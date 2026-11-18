"""Crop cycles: tracking a planting from sowing to harvest."""

from __future__ import annotations

import uuid
from datetime import date
from typing import Annotated

from fastapi import APIRouter, HTTPException, Query, Response, status
from sqlalchemy import func, select
from sqlalchemy.orm import selectinload

from app.api.deps import CurrentUser, DbSession, OwnedField
from app.api.presenters import cycle_read
from app.models import CropCycle, CycleStatus, Field
from app.schemas.agronomy import CycleCreate, CycleRead, CycleUpdate
from app.schemas.common import Limit, Offset, Page
from app.services.crops import get_catalog
from app.services.growth import expected_harvest_date

router = APIRouter(tags=["crop cycles"])


def _validate_dates(planted_on: date, expected: date, harvested: date | None) -> None:
    if expected <= planted_on:
        raise HTTPException(
            status_code=422, detail="Expected harvest date must be after the planting date"
        )
    if harvested is not None and harvested < planted_on:
        raise HTTPException(status_code=422, detail="Harvest date cannot be before planting")
    if planted_on > date.today():
        raise HTTPException(status_code=422, detail="Planting date cannot be in the future")


@router.post(
    "/fields/{field_id}/cycles", response_model=CycleRead, status_code=status.HTTP_201_CREATED
)
def start_cycle(payload: CycleCreate, field: OwnedField, db: DbSession) -> CycleRead:
    catalog = get_catalog()
    crop = catalog.get(payload.crop)
    if crop is None:
        raise HTTPException(status_code=422, detail=f"Unknown crop '{payload.crop}'")

    expected = payload.expected_harvest_on or expected_harvest_date(crop, payload.planted_on)
    _validate_dates(payload.planted_on, expected, None)
    cycle = CropCycle(
        field_id=field.id,
        crop=crop.slug,
        planted_on=payload.planted_on,
        expected_harvest_on=expected,
        notes=payload.notes,
    )
    db.add(cycle)
    db.commit()
    db.refresh(cycle, ["field"])
    return cycle_read(cycle, catalog)


@router.get("/cycles", response_model=Page[CycleRead])
def list_cycles(
    user: CurrentUser,
    db: DbSession,
    status_filter: Annotated[CycleStatus | None, Query(alias="status")] = None,
    field_id: Annotated[uuid.UUID | None, Query()] = None,
    limit: Limit = 50,
    offset: Offset = 0,
) -> Page[CycleRead]:
    query = select(CropCycle).join(Field).where(Field.owner_id == user.id)
    if status_filter:
        query = query.where(CropCycle.status == status_filter)
    if field_id:
        query = query.where(CropCycle.field_id == field_id)
    total = db.scalar(select(func.count()).select_from(query.subquery())) or 0
    rows = db.scalars(
        query.options(selectinload(CropCycle.field))
        .order_by(CropCycle.planted_on.desc())
        .limit(limit)
        .offset(offset)
    )
    catalog = get_catalog()
    return Page(
        items=[cycle_read(c, catalog) for c in rows], total=total, limit=limit, offset=offset
    )


def _owned_cycle(cycle_id: uuid.UUID, user: CurrentUser, db: DbSession) -> CropCycle:
    cycle = db.get(CropCycle, cycle_id, options=[selectinload(CropCycle.field)])
    if cycle is None or cycle.field.owner_id != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Crop cycle not found")
    return cycle


@router.get("/cycles/{cycle_id}", response_model=CycleRead)
def get_cycle(cycle_id: uuid.UUID, user: CurrentUser, db: DbSession) -> CycleRead:
    return cycle_read(_owned_cycle(cycle_id, user, db), get_catalog())


@router.patch("/cycles/{cycle_id}", response_model=CycleRead)
def update_cycle(
    cycle_id: uuid.UUID, payload: CycleUpdate, user: CurrentUser, db: DbSession
) -> CycleRead:
    """Update a cycle, e.g. record the harvest: ``{"status": "harvested", "yield_kg": 850}``."""
    cycle = _owned_cycle(cycle_id, user, db)
    changes = payload.model_dump(exclude_unset=True)

    if changes.get("status") == CycleStatus.HARVESTED and not changes.get("harvested_on"):
        changes.setdefault("harvested_on", cycle.harvested_on or date.today())
    if changes.get("status") == CycleStatus.ACTIVE:
        changes["harvested_on"] = None
    for key, value in changes.items():
        setattr(cycle, key, value)

    if cycle.harvested_on and cycle.harvested_on > date.today():
        raise HTTPException(status_code=422, detail="Harvest date cannot be in the future")
    if cycle.harvested_on and cycle.harvested_on < cycle.planted_on:
        raise HTTPException(status_code=422, detail="Harvest date cannot be before planting")
    if cycle.expected_harvest_on <= cycle.planted_on:
        raise HTTPException(
            status_code=422, detail="Expected harvest date must be after the planting date"
        )
    db.commit()
    return cycle_read(cycle, get_catalog())


@router.delete("/cycles/{cycle_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_cycle(cycle_id: uuid.UUID, user: CurrentUser, db: DbSession) -> Response:
    db.delete(_owned_cycle(cycle_id, user, db))
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
