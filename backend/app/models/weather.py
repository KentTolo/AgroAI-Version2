from __future__ import annotations

import uuid
from datetime import date, datetime
from typing import TYPE_CHECKING

from sqlalchemy import ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, UUIDPrimaryKey, utcnow

if TYPE_CHECKING:
    from app.models.field import Field


class WeatherDay(UUIDPrimaryKey, Base):
    """One day of weather at a field's location, stored so history builds up over time."""

    __tablename__ = "weather_days"
    __table_args__ = (UniqueConstraint("field_id", "day", name="uq_weather_days_field_id_day"),)

    field_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("fields.id", ondelete="CASCADE"), index=True
    )
    day: Mapped[date]
    temperature_mean: Mapped[float]
    temperature_min: Mapped[float | None]
    temperature_max: Mapped[float | None]
    precipitation: Mapped[float]
    humidity_mean: Mapped[float | None]
    # "archive" (ERA5 reanalysis) or "recent" (forecast model; replaced once archived).
    source: Mapped[str] = mapped_column(String(20))
    fetched_at: Mapped[datetime] = mapped_column(default=utcnow)

    field: Mapped[Field] = relationship(back_populates="weather_days")
