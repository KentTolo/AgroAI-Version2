"""Recommendations, advisory, crop catalogue and model information."""

from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, HTTPException, Query, Response, status
from sqlalchemy import func, select

from app.api.deps import CurrentUser, DbSession, OptionalRecommender, Recommender
from app.api.presenters import advisory_read, crop_read, recommendation_read
from app.models import Field, Recommendation, SensorReading
from app.schemas.agronomy import (
    AdvisoryRead,
    AdvisoryRequest,
    CropRead,
    ModelInfo,
    RecommendationRead,
    RecommendationRequest,
)
from app.schemas.common import GrowingConditions, Limit, Offset, Page
from app.services.advisory import assess
from app.services.crops import get_catalog

router = APIRouter(tags=["agronomy"])

_NOT_FOUND = "Recommendation not found"


@router.get("/crops", response_model=list[CropRead], tags=["crops"])
def list_crops() -> list[CropRead]:
    """Every crop the system knows, with the conditions it grows best in."""
    return [crop_read(c) for c in get_catalog().crops.values()]


@router.get("/crops/{slug}", response_model=CropRead, tags=["crops"])
def get_crop(slug: str) -> CropRead:
    crop = get_catalog().get(slug)
    if crop is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Crop not found")
    return crop_read(crop)


@router.get("/model", response_model=ModelInfo, tags=["recommendations"])
def model_info(recommender: Recommender) -> ModelInfo:
    """Version and evaluation metrics of the model currently serving predictions."""
    fields = ModelInfo.model_fields.keys()
    return ModelInfo.model_validate({k: v for k, v in recommender.metadata.items() if k in fields})


@router.post(
    "/recommendations",
    response_model=RecommendationRead,
    status_code=status.HTTP_201_CREATED,
    tags=["recommendations"],
)
def create_recommendation(
    payload: RecommendationRequest, user: CurrentUser, db: DbSession, recommender: Recommender
) -> RecommendationRead:
    """Rank crops for the given conditions, or for a field's latest sensor reading."""
    conditions = payload.conditions
    if payload.field_id is not None:
        field = db.get(Field, payload.field_id)
        if field is None or field.owner_id != user.id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Field not found")
        if conditions is None:
            latest = db.scalar(
                select(SensorReading)
                .where(SensorReading.field_id == field.id)
                .order_by(SensorReading.recorded_at.desc())
                .limit(1)
            )
            if latest is None:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="This field has no readings yet. Add or simulate a reading first.",
                )
            conditions = GrowingConditions.model_validate(latest)

    if conditions is None:  # pragma: no cover - RecommendationRequest guarantees an input
        raise HTTPException(status_code=422, detail="Provide conditions or a field_id")
    inputs = conditions.model_dump()
    ranked = recommender.rank(inputs, top_k=payload.top_k)
    rec = Recommendation(
        user_id=user.id,
        field_id=payload.field_id,
        inputs=inputs,
        predictions=[{"crop": s.crop, "probability": round(s.probability, 4)} for s in ranked],
        recommended_crop=ranked[0].crop,
        model_version=recommender.version,
        context={"climate_basis": payload.climate_basis} if payload.climate_basis else None,
    )
    db.add(rec)
    db.commit()
    return recommendation_read(rec, get_catalog())


@router.get("/recommendations", response_model=Page[RecommendationRead], tags=["recommendations"])
def list_recommendations(
    user: CurrentUser,
    db: DbSession,
    field_id: Annotated[uuid.UUID | None, Query()] = None,
    limit: Limit = 20,
    offset: Offset = 0,
) -> Page[RecommendationRead]:
    query = select(Recommendation).where(Recommendation.user_id == user.id)
    if field_id:
        query = query.where(Recommendation.field_id == field_id)
    total = db.scalar(select(func.count()).select_from(query.subquery())) or 0
    rows = db.scalars(query.order_by(Recommendation.created_at.desc()).limit(limit).offset(offset))
    catalog = get_catalog()
    items = [recommendation_read(r, catalog) for r in rows]
    return Page(items=items, total=total, limit=limit, offset=offset)


def _owned_recommendation(rec_id: uuid.UUID, user: CurrentUser, db: DbSession) -> Recommendation:
    rec = db.get(Recommendation, rec_id)
    if rec is None or rec.user_id != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=_NOT_FOUND)
    return rec


@router.get(
    "/recommendations/{rec_id}", response_model=RecommendationRead, tags=["recommendations"]
)
def get_recommendation(rec_id: uuid.UUID, user: CurrentUser, db: DbSession) -> RecommendationRead:
    return recommendation_read(_owned_recommendation(rec_id, user, db), get_catalog())


@router.delete(
    "/recommendations/{rec_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    tags=["recommendations"],
)
def delete_recommendation(rec_id: uuid.UUID, user: CurrentUser, db: DbSession) -> Response:
    db.delete(_owned_recommendation(rec_id, user, db))
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/advisory", response_model=AdvisoryRead, tags=["advisory"])
def advise(
    payload: AdvisoryRequest, _user: CurrentUser, recommender: OptionalRecommender
) -> AdvisoryRead:
    """Assess how well a chosen crop suits the conditions, with corrective advice."""
    crop = get_catalog().get(payload.crop)
    if crop is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=f"Unknown crop '{payload.crop}'"
        )
    conditions = payload.conditions.model_dump()
    probability = recommender.probability_of(crop.slug, conditions) if recommender else None
    return advisory_read(assess(crop, conditions), probability)
