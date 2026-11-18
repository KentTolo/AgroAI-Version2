"""Export the trained model and agronomy knowledge for the browser-only demo build.

Usage (from ``backend/``)::

    uv run python -m app.ml.export --out ../frontend/public/demo

Writes two files:

* ``model.json``: the Random Forest in a compact pre-order encoding. Each tree is a flat list
  where an internal node is ``feature_index, threshold`` followed by its left then right
  subtree, and a leaf is ``-(class_index + 1)``. Every leaf of a fully grown forest is pure, so
  a tree's prediction is a single class and the forest's probability for a class is the share
  of trees that vote for it, exactly as scikit-learn computes it.
* ``knowledge.json``: parameters, crop catalogue and profiles, advice text, verdict wording,
  growth-stage templates and simulator settings, so the demo applies the same rules as the API.
"""

from __future__ import annotations

import argparse
import json
from dataclasses import asdict
from pathlib import Path
from typing import Any

import numpy as np
from sklearn.ensemble import RandomForestClassifier

from app.api.presenters import VERDICT_TEXT
from app.core.config import get_settings
from app.ml.features import FEATURES, PARAMETERS
from app.ml.predictor import CropRecommender
from app.services.advisory import ADVICE, SEVERITY_SCORES
from app.services.crops import get_catalog
from app.services.growth import STAGE_TEMPLATES
from app.services.simulator import SERIES


class ExportError(RuntimeError):
    pass


def encode_tree(tree: Any) -> list[float]:
    left, right = tree.children_left, tree.children_right
    feature, threshold, value = tree.feature, tree.threshold, tree.value[:, 0, :]
    out: list[float] = []

    def walk(node: int) -> None:
        if left[node] == -1:
            classes = np.flatnonzero(value[node] > 0)
            if len(classes) != 1:
                raise ExportError("Impure leaf found; the compact encoding needs pure leaves.")
            out.append(-(int(classes[0]) + 1))
            return
        out.append(int(feature[node]))
        out.append(float(np.float32(threshold[node])))
        walk(int(left[node]))
        walk(int(right[node]))

    walk(0)
    return out


def predict_encoded(trees: list[list[float]], n_classes: int, row: list[float]) -> list[float]:
    """Reference decoder, mirroring the TypeScript one; used by the tests."""
    votes = [0] * n_classes
    for tree in trees:
        i = 0
        while tree[i] >= 0:
            feature, threshold = int(tree[i]), tree[i + 1]
            if row[feature] <= threshold:
                i += 2
            else:
                i = _skip(tree, i + 2)
        votes[int(-tree[i]) - 1] += 1
    return [v / len(trees) for v in votes]


def _skip(tree: list[float], i: int) -> int:
    """Index just past the subtree starting at ``i``."""
    pending = 1
    while pending:
        if tree[i] < 0:
            i += 1
            pending -= 1
        else:
            i += 2
            pending += 1
    return i


def export_model(recommender: CropRecommender) -> dict[str, Any]:
    estimator = recommender.estimator
    if not isinstance(estimator, RandomForestClassifier):
        raise ExportError("The browser demo supports Random Forest models only.")
    meta = recommender.metadata
    return {
        "version": meta["version"],
        "algorithm": meta["algorithm"],
        "trained_at": meta["trained_at"],
        "features": list(FEATURES),
        "classes": recommender.classes,
        "dataset": meta.get("dataset", {}),
        "metrics": meta.get("metrics", {}),
        "trees": [encode_tree(e.tree_) for e in estimator.estimators_],
    }


def export_knowledge() -> dict[str, Any]:
    catalog = get_catalog()
    return {
        "parameters": [asdict(p) for p in PARAMETERS],
        "dataset_bounds": catalog.dataset_bounds,
        "crops": [
            {
                "slug": c.slug,
                "name": c.name,
                "category": c.category,
                "lifecycle": c.lifecycle,
                "days_to_harvest": c.days_to_harvest,
                "description": c.description,
                "profile": c.profile,
            }
            for c in catalog.crops.values()
        ],
        "advice": {
            key: {d: {str(s): text for s, text in levels.items()} for d, levels in dirs.items()}
            for key, dirs in ADVICE.items()
        },
        "severity_scores": {str(k): v for k, v in SEVERITY_SCORES.items()},
        "verdict_text": VERDICT_TEXT,
        "stage_templates": {
            lifecycle: [asdict(t) for t in templates]
            for lifecycle, templates in STAGE_TEMPLATES.items()
        },
        "simulator": {k: asdict(v) for k, v in SERIES.items()},
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Export the model and rules for the web demo.")
    parser.add_argument("--out", type=Path, required=True, help="Output directory")
    args = parser.parse_args()

    recommender = CropRecommender.load(get_settings().artifacts_dir)
    args.out.mkdir(parents=True, exist_ok=True)
    model = export_model(recommender)
    (args.out / "model.json").write_text(json.dumps(model, separators=(",", ":")))
    (args.out / "knowledge.json").write_text(
        json.dumps(export_knowledge(), separators=(",", ":"), ensure_ascii=False)
    )
    size_kb = (args.out / "model.json").stat().st_size / 1024
    print(f"Exported {len(model['trees'])} trees ({size_kb:.0f} KB) to {args.out}")


if __name__ == "__main__":
    main()
