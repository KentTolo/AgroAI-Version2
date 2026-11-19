from __future__ import annotations

from datetime import UTC, datetime, timedelta

from fastapi.testclient import TestClient

from tests.conftest import RegisterFn


def register_device(client: TestClient, auth: dict[str, str], field_id: str) -> dict[str, str]:
    response = client.post(
        f"/api/v1/fields/{field_id}/devices", json={"name": "Home station"}, headers=auth
    )
    assert response.status_code == 201
    body: dict[str, str] = response.json()
    return body


def post(client: TestClient, key: str | None, **values: object) -> int:
    headers = {"X-Device-Key": key} if key else {}
    return client.post("/api/v1/telemetry", json=values, headers=headers).status_code


def test_device_lifecycle(client: TestClient, auth: dict[str, str], field_id: str) -> None:
    device = register_device(client, auth, field_id)
    key = device["api_key"]
    assert key.startswith("agk_")
    assert device["key_prefix"] == key[:10]

    listed = client.get(f"/api/v1/fields/{field_id}/devices", headers=auth).json()
    assert len(listed) == 1
    assert "api_key" not in listed[0]
    assert listed[0]["last_seen_at"] is None

    assert post(client, key, air_temperature=21.5, air_humidity=58, soil_moisture=34.2) == 201
    assert post(client, key, soil_temperature=17.9, battery_voltage=3.9, signal_strength=-67) == 201

    listed = client.get(f"/api/v1/fields/{field_id}/devices", headers=auth).json()
    assert listed[0]["last_seen_at"] is not None
    assert listed[0]["latest"]["soil_temperature"] == 17.9

    telemetry = client.get(f"/api/v1/fields/{field_id}/telemetry", headers=auth).json()
    assert len(telemetry) == 2

    summary = client.get(f"/api/v1/fields/{field_id}/telemetry/summary", headers=auth).json()
    assert summary["readings"] == 2
    assert summary["air_temperature"] == 21.5
    assert summary["soil_moisture"] == 34.2

    rotated = client.post(f"/api/v1/devices/{device['id']}/rotate-key", headers=auth).json()
    assert rotated["api_key"] != key
    assert post(client, key, air_temperature=20) == 401
    assert post(client, rotated["api_key"], air_temperature=20) == 201

    assert client.delete(f"/api/v1/devices/{device['id']}", headers=auth).status_code == 204
    assert post(client, rotated["api_key"], air_temperature=20) == 401
    assert client.get(f"/api/v1/fields/{field_id}/telemetry", headers=auth).json() == []


def test_telemetry_validation(client: TestClient, auth: dict[str, str], field_id: str) -> None:
    key = register_device(client, auth, field_id)["api_key"]
    assert post(client, None, air_temperature=20) == 401
    assert post(client, "agk_wrong", air_temperature=20) == 401
    assert post(client, key) == 422  # no measurements
    assert post(client, key, air_humidity=140) == 422
    assert post(client, key, soil_moisture=-5) == 422


def test_bad_device_clocks_fall_back_to_received_time(
    client: TestClient, auth: dict[str, str], field_id: str
) -> None:
    key = register_device(client, auth, field_id)["api_key"]
    future = (datetime.now(UTC) + timedelta(days=400)).isoformat()
    epoch = "1970-01-01T00:00:00Z"
    hour_ago = (datetime.now(UTC) - timedelta(hours=1)).isoformat()
    for when in (future, epoch, hour_ago):
        assert post(client, key, recorded_at=when, air_temperature=20) == 201
    times = sorted(
        r["recorded_at"]
        for r in client.get(f"/api/v1/fields/{field_id}/telemetry", headers=auth).json()
    )
    assert times[0][:13] == hour_ago[:13]  # a plausible timestamp is kept
    assert all(t[:4] == str(datetime.now(UTC).year) for t in times)


def test_devices_are_private(
    client: TestClient, auth: dict[str, str], field_id: str, register: RegisterFn
) -> None:
    device = register_device(client, auth, field_id)
    other = register()
    assert client.get(f"/api/v1/fields/{field_id}/devices", headers=other).status_code == 404
    assert (
        client.post(f"/api/v1/devices/{device['id']}/rotate-key", headers=other).status_code == 404
    )
    assert client.delete(f"/api/v1/devices/{device['id']}", headers=other).status_code == 404
