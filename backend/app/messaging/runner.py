"""The daily run: collect each linked farmer's new milestones and alerts and send one message."""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import UTC, date, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.messaging.queries import active_cycles
from app.models import Device, Field, Notification, NotificationStatus, User
from app.services.crops import CropCatalog
from app.services.milestones import (
    Alert,
    compose_digest,
    cycle_alerts,
    station_alerts,
    weather_alerts,
)
from app.services.weather import WeatherClient, WeatherUnavailableError
from app.services.whatsapp import WhatsAppError, WhatsAppSender, pause

logger = logging.getLogger(__name__)


@dataclass(frozen=True, slots=True)
class RunResult:
    users: int
    messages_sent: int
    messages_failed: int
    alerts: int


def collect_alerts(
    db: Session,
    user: User,
    catalog: CropCatalog,
    weather: WeatherClient | None,
    today: date,
    now: datetime,
) -> list[Alert]:
    alerts: list[Alert] = []
    cycles = active_cycles(db, user)
    fields_with_crops: dict[object, Field] = {}
    for number, cycle in enumerate(cycles, start=1):
        crop = catalog.get(cycle.crop)
        if crop is None:
            continue
        fields_with_crops[cycle.field_id] = cycle.field
        alerts += cycle_alerts(
            cycle_id=str(cycle.id),
            number=number,
            crop=crop,
            field_name=cycle.field.name,
            planted_on=cycle.planted_on,
            expected_harvest_on=cycle.expected_harvest_on,
            today=today,
        )
    if weather is not None:
        for field in fields_with_crops.values():
            if field.latitude is None or field.longitude is None:
                continue
            try:
                forecast = weather.forecast(field.latitude, field.longitude, 3)
            except WeatherUnavailableError as exc:
                logger.warning("No forecast for field %s: %s", field.id, exc)
                continue
            alerts += weather_alerts(
                field_id=str(field.id), field_name=field.name, forecast=forecast, today=today
            )
    devices = db.scalars(
        select(Device)
        .join(Field)
        .where(Field.owner_id == user.id)
        .options(selectinload(Device.field))
    )
    for device in devices:
        alerts += station_alerts(
            device_id=str(device.id),
            device_name=device.name,
            field_name=device.field.name,
            last_seen_at=device.last_seen_at,
            now=now,
        )
    return alerts


def run_daily(
    db: Session,
    sender: WhatsAppSender,
    catalog: CropCatalog,
    weather: WeatherClient | None,
    *,
    now: datetime | None = None,
) -> RunResult:
    now = now or datetime.now(UTC)
    today = now.date()
    users = list(
        db.scalars(
            select(User).where(
                User.whatsapp_number.is_not(None),
                User.whatsapp_alerts.is_(True),
                User.is_active.is_(True),
            )
        )
    )
    sent = failed = total_alerts = 0
    for user in users:
        alerts = collect_alerts(db, user, catalog, weather, today, now)
        if not alerts:
            continue
        existing = {
            n.key: n
            for n in db.scalars(
                select(Notification).where(
                    Notification.user_id == user.id,
                    Notification.key.in_([a.key for a in alerts]),
                )
            )
        }
        # Failed sends are retried on the next run; sent ones never repeat.
        new = [
            a
            for a in alerts
            if a.key not in existing or existing[a.key].status is not NotificationStatus.SENT
        ]
        if not new or user.whatsapp_number is None:
            continue
        total_alerts += len(new)
        message = compose_digest(user.full_name.split()[0], new, today)
        status, error = NotificationStatus.SENT, None
        try:
            sender.send(user.whatsapp_number, message)
            sent += 1
        except WhatsAppError as exc:
            status, error = NotificationStatus.FAILED, str(exc)[:300]
            failed += 1
            logger.warning("WhatsApp alert to user %s failed: %s", user.id, exc)
        for alert in new:
            row = existing.get(alert.key)
            if row is None:
                db.add(
                    Notification(
                        user_id=user.id,
                        key=alert.key,
                        kind=alert.kind,
                        message=alert.text,
                        status=status,
                        error=error,
                    )
                )
            else:
                row.status, row.error, row.message, row.created_at = status, error, alert.text, now
        db.commit()
        pause(sender)
    return RunResult(
        users=len(users), messages_sent=sent, messages_failed=failed, alerts=total_alerts
    )
