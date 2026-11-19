from __future__ import annotations

from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient

from app.core.config import Settings, get_settings
from tests.conftest import RICE_CONDITIONS, RegisterFn

ADMIN = "owner@example.com"


@pytest.fixture(autouse=True)
def admin_emails(monkeypatch: pytest.MonkeyPatch) -> Iterator[None]:
    monkeypatch.setenv("AGROAI_ADMIN_EMAILS", f" {ADMIN.upper()} , other-admin@example.com")
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


def test_admin_emails_are_parsed() -> None:
    assert get_settings().admin_emails == [ADMIN, "other-admin@example.com"]
    assert Settings(admin_emails="").admin_emails == []  # type: ignore[arg-type]


def test_only_admins_can_open_the_dashboard(client: TestClient, register: RegisterFn) -> None:
    farmer = register("farmer@example.com")
    assert client.get("/api/v1/users/me", headers=farmer).json()["is_admin"] is False
    assert client.get("/api/v1/admin/overview", headers=farmer).status_code == 403
    assert client.get("/api/v1/admin/users", headers=farmer).status_code == 403
    assert client.get("/api/v1/admin/overview").status_code == 401

    admin = register(ADMIN)
    assert client.get("/api/v1/users/me", headers=admin).json()["is_admin"] is True


def test_overview_and_users(client: TestClient, register: RegisterFn) -> None:
    admin = register(ADMIN)
    farmer = register("farmer@example.com")
    field = client.post(
        "/api/v1/fields",
        json={"name": "Home", "latitude": -29.3, "longitude": 27.5},
        headers=farmer,
    ).json()
    client.post(f"/api/v1/fields/{field['id']}/readings", json=RICE_CONDITIONS, headers=farmer)
    client.post(
        "/api/v1/recommendations",
        json={"field_id": field["id"], "climate_basis": "Typical Oct–Jan"},
        headers=farmer,
    )
    key = client.post(
        f"/api/v1/fields/{field['id']}/devices", json={"name": "Station"}, headers=farmer
    ).json()["api_key"]
    client.post("/api/v1/telemetry", json={"air_temperature": 20}, headers={"X-Device-Key": key})

    overview = client.get("/api/v1/admin/overview", headers=admin).json()
    assert overview["users"] == 2
    assert overview["users_active_7d"] == 2
    assert (overview["fields"], overview["mapped_fields"]) == (1, 1)
    assert (overview["devices"], overview["devices_online"], overview["telemetry_24h"]) == (1, 1, 1)
    assert overview["recommendations"] == 1
    assert len(overview["signups"]) == 30
    assert sum(d["count"] for d in overview["signups"]) == 2
    recent = overview["recent_recommendations"][0]
    assert recent["user_email"] == "farmer@example.com"
    assert recent["field_name"] == "Home"
    assert recent["climate_basis"] == "Typical Oct–Jan"

    rows = {r["email"]: r for r in client.get("/api/v1/admin/users", headers=admin).json()}
    assert rows[ADMIN]["is_admin"] is True
    farmer_row = rows["farmer@example.com"]
    assert (farmer_row["fields"], farmer_row["soil_readings"], farmer_row["devices"]) == (1, 1, 1)
    assert farmer_row["recommendations"] == 1
    assert "hashed_password" not in farmer_row
