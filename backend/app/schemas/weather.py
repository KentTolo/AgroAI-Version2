from __future__ import annotations

from datetime import date

from pydantic import Field

from app.schemas.common import Schema


class DailyWeatherRead(Schema):
    day: date
    temperature_mean: float = Field(description="°C")
    temperature_min: float | None = Field(description="°C")
    temperature_max: float | None = Field(description="°C")
    precipitation: float = Field(description="mm")
    humidity_mean: float | None = Field(description="%")
    source: str = Field(description="archive, recent (provisional) or forecast")


class SyncRequest(Schema):
    years: int = Field(default=3, ge=1, le=10, description="How many years of history to keep")


class SyncResult(Schema):
    fetched: int = Field(description="Days downloaded in this sync")
    total_days: int
    start: date | None
    end: date | None


class ClimateSummaryRead(Schema):
    label: str
    start: date
    end: date
    days: int
    temperature: float = Field(description="Average °C")
    humidity: float | None = Field(description="Average relative humidity, %")
    rainfall: float = Field(description="Average monthly rainfall, mm per 30 days")
    total_rainfall: float = Field(description="Total rainfall over the period, mm")


class MonthNormalRead(Schema):
    month: int = Field(ge=1, le=12)
    temperature: float
    humidity: float | None
    rainfall: float | None = Field(description="Average monthly total, mm")
    years: int


class SeasonClimateRead(Schema):
    label: str
    start_month: int
    months: int
    temperature: float
    humidity: float | None
    rainfall: float = Field(description="Average monthly rainfall over the season, mm")
    years: int


class Coverage(Schema):
    start: date | None
    end: date | None
    days: int


class ClimateRead(Schema):
    coverage: Coverage
    recent: list[ClimateSummaryRead]
    normals: list[MonthNormalRead]
    season: SeasonClimateRead | None
    attribution: str = "Weather data by Open-Meteo.com (CC BY 4.0)"
