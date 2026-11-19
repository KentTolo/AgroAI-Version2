"""Build app/data/soil_lesotho.json: typical topsoil pH, N, P and K across Lesotho.

Source: iSDAsoil (Hengl et al. 2021, https://doi.org/10.1038/s41598-021-85639-y), 30 m soil
property maps of Africa, licensed CC BY 4.0, read straight from its public cloud-optimised GeoTIFFs
(https://isdasoil.s3.amazonaws.com). Values are the predicted mean at 0-20 cm depth.

The script reads each layer over Lesotho at 240 m (the files' 8x overview), back-transforms the
pixel values as the iSDAsoil documentation specifies, and writes the median per ~5 km grid cell and
per district (Natural Earth admin-1 boundaries, public domain).

Run (needs network; about a minute):
    uv run --with rasterio --with shapely python scripts/build_soil_grid.py
"""

from __future__ import annotations

import argparse
import json
from datetime import date
from pathlib import Path
from typing import Any

import numpy as np
import rasterio
from rasterio.enums import Resampling
from rasterio.warp import transform as warp_transform
from rasterio.windows import from_bounds
from shapely import contains_xy
from shapely.geometry import shape
from shapely.ops import unary_union

BACKEND = Path(__file__).resolve().parents[1]
BASE = "/vsicurl/https://isdasoil.s3.amazonaws.com/soil_data"

# layer -> (file stem, back-transformation, output key, decimals)
LAYERS: dict[str, tuple[str, Any, int]] = {
    "ph": ("ph", lambda x: x / 10, 2),
    "nitrogen_total_g_kg": ("nitrogen_total", lambda x: np.expm1(x / 100), 3),
    "phosphorus_ppm": ("phosphorous_extractable", lambda x: np.expm1(x / 10), 1),
    "potassium_ppm": ("potassium_extractable", lambda x: np.expm1(x / 10), 1),
    "bulk_density_g_cm3": ("bulk_density", lambda x: x / 100, 2),
}
NODATA = 255
CELL_DEG = 0.05
OVERVIEW = 8  # 30 m x 8 = 240 m


def read_layer(stem: str, bounds_3857: tuple[float, float, float, float]) -> tuple[np.ndarray, Any]:
    with rasterio.open(f"{BASE}/{stem}/{stem}.tif") as src:
        window = from_bounds(*bounds_3857, transform=src.transform)
        height = max(1, round(window.height / OVERVIEW))
        width = max(1, round(window.width / OVERVIEW))
        data = src.read(1, window=window, out_shape=(height, width), resampling=Resampling.nearest)
        transform = src.window_transform(window) * src.window_transform(window).scale(
            window.width / width, window.height / height
        )
    return data, transform


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--districts", type=Path, default=BACKEND / "data" / "lesotho_districts.geojson"
    )
    parser.add_argument("--out", type=Path, default=BACKEND / "app" / "data" / "soil_lesotho.json")
    args = parser.parse_args()

    districts = {
        f["properties"]["name"]: shape(f["geometry"])
        for f in json.loads(args.districts.read_text())["features"]
    }
    country = unary_union(list(districts.values()))
    lon0, lat0, lon1, lat1 = country.bounds
    xs, ys = warp_transform("EPSG:4326", "EPSG:3857", [lon0, lon1], [lat0, lat1])
    bounds = (min(xs), min(ys), max(xs), max(ys))

    rasters = {key: read_layer(stem, bounds) for key, (stem, _, _) in LAYERS.items()}
    shape_ref = rasters["ph"][0].shape
    transform = rasters["ph"][1]
    rows, cols = np.indices(shape_ref)
    px, py = rasterio.transform.xy(transform, rows.ravel(), cols.ravel())
    lons, lats = warp_transform("EPSG:3857", "EPSG:4326", px, py)
    lons, lats = np.asarray(lons), np.asarray(lats)

    inside = contains_xy(country, lons, lats)
    values: dict[str, np.ndarray] = {}
    valid = inside.copy()
    for key, (_, back, _) in LAYERS.items():
        raw = rasters[key][0]
        if raw.shape != shape_ref:  # layers share a grid; guard against an off-by-one window
            raw = np.resize(raw, shape_ref)
        flat = raw.ravel().astype(float)
        valid &= flat != NODATA
        values[key] = back(flat)

    def summary(mask: np.ndarray) -> dict[str, Any] | None:
        if mask.sum() == 0:
            return None
        out: dict[str, Any] = {"pixels": int(mask.sum())}
        for key, (_, _, decimals) in LAYERS.items():
            v = values[key][mask]
            out[key] = round(float(np.median(v)), decimals)
            out[f"{key}_p25"] = round(float(np.percentile(v, 25)), decimals)
            out[f"{key}_p75"] = round(float(np.percentile(v, 75)), decimals)
        return out

    district_names = sorted(districts)
    district_of = np.full(lons.shape, -1)
    district_stats = {}
    for index, name in enumerate(district_names):
        in_district = contains_xy(districts[name], lons, lats)
        district_of[in_district] = index
        stats = summary(valid & in_district)
        if stats:
            district_stats[name] = stats

    cell_i = np.floor((lats - lat0) / CELL_DEG).astype(int)
    cell_j = np.floor((lons - lon0) / CELL_DEG).astype(int)
    cells = []
    keys = list(LAYERS)
    for i, j in sorted(set(zip(cell_i[valid].tolist(), cell_j[valid].tolist(), strict=True))):
        mask = valid & (cell_i == i) & (cell_j == j)
        if mask.sum() < 20:  # mostly outside Lesotho or no data
            continue
        majority = int(np.bincount(district_of[mask][district_of[mask] >= 0]).argmax())
        cells.append(
            [
                i,
                j,
                majority,
                *[round(float(np.median(values[k][mask])), LAYERS[k][2]) for k in keys],
            ]
        )

    output = {
        "_source": (
            "iSDAsoil predicted mean at 0-20 cm (Hengl et al. 2021, "
            "doi:10.1038/s41598-021-85639-y), CC BY 4.0, aggregated by scripts/build_soil_grid.py. "
            "District boundaries: Natural Earth (public domain)."
        ),
        "built": date.today().isoformat(),
        "units": {
            "ph": "pH (water)",
            "nitrogen_total_g_kg": "g/kg total nitrogen",
            "phosphorus_ppm": "mg/kg extractable phosphorus (Mehlich-3)",
            "potassium_ppm": "mg/kg extractable potassium (Mehlich-3)",
            "bulk_density_g_cm3": "g/cm3 fine-earth bulk density",
        },
        "grid": {
            "origin": [round(lat0, 4), round(lon0, 4)],
            "cell_degrees": CELL_DEG,
            "columns": ["row", "col", "district", *keys],
            "district_names": district_names,
            "cells": cells,
        },
        "national": summary(valid),
        "districts": district_stats,
    }
    args.out.write_text(json.dumps(output, separators=(",", ":")) + "\n")
    print(f"Wrote {len(cells)} cells and {len(district_stats)} districts to {args.out}")
    print(json.dumps({"national": output["national"]}, indent=1))
    for name, s in district_stats.items():
        print(
            f"{name:14} pH {s['ph']:.2f}  N {s['nitrogen_total_g_kg']:.2f} g/kg  "
            f"P {s['phosphorus_ppm']:.1f} ppm  K {s['potassium_ppm']:.1f} ppm  "
            f"BD {s['bulk_density_g_cm3']:.2f}"
        )


if __name__ == "__main__":
    main()
