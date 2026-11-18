from __future__ import annotations

from datetime import date, timedelta

from fastapi.testclient import TestClient

from app.services.crops import get_catalog
from app.services.growth import compute_progress
from tests.conftest import RICE_CONDITIONS, RegisterFn


def test_progress_moves_through_stages() -> None:
    maize = get_catalog().get("maize")
    assert maize is not None
    planted = date(2026, 1, 1)
    harvest = planted + timedelta(days=100)

    start = compute_progress(maize, planted, harvest, planted)
    assert start.day == 0
    assert start.current_stage == "Germination and emergence"
    assert [s.status for s in start.stages][:2] == ["current", "upcoming"]

    middle = compute_progress(maize, planted, harvest, planted + timedelta(days=50))
    assert middle.current_stage == "Flowering"
    assert middle.percent == 50.0
    assert middle.days_remaining == 50

    late = compute_progress(maize, planted, harvest, planted + timedelta(days=150))
    assert late.percent == 100.0
    assert late.current_stage == "Maturity and harvest"
    assert late.stages[-1].status == "current"
    assert all(s.status == "completed" for s in late.stages[:-1])


def test_cycle_lifecycle(client: TestClient, auth: dict[str, str], field_id: str) -> None:
    planted = date.today() - timedelta(days=30)
    response = client.post(
        f"/api/v1/fields/{field_id}/cycles",
        json={"crop": "maize", "planted_on": planted.isoformat()},
        headers=auth,
    )
    assert response.status_code == 201
    cycle = response.json()
    assert cycle["crop_name"] == "Maize"
    assert cycle["field_name"] == "North plot"
    assert cycle["expected_harvest_on"] == (planted + timedelta(days=120)).isoformat()
    assert cycle["progress"]["day"] == 30
    assert cycle["progress"]["current_stage"] == "Vegetative growth"

    field = client.get(f"/api/v1/fields/{field_id}", headers=auth).json()
    assert field["active_cycle_count"] == 1
    dashboard = client.get("/api/v1/dashboard", headers=auth).json()
    assert dashboard["active_cycle_count"] == 1
    assert dashboard["field_count"] == 1

    harvested = client.patch(
        f"/api/v1/cycles/{cycle['id']}",
        json={"status": "harvested", "yield_kg": 850},
        headers=auth,
    )
    assert harvested.status_code == 200
    body = harvested.json()
    assert body["status"] == "harvested"
    assert body["harvested_on"] == date.today().isoformat()
    assert body["progress"] is None

    active = client.get("/api/v1/cycles", params={"status": "active"}, headers=auth).json()
    assert active["total"] == 0
    assert client.get("/api/v1/cycles", headers=auth).json()["total"] == 1

    assert client.delete(f"/api/v1/cycles/{cycle['id']}", headers=auth).status_code == 204


def test_cycle_validation(client: TestClient, auth: dict[str, str], field_id: str) -> None:
    url = f"/api/v1/fields/{field_id}/cycles"
    today = date.today()
    cases = [
        {"crop": "unobtainium", "planted_on": today.isoformat()},
        {"crop": "maize", "planted_on": (today + timedelta(days=3)).isoformat()},
        {
            "crop": "maize",
            "planted_on": today.isoformat(),
            "expected_harvest_on": (today - timedelta(days=1)).isoformat(),
        },
    ]
    for payload in cases:
        assert client.post(url, json=payload, headers=auth).status_code == 422, payload


def test_cycles_are_private(
    client: TestClient, auth: dict[str, str], field_id: str, register: RegisterFn
) -> None:
    cycle_id = client.post(
        f"/api/v1/fields/{field_id}/cycles",
        json={"crop": "beans" if False else "kidneybeans", "planted_on": date.today().isoformat()},
        headers=auth,
    ).json()["id"]
    other = register()
    assert client.get(f"/api/v1/cycles/{cycle_id}", headers=other).status_code == 404
    assert (
        client.patch(f"/api/v1/cycles/{cycle_id}", json={"notes": "x"}, headers=other).status_code
        == 404
    )
    assert client.get("/api/v1/cycles", headers=other).json()["total"] == 0


def test_dashboard_lists_recent_activity(
    client: TestClient, auth: dict[str, str], field_id: str
) -> None:
    client.post(f"/api/v1/fields/{field_id}/readings", json=RICE_CONDITIONS, headers=auth)
    client.post("/api/v1/recommendations", json={"field_id": field_id}, headers=auth)
    body = client.get("/api/v1/dashboard", headers=auth).json()
    assert body["reading_count"] == 1
    assert body["recommendation_count"] == 1
    assert body["recent_recommendations"][0]["recommended_crop"] == "rice"
