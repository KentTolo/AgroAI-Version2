from __future__ import annotations

from datetime import timedelta

import pytest
from fastapi.testclient import TestClient

from app.core.security import (
    create_access_token,
    decode_access_token,
    hash_password,
    verify_password,
)
from tests.conftest import PASSWORD, RegisterFn

REGISTER = "/api/v1/auth/register"
LOGIN = "/api/v1/auth/login"
ME = "/api/v1/users/me"


def test_password_hashing_round_trip() -> None:
    hashed = hash_password(PASSWORD)
    assert hashed != PASSWORD
    assert verify_password(PASSWORD, hashed)
    assert not verify_password("wrong-pass1", hashed)
    assert not verify_password(PASSWORD, None)


def test_token_round_trip_and_expiry() -> None:
    assert decode_access_token(create_access_token("abc")) == "abc"
    expired = create_access_token("abc", expires_delta=timedelta(seconds=-1))
    with pytest.raises(Exception, match="expired"):
        decode_access_token(expired)


def test_register_and_login(client: TestClient) -> None:
    response = client.post(
        REGISTER,
        json={"email": "Lerato@Example.com", "full_name": "  Lerato M  ", "password": PASSWORD},
    )
    assert response.status_code == 201
    body = response.json()
    assert body["email"] == "lerato@example.com"
    assert body["full_name"] == "Lerato M"
    assert "hashed_password" not in body

    login = client.post(LOGIN, data={"username": "LERATO@example.com", "password": PASSWORD})
    assert login.status_code == 200
    token = login.json()
    assert token["token_type"] == "bearer"
    assert token["expires_in"] > 0

    me = client.get(ME, headers={"Authorization": f"Bearer {token['access_token']}"})
    assert me.status_code == 200
    assert me.json()["last_login_at"] is not None


def test_duplicate_email_is_rejected(client: TestClient, register: RegisterFn) -> None:
    register("taken@example.com")
    response = client.post(
        REGISTER, json={"email": "TAKEN@example.com", "full_name": "X", "password": PASSWORD}
    )
    assert response.status_code == 409


@pytest.mark.parametrize("password", ["short1", "allletters", "1234567890"])
def test_weak_passwords_are_rejected(client: TestClient, password: str) -> None:
    response = client.post(
        REGISTER, json={"email": "a@example.com", "full_name": "A", "password": password}
    )
    assert response.status_code == 422


def test_wrong_password_and_unknown_user_look_the_same(
    client: TestClient, register: RegisterFn
) -> None:
    register("known@example.com")
    wrong = client.post(LOGIN, data={"username": "known@example.com", "password": "nope-123"})
    unknown = client.post(LOGIN, data={"username": "ghost@example.com", "password": "nope-123"})
    assert wrong.status_code == unknown.status_code == 401
    assert wrong.json() == unknown.json()


@pytest.mark.parametrize(
    "header", [None, "Bearer not-a-token", f"Bearer {create_access_token('not-a-uuid')}"]
)
def test_protected_routes_need_a_valid_token(client: TestClient, header: str | None) -> None:
    headers = {"Authorization": header} if header else {}
    assert client.get(ME, headers=headers).status_code == 401


def test_update_profile_and_change_password(client: TestClient, register: RegisterFn) -> None:
    auth = register("change@example.com")
    assert client.patch(ME, json={"full_name": "New Name"}, headers=auth).json()["full_name"] == (
        "New Name"
    )

    bad = client.post(
        f"{ME}/password",
        json={"current_password": "wrong-123", "new_password": "another-pass9"},
        headers=auth,
    )
    assert bad.status_code == 400
    ok = client.post(
        f"{ME}/password",
        json={"current_password": PASSWORD, "new_password": "another-pass9"},
        headers=auth,
    )
    assert ok.status_code == 204
    login = client.post(LOGIN, data={"username": "change@example.com", "password": "another-pass9"})
    assert login.status_code == 200


def test_delete_account_removes_owned_data(
    client: TestClient, auth: dict[str, str], field_id: str
) -> None:
    assert client.delete(ME, headers=auth).status_code == 204
    assert client.get(ME, headers=auth).status_code == 401
