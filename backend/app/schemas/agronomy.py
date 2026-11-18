"""Schemas for recommendations, advisory, the crop catalogue and crop cycles."""

from __future__ import annotations

import uuid
from datetime import date, datetime
from typing import Annotated, Any, Literal

from pydantic import Field, model_validator

from app.models import CycleStatus
from app.schemas.common import GrowingConditions, Schema
from app.services.advisory import Direction, Severity, Verdict
from app.services.growth import StageStatus

# --- Crop catalogue ---------------------------------------------------------------------------


class ParameterRange(Schema):
    min: float
    max: float
    optimal_min: float = Field(description="10th percentile of observed conditions")
    optimal_max: float = Field(description="90th percentile of observed conditions")
    typical: float = Field(description="Median of observed conditions")


class CropRead(Schema):
    slug: str
    name: str
    category: str
    lifecycle: Literal["annual", "perennial"]
    days_to_harvest: int
    description: str
    requirements: dict[str, ParameterRange]


# --- Recommendations --------------------------------------------------------------------------


class RecommendationRequest(Schema):
    conditions: GrowingConditions | None = Field(
        default=None, description="Conditions to evaluate. Omit to use the field's latest reading."
    )
    field_id: uuid.UUID | None = Field(
        default=None, description="Field to link the recommendation to"
    )
    top_k: int = Field(default=3, ge=1, le=10, description="Number of ranked crops to return")

    @model_validator(mode="after")
    def _needs_input(self) -> RecommendationRequest:
        if self.conditions is None and self.field_id is None:
            raise ValueError("Provide conditions, a field_id, or both")
        return self


class CropPrediction(Schema):
    crop: str
    name: str
    probability: float = Field(ge=0, le=1)


class RecommendationRead(Schema):
    id: uuid.UUID
    field_id: uuid.UUID | None
    created_at: datetime
    inputs: GrowingConditions
    recommended_crop: str
    predictions: list[CropPrediction]
    model_version: str
    warnings: list[str] = Field(default_factory=list)


# --- Advisory ---------------------------------------------------------------------------------


class AdvisoryRequest(Schema):
    crop: str = Field(min_length=1, max_length=40, examples=["maize"])
    conditions: GrowingConditions


class ParameterAssessmentRead(Schema):
    parameter: str
    label: str
    unit: str
    value: float
    optimal_min: float
    optimal_max: float
    typical: float
    severity: Severity
    direction: Direction | None
    advice: str | None


class AdvisoryRead(Schema):
    crop: str
    crop_name: str
    score: int = Field(ge=0, le=100, description="Overall suitability, 0 to 100")
    verdict: Verdict
    summary: str
    model_probability: float | None = Field(
        default=None, description="The ML model's probability for this crop, if available"
    )
    parameters: list[ParameterAssessmentRead]


# --- Crop cycles ------------------------------------------------------------------------------

Notes = Annotated[str, Field(max_length=2000)]


class CycleCreate(Schema):
    crop: str = Field(min_length=1, max_length=40, examples=["maize"])
    planted_on: date
    expected_harvest_on: date | None = Field(
        default=None, description="Defaults to the crop's typical time to harvest"
    )
    notes: Notes | None = None


class CycleUpdate(Schema):
    status: CycleStatus | None = None
    expected_harvest_on: date | None = None
    harvested_on: date | None = None
    yield_kg: float | None = Field(default=None, ge=0)
    notes: Notes | None = None


class StageRead(Schema):
    name: str
    guidance: str
    start_day: int
    end_day: int
    status: StageStatus


class ProgressRead(Schema):
    day: int
    total_days: int
    percent: float
    days_remaining: int
    current_stage: str
    stages: list[StageRead]


class CycleRead(Schema):
    id: uuid.UUID
    field_id: uuid.UUID
    field_name: str
    crop: str
    crop_name: str
    planted_on: date
    expected_harvest_on: date
    harvested_on: date | None
    status: CycleStatus
    yield_kg: float | None
    notes: str | None
    created_at: datetime
    progress: ProgressRead | None = Field(description="Present while the cycle is active")


# --- Model info and dashboard -----------------------------------------------------------------


class ModelInfo(Schema):
    version: str
    algorithm: str
    trained_at: datetime
    features: list[str]
    classes: list[str]
    metrics: dict[str, Any]


class DashboardRead(Schema):
    field_count: int
    active_cycle_count: int
    recommendation_count: int
    reading_count: int
    recent_recommendations: list[RecommendationRead]
    active_cycles: list[CycleRead]
