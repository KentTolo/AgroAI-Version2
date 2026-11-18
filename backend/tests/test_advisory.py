from __future__ import annotations

import json

from fastapi.testclient import TestClient

from app.core.config import get_settings
from app.ml.dataset import load_dataset
from app.ml.features import FEATURES
from app.ml.profiles import build_profiles
from app.services.advisory import Severity, assess
from app.services.crops import DATA_DIR, get_catalog
from tests.conftest import RICE_CONDITIONS


def typical_conditions(slug: str) -> dict[str, float]:
    crop = get_catalog().get(slug)
    assert crop is not None
    return {f: crop.profile[f]["median"] for f in FEATURES}


def test_typical_conditions_are_well_suited() -> None:
    for crop in get_catalog().crops.values():
        result = assess(crop, typical_conditions(crop.slug))
        assert result.score == 100, crop.slug
        assert result.verdict == "well_suited"
        assert result.issues == []


def test_deviations_are_graded_with_direction_and_advice() -> None:
    maize = get_catalog().get("maize")
    assert maize is not None
    conditions = typical_conditions("maize")
    conditions["ph"] = maize.profile["ph"]["p10"] - 3  # far too acidic
    conditions["nitrogen"] = maize.profile["nitrogen"]["p90"] + 4  # a little too much

    result = assess(maize, conditions)
    by_key = {p.parameter: p for p in result.parameters}
    assert by_key["ph"].severity is Severity.SIGNIFICANT
    assert by_key["ph"].direction == "increase"
    assert by_key["ph"].advice is not None
    assert "lime" in by_key["ph"].advice.lower()
    assert by_key["nitrogen"].severity is Severity.SLIGHT
    assert by_key["nitrogen"].direction == "decrease"
    assert by_key["temperature"].severity is Severity.OPTIMAL
    assert by_key["temperature"].advice is None
    assert result.verdict == "suitable_with_adjustments"


def test_hostile_conditions_are_not_recommended() -> None:
    rice = get_catalog().get("rice")
    assert rice is not None
    desert = {
        "nitrogen": 0,
        "phosphorus": 0,
        "potassium": 0,
        "temperature": 45,
        "humidity": 5,
        "ph": 9.5,
        "rainfall": 0,
    }
    result = assess(rice, desert)
    assert result.verdict == "not_recommended"
    assert result.score < 45


def test_crop_profiles_match_the_dataset() -> None:
    """The committed profiles must be regenerated whenever the dataset changes."""
    expected = build_profiles(load_dataset(get_settings().dataset_path))
    committed = json.loads((DATA_DIR / "crop_profiles.json").read_text())
    assert committed == json.loads(json.dumps(expected))


def test_advisory_endpoint(client: TestClient, auth: dict[str, str]) -> None:
    response = client.post(
        "/api/v1/advisory", json={"crop": "Rice", "conditions": RICE_CONDITIONS}, headers=auth
    )
    assert response.status_code == 200
    body = response.json()
    assert body["crop"] == "rice"
    assert body["crop_name"] == "Rice"
    assert len(body["parameters"]) == len(FEATURES)
    assert 0 <= body["score"] <= 100
    assert body["model_probability"] > 0.5
    assert body["summary"].startswith("Rice")


def test_advisory_unknown_crop(client: TestClient, auth: dict[str, str]) -> None:
    response = client.post(
        "/api/v1/advisory",
        json={"crop": "dragonfruit", "conditions": RICE_CONDITIONS},
        headers=auth,
    )
    assert response.status_code == 404


def test_crop_catalog(client: TestClient) -> None:
    crops = client.get("/api/v1/crops").json()
    assert len(crops) == 22
    maize = client.get("/api/v1/crops/maize").json()
    assert maize["lifecycle"] == "annual"
    ph = maize["requirements"]["ph"]
    assert ph["min"] <= ph["optimal_min"] <= ph["typical"] <= ph["optimal_max"] <= ph["max"]
    assert client.get("/api/v1/crops/unknown").status_code == 404
