"""Application settings, loaded from environment variables (prefix ``AGROAI_``)."""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Annotated, Literal

from pydantic import Field, SecretStr, field_validator, model_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parents[2]
_INSECURE_DEFAULT_KEY = "insecure-development-key-change-me"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="AGROAI_",
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    environment: Literal["development", "test", "production"] = "development"
    project_name: str = "AgroAI"
    api_v1_prefix: str = "/api/v1"
    log_level: str = "INFO"

    database_url: str = "postgresql+psycopg://agroai:agroai@localhost:5432/agroai"

    secret_key: SecretStr = SecretStr(_INSECURE_DEFAULT_KEY)
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = Field(default=60, ge=5, le=60 * 24 * 7)

    cors_origins: Annotated[list[str], NoDecode] = ["http://localhost:5173"]

    artifacts_dir: Path = BACKEND_DIR / "artifacts"
    dataset_path: Path = BACKEND_DIR / "data" / "crop_recommendation.csv"

    @field_validator("cors_origins", mode="before")
    @classmethod
    def _split_origins(cls, value: object) -> object:
        if isinstance(value, str):
            return [origin.strip() for origin in value.split(",") if origin.strip()]
        return value

    @model_validator(mode="after")
    def _require_real_secret_in_production(self) -> Settings:
        key = self.secret_key.get_secret_value()
        if self.environment == "production" and (key == _INSECURE_DEFAULT_KEY or len(key) < 32):
            raise ValueError(
                "AGROAI_SECRET_KEY must be set to a random value of at least 32 characters "
                "in production."
            )
        return self

    @property
    def is_production(self) -> bool:
        return self.environment == "production"


@lru_cache
def get_settings() -> Settings:
    return Settings()
