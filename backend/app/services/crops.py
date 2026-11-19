"""The crop catalogue: descriptive metadata plus the condition profiles derived from data."""

from __future__ import annotations

import json
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Any, Literal

DATA_DIR = Path(__file__).resolve().parents[1] / "data"

Lifecycle = Literal["annual", "perennial"]
LesothoStatus = Literal["staple", "common", "possible", "unsuitable"]

# Order in which crops are listed: what Lesotho farmers grow most comes first.
LESOTHO_ORDER: dict[str, int] = {"staple": 0, "common": 1, "possible": 2, "unsuitable": 3}


@dataclass(frozen=True, slots=True)
class CropInfo:
    slug: str
    name: str
    category: str
    lifecycle: Lifecycle
    days_to_harvest: int
    description: str
    profile: dict[str, dict[str, float]]
    lesotho: LesothoStatus = "unsuitable"
    model_ranked: bool = True  # False: profile from literature; the model cannot rank it

    @property
    def grown_in_lesotho(self) -> bool:
        return self.lesotho != "unsuitable"


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


def lesotho_sort_key(crop: CropInfo) -> tuple[int, str]:
    return LESOTHO_ORDER[crop.lesotho], crop.name


@lru_cache
def get_catalog() -> CropCatalog:
    """Crops in display order: Lesotho staples first, then common, possible and unsuitable."""
    metadata = _read_json("crops.json")["crops"]
    profiles = _read_json("crop_profiles.json")
    literature = _read_json("crop_profiles_literature.json")["crops"]
    crops: list[CropInfo] = []
    for entry in metadata:
        slug = entry["slug"]
        if slug in profiles["crops"]:
            crops.append(CropInfo(profile=profiles["crops"][slug], model_ranked=True, **entry))
        elif slug in literature:
            crops.append(CropInfo(profile=literature[slug], model_ranked=False, **entry))
        else:
            raise RuntimeError(f"No condition profile for crop '{slug}'; regenerate profiles.")
    crops.sort(key=lesotho_sort_key)
    return CropCatalog(crops={c.slug: c for c in crops}, dataset_bounds=profiles["dataset_bounds"])
