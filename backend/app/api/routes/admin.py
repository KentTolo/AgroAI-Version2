"""Admin dashboard: platform-wide usage for the people listed in AGROAI_ADMIN_EMAILS."""

from __future__ import annotations

import uuid
from datetime import date, datetime, timedelta
from typing import Any

from fastapi import APIRouter
from sqlalchemy import Select, func, select

from app.api.deps import AdminUser, DbSession, is_admin
from app.db.base import utcnow
from app.models import (
    CropCycle,
    CycleStatus,
    Device,
    Field,
    Recommendation,
    SensorReading,
    Telemetry,
    User,
    WeatherDay,
)
from app.schemas.common import Schema
from app.services.crops import get_catalog

router = APIRouter(prefix="/admin", tags=["admin"])


class DayCount(Schema):
    day: date
    count: int


class RecentRecommendation(Schema):
    id: uuid.UUID
    created_at: datetime
    user_email: str
    field_name: str | None
    crop: str
    probability: float
    climate_basis: str | None


class AdminOverview(Schema):
    users: int
    users_active_7d: int
    fields: int
    mapped_fields: int
    soil_readings: int
    devices: int
    devices_online: int
    telemetry_24h: int
    recommendations: int
    active_cycles: int
    weather_days: int
    signups: list[DayCount]
    recent_recommendations: list[RecentRecommendation]


class AdminUserRow(Schema):
    id: uuid.UUID
    email: str
    full_name: str
    is_admin: bool
    created_at: datetime
    last_login_at: datetime | None
    fields: int
    soil_readings: int
    devices: int
    recommendations: int


def _count(db: DbSession, statement: Select[Any]) -> int:
    return db.scalar(select(func.count()).select_from(statement.subquery())) or 0


@router.get("/overview", response_model=AdminOverview)
def overview(_admin: AdminUser, db: DbSession) -> AdminOverview:
    now = utcnow()
    since = now - timedelta(days=29)
    signup_dates = db.scalars(select(User.created_at).where(User.created_at >= since))
    per_day: dict[date, int] = {}
    for created in signup_dates:
        per_day[created.date()] = per_day.get(created.date(), 0) + 1
    days = [(since + timedelta(days=i)).date() for i in range(30)]

    recent = db.execute(
        select(Recommendation, User.email, Field.name)
        .join(User, User.id == Recommendation.user_id)
        .outerjoin(Field, Field.id == Recommendation.field_id)
        .order_by(Recommendation.created_at.desc())
        .limit(10)
    ).all()
    catalog = get_catalog()

    def crop_name(slug: str) -> str:
        crop = catalog.get(slug)
        return crop.name if crop else slug

    return AdminOverview(
        users=_count(db, select(User.id)),
        users_active_7d=_count(
            db, select(User.id).where(User.last_login_at >= now - timedelta(days=7))
        ),
        fields=_count(db, select(Field.id)),
        mapped_fields=_count(db, select(Field.id).where(Field.latitude.is_not(None))),
        soil_readings=_count(db, select(SensorReading.id)),
        devices=_count(db, select(Device.id)),
        devices_online=_count(
            db, select(Device.id).where(Device.last_seen_at >= now - timedelta(hours=1))
        ),
        telemetry_24h=_count(
            db, select(Telemetry.id).where(Telemetry.received_at >= now - timedelta(days=1))
        ),
        recommendations=_count(db, select(Recommendation.id)),
        active_cycles=_count(
            db, select(CropCycle.id).where(CropCycle.status == CycleStatus.ACTIVE)
        ),
        weather_days=_count(db, select(WeatherDay.id)),
        signups=[DayCount(day=d, count=per_day.get(d, 0)) for d in days],
        recent_recommendations=[
            RecentRecommendation(
                id=rec.id,
                created_at=rec.created_at,
                user_email=email,
                field_name=field_name,
                crop=crop_name(rec.recommended_crop),
                probability=rec.predictions[0]["probability"] if rec.predictions else 0,
                climate_basis=(rec.context or {}).get("climate_basis"),
            )
            for rec, email, field_name in recent
        ],
    )


@router.get("/users", response_model=list[AdminUserRow])
def users(_admin: AdminUser, db: DbSession) -> list[AdminUserRow]:
    def per_user(statement: Select[uuid.UUID, int]) -> dict[uuid.UUID, int]:
        return {row[0]: row[1] for row in db.execute(statement)}

    fields = per_user(select(Field.owner_id, func.count()).group_by(Field.owner_id))
    readings = per_user(
        select(Field.owner_id, func.count()).join(SensorReading).group_by(Field.owner_id)
    )
    devices = per_user(select(Field.owner_id, func.count()).join(Device).group_by(Field.owner_id))
    recs = per_user(select(Recommendation.user_id, func.count()).group_by(Recommendation.user_id))

    return [
        AdminUserRow(
            id=u.id,
            email=u.email,
            full_name=u.full_name,
            is_admin=is_admin(u),
            created_at=u.created_at,
            last_login_at=u.last_login_at,
            fields=fields.get(u.id, 0),
            soil_readings=readings.get(u.id, 0),
            devices=devices.get(u.id, 0),
            recommendations=recs.get(u.id, 0),
        )
        for u in db.scalars(select(User).order_by(User.created_at.desc()))
    ]
