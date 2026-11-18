from __future__ import annotations

from fastapi.testclient import TestClient

from tests.conftest import RICE_CONDITIONS, RegisterFn

RECS = "/api/v1/recommendations"


def test_recommend_from_conditions(client: TestClient, auth: dict[str, str]) -> None:
    response = client.post(RECS, json={"conditions": RICE_CONDITIONS, "top_k": 5}, headers=auth)
    assert response.status_code == 201
    body = response.json()
    assert body["recommended_crop"] == "rice"
    assert len(body["predictions"]) == 5
    assert body["predictions"][0] == {
        "crop": "rice",
        "name": "Rice",
        "probability": body["predictions"][0]["probability"],
    }
    probabilities = [p["probability"] for p in body["predictions"]]
    assert probabilities == sorted(probabilities, reverse=True)
    assert body["model_version"] == "test-model"
    assert body["warnings"] == []


def test_recommend_from_field_latest_reading(
    client: TestClient, auth: dict[str, str], field_id: str
) -> None:
    missing = client.post(RECS, json={"field_id": field_id}, headers=auth)
    assert missing.status_code == 409

    client.post(f"/api/v1/fields/{field_id}/readings", json=RICE_CONDITIONS, headers=auth)
    response = client.post(RECS, json={"field_id": field_id}, headers=auth)
    assert response.status_code == 201
    assert response.json()["field_id"] == field_id
    assert response.json()["inputs"] == {k: float(v) for k, v in RICE_CONDITIONS.items()}

    history = client.get(RECS, params={"field_id": field_id}, headers=auth).json()
    assert history["total"] == 1


def test_request_needs_conditions_or_field(client: TestClient, auth: dict[str, str]) -> None:
    assert client.post(RECS, json={}, headers=auth).status_code == 422
    assert client.post(RECS, json={"conditions": {"ph": 6}}, headers=auth).status_code == 422


def test_out_of_distribution_inputs_are_flagged(client: TestClient, auth: dict[str, str]) -> None:
    conditions = RICE_CONDITIONS | {"rainfall": 600, "temperature": 2}
    body = client.post(RECS, json={"conditions": conditions}, headers=auth).json()
    assert len(body["warnings"]) == 2
    assert any("Rainfall" in w for w in body["warnings"])


def test_history_is_private_and_deletable(
    client: TestClient, auth: dict[str, str], register: RegisterFn
) -> None:
    rec_id = client.post(RECS, json={"conditions": RICE_CONDITIONS}, headers=auth).json()["id"]
    other = register()
    assert client.get(f"{RECS}/{rec_id}", headers=other).status_code == 404
    assert client.get(RECS, headers=other).json()["total"] == 0
    assert client.get(f"{RECS}/{rec_id}", headers=auth).status_code == 200
    assert client.delete(f"{RECS}/{rec_id}", headers=auth).status_code == 204
    assert client.get(RECS, headers=auth).json()["total"] == 0


def test_cannot_link_to_someone_elses_field(
    client: TestClient, field_id: str, register: RegisterFn
) -> None:
    other = register()
    response = client.post(
        RECS, json={"field_id": field_id, "conditions": RICE_CONDITIONS}, headers=other
    )
    assert response.status_code == 404


def test_model_info(client: TestClient) -> None:
    body = client.get("/api/v1/model").json()
    assert body["version"] == "test-model"
    assert "rice" in body["classes"]
    assert body["dataset"]["samples"] == 2200
    assert "environment" not in body


def test_missing_model_returns_503(client_without_model: TestClient) -> None:
    client = client_without_model
    client.post(
        "/api/v1/auth/register",
        json={"email": "x@example.com", "full_name": "X", "password": "pass-1234"},
    )
    token = client.post(
        "/api/v1/auth/login", data={"username": "x@example.com", "password": "pass-1234"}
    ).json()["access_token"]
    response = client.post(
        RECS, json={"conditions": RICE_CONDITIONS}, headers={"Authorization": f"Bearer {token}"}
    )
    assert response.status_code == 503
    assert client.get("/health/ready").status_code == 503
