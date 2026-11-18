from __future__ import annotations

import enum
import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import Enum, ForeignKey, Index
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, UUIDPrimaryKey, utcnow

if TYPE_CHECKING:
    from app.models.field import Field


class ReadingSource(enum.StrEnum):
    MANUAL = "manual"
    SIMULATED = "simulated"
    DEVICE = "device"


class SensorReading(UUIDPrimaryKey, Base):
    """One snapshot of soil and climate conditions for a field."""

    __tablename__ = "sensor_readings"
    __table_args__ = (Index("ix_sensor_readings_field_recorded", "field_id", "recorded_at"),)

    field_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("fields.id", ondelete="CASCADE"))
    recorded_at: Mapped[datetime] = mapped_column(default=utcnow)
    source: Mapped[ReadingSource] = mapped_column(
        Enum(
            ReadingSource,
            native_enum=False,
            length=20,
            values_callable=lambda e: [m.value for m in e],
            validate_strings=True,
        ),
        default=ReadingSource.MANUAL,
    )

    nitrogen: Mapped[float]
    phosphorus: Mapped[float]
    potassium: Mapped[float]
    temperature: Mapped[float]
    humidity: Mapped[float]
    ph: Mapped[float]
    rainfall: Mapped[float]

    created_at: Mapped[datetime] = mapped_column(default=utcnow)

    field: Mapped[Field] = relationship(back_populates="readings")
