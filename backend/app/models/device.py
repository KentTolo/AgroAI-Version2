from __future__ import annotations

import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import ForeignKey, Index, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, UUIDPrimaryKey, utcnow

if TYPE_CHECKING:
    from app.models.field import Field


class Device(UUIDPrimaryKey, Base):
    """A field sensor station that posts telemetry with its own API key."""

    __tablename__ = "devices"

    field_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("fields.id", ondelete="CASCADE"), index=True
    )
    name: Mapped[str] = mapped_column(String(80))
    # Only a SHA-256 hash of the key is stored; the prefix helps the owner recognise it.
    key_hash: Mapped[str] = mapped_column(String(64), unique=True)
    key_prefix: Mapped[str] = mapped_column(String(12))
    created_at: Mapped[datetime] = mapped_column(default=utcnow)
    last_seen_at: Mapped[datetime | None] = mapped_column(default=None)

    field: Mapped[Field] = relationship(back_populates="devices")
    telemetry: Mapped[list[Telemetry]] = relationship(
        back_populates="device", cascade="all, delete-orphan", passive_deletes=True
    )


class Telemetry(UUIDPrimaryKey, Base):
    """One transmission from a device. Every measurement is optional: kits vary."""

    __tablename__ = "telemetry"
    __table_args__ = (Index("ix_telemetry_field_recorded", "field_id", "recorded_at"),)

    device_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("devices.id", ondelete="CASCADE"), index=True
    )
    field_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("fields.id", ondelete="CASCADE"))
    recorded_at: Mapped[datetime] = mapped_column(default=utcnow)
    received_at: Mapped[datetime] = mapped_column(default=utcnow)

    air_temperature: Mapped[float | None]
    air_humidity: Mapped[float | None]
    soil_moisture: Mapped[float | None]
    soil_temperature: Mapped[float | None]
    battery_voltage: Mapped[float | None]
    signal_strength: Mapped[int | None]

    device: Mapped[Device] = relationship(back_populates="telemetry")
