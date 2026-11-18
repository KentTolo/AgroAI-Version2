from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Annotated

from fastapi import APIRouter, HTTPException, Query, Response, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError

from app.api.deps import CurrentUser, DbSession, OwnedField
from app.db.base import utcnow
from app.models import CropCycle, CycleStatus, Field, ReadingSource, SensorReading
from app.schemas.common import Limit, Offset, Page
from app.schemas.field import (
    FieldCreate,
    FieldRead,
    FieldUpdate,
    ReadingCreate,
    ReadingRead,
    SimulationRequest,
)
from app.services.simulator import generate_series

router = APIRouter(prefix="/fields", tags=["fields"])

_DUPLICATE_NAME = HTTPException(
    status_code=status.HTTP_409_CONFLICT, detail="You already have a field with this name"
)


def _latest_readings(db: DbSession, field_ids: list[object]) -> dict[object, SensorReading]:
    if not field_ids:
        return {}
    ranked = (
        select(
            SensorReading.id,
            func.row_number()
            .over(partition_by=SensorReading.field_id, order_by=SensorReading.recorded_at.desc())
            .label("rank"),
        )
        .where(SensorReading.field_id.in_(field_ids))
        .subquery()
    )
    rows = db.scalars(
        select(SensorReading)
        .join(ranked, ranked.c.id == SensorReading.id)
        .where(ranked.c.rank == 1)
    )
    return {r.field_id: r for r in rows}


def _active_cycle_counts(db: DbSession, field_ids: list[object]) -> dict[object, int]:
    if not field_ids:
        return {}
    rows = db.execute(
        select(CropCycle.field_id, func.count())
        .where(CropCycle.field_id.in_(field_ids), CropCycle.status == CycleStatus.ACTIVE)
        .group_by(CropCycle.field_id)
    )
    return {row[0]: row[1] for row in rows}


def _present(db: DbSession, fields: list[Field]) -> list[FieldRead]:
    ids: list[object] = [f.id for f in fields]
    latest = _latest_readings(db, ids)
    counts = _active_cycle_counts(db, ids)
    return [
        FieldRead.model_validate(f).model_copy(
            update={
                "latest_reading": ReadingRead.model_validate(latest[f.id])
                if f.id in latest
                else None,
                "active_cycle_count": counts.get(f.id, 0),
            }
        )
        for f in fields
    ]


@router.get("", response_model=Page[FieldRead])
def list_fields(
    user: CurrentUser, db: DbSession, limit: Limit = 50, offset: Offset = 0
) -> Page[FieldRead]:
    base = select(Field).where(Field.owner_id == user.id)
    total = db.scalar(select(func.count()).select_from(base.subquery())) or 0
    fields = list(db.scalars(base.order_by(Field.name).limit(limit).offset(offset)))
    return Page(items=_present(db, fields), total=total, limit=limit, offset=offset)


@router.post("", response_model=FieldRead, status_code=status.HTTP_201_CREATED)
def create_field(payload: FieldCreate, user: CurrentUser, db: DbSession) -> FieldRead:
    field = Field(owner_id=user.id, **payload.model_dump())
    db.add(field)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise _DUPLICATE_NAME from None
    return _present(db, [field])[0]


@router.get("/{field_id}", response_model=FieldRead)
def get_field(field: OwnedField, db: DbSession) -> FieldRead:
    return _present(db, [field])[0]


@router.patch("/{field_id}", response_model=FieldRead)
def update_field(payload: FieldUpdate, field: OwnedField, db: DbSession) -> FieldRead:
    changes = payload.model_dump(exclude_unset=True)
    if "name" in changes and changes["name"] is None:
        raise HTTPException(status_code=422, detail="Field name cannot be empty")
    for key, value in changes.items():
        setattr(field, key, value)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise _DUPLICATE_NAME from None
    return _present(db, [field])[0]


@router.delete("/{field_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_field(field: OwnedField, db: DbSession) -> Response:
    db.delete(field)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# --- Readings ---------------------------------------------------------------------------------


@router.get("/{field_id}/readings", response_model=Page[ReadingRead])
def list_readings(
    field: OwnedField,
    db: DbSession,
    since: Annotated[datetime | None, Query(description="Only readings at or after")] = None,
    until: Annotated[datetime | None, Query(description="Only readings at or before")] = None,
    limit: Annotated[int, Query(ge=1, le=2000)] = 500,
    offset: Offset = 0,
) -> Page[ReadingRead]:
    """Most recent readings first, filtered by an optional time window."""
    query = select(SensorReading).where(SensorReading.field_id == field.id)
    if since:
        query = query.where(SensorReading.recorded_at >= since)
    if until:
        query = query.where(SensorReading.recorded_at <= until)
    total = db.scalar(select(func.count()).select_from(query.subquery())) or 0
    rows = db.scalars(query.order_by(SensorReading.recorded_at.desc()).limit(limit).offset(offset))
    items = [ReadingRead.model_validate(r) for r in rows]
    return Page(items=items, total=total, limit=limit, offset=offset)


@router.post(
    "/{field_id}/readings", response_model=ReadingRead, status_code=status.HTTP_201_CREATED
)
def create_reading(payload: ReadingCreate, field: OwnedField, db: DbSession) -> SensorReading:
    data = payload.model_dump()
    recorded_at = data.pop("recorded_at") or utcnow()
    if recorded_at.tzinfo is None:
        recorded_at = recorded_at.replace(tzinfo=UTC)
    if recorded_at > utcnow() + timedelta(minutes=5):
        raise HTTPException(status_code=422, detail="recorded_at cannot be in the future")
    reading = SensorReading(
        field_id=field.id, recorded_at=recorded_at, source=ReadingSource.MANUAL, **data
    )
    db.add(reading)
    db.commit()
    return reading


@router.post(
    "/{field_id}/readings/simulate",
    response_model=Page[ReadingRead],
    status_code=status.HTTP_201_CREATED,
)
def simulate_readings(
    payload: SimulationRequest, field: OwnedField, db: DbSession
) -> Page[ReadingRead]:
    """Generate synthetic sensor history for a field (stands in for IoT devices)."""
    count = payload.days * payload.readings_per_day
    series = generate_series(
        end=utcnow(),
        count=count,
        interval=timedelta(hours=24 / payload.readings_per_day),
        seed=payload.seed,
    )
    readings = [
        SensorReading(field_id=field.id, recorded_at=ts, source=ReadingSource.SIMULATED, **values)
        for ts, values in series
    ]
    db.add_all(readings)
    db.commit()
    items = [ReadingRead.model_validate(r) for r in reversed(readings)]
    return Page(items=items, total=len(items), limit=len(items), offset=0)


@router.delete("/{field_id}/readings", status_code=status.HTTP_204_NO_CONTENT)
def clear_readings(field: OwnedField, db: DbSession) -> Response:
    db.query(SensorReading).filter(SensorReading.field_id == field.id).delete()
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
