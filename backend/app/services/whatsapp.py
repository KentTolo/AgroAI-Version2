"""Sending and receiving WhatsApp messages through a self-hosted WAHA server.

WAHA (https://github.com/devlikeapro/waha, Apache-2.0) runs WhatsApp Web for a phone number you
own and exposes it over HTTP. It is free but unofficial: WhatsApp may ban numbers that behave like
bulk senders, so AgroAI only messages farmers who linked their number by messaging the bot first,
batches each day's news into one message, and pauses between sends.
"""

from __future__ import annotations

import hashlib
import hmac
import logging
import re
import time
from dataclasses import dataclass, field
from typing import Protocol
from urllib.parse import quote

import httpx

logger = logging.getLogger(__name__)

LESOTHO_COUNTRY_CODE = "266"


class WhatsAppError(RuntimeError):
    """The message could not be handed to WhatsApp."""


def normalise_number(raw: str) -> str | None:
    """Digits-only international number, or None if it can't be a phone number.

    Local Lesotho numbers (8 digits, e.g. "5012 3456") get the 266 country code.
    """
    digits = re.sub(r"\D", "", raw)
    if digits.startswith("00"):
        digits = digits[2:]
    if len(digits) == 8:
        digits = LESOTHO_COUNTRY_CODE + digits
    return digits if 10 <= len(digits) <= 15 else None


def display_number(digits: str) -> str:
    return f"+{digits}"


def verify_signature(body: bytes, signature: str | None, key: str) -> bool:
    """WAHA signs each webhook body with HMAC-SHA512 in the X-Webhook-Hmac header."""
    if not signature:
        return False
    expected = hmac.new(key.encode(), body, hashlib.sha512).hexdigest()
    return hmac.compare_digest(expected, signature.strip().lower())


class WhatsAppSender(Protocol):
    def send(self, number: str, text: str) -> None:
        """Send ``text`` to the digits-only ``number``. Raises WhatsAppError on failure."""
        ...

    def phone_for(self, chat_id: str) -> str | None:
        """Digits-only phone number for an incoming chat id, or None if unknown."""
        ...


@dataclass
class LogSender:
    """Records messages instead of sending them (development and tests)."""

    sent: list[tuple[str, str]] = field(default_factory=list)
    lids: dict[str, str] = field(default_factory=dict)
    delay_seconds: float = 0

    def send(self, number: str, text: str) -> None:
        logger.info("WhatsApp (log only) to +%s: %s", number, text.replace("\n", " | "))
        self.sent.append((number, text))

    def phone_for(self, chat_id: str) -> str | None:
        user, _, server = chat_id.partition("@")
        if server == "lid":
            return self.lids.get(chat_id)
        return normalise_number(user) if server in ("c.us", "s.whatsapp.net") else None


class WahaSender:
    def __init__(
        self,
        base_url: str,
        api_key: str | None,
        session: str = "default",
        timeout: float = 20,
        delay_seconds: float = 3,
    ) -> None:
        self._base_url = base_url.rstrip("/")
        self._headers = {"X-Api-Key": api_key} if api_key else {}
        self._session = session
        self._timeout = timeout
        self.delay_seconds = delay_seconds

    def send(self, number: str, text: str) -> None:
        try:
            response = httpx.post(
                f"{self._base_url}/api/sendText",
                json={"session": self._session, "chatId": f"{number}@c.us", "text": text},
                headers=self._headers,
                timeout=self._timeout,
            )
        except httpx.HTTPError as exc:
            raise WhatsAppError(f"WAHA could not be reached: {exc}") from exc
        if response.status_code >= 400:
            raise WhatsAppError(f"WAHA refused the message ({response.status_code})")

    def phone_for(self, chat_id: str) -> str | None:
        user, _, server = chat_id.partition("@")
        if server in ("c.us", "s.whatsapp.net"):
            return normalise_number(user)
        if server != "lid":
            return None  # groups, broadcasts, newsletters
        # Newer WhatsApp accounts show up under a private "linked id"; WAHA maps it back.
        try:
            response = httpx.get(
                f"{self._base_url}/api/{quote(self._session)}/lids/{quote(chat_id)}",
                headers=self._headers,
                timeout=self._timeout,
            )
            response.raise_for_status()
            pn = response.json().get("pn")
        except (httpx.HTTPError, ValueError) as exc:
            logger.warning("Could not resolve WhatsApp linked id: %s", exc)
            return None
        return normalise_number(str(pn).partition("@")[0]) if pn else None


def pause(sender: WhatsAppSender) -> None:
    """Wait between messages in a batch."""
    delay = getattr(sender, "delay_seconds", 0)
    if delay:
        time.sleep(delay)
