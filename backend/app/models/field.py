from __future__ import annotations

import uuid
from typing import TYPE_CHECKING

from sqlalchemy import CheckConstraint, ForeignKey, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, Timestamps, UUIDPrimaryKey

if TYPE_CHECKING:
    from app.models.crop_cycle import CropCycle
    from app.models.reading import SensorReading
    from app.models.user import User
    from app.models.weather import WeatherDay


class Field(UUIDPrimaryKey, Timestamps, Base):
    """A plot of land a farmer manages and monitors."""

    __tablename__ = "fields"
    __table_args__ = (
        UniqueConstraint("owner_id", "name", name="uq_fields_owner_id_name"),
        CheckConstraint("latitude BETWEEN -90 AND 90", name="latitude_range"),
        CheckConstraint("longitude BETWEEN -180 AND 180", name="longitude_range"),
        CheckConstraint("area_hectares > 0", name="area_positive"),
    )

    owner_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    name: Mapped[str] = mapped_column(String(120))
    latitude: Mapped[float | None]
    longitude: Mapped[float | None]
    area_hectares: Mapped[float | None]
    soil_type: Mapped[str | None] = mapped_column(String(40))
    notes: Mapped[str | None] = mapped_column(Text)

    owner: Mapped[User] = relationship(back_populates="fields")
    readings: Mapped[list[SensorReading]] = relationship(
        back_populates="field", cascade="all, delete-orphan", passive_deletes=True
    )
    cycles: Mapped[list[CropCycle]] = relationship(
        back_populates="field", cascade="all, delete-orphan", passive_deletes=True
    )
    weather_days: Mapped[list[WeatherDay]] = relationship(
        back_populates="field", cascade="all, delete-orphan", passive_deletes=True
    )
