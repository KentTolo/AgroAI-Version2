"""Lookups shared by the bot and the daily run, so both number things the same way."""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.models import CropCycle, CycleStatus, Field, User


def user_fields(db: Session, user: User) -> list[Field]:
    """A farmer's fields in the order the bot numbers them (by name)."""
    return list(db.scalars(select(Field).where(Field.owner_id == user.id).order_by(Field.name)))


def active_cycles(db: Session, user: User) -> list[CropCycle]:
    """Active plantings in the order the bot numbers them (oldest first)."""
    return list(
        db.scalars(
            select(CropCycle)
            .join(Field)
            .where(Field.owner_id == user.id, CropCycle.status == CycleStatus.ACTIVE)
            .options(selectinload(CropCycle.field))
            .order_by(CropCycle.planted_on, CropCycle.crop)
        )
    )
