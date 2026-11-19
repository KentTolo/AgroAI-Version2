"""Sensor devices: registration, telemetry ingestion and telemetry queries."""

from __future__ import annotations

import hashlib
import secrets
import uuid
from datetime import UTC, datetime, timedelta
from statistics import fmean
from typing import Annotated

from fastapi import APIRouter, Header, HTTPException, Query, Response, status
from sqlalchemy import select

from app.api.deps import CurrentUser, DbSession, OwnedField
from app.db.base import utcnow
from app.models import Device, Field, Telemetry
from app.schemas.device import (
    DeviceCreate,
    DeviceRead,
    DeviceWithKey,
    SensorSummary,
    TelemetryCreate,
    TelemetryRead,
)

router = APIRouter(tags=["sensors"])

KEY_PREFIX = "agk_"


def _new_key() -> tuple[str, str, str]:
    """Return (key, sha256 hex, display prefix)."""
    key = KEY_PREFIX + secrets.token_urlsafe(32)
    return key, hashlib.sha256(key.encode()).hexdigest(), key[: len(KEY_PREFIX) + 6]


def _latest(db: DbSession, device_id: uuid.UUID) -> Telemetry | None:
    return db.scalar(
        select(Telemetry)
        .where(Telemetry.device_id == device_id)
        .order_by(Telemetry.recorded_at.desc())
        .limit(1)
    )


def _present(db: DbSession, device: Device) -> DeviceRead:
    latest = _latest(db, device.id)
    return DeviceRead.model_validate(device).model_copy(
        update={"latest": TelemetryRead.model_validate(latest) if latest else None}
    )


def _owned_device(device_id: uuid.UUID, user: CurrentUser, db: DbSession) -> Device:
    device = db.get(Device, device_id)
    field = db.get(Field, device.field_id) if device else None
    if device is None or field is None or field.owner_id != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Device not found")
    return device


def _with_key(device: Device, key: str) -> DeviceWithKey:
    return DeviceWithKey(**DeviceRead.model_validate(device).model_dump(), api_key=key)


@router.get("/fields/{field_id}/devices", response_model=list[DeviceRead])
def list_devices(field: OwnedField, db: DbSession) -> list[DeviceRead]:
    devices = db.scalars(select(Device).where(Device.field_id == field.id).order_by(Device.name))
    return [_present(db, d) for d in devices]


@router.post(
    "/fields/{field_id}/devices", response_model=DeviceWithKey, status_code=status.HTTP_201_CREATED
)
def register_device(payload: DeviceCreate, field: OwnedField, db: DbSession) -> DeviceWithKey:
    """Register a sensor station. The response contains its API key, which is shown only once."""
    key, key_hash, prefix = _new_key()
    device = Device(
        field_id=field.id, name=payload.name.strip(), key_hash=key_hash, key_prefix=prefix
    )
    db.add(device)
    db.commit()
    return _with_key(device, key)


@router.post("/devices/{device_id}/rotate-key", response_model=DeviceWithKey)
def rotate_key(device_id: uuid.UUID, user: CurrentUser, db: DbSession) -> DeviceWithKey:
    """Issue a new key (for example if the old one leaked). The old key stops working at once."""
    device = _owned_device(device_id, user, db)
    key, device.key_hash, device.key_prefix = _new_key()
    db.commit()
    return _with_key(device, key)


@router.delete("/devices/{device_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_device(device_id: uuid.UUID, user: CurrentUser, db: DbSession) -> Response:
    db.delete(_owned_device(device_id, user, db))
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/telemetry", response_model=TelemetryRead, status_code=status.HTTP_201_CREATED)
def ingest(
    payload: TelemetryCreate,
    db: DbSession,
    x_device_key: Annotated[str | None, Header(description="The device's API key")] = None,
) -> Telemetry:
    """Endpoint the sensor firmware posts to, authenticated by the ``X-Device-Key`` header."""
    if not x_device_key:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing device key")
    device = db.scalar(
        select(Device).where(Device.key_hash == hashlib.sha256(x_device_key.encode()).hexdigest())
    )
    if device is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Unknown device key")

    now = utcnow()
    recorded_at = payload.recorded_at or now
    if recorded_at.tzinfo is None:
        recorded_at = recorded_at.replace(tzinfo=UTC)
    # Devices without a clock fix may send nonsense; fall back to the time received.
    if recorded_at > now + timedelta(minutes=5) or recorded_at < now - timedelta(days=30):
        recorded_at = now

    reading = Telemetry(
        device_id=device.id,
        field_id=device.field_id,
        recorded_at=recorded_at,
        received_at=now,
        **payload.model_dump(exclude={"recorded_at"}),
    )
    device.last_seen_at = now
    db.add(reading)
    db.commit()
    return reading


@router.get("/fields/{field_id}/telemetry", response_model=list[TelemetryRead])
def list_telemetry(
    field: OwnedField,
    db: DbSession,
    since: Annotated[datetime | None, Query()] = None,
    limit: Annotated[int, Query(ge=1, le=5000)] = 2000,
) -> list[Telemetry]:
    """A field's telemetry from all its devices, newest first."""
    query = select(Telemetry).where(Telemetry.field_id == field.id)
    if since:
        query = query.where(Telemetry.recorded_at >= since)
    return list(db.scalars(query.order_by(Telemetry.recorded_at.desc()).limit(limit)))


@router.get("/fields/{field_id}/telemetry/summary", response_model=SensorSummary)
def telemetry_summary(
    field: OwnedField, db: DbSession, days: Annotated[int, Query(ge=1, le=90)] = 7
) -> SensorSummary:
    since = datetime.now(UTC) - timedelta(days=days)
    rows = list(
        db.scalars(
            select(Telemetry).where(Telemetry.field_id == field.id, Telemetry.recorded_at >= since)
        )
    )

    def avg(name: str) -> float | None:
        values = [v for r in rows if (v := getattr(r, name)) is not None]
        return round(fmean(values), 1) if values else None

    return SensorSummary(
        days=days,
        readings=len(rows),
        start=min((r.recorded_at for r in rows), default=None),
        end=max((r.recorded_at for r in rows), default=None),
        air_temperature=avg("air_temperature"),
        air_humidity=avg("air_humidity"),
        soil_moisture=avg("soil_moisture"),
        soil_temperature=avg("soil_temperature"),
    )
