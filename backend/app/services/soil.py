"""Typical topsoil values for a location in Lesotho, to prefill soil tests.

The numbers come from iSDAsoil's 30 m maps (CC BY 4.0), aggregated to ~5 km cells and districts by
``scripts/build_soil_grid.py`` into ``app/data/soil_lesotho.json``. They are estimates for a
neighbourhood, not a measurement of a particular field: a soil test or a sensor reading replaces
them.

The model's N, P and K inputs are in kg/ha, so laboratory concentrations are converted:

* P and K: mg/kg x bulk density (g/cm3) x 2 gives kg/ha in the top 20 cm
  (10 000 m2 x 0.2 m x bulk density x 1000 kg/m3 = bulk density x 2 000 000 kg of soil).
* N: about 2% of total nitrogen is mineralised into plant-available forms in a season
  (typical values are 1-3%), so available N = total N (g/kg) x bulk density x 2000 x 0.02.

Potassium is the exception. Lesotho topsoils hold about 120-200 mg/kg of extractable potassium
(roughly 300-500 kg/ha), far above the model's training range, where only apple and grape rows
reach 200 (the dataset's K separates crops more than it measures soil). Above the ~120 mg/kg
level at which potassium stops limiting most crops (Mehlich-3), the model is given the training
data's median potassium instead, so potassium neither helps nor hinders any crop; the real value is
still reported. Other values outside the training range are capped at its edge, with a note.
"""

from __future__ import annotations

import json
import math
from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path
from typing import Any, Literal

from app.services.crops import get_catalog

DATA_FILE = Path(__file__).resolve().parents[1] / "data" / "soil_lesotho.json"
MINERALISABLE_N_FRACTION = 0.02
SOURCE = "iSDAsoil (CC BY 4.0), topsoil 0–20 cm"
# Mehlich-3 potassium above which most crops do not respond to potassium fertiliser.
SUFFICIENT_POTASSIUM_PPM = 120.0
# Median potassium across the 2,200 training observations (checked by the tests).
TRAINING_MEDIAN_POTASSIUM = 32.0
# How far (in grid cells) to look for the nearest cell, so points just outside a cell still match.
SEARCH_RADIUS = 2

Scope = Literal["local", "district", "national"]


@dataclass(frozen=True, slots=True)
class SoilLab:
    ph: float
    nitrogen_total_g_kg: float
    phosphorus_ppm: float
    potassium_ppm: float
    bulk_density_g_cm3: float


@dataclass(frozen=True, slots=True)
class SoilDefaults:
    scope: Scope
    district: str | None
    description: str
    source: str
    lab: SoilLab
    nitrogen: float
    phosphorus: float
    potassium: float
    ph: float
    notes: list[str] = field(default_factory=list)


@dataclass(frozen=True, slots=True)
class _Grid:
    lat0: float
    lon0: float
    step: float
    cells: dict[tuple[int, int], tuple[int, SoilLab]]
    district_names: list[str]
    districts: dict[str, SoilLab]
    national: SoilLab


def _lab(values: dict[str, Any]) -> SoilLab:
    return SoilLab(
        ph=values["ph"],
        nitrogen_total_g_kg=values["nitrogen_total_g_kg"],
        phosphorus_ppm=values["phosphorus_ppm"],
        potassium_ppm=values["potassium_ppm"],
        bulk_density_g_cm3=values["bulk_density_g_cm3"],
    )


@lru_cache
def _grid() -> _Grid:
    data = json.loads(DATA_FILE.read_text(encoding="utf-8"))
    grid = data["grid"]
    columns = grid["columns"]
    cells: dict[tuple[int, int], tuple[int, SoilLab]] = {}
    for row in grid["cells"]:
        record = dict(zip(columns, row, strict=True))
        cells[(record["row"], record["col"])] = (record["district"], _lab(record))
    return _Grid(
        lat0=grid["origin"][0],
        lon0=grid["origin"][1],
        step=grid["cell_degrees"],
        cells=cells,
        district_names=grid["district_names"],
        districts={name: _lab(v) for name, v in data["districts"].items()},
        national=_lab(data["national"]),
    )


def _nearest_cell(grid: _Grid, latitude: float, longitude: float) -> tuple[int, SoilLab] | None:
    i = math.floor((latitude - grid.lat0) / grid.step)
    j = math.floor((longitude - grid.lon0) / grid.step)
    if (i, j) in grid.cells:
        return grid.cells[(i, j)]
    best: tuple[int, tuple[int, SoilLab]] | None = None
    for di in range(-SEARCH_RADIUS, SEARCH_RADIUS + 1):
        for dj in range(-SEARCH_RADIUS, SEARCH_RADIUS + 1):
            cell = grid.cells.get((i + di, j + dj))
            if cell is not None and (best is None or di * di + dj * dj < best[0]):
                best = (di * di + dj * dj, cell)
    return best[1] if best else None


def to_model_units(lab: SoilLab) -> tuple[dict[str, float], list[str]]:
    """Convert laboratory concentrations to the model's kg/ha inputs, capped to its range."""
    soil_kg_per_ha_per_ppm = lab.bulk_density_g_cm3 * 2  # kg/ha for 1 mg/kg in the top 20 cm
    raw = {
        "nitrogen": (
            lab.nitrogen_total_g_kg * 1000 * soil_kg_per_ha_per_ppm * MINERALISABLE_N_FRACTION
        ),
        "phosphorus": lab.phosphorus_ppm * soil_kg_per_ha_per_ppm,
        "potassium": lab.potassium_ppm * soil_kg_per_ha_per_ppm,
        "ph": lab.ph,
    }
    bounds = get_catalog().dataset_bounds
    values: dict[str, float] = {}
    notes: list[str] = []
    if lab.potassium_ppm >= SUFFICIENT_POTASSIUM_PPM:
        values["potassium"] = TRAINING_MEDIAN_POTASSIUM
        notes.append(
            f"Potassium is plentiful here ({lab.potassium_ppm:.0f} mg/kg, about "
            f"{raw['potassium']:.0f} kg/ha; crops need around {SUFFICIENT_POTASSIUM_PPM:.0f} "
            f"mg/kg), so it is not limiting. The model is given its typical value "
            f"({TRAINING_MEDIAN_POTASSIUM:.0f} kg/ha) so potassium doesn't skew the ranking."
        )
        del raw["potassium"]
    for key, value in raw.items():
        low, high = bounds[key]["min"], bounds[key]["max"]
        capped = min(max(value, low), high)
        values[key] = round(capped, 1 if key != "ph" else 2)
        if capped != value:
            notes.append(
                f"{key.capitalize()} here is about {value:.0f} kg/ha, beyond the model's training "
                f"range, so {capped:.0f} kg/ha (its {'maximum' if value > high else 'minimum'}) "
                "is used."
            )
    return values, notes


def soil_defaults(latitude: float | None, longitude: float | None) -> SoilDefaults:
    grid = _grid()
    district: str | None = None
    scope: Scope = "national"
    lab = grid.national
    if latitude is not None and longitude is not None:
        cell = _nearest_cell(grid, latitude, longitude)
        if cell is not None:
            index, lab = cell
            district = grid.district_names[index]
            scope = "local"
    description = {
        "local": f"Typical topsoil within about 5 km of this spot ({district} district)",
        "district": f"Typical topsoil in {district} district",
        "national": "Typical topsoil across Lesotho (add the field's location for local values)",
    }[scope]
    values, notes = to_model_units(lab)
    return SoilDefaults(
        scope=scope,
        district=district,
        description=description,
        source=SOURCE,
        lab=lab,
        notes=notes,
        **values,
    )


def district_defaults(name: str) -> SoilDefaults | None:
    grid = _grid()
    lab = grid.districts.get(name)
    if lab is None:
        return None
    values, notes = to_model_units(lab)
    return SoilDefaults(
        scope="district",
        district=name,
        description=f"Typical topsoil in {name} district",
        source=SOURCE,
        lab=lab,
        notes=notes,
        **values,
    )
