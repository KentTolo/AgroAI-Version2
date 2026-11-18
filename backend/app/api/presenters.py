"""Turn ORM objects and service results into response schemas."""

from __future__ import annotations

from dataclasses import asdict
from datetime import date

from app.ml.features import PARAMETERS
from app.models import CropCycle, CycleStatus, Recommendation
from app.schemas.agronomy import (
    AdvisoryRead,
    CropPrediction,
    CropRead,
    CycleRead,
    ParameterAssessmentRead,
    ParameterRange,
    ProgressRead,
    RecommendationRead,
)
from app.schemas.common import GrowingConditions
from app.services.advisory import SEVERITY_SCORES, Assessment
from app.services.crops import CropCatalog, CropInfo
from app.services.growth import compute_progress

VERDICT_TEXT = {
    "well_suited": "{name} is well suited to these conditions.",
    "suitable_with_adjustments": "{name} can do well here with some adjustments.",
    "marginal": "{name} is marginal here; expect reduced yields without significant changes.",
    "not_recommended": "{name} is not recommended for these conditions.",
}


def crop_read(crop: CropInfo) -> CropRead:
    requirements = {
        key: ParameterRange(
            min=stats["min"],
            max=stats["max"],
            optimal_min=stats["p10"],
            optimal_max=stats["p90"],
            typical=stats["median"],
        )
        for key, stats in crop.profile.items()
    }
    return CropRead(
        slug=crop.slug,
        name=crop.name,
        category=crop.category,
        lifecycle=crop.lifecycle,
        days_to_harvest=crop.days_to_harvest,
        description=crop.description,
        requirements=requirements,
    )


def out_of_range_warnings(conditions: dict[str, float], catalog: CropCatalog) -> list[str]:
    """Flag inputs outside anything the model saw in training, where predictions are guesses."""
    warnings = []
    for param in PARAMETERS:
        bounds = catalog.dataset_bounds[param.key]
        value = conditions[param.key]
        if not bounds["min"] <= value <= bounds["max"]:
            warnings.append(
                f"{param.label} of {value:g} {param.unit} is outside the training data range "
                f"({bounds['min']:g} to {bounds['max']:g} {param.unit}); treat the result with "
                "caution."
            )
    return warnings


def recommendation_read(rec: Recommendation, catalog: CropCatalog) -> RecommendationRead:
    def name_of(slug: str) -> str:
        crop = catalog.get(slug)
        return crop.name if crop else slug.title()

    return RecommendationRead(
        id=rec.id,
        field_id=rec.field_id,
        created_at=rec.created_at,
        inputs=GrowingConditions.model_validate(rec.inputs),
        recommended_crop=rec.recommended_crop,
        predictions=[
            CropPrediction(crop=p["crop"], name=name_of(p["crop"]), probability=p["probability"])
            for p in rec.predictions
        ],
        model_version=rec.model_version,
        warnings=out_of_range_warnings(rec.inputs, catalog),
    )


def advisory_read(assessment: Assessment, model_probability: float | None) -> AdvisoryRead:
    crop = assessment.crop
    summary = VERDICT_TEXT[assessment.verdict].format(name=crop.name)
    issues = assessment.issues
    if issues:
        worst = min(issues, key=lambda p: SEVERITY_SCORES[p.severity])
        summary += f" The biggest gap is {worst.label.lower()}."
    return AdvisoryRead(
        crop=crop.slug,
        crop_name=crop.name,
        score=assessment.score,
        verdict=assessment.verdict,
        summary=summary,
        model_probability=model_probability,
        parameters=[ParameterAssessmentRead(**asdict(p)) for p in assessment.parameters],
    )


def cycle_read(cycle: CropCycle, catalog: CropCatalog, today: date | None = None) -> CycleRead:
    crop = catalog.get(cycle.crop)
    progress = None
    if crop and cycle.status is CycleStatus.ACTIVE:
        result = compute_progress(
            crop, cycle.planted_on, cycle.expected_harvest_on, today or date.today()
        )
        progress = ProgressRead.model_validate(asdict(result))
    return CycleRead(
        id=cycle.id,
        field_id=cycle.field_id,
        field_name=cycle.field.name,
        crop=cycle.crop,
        crop_name=crop.name if crop else cycle.crop.title(),
        planted_on=cycle.planted_on,
        expected_harvest_on=cycle.expected_harvest_on,
        harvested_on=cycle.harvested_on,
        status=cycle.status,
        yield_kg=cycle.yield_kg,
        notes=cycle.notes,
        created_at=cycle.created_at,
        progress=progress,
    )
