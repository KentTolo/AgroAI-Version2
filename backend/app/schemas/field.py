from __future__ import annotations

import uuid
from datetime import datetime
from typing import Annotated

from pydantic import Field as PydanticField
from pydantic import model_validator

from app.models import ReadingSource
from app.schemas.common import GrowingConditions, Schema

Name = Annotated[str, PydanticField(min_length=1, max_length=120)]
Latitude = Annotated[float, PydanticField(ge=-90, le=90)]
Longitude = Annotated[float, PydanticField(ge=-180, le=180)]
Area = Annotated[float, PydanticField(gt=0, le=100_000, description="Area in hectares")]


class _Location(Schema):
    @model_validator(mode="after")
    def _both_or_neither(self) -> _Location:
        lat = getattr(self, "latitude", None)
        lng = getattr(self, "longitude", None)
        if (lat is None) != (lng is None):
            raise ValueError("Provide both latitude and longitude, or neither")
        return self


class FieldCreate(_Location):
    name: Name
    latitude: Latitude | None = None
    longitude: Longitude | None = None
    area_hectares: Area | None = None
    soil_type: Annotated[str, PydanticField(max_length=40)] | None = None
    notes: Annotated[str, PydanticField(max_length=2000)] | None = None


class FieldUpdate(_Location):
    name: Name | None = None
    latitude: Latitude | None = None
    longitude: Longitude | None = None
    area_hectares: Area | None = None
    soil_type: Annotated[str, PydanticField(max_length=40)] | None = None
    notes: Annotated[str, PydanticField(max_length=2000)] | None = None


class ReadingCreate(GrowingConditions):
    recorded_at: datetime | None = PydanticField(
        default=None, description="When the reading was taken (defaults to now)"
    )


class ReadingRead(GrowingConditions):
    id: uuid.UUID
    field_id: uuid.UUID
    recorded_at: datetime
    source: ReadingSource


class SimulationRequest(Schema):
    days: int = PydanticField(default=30, ge=1, le=365, description="How far back to simulate")
    readings_per_day: int = PydanticField(default=1, ge=1, le=24)
    seed: int | None = PydanticField(default=None, description="Seed for reproducible data")


class FieldRead(Schema):
    id: uuid.UUID
    name: str
    latitude: float | None
    longitude: float | None
    area_hectares: float | None
    soil_type: str | None
    notes: str | None
    created_at: datetime
    updated_at: datetime
    latest_reading: ReadingRead | None = None
    active_cycle_count: int = 0
