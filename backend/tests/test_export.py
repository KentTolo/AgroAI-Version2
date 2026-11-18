from __future__ import annotations

import json
from pathlib import Path

from app.core.config import get_settings
from app.ml.dataset import load_dataset
from app.ml.export import export_knowledge, export_model, predict_encoded
from app.ml.features import FEATURES
from app.ml.predictor import CropRecommender


def test_encoded_forest_matches_scikit_learn(artifacts_dir: Path) -> None:
    """The browser demo must make exactly the same predictions as the API."""
    recommender = CropRecommender.load(artifacts_dir)
    exported = json.loads(json.dumps(export_model(recommender)))  # round-trip through JSON
    df = load_dataset(get_settings().dataset_path).sample(300, random_state=1)

    for row in df[list(FEATURES)].itertuples(index=False):
        conditions = dict(zip(FEATURES, row, strict=True))
        expected = {s.crop: s.probability for s in recommender.rank(conditions)}
        actual = predict_encoded(exported["trees"], len(exported["classes"]), list(row))
        for crop, probability in zip(exported["classes"], actual, strict=True):
            assert abs(probability - expected[crop]) < 1e-9, crop


def test_knowledge_export_is_complete() -> None:
    knowledge = export_knowledge()
    assert len(knowledge["crops"]) == 22
    assert set(knowledge["advice"]) == set(FEATURES)
    assert knowledge["advice"]["ph"]["increase"]["significant"]
    assert {"annual", "perennial"} == set(knowledge["stage_templates"])
    json.dumps(knowledge)  # serialisable
