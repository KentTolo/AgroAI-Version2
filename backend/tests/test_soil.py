from __future__ import annotations

import json

import pandas as pd
import pytest
from fastapi.testclient import TestClient

from app.core.config import get_settings
from app.services.soil import (
    DATA_FILE,
    SUFFICIENT_POTASSIUM_PPM,
    TRAINING_MEDIAN_POTASSIUM,
    SoilLab,
    soil_defaults,
    to_model_units,
)

MASERU = (-29.31, 27.48)
MOKHOTLONG = (-29.29, 29.06)


def test_data_file_is_well_formed() -> None:
    data = json.loads(DATA_FILE.read_text())
    assert "iSDAsoil" in data["_source"]
    assert len(data["districts"]) == 10
    assert len(data["grid"]["cells"]) > 500
    national = data["national"]
    # Lesotho topsoils: mildly acidic, phosphorus-poor (as the literature describes).
    assert 5.5 <= national["ph"] <= 7
    assert national["phosphorus_ppm"] < 20


def test_local_values_for_a_field() -> None:
    d = soil_defaults(*MASERU)
    assert d.scope == "local"
    assert d.district == "Maseru"
    lab = d.lab
    # P is converted from mg/kg with the topsoil mass (bulk density x 2 per mg/kg).
    assert d.phosphorus == pytest.approx(lab.phosphorus_ppm * lab.bulk_density_g_cm3 * 2, abs=0.1)
    assert d.nitrogen == pytest.approx(
        lab.nitrogen_total_g_kg * lab.bulk_density_g_cm3 * 2000 * 0.02, abs=0.1
    )
    assert d.ph == lab.ph
    assert soil_defaults(*MOKHOTLONG).district == "Mokhotlong"


def test_without_location_or_outside_lesotho_uses_national_values() -> None:
    assert soil_defaults(None, None).scope == "national"
    johannesburg = soil_defaults(-26.2, 28.05)
    assert johannesburg.scope == "national"
    assert johannesburg.district is None


def test_plentiful_potassium_does_not_skew_the_model() -> None:
    lab = SoilLab(
        ph=6.2,
        nitrogen_total_g_kg=1.5,
        phosphorus_ppm=10,
        potassium_ppm=160,
        bulk_density_g_cm3=1.3,
    )
    values, notes = to_model_units(lab)
    assert values["potassium"] == TRAINING_MEDIAN_POTASSIUM
    assert any("plentiful" in n for n in notes)
    low = SoilLab(
        ph=6.2,
        nitrogen_total_g_kg=1.5,
        phosphorus_ppm=10,
        potassium_ppm=SUFFICIENT_POTASSIUM_PPM / 4,
        bulk_density_g_cm3=1.3,
    )
    assert to_model_units(low)[0]["potassium"] == pytest.approx(30 * 1.3 * 2, abs=0.1)


def test_training_median_potassium_matches_the_dataset() -> None:
    df = pd.read_csv(get_settings().dataset_path)
    assert float(df["K"].median()) == TRAINING_MEDIAN_POTASSIUM


def test_soil_defaults_endpoint(client: TestClient) -> None:
    body = client.get(
        "/api/v1/soil/defaults", params={"latitude": MASERU[0], "longitude": MASERU[1]}
    ).json()
    assert body["district"] == "Maseru"
    assert body["source"].startswith("iSDAsoil")
    assert set(body["lab"]) >= {"ph", "phosphorus_ppm", "potassium_ppm"}
    assert client.get("/api/v1/soil/defaults").json()["scope"] == "national"
    assert client.get("/api/v1/soil/defaults", params={"latitude": 200}).status_code == 422
