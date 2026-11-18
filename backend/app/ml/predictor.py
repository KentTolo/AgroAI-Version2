"""Loading the trained model and serving predictions."""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import joblib
import pandas as pd

from app.ml.features import FEATURES

logger = logging.getLogger(__name__)

MODEL_FILENAME = "model.joblib"
METADATA_FILENAME = "model_metadata.json"


class ModelNotAvailableError(RuntimeError):
    pass


@dataclass(frozen=True, slots=True)
class CropScore:
    crop: str
    probability: float


class CropRecommender:
    """Thin wrapper around the trained scikit-learn estimator."""

    def __init__(self, estimator: Any, metadata: dict[str, Any]) -> None:
        self._estimator = estimator
        self.metadata = metadata
        self.version: str = metadata["version"]
        self.classes: list[str] = [str(c) for c in estimator.classes_]
        if list(metadata.get("features", [])) != list(FEATURES):
            raise ModelNotAvailableError(
                "Model was trained on different features than this API expects; retrain it."
            )

    @classmethod
    def load(cls, artifacts_dir: Path) -> CropRecommender:
        model_path = artifacts_dir / MODEL_FILENAME
        metadata_path = artifacts_dir / METADATA_FILENAME
        if not model_path.exists() or not metadata_path.exists():
            raise ModelNotAvailableError(
                f"No trained model in {artifacts_dir}. Run `make train` (or "
                "`uv run python -m app.ml.train` in backend/) first."
            )
        estimator = joblib.load(model_path)
        metadata = json.loads(metadata_path.read_text())
        logger.info("Loaded crop model %s", metadata.get("version"))
        return cls(estimator, metadata)

    def rank(self, conditions: dict[str, float], top_k: int | None = None) -> list[CropScore]:
        """Return crops ordered from most to least suitable, with class probabilities."""
        frame = pd.DataFrame([[float(conditions[f]) for f in FEATURES]], columns=list(FEATURES))
        probabilities = self._estimator.predict_proba(frame)[0]
        ranked = sorted(
            (
                CropScore(crop, float(p))
                for crop, p in zip(self.classes, probabilities, strict=True)
            ),
            key=lambda s: s.probability,
            reverse=True,
        )
        return ranked[:top_k] if top_k else ranked

    def probability_of(self, crop: str, conditions: dict[str, float]) -> float | None:
        if crop not in self.classes:
            return None
        return next(s.probability for s in self.rank(conditions) if s.crop == crop)
