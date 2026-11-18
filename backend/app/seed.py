"""Create a demo account populated with fields, sensor history, plantings and recommendations.

Usage (from ``backend/``)::

    uv run python -m app.seed                      # demo@agroai.example / agroai-demo-1
    uv run python -m app.seed --email me@example.com --password 'my-pass-1'

Running it again resets the demo account to a fresh state.
"""

from __future__ import annotations

import argparse
import logging
from datetime import date, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.security import hash_password
from app.db.base import utcnow
from app.db.session import SessionLocal
from app.ml.predictor import CropRecommender, ModelNotAvailableError
from app.models import (
    CropCycle,
    CycleStatus,
    Field,
    ReadingSource,
    Recommendation,
    SensorReading,
    User,
)
from app.services.crops import get_catalog
from app.services.growth import expected_harvest_date
from app.services.simulator import generate_series

logger = logging.getLogger("agroai.seed")

DEMO_FIELDS = [
    # name, latitude, longitude, hectares, soil, notes, seed
    ("Ha Foso lowland plot", -29.2675, 27.5410, 1.8, "Loam", "Gentle slope, river nearby.", 11),
    ("Roma valley terrace", -29.4485, 27.7239, 0.9, "Clay loam", "Terraced; holds water well.", 23),
    ("Morija garden", -29.6260, 27.5050, 0.4, "Sandy loam", "Vegetables and legumes.", 37),
]

DEMO_CYCLES = [
    # field index, crop, days since planting, status
    (0, "maize", 46, CycleStatus.ACTIVE),
    (1, "kidneybeans", 18, CycleStatus.ACTIVE),
    (2, "chickpea", 70, CycleStatus.ACTIVE),
    (0, "lentil", 300, CycleStatus.HARVESTED),
]


def seed(db: Session, email: str, password: str, recommender: CropRecommender | None) -> User:
    existing = db.scalar(select(User).where(User.email == email))
    if existing:
        db.delete(existing)
        db.flush()

    user = User(email=email, full_name="Demo Farmer", hashed_password=hash_password(password))
    db.add(user)
    db.flush()

    catalog = get_catalog()
    fields: list[Field] = []
    for name, lat, lng, area, soil, notes, rng_seed in DEMO_FIELDS:
        field = Field(
            owner_id=user.id,
            name=name,
            latitude=lat,
            longitude=lng,
            area_hectares=area,
            soil_type=soil,
            notes=notes,
        )
        db.add(field)
        db.flush()
        series = generate_series(end=utcnow(), count=60, interval=timedelta(days=1), seed=rng_seed)
        db.add_all(
            SensorReading(
                field_id=field.id, recorded_at=ts, source=ReadingSource.SIMULATED, **values
            )
            for ts, values in series
        )
        fields.append(field)

        if recommender is not None:
            latest = series[-1][1]
            ranked = recommender.rank(latest, top_k=5)
            db.add(
                Recommendation(
                    user_id=user.id,
                    field_id=field.id,
                    inputs=latest,
                    predictions=[
                        {"crop": s.crop, "probability": round(s.probability, 4)} for s in ranked
                    ],
                    recommended_crop=ranked[0].crop,
                    model_version=recommender.version,
                )
            )

    today = date.today()
    for field_index, crop_slug, days_ago, status in DEMO_CYCLES:
        crop = catalog.get(crop_slug)
        if crop is None:
            raise RuntimeError(f"Demo crop '{crop_slug}' is missing from the catalogue")
        planted = today - timedelta(days=days_ago)
        expected = expected_harvest_date(crop, planted)
        harvested = expected if status is CycleStatus.HARVESTED else None
        db.add(
            CropCycle(
                field_id=fields[field_index].id,
                crop=crop.slug,
                planted_on=planted,
                expected_harvest_on=expected,
                harvested_on=harvested,
                status=status,
                yield_kg=420.0 if harvested else None,
            )
        )

    db.commit()
    return user


def main() -> None:
    parser = argparse.ArgumentParser(description="Create or reset the AgroAI demo account.")
    parser.add_argument("--email", default="demo@agroai.example")
    parser.add_argument("--password", default="agroai-demo-1")
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(message)s")

    try:
        recommender: CropRecommender | None = CropRecommender.load(get_settings().artifacts_dir)
    except ModelNotAvailableError:
        logger.warning("No trained model found; seeding without recommendations.")
        recommender = None

    with SessionLocal() as db:
        user = seed(db, args.email.lower(), args.password, recommender)
    logger.info("Demo account ready: %s / %s", user.email, args.password)


if __name__ == "__main__":
    main()
