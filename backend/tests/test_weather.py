from __future__ import annotations

from datetime import date, timedelta
from typing import Any

import httpx
import pytest
from fastapi.testclient import TestClient

from app.services import weather as weather_module
from app.services.weather import (
    ARCHIVE_LAG_DAYS,
    DailyWeather,
    OpenMeteoClient,
    WeatherUnavailableError,
    monthly_normals,
    parse_daily,
    recent_summaries,
    season_climate,
    season_label,
    summarise,
)
from tests.conftest import RICE_CONDITIONS, FakeWeather, RegisterFn

# --- Parsing and the Open-Meteo client --------------------------------------------------------


def payload(days: list[str], **columns: list[Any]) -> dict[str, Any]:
    return {"daily": {"time": days, **columns}}


def test_parse_daily_handles_gaps_and_derives_missing_means() -> None:
    records = parse_daily(
        payload(
            ["2026-01-01", "2026-01-02", "2026-01-03"],
            temperature_2m_mean=[20.5, None, None],
            temperature_2m_min=[12, 10, None],
            temperature_2m_max=[28, 20, None],
            precipitation_sum=[3.2, None, None],
            relative_humidity_2m_mean=[60, None],
        ),
        "archive",
    )
    assert [r.day for r in records] == [date(2026, 1, 1), date(2026, 1, 2)]
    assert records[0].precipitation == 3.2
    assert records[1].temperature_mean == 15  # midpoint of min and max
    assert records[1].precipitation == 0
    assert records[1].humidity_mean is None


def test_history_splits_archive_and_recent_requests(monkeypatch: pytest.MonkeyPatch) -> None:
    today = date.today()
    archive_end = today - timedelta(days=ARCHIVE_LAG_DAYS)
    seen: list[tuple[str, dict[str, Any]]] = []

    def fake_get(url: str, params: dict[str, Any], timeout: float) -> httpx.Response:
        seen.append((url, params))
        start = date.fromisoformat(params["start_date"])
        end = date.fromisoformat(params["end_date"])
        days = [(start + timedelta(days=i)).isoformat() for i in range((end - start).days + 1)]
        body = payload(
            days,
            temperature_2m_mean=[18.0] * len(days),
            precipitation_sum=[1.0] * len(days),
            relative_humidity_2m_mean=[50] * len(days),
        )
        return httpx.Response(200, json=body)

    monkeypatch.setattr(weather_module.httpx, "get", fake_get)
    client = OpenMeteoClient("https://forecast.test", "https://archive.test")
    records = client.history(-29.3, 27.5, today - timedelta(days=30), today)

    assert [url for url, _ in seen] == ["https://archive.test", "https://forecast.test"]
    assert seen[0][1]["end_date"] == archive_end.isoformat()
    assert seen[1][1]["start_date"] == (archive_end + timedelta(days=1)).isoformat()
    assert seen[0][1]["timezone"] == "auto"
    assert len(records) == 31
    assert {r.source for r in records if r.day <= archive_end} == {"archive"}
    assert {r.source for r in records if r.day > archive_end} == {"recent"}


def test_client_reports_provider_errors(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        weather_module.httpx,
        "get",
        lambda *a, **k: httpx.Response(400, json={"error": True, "reason": "Bad latitude"}),
    )
    with pytest.raises(WeatherUnavailableError, match="Bad latitude"):
        OpenMeteoClient("https://f.test", "https://a.test").forecast(0, 0, 7)

    monkeypatch.setattr(
        weather_module.httpx,
        "get",
        lambda *a, **k: httpx.Response(429, json={"error": True, "reason": "Daily limit"}),
    )
    with pytest.raises(WeatherUnavailableError, match="request limit") as info:
        OpenMeteoClient("https://f.test", "https://a.test").forecast(0, 0, 7)
    assert info.value.rate_limited

    def boom(*a: Any, **k: Any) -> httpx.Response:
        raise httpx.ConnectError("offline")

    monkeypatch.setattr(weather_module.httpx, "get", boom)
    with pytest.raises(WeatherUnavailableError, match="could not be reached"):
        OpenMeteoClient("https://f.test", "https://a.test").forecast(0, 0, 7)


# --- Climate maths ----------------------------------------------------------------------------


def days_between(start: date, end: date) -> list[DailyWeather]:
    return [
        FakeWeather.day(start + timedelta(days=i), "archive") for i in range((end - start).days + 1)
    ]


def test_summarise_converts_rainfall_to_a_monthly_rate() -> None:
    days = [
        DailyWeather(date(2026, 1, i), 20.0, None, None, 2.0, 60.0, "archive") for i in range(1, 16)
    ]
    summary = summarise(days, "Test")
    assert summary is not None
    assert (summary.days, summary.temperature, summary.humidity) == (15, 20.0, 60.0)
    assert summary.total_rainfall == 30.0
    assert summary.rainfall == 60.0  # 2 mm/day over 30 days
    assert summarise([], "Empty") is None


def test_recent_windows_need_enough_coverage() -> None:
    end = date(2026, 6, 30)
    summaries = recent_summaries(days_between(end - timedelta(days=99), end))
    assert [s.label for s in summaries] == ["Last 30 days", "Last 90 days"]


def test_monthly_normals_and_seasons() -> None:
    days = days_between(date(2023, 1, 1), date(2025, 12, 31))
    normals = monthly_normals(days)
    assert [n.month for n in normals] == list(range(1, 13))
    january, july = normals[0], normals[6]
    assert january.temperature > july.temperature  # southern-hemisphere summer
    assert january.rainfall is not None
    assert july.rainfall is not None
    assert january.rainfall > july.rainfall
    assert january.years == 3

    summer = season_climate(normals, start_month=11, months=4)  # Nov–Feb wraps the year
    assert summer is not None
    assert summer.label == "Typical Nov–Feb"
    assert summer.temperature > july.temperature
    assert season_label(6, 1) == "Typical Jun"

    partial = monthly_normals(days_between(date(2025, 1, 1), date(2025, 3, 31)))
    assert season_climate(partial, start_month=2, months=4) is None  # no data for May


# --- API --------------------------------------------------------------------------------------


@pytest.fixture
def unmapped_field(client: TestClient, auth: dict[str, str]) -> str:
    return str(client.post("/api/v1/fields", json={"name": "No map"}, headers=auth).json()["id"])


def test_weather_needs_a_location(
    client: TestClient, auth: dict[str, str], unmapped_field: str
) -> None:
    for method, path in [
        ("get", "weather/forecast"),
        ("post", "weather/sync"),
    ]:
        response = client.request(
            method, f"/api/v1/fields/{unmapped_field}/{path}", json={}, headers=auth
        )
        assert response.status_code == 409
        assert "location" in response.json()["detail"]


def test_forecast(client: TestClient, auth: dict[str, str], field_id: str) -> None:
    days = client.get(
        f"/api/v1/fields/{field_id}/weather/forecast", params={"days": 5}, headers=auth
    ).json()
    assert len(days) == 5
    assert days[0]["day"] == date.today().isoformat()
    assert days[0]["source"] == "forecast"


def test_sync_is_incremental_and_climate_is_derived(
    client: TestClient, auth: dict[str, str], field_id: str, fake_weather: FakeWeather
) -> None:
    url = f"/api/v1/fields/{field_id}/weather"
    first = client.post(f"{url}/sync", json={"years": 2}, headers=auth).json()
    assert first["fetched"] == first["total_days"] == 731
    assert first["end"] == date.today().isoformat()

    fake_weather.calls.clear()
    second = client.post(f"{url}/sync", json={"years": 2}, headers=auth).json()
    assert second["total_days"] == 731
    assert second["fetched"] == 8  # only the provisional last week is refreshed
    assert len(fake_weather.calls) == 1

    fake_weather.calls.clear()
    third = client.post(f"{url}/sync", json={"years": 3}, headers=auth).json()
    assert third["total_days"] == 1096  # older history is backfilled
    assert fake_weather.calls[0][1] == date.today() - timedelta(days=365 * 3)

    since = (date.today() - timedelta(days=9)).isoformat()
    history = client.get(url, params={"since": since}, headers=auth).json()
    assert [d["day"] for d in history] == sorted(d["day"] for d in history)
    assert len(history) == 10

    climate = client.get(
        f"{url}/climate", params={"season_start": 10, "season_months": 4}, headers=auth
    ).json()
    assert climate["coverage"]["days"] == 1096
    assert [w["label"] for w in climate["recent"]] == [
        "Last 30 days",
        "Last 90 days",
        "Last 365 days",
    ]
    assert len(climate["normals"]) == 12
    assert climate["season"]["label"] == "Typical Oct–Jan"
    assert climate["season"]["years"] >= 3
    assert "Open-Meteo" in climate["attribution"]


def test_climate_without_history_is_empty(
    client: TestClient, auth: dict[str, str], field_id: str
) -> None:
    climate = client.get(
        f"/api/v1/fields/{field_id}/weather/climate", params={"season_start": 1}, headers=auth
    ).json()
    assert climate["coverage"] == {"start": None, "end": None, "days": 0}
    assert climate["recent"] == []
    assert climate["season"] is None


def test_provider_failure_returns_502_and_stores_nothing(
    client: TestClient, auth: dict[str, str], field_id: str, fake_weather: FakeWeather
) -> None:
    fake_weather.fail = True
    url = f"/api/v1/fields/{field_id}/weather"
    assert client.post(f"{url}/sync", json={}, headers=auth).status_code == 502
    assert client.get(f"{url}/forecast", headers=auth).status_code == 502
    assert client.get(url, headers=auth).json() == []


def test_weather_is_private_and_deleted_with_the_field(
    client: TestClient, auth: dict[str, str], field_id: str, register: RegisterFn
) -> None:
    url = f"/api/v1/fields/{field_id}/weather"
    client.post(f"{url}/sync", json={"years": 1}, headers=auth)
    other = register()
    assert client.get(url, headers=other).status_code == 404
    assert client.post(f"{url}/sync", json={}, headers=other).status_code == 404

    client.delete(f"/api/v1/fields/{field_id}", headers=auth)
    assert client.get(url, headers=auth).status_code == 404


def test_recommendation_records_its_climate_basis(client: TestClient, auth: dict[str, str]) -> None:
    basis = "Typical Oct–Jan, 2023–2026 (Open-Meteo)"
    rec = client.post(
        "/api/v1/recommendations",
        json={"conditions": RICE_CONDITIONS, "climate_basis": basis},
        headers=auth,
    ).json()
    assert rec["climate_basis"] == basis
    again = client.get(f"/api/v1/recommendations/{rec['id']}", headers=auth).json()
    assert again["climate_basis"] == basis
