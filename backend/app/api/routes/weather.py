"""Weather feed for fields: live forecast, stored daily history and climate summaries."""

from __future__ import annotations

from dataclasses import asdict
from datetime import date, timedelta
from typing import Annotated

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import delete, func, select

from app.api.deps import DbSession, OwnedField, Weather
from app.models import Field, WeatherDay
from app.schemas.weather import (
    ClimateRead,
    ClimateSummaryRead,
    Coverage,
    DailyWeatherRead,
    MonthNormalRead,
    SeasonClimateRead,
    SyncRequest,
    SyncResult,
)
from app.services.weather import (
    DailyWeather,
    WeatherUnavailableError,
    monthly_normals,
    recent_summaries,
    season_climate,
)

router = APIRouter(prefix="/fields/{field_id}/weather", tags=["weather"])

# Recent days come from the forecast model and are refreshed until the archive replaces them.
REFRESH_RECENT_DAYS = 7


def _location(field: Field) -> tuple[float, float]:
    if field.latitude is None or field.longitude is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Add a location to this field to use weather data.",
        )
    return field.latitude, field.longitude


def _unavailable(exc: WeatherUnavailableError) -> HTTPException:
    code = status.HTTP_503_SERVICE_UNAVAILABLE if exc.rate_limited else status.HTTP_502_BAD_GATEWAY
    return HTTPException(status_code=code, detail=str(exc))


@router.get("/forecast", response_model=list[DailyWeatherRead])
def forecast(
    field: OwnedField,
    weather: Weather,
    days: Annotated[int, Query(ge=1, le=16)] = 7,
) -> list[DailyWeather]:
    """Live daily forecast for the field's location (not stored)."""
    lat, lon = _location(field)
    try:
        return weather.forecast(lat, lon, days)
    except WeatherUnavailableError as exc:
        raise _unavailable(exc) from exc


def sync_field_weather(db: DbSession, field: Field, weather: Weather, years: int) -> SyncResult:
    """Download whatever history is missing for ``field`` and store it."""
    lat, lon = _location(field)
    today = date.today()
    wanted_start = today - timedelta(days=365 * years)
    first, last = db.execute(
        select(func.min(WeatherDay.day), func.max(WeatherDay.day)).where(
            WeatherDay.field_id == field.id
        )
    ).one()

    ranges: list[tuple[date, date]] = []
    if first is None:
        ranges.append((wanted_start, today))
    else:
        if wanted_start < first:
            ranges.append((wanted_start, first - timedelta(days=1)))
        ranges.append((max(first, last - timedelta(days=REFRESH_RECENT_DAYS)), today))

    fetched = 0
    try:
        for start, end in ranges:
            records = weather.history(lat, lon, start, end)
            if not records:
                continue
            db.execute(
                delete(WeatherDay).where(
                    WeatherDay.field_id == field.id,
                    WeatherDay.day >= records[0].day,
                    WeatherDay.day <= records[-1].day,
                )
            )
            db.add_all(WeatherDay(field_id=field.id, **asdict(r)) for r in records)
            fetched += len(records)
    except WeatherUnavailableError as exc:
        db.rollback()
        raise _unavailable(exc) from exc
    db.commit()

    total, first, last = db.execute(
        select(func.count(), func.min(WeatherDay.day), func.max(WeatherDay.day)).where(
            WeatherDay.field_id == field.id
        )
    ).one()
    return SyncResult(fetched=fetched, total_days=total, start=first, end=last)


@router.post("/sync", response_model=SyncResult)
def sync(payload: SyncRequest, field: OwnedField, db: DbSession, weather: Weather) -> SyncResult:
    """Fetch and store daily weather history. Only missing or provisional days are downloaded."""
    return sync_field_weather(db, field, weather, payload.years)


@router.get("", response_model=list[DailyWeatherRead])
def history(
    field: OwnedField,
    db: DbSession,
    since: Annotated[date | None, Query()] = None,
    until: Annotated[date | None, Query()] = None,
) -> list[WeatherDay]:
    """Stored daily weather, oldest first."""
    query = select(WeatherDay).where(WeatherDay.field_id == field.id)
    if since:
        query = query.where(WeatherDay.day >= since)
    if until:
        query = query.where(WeatherDay.day <= until)
    return list(db.scalars(query.order_by(WeatherDay.day)))


@router.get("/climate", response_model=ClimateRead)
def climate(
    field: OwnedField,
    db: DbSession,
    season_start: Annotated[int | None, Query(ge=1, le=12, description="First month")] = None,
    season_months: Annotated[int, Query(ge=1, le=12)] = 4,
) -> ClimateRead:
    """Climate derived from stored history: recent windows, monthly normals and a season."""
    days = list(db.scalars(select(WeatherDay).where(WeatherDay.field_id == field.id)))
    normals = monthly_normals(days)
    season = season_climate(normals, season_start, season_months) if season_start else None
    return ClimateRead(
        coverage=Coverage(
            start=min((d.day for d in days), default=None),
            end=max((d.day for d in days), default=None),
            days=len(days),
        ),
        recent=[ClimateSummaryRead.model_validate(asdict(s)) for s in recent_summaries(days)],
        normals=[MonthNormalRead.model_validate(asdict(n)) for n in normals],
        season=SeasonClimateRead.model_validate(asdict(season)) if season else None,
    )
