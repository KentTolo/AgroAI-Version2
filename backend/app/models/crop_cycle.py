from __future__ import annotations

import enum
import uuid
from datetime import date
from typing import TYPE_CHECKING

from sqlalchemy import CheckConstraint, Enum, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, Timestamps, UUIDPrimaryKey

if TYPE_CHECKING:
    from app.models.field import Field


class CycleStatus(enum.StrEnum):
    ACTIVE = "active"
    HARVESTED = "harvested"
    FAILED = "failed"


class CropCycle(UUIDPrimaryKey, Timestamps, Base):
    """One planting of a crop on a field, tracked from sowing to harvest."""

    __tablename__ = "crop_cycles"
    __table_args__ = (
        CheckConstraint("expected_harvest_on > planted_on", name="harvest_after_planting"),
        CheckConstraint("yield_kg >= 0", name="yield_non_negative"),
    )

    field_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("fields.id", ondelete="CASCADE"), index=True
    )
    crop: Mapped[str] = mapped_column(String(40))
    planted_on: Mapped[date]
    expected_harvest_on: Mapped[date]
    harvested_on: Mapped[date | None]
    status: Mapped[CycleStatus] = mapped_column(
        Enum(
            CycleStatus,
            native_enum=False,
            length=20,
            values_callable=lambda e: [m.value for m in e],
            validate_strings=True,
        ),
        default=CycleStatus.ACTIVE,
    )
    yield_kg: Mapped[float | None]
    notes: Mapped[str | None] = mapped_column(Text)

    field: Mapped[Field] = relationship(back_populates="cycles")
