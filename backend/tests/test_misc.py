from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.core.config import Settings
from app.services.simulator import generate_series


def test_simulator_is_deterministic_with_a_seed() -> None:
    end = datetime(2026, 1, 31, tzinfo=UTC)
    a = generate_series(end=end, count=30, interval=timedelta(days=1), seed=3)
    b = generate_series(end=end, count=30, interval=timedelta(days=1), seed=3)
    assert a == b
    assert a[-1][0] == end
    assert a[0][0] == end - timedelta(days=29)


def test_health_endpoints(client: TestClient) -> None:
    assert client.get("/health").json() == {"status": "ok", "database": None, "model": None}
    ready = client.get("/health/ready")
    assert ready.status_code == 200
    assert ready.json() == {"status": "ok", "database": "ok", "model": "test-model"}


def test_responses_carry_a_request_id(client: TestClient) -> None:
    response = client.get("/health", headers={"X-Request-ID": "abc123"})
    assert response.headers["X-Request-ID"] == "abc123"
    assert client.get("/health").headers["X-Request-ID"]


def test_production_requires_a_real_secret() -> None:
    with pytest.raises(ValidationError, match="SECRET_KEY"):
        Settings(environment="production")
    Settings(environment="production", secret_key="x" * 40)


def test_cors_origins_accept_comma_separated_values() -> None:
    settings = Settings(cors_origins="https://a.example, https://b.example")  # type: ignore[arg-type]
    assert settings.cors_origins == ["https://a.example", "https://b.example"]
