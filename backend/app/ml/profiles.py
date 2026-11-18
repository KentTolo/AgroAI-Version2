"""Per-crop statistical profiles of the conditions each crop was observed growing in.

The advisory engine uses these instead of hand-picked single "ideal" values: the optimal band
for a parameter is the central 80% (10th to 90th percentile) of the dataset's observations.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pandas as pd

from app.ml.features import FEATURES

PROFILE_QUANTILES = {"p10": 0.10, "p25": 0.25, "median": 0.50, "p75": 0.75, "p90": 0.90}


def build_profiles(df: pd.DataFrame) -> dict[str, Any]:
    crops: dict[str, dict[str, dict[str, float]]] = {}
    for crop, group in df.groupby("crop", sort=True):
        stats: dict[str, dict[str, float]] = {}
        for feature in FEATURES:
            series = group[feature]
            entry = {"min": series.min(), "max": series.max(), "mean": series.mean()}
            entry |= {name: series.quantile(q) for name, q in PROFILE_QUANTILES.items()}
            stats[feature] = {k: round(float(v), 3) for k, v in entry.items()}
        crops[str(crop)] = stats

    dataset_bounds = {
        f: {"min": round(float(df[f].min()), 3), "max": round(float(df[f].max()), 3)}
        for f in FEATURES
    }
    return {"samples": len(df), "dataset_bounds": dataset_bounds, "crops": crops}


def write_profiles(profiles: dict[str, Any], path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(profiles, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
