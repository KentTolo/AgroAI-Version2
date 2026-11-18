"""Train, evaluate and package the crop recommendation model.

Usage (from ``backend/``)::

    uv run python -m app.ml.train                  # compare candidates, ship Random Forest
    uv run python -m app.ml.train --select-best    # ship the candidate with the lowest CV log loss
    uv run python -m app.ml.train --model knn      # ship a specific candidate

Steps:
1. Load and validate the dataset.
2. Hold out a stratified 20% test split.
3. Compare candidate classifiers with stratified 5-fold cross-validation on the training split.
4. Evaluate the shipped model once on the held-out test split.
5. Refit the selected model on the full dataset and write the artifact plus its metadata.
6. Regenerate the per-crop condition profiles used by the advisory engine.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import logging
import platform
import time
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import joblib
import numpy as np
import sklearn
from sklearn.base import ClassifierMixin
from sklearn.ensemble import ExtraTreesClassifier, RandomForestClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, classification_report, f1_score, log_loss
from sklearn.model_selection import StratifiedKFold, cross_validate, train_test_split
from sklearn.naive_bayes import GaussianNB
from sklearn.neighbors import KNeighborsClassifier
from sklearn.pipeline import Pipeline, make_pipeline
from sklearn.preprocessing import StandardScaler

from app.core.config import BACKEND_DIR, get_settings
from app.ml.dataset import load_dataset
from app.ml.features import FEATURES
from app.ml.predictor import METADATA_FILENAME, MODEL_FILENAME
from app.ml.profiles import build_profiles, write_profiles

logger = logging.getLogger("agroai.train")

RANDOM_STATE = 42
TEST_SIZE = 0.2
CV_FOLDS = 5

# Random Forest is the default even though Gaussian Naive Bayes scores marginally better on this
# dataset's cross-validation. On conditions unlike the training data (which is the normal case
# for Lesotho: cooler and drier than the source data) Naive Bayes reports near-certainty, while
# the forest's vote shares stay spread out and honestly reflect the uncertainty. See
# docs/model-card.md.
DEFAULT_MODEL = "random_forest"
PROFILES_PATH = BACKEND_DIR / "app" / "data" / "crop_profiles.json"


def candidate_models() -> dict[str, ClassifierMixin | Pipeline]:
    return {
        "random_forest": RandomForestClassifier(
            n_estimators=300, min_samples_leaf=1, n_jobs=-1, random_state=RANDOM_STATE
        ),
        "extra_trees": ExtraTreesClassifier(n_estimators=300, n_jobs=-1, random_state=RANDOM_STATE),
        "gaussian_nb": GaussianNB(),
        "knn": make_pipeline(StandardScaler(), KNeighborsClassifier(n_neighbors=7)),
        "logistic_regression": make_pipeline(
            StandardScaler(), LogisticRegression(max_iter=5000, random_state=RANDOM_STATE)
        ),
    }


def _file_sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def train(
    model_name: str | None, artifacts_dir: Path, dataset_path: Path, *, select_best: bool = False
) -> dict[str, Any]:
    started = time.perf_counter()
    df = load_dataset(dataset_path)
    x = df[list(FEATURES)]
    y = df["crop"]
    logger.info("Loaded %d samples, %d crops", len(df), y.nunique())

    x_train, x_test, y_train, y_test = train_test_split(
        x, y, test_size=TEST_SIZE, stratify=y, random_state=RANDOM_STATE
    )

    candidates = candidate_models()
    if model_name and model_name not in candidates:
        raise SystemExit(f"Unknown model '{model_name}'. Choose from: {', '.join(candidates)}")

    cv = StratifiedKFold(n_splits=CV_FOLDS, shuffle=True, random_state=RANDOM_STATE)
    comparison: dict[str, dict[str, float]] = {}
    for name, estimator in candidates.items():
        scores = cross_validate(
            estimator,
            x_train,
            y_train,
            cv=cv,
            scoring=("accuracy", "f1_macro", "neg_log_loss"),
            n_jobs=1,
        )
        comparison[name] = {
            "cv_accuracy_mean": round(float(np.mean(scores["test_accuracy"])), 4),
            "cv_accuracy_std": round(float(np.std(scores["test_accuracy"])), 4),
            "cv_f1_macro_mean": round(float(np.mean(scores["test_f1_macro"])), 4),
            "cv_log_loss_mean": round(float(-np.mean(scores["test_neg_log_loss"])), 4),
        }
        logger.info(
            "%-20s CV accuracy %.4f ± %.4f, log loss %.4f",
            name,
            comparison[name]["cv_accuracy_mean"],
            comparison[name]["cv_accuracy_std"],
            comparison[name]["cv_log_loss_mean"],
        )

    if model_name:
        selected = model_name
    elif select_best:
        selected = min(comparison, key=lambda n: comparison[n]["cv_log_loss_mean"])
    else:
        selected = DEFAULT_MODEL
    logger.info("Selected model: %s", selected)

    estimator = candidate_models()[selected]
    estimator.fit(x_train, y_train)
    y_pred = estimator.predict(x_test)
    report = classification_report(y_test, y_pred, output_dict=True, zero_division=0)
    test_metrics = {
        "log_loss": round(float(log_loss(y_test, estimator.predict_proba(x_test))), 4),
        "accuracy": round(float(accuracy_score(y_test, y_pred)), 4),
        "f1_macro": round(float(f1_score(y_test, y_pred, average="macro")), 4),
        "per_class_f1": {
            crop: round(float(report[crop]["f1-score"]), 4) for crop in sorted(y.unique())
        },
    }
    logger.info("Held-out test accuracy: %.4f", test_metrics["accuracy"])

    # Ship a model trained on all available data; the metrics above describe its expected quality.
    final_model = candidate_models()[selected]
    final_model.fit(x, y)

    dataset_hash = _file_sha256(dataset_path)
    trained_at = datetime.now(UTC)
    version = f"{trained_at:%Y%m%d}-{selected}-{dataset_hash[:8]}"
    metadata = {
        "version": version,
        "algorithm": selected,
        "trained_at": trained_at.isoformat(),
        "features": list(FEATURES),
        "classes": [str(c) for c in final_model.classes_],
        "dataset": {
            "file": dataset_path.name,
            "sha256": dataset_hash,
            "samples": len(df),
            "test_size": TEST_SIZE,
        },
        "metrics": {"test": test_metrics, "cross_validation": comparison},
        "random_state": RANDOM_STATE,
        "environment": {"python": platform.python_version(), "scikit_learn": sklearn.__version__},
    }

    artifacts_dir.mkdir(parents=True, exist_ok=True)
    joblib.dump(final_model, artifacts_dir / MODEL_FILENAME, compress=3)
    (artifacts_dir / METADATA_FILENAME).write_text(json.dumps(metadata, indent=2) + "\n")
    write_profiles(build_profiles(df), PROFILES_PATH)

    logger.info("Wrote %s (%.1fs)", artifacts_dir / MODEL_FILENAME, time.perf_counter() - started)
    return metadata


def main() -> None:
    settings = get_settings()
    parser = argparse.ArgumentParser(description=__doc__.split("\n", 1)[0])
    parser.add_argument("--model", help=f"Candidate to ship (default: {DEFAULT_MODEL})")
    parser.add_argument(
        "--select-best", action="store_true", help="Ship the candidate with the lowest CV log loss"
    )
    parser.add_argument("--artifacts-dir", type=Path, default=settings.artifacts_dir)
    parser.add_argument("--dataset", type=Path, default=settings.dataset_path)
    args = parser.parse_args()

    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    metadata = train(args.model, args.artifacts_dir, args.dataset, select_best=args.select_best)
    print(json.dumps({"version": metadata["version"], **metadata["metrics"]["test"]}, indent=2))


if __name__ == "__main__":
    main()
