from __future__ import annotations

from datetime import UTC, datetime, timedelta

from fastapi.testclient import TestClient

from app.ml.features import PARAMETERS
from tests.conftest import RICE_CONDITIONS, RegisterFn

FIELDS = "/api/v1/fields"


def test_field_crud(client: TestClient, auth: dict[str, str]) -> None:
    created = client.post(FIELDS, json={"name": "Valley", "soil_type": "loam"}, headers=auth)
    assert created.status_code == 201
    field = created.json()
    assert field["latest_reading"] is None
    assert field["active_cycle_count"] == 0

    listing = client.get(FIELDS, headers=auth).json()
    assert listing["total"] == 1
    assert listing["items"][0]["name"] == "Valley"

    updated = client.patch(
        f"{FIELDS}/{field['id']}", json={"notes": "Terraced", "area_hectares": 2}, headers=auth
    )
    assert updated.status_code == 200
    assert updated.json()["notes"] == "Terraced"
    assert updated.json()["soil_type"] == "loam"

    assert client.delete(f"{FIELDS}/{field['id']}", headers=auth).status_code == 204
    assert client.get(f"{FIELDS}/{field['id']}", headers=auth).status_code == 404


def test_field_validation(client: TestClient, auth: dict[str, str]) -> None:
    assert client.post(FIELDS, json={"name": "A", "latitude": 10}, headers=auth).status_code == 422
    assert client.post(FIELDS, json={"name": ""}, headers=auth).status_code == 422
    assert (
        client.post(FIELDS, json={"name": "A", "area_hectares": -1}, headers=auth).status_code
        == 422
    )
    assert client.post(FIELDS, json={"name": "A", "bogus": 1}, headers=auth).status_code == 422


def test_duplicate_field_names_conflict(client: TestClient, auth: dict[str, str]) -> None:
    client.post(FIELDS, json={"name": "Same"}, headers=auth)
    assert client.post(FIELDS, json={"name": "Same"}, headers=auth).status_code == 409


def test_users_cannot_see_each_others_fields(
    client: TestClient, field_id: str, register: RegisterFn
) -> None:
    intruder = register()
    assert client.get(f"{FIELDS}/{field_id}", headers=intruder).status_code == 404
    assert client.delete(f"{FIELDS}/{field_id}", headers=intruder).status_code == 404
    assert client.get(f"{FIELDS}/{field_id}/readings", headers=intruder).status_code == 404
    assert client.get(FIELDS, headers=intruder).json()["total"] == 0


def test_readings_are_listed_newest_first(
    client: TestClient, auth: dict[str, str], field_id: str
) -> None:
    now = datetime.now(UTC)
    for days_ago in (3, 1, 2):
        payload = RICE_CONDITIONS | {"recorded_at": (now - timedelta(days=days_ago)).isoformat()}
        response = client.post(f"{FIELDS}/{field_id}/readings", json=payload, headers=auth)
        assert response.status_code == 201
        assert response.json()["source"] == "manual"

    readings = client.get(f"{FIELDS}/{field_id}/readings", headers=auth).json()
    times = [r["recorded_at"] for r in readings["items"]]
    assert readings["total"] == 3
    assert times == sorted(times, reverse=True)

    field = client.get(f"{FIELDS}/{field_id}", headers=auth).json()
    assert field["latest_reading"]["recorded_at"] == times[0]

    since = (now - timedelta(days=2, hours=1)).isoformat()
    window = client.get(f"{FIELDS}/{field_id}/readings", params={"since": since}, headers=auth)
    assert window.json()["total"] == 2


def test_reading_validation(client: TestClient, auth: dict[str, str], field_id: str) -> None:
    url = f"{FIELDS}/{field_id}/readings"
    future = (datetime.now(UTC) + timedelta(days=1)).isoformat()
    assert (
        client.post(url, json=RICE_CONDITIONS | {"recorded_at": future}, headers=auth).status_code
        == 422
    )
    assert client.post(url, json=RICE_CONDITIONS | {"ph": 15}, headers=auth).status_code == 422
    assert (
        client.post(url, json=RICE_CONDITIONS | {"humidity": -1}, headers=auth).status_code == 422
    )


def test_simulated_readings_stay_in_range(
    client: TestClient, auth: dict[str, str], field_id: str
) -> None:
    response = client.post(
        f"{FIELDS}/{field_id}/readings/simulate",
        json={"days": 10, "readings_per_day": 2, "seed": 7},
        headers=auth,
    )
    assert response.status_code == 201
    items = response.json()["items"]
    assert len(items) == 20
    assert all(r["source"] == "simulated" for r in items)
    for param in PARAMETERS:
        assert all(param.min_value <= r[param.key] <= param.max_value for r in items)

    assert client.delete(f"{FIELDS}/{field_id}/readings", headers=auth).status_code == 204
    assert client.get(f"{FIELDS}/{field_id}/readings", headers=auth).json()["total"] == 0
