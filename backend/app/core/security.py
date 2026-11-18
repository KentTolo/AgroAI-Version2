"""Password hashing and JWT access tokens."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import bcrypt
import jwt

from app.core.config import get_settings

# bcrypt only considers the first 72 bytes of a password; longer inputs are rejected upstream.
BCRYPT_MAX_BYTES = 72

# Used to keep login timing constant when the e-mail address is unknown.
_DUMMY_HASH = bcrypt.hashpw(b"agroai-timing-equaliser", bcrypt.gensalt()).decode()


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def verify_password(password: str, hashed: str | None) -> bool:
    """Check ``password`` against ``hashed``. ``None`` still spends the time of a real check."""
    candidate = password.encode()[:BCRYPT_MAX_BYTES]
    try:
        matches = bcrypt.checkpw(candidate, (hashed or _DUMMY_HASH).encode())
    except ValueError:
        return False
    return matches and hashed is not None


def create_access_token(subject: str, expires_delta: timedelta | None = None) -> str:
    settings = get_settings()
    now = datetime.now(UTC)
    expire = now + (expires_delta or timedelta(minutes=settings.access_token_expire_minutes))
    payload = {"sub": subject, "iat": now, "exp": expire, "type": "access"}
    return jwt.encode(
        payload, settings.secret_key.get_secret_value(), algorithm=settings.jwt_algorithm
    )


def decode_access_token(token: str) -> str:
    """Return the token's subject. Raises ``jwt.InvalidTokenError`` if it is not valid."""
    settings = get_settings()
    payload = jwt.decode(
        token,
        settings.secret_key.get_secret_value(),
        algorithms=[settings.jwt_algorithm],
        options={"require": ["sub", "exp", "iat"]},
    )
    if payload.get("type") != "access":
        raise jwt.InvalidTokenError("Not an access token")
    return str(payload["sub"])
