from __future__ import annotations

import uuid
from datetime import datetime
from typing import Annotated, Literal

from pydantic import AfterValidator, EmailStr, Field, field_validator

from app.core.security import BCRYPT_MAX_BYTES
from app.schemas.common import Schema


def _check_password(value: str) -> str:
    if len(value.encode()) > BCRYPT_MAX_BYTES:
        raise ValueError(f"Password must be at most {BCRYPT_MAX_BYTES} bytes")
    if value.isdigit() or value.isalpha():
        raise ValueError("Password must mix letters with numbers or symbols")
    return value


Password = Annotated[str, Field(min_length=8, max_length=128), AfterValidator(_check_password)]
FullName = Annotated[str, Field(min_length=1, max_length=120)]


class UserCreate(Schema):
    email: EmailStr
    full_name: FullName
    password: Password

    @field_validator("email")
    @classmethod
    def _lowercase(cls, value: str) -> str:
        return value.lower()

    @field_validator("full_name")
    @classmethod
    def _strip(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("Name cannot be blank")
        return value.strip()


class UserUpdate(Schema):
    full_name: FullName | None = None


class PasswordChange(Schema):
    current_password: str
    new_password: Password


class UserRead(Schema):
    id: uuid.UUID
    email: EmailStr
    full_name: str
    created_at: datetime
    last_login_at: datetime | None


class Token(Schema):
    access_token: str
    token_type: Literal["bearer"] = "bearer"  # noqa: S105 - OAuth2 token type, not a secret
    expires_in: int = Field(description="Lifetime in seconds")
