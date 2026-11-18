"""The growing-condition parameters the model and the advisory engine work with.

This module is the single source of truth for parameter names, units, valid ranges and the
column each one maps to in the training dataset.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class Parameter:
    key: str
    label: str
    unit: str
    dataset_column: str
    min_value: float
    max_value: float
    # Smallest deviation worth flagging, so very narrow crop ranges don't produce noise.
    tolerance: float


PARAMETERS: tuple[Parameter, ...] = (
    Parameter("nitrogen", "Nitrogen (N)", "kg/ha", "N", 0, 300, 5),
    Parameter("phosphorus", "Phosphorus (P)", "kg/ha", "P", 0, 300, 5),
    Parameter("potassium", "Potassium (K)", "kg/ha", "K", 0, 300, 5),
    Parameter("temperature", "Temperature", "°C", "temperature", -20, 60, 1.5),
    Parameter("humidity", "Relative humidity", "%", "humidity", 0, 100, 5),
    Parameter("ph", "Soil pH", "pH", "ph", 0, 14, 0.3),
    Parameter("rainfall", "Rainfall", "mm", "rainfall", 0, 1000, 15),
)

FEATURES: tuple[str, ...] = tuple(p.key for p in PARAMETERS)
PARAMETERS_BY_KEY: dict[str, Parameter] = {p.key: p for p in PARAMETERS}
DATASET_TARGET = "label"
