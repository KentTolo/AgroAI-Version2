"""Test fixtures.

Tests run against SQLite in memory by default. Set ``AGROAI_TEST_DATABASE_URL`` to run them
against PostgreSQL instead (CI does this).
"""

from __future__ import annotations

import json
import math
import os
from collections.abc import Callable, Iterator
from datetime import date, timedelta
from pathlib import Path
from typing import Any

os.environ.setdefault("AGROAI_ENVIRONMENT", "test")

import joblib
import pytest
from fastapi.testclient import TestClient
from sklearn.ensemble import RandomForestClassifier
from sqlalchemy import Engine, create_engine, event
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.api.deps import get_weather_client
from app.core.config import Settings, get_settings
from app.db.base import Base
from app.db.session import get_db
from app.main import create_app
from app.ml.dataset import load_dataset
from app.ml.features import FEATURES
from app.ml.predictor import METADATA_FILENAME, MODEL_FILENAME
from app.services.weather import DailyWeather, WeatherUnavailableError

RICE_CONDITIONS = {
    "nitrogen": 90,
    "phosphorus": 42,
    "potassium": 43,
    "temperature": 20.9,
    "humidity": 82,
    "ph": 6.5,
    "rainfall": 203,
}
PASSWORD = "s3cure-pass"


@pytest.fixture(scope="session")
def engine() -> Iterator[Engine]:
    url = os.environ.get("AGROAI_TEST_DATABASE_URL")
    if url:
        eng = create_engine(url)
    else:
        eng = create_engine(
            "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
        )

        @event.listens_for(eng, "connect")
        def _enable_foreign_keys(dbapi_connection: Any, _: Any) -> None:
            dbapi_connection.execute("PRAGMA foreign_keys=ON")

    Base.metadata.drop_all(eng)
    Base.metadata.create_all(eng)
    yield eng
    Base.metadata.drop_all(eng)
    eng.dispose()


@pytest.fixture
def session_factory(engine: Engine) -> Iterator[sessionmaker[Session]]:
    factory = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)
    yield factory
    with engine.begin() as conn:
        for table in reversed(Base.metadata.sorted_tables):
            conn.execute(table.delete())


@pytest.fixture
def db(session_factory: sessionmaker[Session]) -> Iterator[Session]:
    with session_factory() as session:
        yield session


@pytest.fixture(scope="session")
def artifacts_dir(tmp_path_factory: pytest.TempPathFactory) -> Path:
    """A small but real model trained on the bundled dataset."""
    settings = get_settings()
    df = load_dataset(settings.dataset_path)
    model = RandomForestClassifier(n_estimators=60, random_state=0, n_jobs=-1)
    model.fit(df[list(FEATURES)], df["crop"])

    directory = tmp_path_factory.mktemp("artifacts")
    joblib.dump(model, directory / MODEL_FILENAME)
    metadata = {
        "version": "test-model",
        "algorithm": "random_forest",
        "trained_at": "2026-01-01T00:00:00+00:00",
        "features": list(FEATURES),
        "classes": [str(c) for c in model.classes_],
        # Mirror every key app.ml.train writes, so schema changes are caught here.
        "dataset": {"file": "crop_recommendation.csv", "sha256": "0" * 64, "samples": len(df)},
        "metrics": {"test": {"accuracy": 0.99}, "cross_validation": {}},
        "random_state": 0,
        "environment": {"python": "3", "scikit_learn": "1"},
    }
    (directory / METADATA_FILENAME).write_text(json.dumps(metadata))
    return directory


class FakeWeather:
    """Deterministic stand-in for Open-Meteo: a seasonal cycle typical of the Lesotho lowlands."""

    def __init__(self) -> None:
        self.calls: list[tuple[str, date, date]] = []
        self.fail = False

    @staticmethod
    def day(d: date, source: str) -> DailyWeather:
        phase = math.cos(2 * math.pi * (d.timetuple().tm_yday - 15) / 365)  # peak mid-January
        return DailyWeather(
            day=d,
            temperature_mean=round(15 + 7 * phase, 1),
            temperature_min=round(8 + 7 * phase, 1),
            temperature_max=round(22 + 7 * phase, 1),
            precipitation=round(max(0.0, 2.5 * phase + 1.0) if d.day % 3 else 0.0, 1),
            humidity_mean=round(55 + 15 * phase, 1),
            source=source,
        )

    def history(
        self, latitude: float, longitude: float, start: date, end: date
    ) -> list[DailyWeather]:
        if self.fail:
            raise WeatherUnavailableError("The weather service could not be reached.")
        self.calls.append(("history", start, end))
        return [
            self.day(start + timedelta(days=i), "archive") for i in range((end - start).days + 1)
        ]

    def forecast(self, latitude: float, longitude: float, days: int) -> list[DailyWeather]:
        if self.fail:
            raise WeatherUnavailableError("The weather service could not be reached.")
        today = date.today()
        self.calls.append(("forecast", today, today + timedelta(days=days - 1)))
        return [self.day(today + timedelta(days=i), "forecast") for i in range(days)]


@pytest.fixture
def fake_weather() -> FakeWeather:
    return FakeWeather()


def _client(
    session_factory: sessionmaker[Session], artifacts: Path, weather: FakeWeather
) -> Iterator[TestClient]:
    settings = Settings(artifacts_dir=artifacts, environment="test")
    app = create_app(settings)

    def override_db() -> Iterator[Session]:
        with session_factory() as session:
            yield session

    app.dependency_overrides[get_db] = override_db
    app.dependency_overrides[get_weather_client] = lambda: weather
    with TestClient(app) as client:
        yield client


@pytest.fixture
def client(
    session_factory: sessionmaker[Session], artifacts_dir: Path, fake_weather: FakeWeather
) -> Iterator[TestClient]:
    yield from _client(session_factory, artifacts_dir, fake_weather)


@pytest.fixture
def client_without_model(
    session_factory: sessionmaker[Session], tmp_path: Path, fake_weather: FakeWeather
) -> Iterator[TestClient]:
    yield from _client(session_factory, tmp_path, fake_weather)


RegisterFn = Callable[..., dict[str, str]]


@pytest.fixture
def register(client: TestClient) -> RegisterFn:
    """Create a user and return Authorization headers for them."""
    counter = iter(range(1, 10_000))

    def _register(email: str | None = None, password: str = PASSWORD) -> dict[str, str]:
        email = email or f"farmer{next(counter)}@example.com"
        response = client.post(
            "/api/v1/auth/register",
            json={"email": email, "full_name": "Test Farmer", "password": password},
        )
        assert response.status_code == 201, response.text
        token = client.post(
            "/api/v1/auth/login", data={"username": email, "password": password}
        ).json()["access_token"]
        return {"Authorization": f"Bearer {token}"}

    return _register


@pytest.fixture
def auth(register: RegisterFn) -> dict[str, str]:
    return register()


@pytest.fixture
def field_id(client: TestClient, auth: dict[str, str]) -> str:
    response = client.post(
        "/api/v1/fields",
        json={"name": "North plot", "latitude": -29.31, "longitude": 27.48, "area_hectares": 1.5},
        headers=auth,
    )
    assert response.status_code == 201, response.text
    return str(response.json()["id"])
