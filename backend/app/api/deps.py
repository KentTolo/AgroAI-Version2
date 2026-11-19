"""Shared FastAPI dependencies."""

from __future__ import annotations

import uuid
from functools import lru_cache
from typing import Annotated

import jwt
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.security import decode_access_token
from app.db.session import get_db
from app.ml.predictor import CropRecommender
from app.models import Field, User
from app.services.weather import OpenMeteoClient, WeatherClient

oauth2_scheme = OAuth2PasswordBearer(tokenUrl=f"{get_settings().api_v1_prefix}/auth/login")

DbSession = Annotated[Session, Depends(get_db)]


def get_current_user(db: DbSession, token: Annotated[str, Depends(oauth2_scheme)]) -> User:
    unauthorized = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        user_id = uuid.UUID(decode_access_token(token))
    except (jwt.InvalidTokenError, ValueError):
        raise unauthorized from None

    user = db.get(User, user_id)
    if user is None or not user.is_active:
        raise unauthorized
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]


def is_admin(user: User) -> bool:
    return user.email.lower() in get_settings().admin_emails


def get_admin_user(user: CurrentUser) -> User:
    if not is_admin(user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admins only")
    return user


AdminUser = Annotated[User, Depends(get_admin_user)]


def get_owned_field(field_id: uuid.UUID, db: DbSession, user: CurrentUser) -> Field:
    field = db.get(Field, field_id)
    # Report someone else's field as missing so IDs can't be probed.
    if field is None or field.owner_id != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Field not found")
    return field


OwnedField = Annotated[Field, Depends(get_owned_field)]


def get_recommender(request: Request) -> CropRecommender:
    recommender: CropRecommender | None = getattr(request.app.state, "recommender", None)
    if recommender is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="The recommendation model is not loaded. Train it with `make train`.",
        )
    return recommender


Recommender = Annotated[CropRecommender, Depends(get_recommender)]


def get_optional_recommender(request: Request) -> CropRecommender | None:
    return getattr(request.app.state, "recommender", None)


OptionalRecommender = Annotated[CropRecommender | None, Depends(get_optional_recommender)]


@lru_cache
def get_weather_client() -> WeatherClient:
    settings = get_settings()
    return OpenMeteoClient(
        settings.weather_forecast_url,
        settings.weather_archive_url,
        settings.weather_timeout_seconds,
        settings.weather_api_key.get_secret_value() if settings.weather_api_key else None,
    )


Weather = Annotated[WeatherClient, Depends(get_weather_client)]
