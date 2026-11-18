"""The crop catalogue: descriptive metadata plus the condition profiles derived from data."""

from __future__ import annotations

import json
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Any, Literal

DATA_DIR = Path(__file__).resolve().parents[1] / "data"

Lifecycle = Literal["annual", "perennial"]


@dataclass(frozen=True, slots=True)
class CropInfo:
    slug: str
    name: str
    category: str
    lifecycle: Lifecycle
    days_to_harvest: int
    description: str
    profile: dict[str, dict[str, float]]


@dataclass(frozen=True, slots=True)
class CropCatalog:
    crops: dict[str, CropInfo]
    dataset_bounds: dict[str, dict[str, float]]

    def get(self, slug: str) -> CropInfo | None:
        return self.crops.get(normalise_crop(slug))

    def __contains__(self, slug: object) -> bool:
        return isinstance(slug, str) and normalise_crop(slug) in self.crops


def normalise_crop(value: str) -> str:
    return value.strip().lower().replace(" ", "").replace("-", "").replace("_", "")


def _read_json(name: str) -> Any:
    return json.loads((DATA_DIR / name).read_text(encoding="utf-8"))


@lru_cache
def get_catalog() -> CropCatalog:
    metadata = _read_json("crops.json")["crops"]
    profiles = _read_json("crop_profiles.json")
    crops: dict[str, CropInfo] = {}
    for entry in metadata:
        slug = entry["slug"]
        if slug not in profiles["crops"]:
            raise RuntimeError(f"No condition profile for crop '{slug}'; regenerate profiles.")
        crops[slug] = CropInfo(profile=profiles["crops"][slug], **entry)
    return CropCatalog(crops=crops, dataset_bounds=profiles["dataset_bounds"])
