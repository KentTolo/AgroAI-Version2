"""WhatsApp: linking a farmer's number, alert settings, the bot's webhook and the daily run."""

from __future__ import annotations

import logging
import secrets
from collections import OrderedDict
from dataclasses import asdict
from datetime import UTC, datetime
from typing import Annotated, Any
from urllib.parse import quote

from fastapi import APIRouter, Depends, Header, HTTPException, Request, Response, status
from sqlalchemy import select

from app.api.deps import CurrentUser, DbSession, OptionalRecommender, Weather
from app.core.config import Settings, get_settings
from app.messaging.bot import LINK_CODE_TTL, context_now, handle_message, hash_code
from app.messaging.runner import run_daily
from app.models import Notification
from app.schemas.whatsapp import (
    NotificationRead,
    NotificationRunResult,
    WhatsAppLinkCode,
    WhatsAppStatus,
    WhatsAppUpdate,
)
from app.services.crops import get_catalog
from app.services.whatsapp import (
    LogSender,
    WahaSender,
    WhatsAppError,
    WhatsAppSender,
    display_number,
    normalise_number,
    verify_signature,
)

logger = logging.getLogger(__name__)
router = APIRouter(tags=["whatsapp"])


AppSettings = Annotated[Settings, Depends(get_settings)]


def get_whatsapp_sender(settings: AppSettings) -> WhatsAppSender | None:
    if settings.whatsapp_provider == "waha":
        key = settings.waha_api_key.get_secret_value() if settings.waha_api_key else None
        return WahaSender(
            settings.waha_url,
            key,
            settings.waha_session,
            delay_seconds=settings.whatsapp_send_delay_seconds,
        )
    if settings.whatsapp_provider == "log":
        return LogSender()
    return None


Sender = Annotated[WhatsAppSender | None, Depends(get_whatsapp_sender)]


def _bot_number(settings: Settings) -> str | None:
    raw = settings.whatsapp_bot_number
    number = normalise_number(raw) if raw else None
    return display_number(number) if number else None


def _require(sender: WhatsAppSender | None) -> WhatsAppSender:
    if sender is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="WhatsApp is not set up on this AgroAI server.",
        )
    return sender


@router.get("/whatsapp", response_model=WhatsAppStatus)
def whatsapp_status(
    user: CurrentUser, db: DbSession, sender: Sender, settings: AppSettings
) -> WhatsAppStatus:
    recent = db.scalars(
        select(Notification)
        .where(Notification.user_id == user.id)
        .order_by(Notification.created_at.desc())
        .limit(10)
    )
    expires = user.whatsapp_link_expires_at
    return WhatsAppStatus(
        enabled=sender is not None,
        bot_number=_bot_number(settings),
        linked_number=display_number(user.whatsapp_number) if user.whatsapp_number else None,
        alerts=user.whatsapp_alerts,
        link_expires_at=expires if expires and expires > datetime.now(UTC) else None,
        recent=[NotificationRead.model_validate(n) for n in recent],
    )


@router.post("/whatsapp/link", response_model=WhatsAppLinkCode)
def start_link(
    user: CurrentUser, db: DbSession, sender: Sender, settings: AppSettings
) -> WhatsAppLinkCode:
    """Issue a one-time code; the farmer sends it to the bot from the number to link."""
    _require(sender)
    code = f"{secrets.randbelow(1_000_000):06d}"
    expires = datetime.now(UTC) + LINK_CODE_TTL
    user.whatsapp_link_code_hash = hash_code(code)
    user.whatsapp_link_expires_at = expires
    db.commit()
    message = f"LINK {code}"
    bot = _bot_number(settings)
    return WhatsAppLinkCode(
        code=code,
        message=message,
        expires_at=expires,
        bot_number=bot,
        whatsapp_url=f"https://wa.me/{bot.lstrip('+')}?text={quote(message)}" if bot else None,
    )


@router.patch("/whatsapp", response_model=WhatsAppStatus)
def update_whatsapp(
    payload: WhatsAppUpdate,
    user: CurrentUser,
    db: DbSession,
    sender: Sender,
    settings: AppSettings,
) -> WhatsAppStatus:
    user.whatsapp_alerts = payload.alerts
    db.commit()
    return whatsapp_status(user, db, sender, settings)


@router.delete("/whatsapp", status_code=status.HTTP_204_NO_CONTENT)
def unlink_whatsapp(user: CurrentUser, db: DbSession) -> Response:
    user.whatsapp_number = None
    user.whatsapp_link_code_hash = None
    user.whatsapp_link_expires_at = None
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# WAHA retries webhooks it thinks failed (e.g. while this server wakes up); skip repeats.
_seen_messages: OrderedDict[str, None] = OrderedDict()


def _already_seen(message_id: str) -> bool:
    if message_id in _seen_messages:
        return True
    _seen_messages[message_id] = None
    while len(_seen_messages) > 500:
        _seen_messages.popitem(last=False)
    return False


@router.post("/whatsapp/webhook", include_in_schema=False)
async def whatsapp_webhook(
    request: Request,
    db: DbSession,
    sender: Sender,
    recommender: OptionalRecommender,
    weather: Weather,
    settings: AppSettings,
    x_webhook_hmac: Annotated[str | None, Header()] = None,
) -> dict[str, bool]:
    """Incoming WhatsApp messages from WAHA (event "message"), answered by the bot."""
    active = _require(sender)
    body = await request.body()
    key = settings.waha_webhook_hmac_key
    if key is not None:
        if not verify_signature(body, x_webhook_hmac, key.get_secret_value()):
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Bad signature")
    elif settings.whatsapp_provider == "waha":
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Set AGROAI_WAHA_WEBHOOK_HMAC_KEY to accept WhatsApp webhooks.",
        )
    try:
        event: dict[str, Any] = await request.json()
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Expected JSON") from exc
    payload = event.get("payload") or {}
    text = payload.get("body")
    chat_id = str(payload.get("from") or "")
    if (
        event.get("event") != "message"
        or payload.get("fromMe")
        or not isinstance(text, str)
        or not text.strip()
        or _already_seen(str(payload.get("id") or ""))
    ):
        return {"handled": False}
    number = active.phone_for(chat_id)
    if number is None:
        return {"handled": False}  # a group, broadcast, or an id WAHA could not resolve
    reply = handle_message(context_now(db, get_catalog(), recommender, weather), number, text)
    try:
        active.send(number, reply)
    except WhatsAppError as exc:
        logger.warning("Could not send WhatsApp reply: %s", exc)
    return {"handled": True}


@router.post(
    "/internal/notifications/run", response_model=NotificationRunResult, include_in_schema=False
)
def run_notifications(
    db: DbSession,
    sender: Sender,
    weather: Weather,
    settings: AppSettings,
    x_cron_secret: Annotated[str | None, Header()] = None,
) -> NotificationRunResult:
    """Send today's milestones and alerts. Called once a day by a scheduled GitHub Action."""
    secret = settings.cron_secret
    if (
        secret is None
        or not x_cron_secret
        or not secrets.compare_digest(x_cron_secret, secret.get_secret_value())
    ):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Bad cron secret")
    result = run_daily(db, _require(sender), get_catalog(), weather)
    logger.info("Notification run: %s", result)
    return NotificationRunResult(**asdict(result))
