"""Loading and validating the crop recommendation dataset."""

from __future__ import annotations

from pathlib import Path

import pandas as pd

from app.ml.features import DATASET_TARGET, PARAMETERS


class DatasetError(ValueError):
    pass


def load_dataset(path: Path) -> pd.DataFrame:
    """Load the CSV, rename columns to canonical feature names and check its contents."""
    if not path.exists():
        raise DatasetError(f"Dataset not found at {path}")

    raw = pd.read_csv(path)
    expected = [p.dataset_column for p in PARAMETERS] + [DATASET_TARGET]
    missing = sorted(set(expected) - set(raw.columns))
    if missing:
        raise DatasetError(f"Dataset is missing columns: {', '.join(missing)}")

    df = raw[expected].rename(columns={p.dataset_column: p.key for p in PARAMETERS})
    df = df.rename(columns={DATASET_TARGET: "crop"})
    df["crop"] = df["crop"].astype(str).str.strip().str.lower()

    if df.isna().any().any():
        raise DatasetError("Dataset contains missing values")
    for param in PARAMETERS:
        col = df[param.key]
        if (col < param.min_value).any() or (col > param.max_value).any():
            raise DatasetError(f"Values for {param.key} fall outside the valid range")

    return df
