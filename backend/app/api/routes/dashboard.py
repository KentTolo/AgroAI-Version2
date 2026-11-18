from __future__ import annotations

from fastapi import APIRouter
from sqlalchemy import Select, func, select
from sqlalchemy.orm import selectinload

from app.api.deps import CurrentUser, DbSession
from app.api.presenters import cycle_read, recommendation_read
from app.models import CropCycle, CycleStatus, Field, Recommendation, SensorReading
from app.schemas.agronomy import DashboardRead
from app.services.crops import get_catalog

router = APIRouter(tags=["dashboard"])


@router.get("/dashboard", response_model=DashboardRead)
def dashboard(user: CurrentUser, db: DbSession) -> DashboardRead:
    """Headline numbers and recent activity for the signed-in user."""
    owned_fields = select(Field.id).where(Field.owner_id == user.id)
    active = (
        select(CropCycle)
        .where(CropCycle.field_id.in_(owned_fields), CropCycle.status == CycleStatus.ACTIVE)
        .options(selectinload(CropCycle.field))
        .order_by(CropCycle.expected_harvest_on)
    )
    recent = (
        select(Recommendation)
        .where(Recommendation.user_id == user.id)
        .order_by(Recommendation.created_at.desc())
        .limit(5)
    )

    def count(statement: Select[int]) -> int:
        return db.scalar(statement) or 0

    active_cycles = list(db.scalars(active))
    catalog = get_catalog()
    return DashboardRead(
        field_count=count(select(func.count()).select_from(owned_fields.subquery())),
        active_cycle_count=len(active_cycles),
        recommendation_count=count(select(func.count()).where(Recommendation.user_id == user.id)),
        reading_count=count(select(func.count()).where(SensorReading.field_id.in_(owned_fields))),
        recent_recommendations=[recommendation_read(r, catalog) for r in db.scalars(recent)],
        active_cycles=[cycle_read(c, catalog) for c in active_cycles[:6]],
    )
