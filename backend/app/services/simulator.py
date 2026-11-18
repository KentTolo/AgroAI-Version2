"""Synthetic sensor data, standing in for field IoT devices during development and demos.

Each series is a mean-reverting random walk: values drift day to day but stay near a baseline,
which looks like real soil and weather telemetry rather than independent noise.
"""

from __future__ import annotations

import random
from collections.abc import Mapping
from dataclasses import dataclass
from datetime import datetime, timedelta

from app.ml.features import FEATURES, PARAMETERS_BY_KEY


@dataclass(frozen=True, slots=True)
class SeriesSpec:
    baseline_low: float
    baseline_high: float
    volatility: float  # standard deviation of each step
    reversion: float  # 0..1, pull back toward the baseline each step


# Baselines loosely reflect smallholder plots in the Lesotho lowlands during the growing season.
SERIES: dict[str, SeriesSpec] = {
    "nitrogen": SeriesSpec(40, 90, 1.5, 0.05),
    "phosphorus": SeriesSpec(30, 60, 1.0, 0.05),
    "potassium": SeriesSpec(30, 60, 1.0, 0.05),
    "temperature": SeriesSpec(16, 24, 1.8, 0.35),
    "humidity": SeriesSpec(45, 75, 5.0, 0.3),
    "ph": SeriesSpec(5.8, 7.2, 0.05, 0.1),
    "rainfall": SeriesSpec(60, 140, 12.0, 0.3),
}


def generate_series(
    *,
    end: datetime,
    count: int,
    interval: timedelta,
    seed: int | None = None,
    start_from: Mapping[str, float] | None = None,
) -> list[tuple[datetime, dict[str, float]]]:
    """Generate ``count`` readings ending at ``end``, oldest first."""
    rng = random.Random(seed)  # noqa: S311 - simulation, not cryptography
    baselines = {k: rng.uniform(s.baseline_low, s.baseline_high) for k, s in SERIES.items()}
    current = {k: float(start_from[k]) if start_from else baselines[k] for k in FEATURES}

    readings: list[tuple[datetime, dict[str, float]]] = []
    start = end - interval * (count - 1)
    for step in range(count):
        values: dict[str, float] = {}
        for key in FEATURES:
            spec = SERIES[key]
            param = PARAMETERS_BY_KEY[key]
            drift = (baselines[key] - current[key]) * spec.reversion
            nxt = current[key] + drift + rng.gauss(0, spec.volatility)
            nxt = min(max(nxt, param.min_value), param.max_value)
            current[key] = nxt
            values[key] = round(nxt, 2)
        readings.append((start + interval * step, values))
    return readings
