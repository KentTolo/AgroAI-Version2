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
    # Hosted databases (e.g. Supabase's free tier) cap connections; keep the pool small.
    database_pool_size: int = Field(default=5, ge=1, le=50)

    secret_key: SecretStr = SecretStr(_INSECURE_DEFAULT_KEY)
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = Field(default=60, ge=5, le=60 * 24 * 7)

    cors_origins: Annotated[list[str], NoDecode] = ["http://localhost:5173"]
    # Accounts registered with these emails can open the admin dashboard.
    admin_emails: Annotated[list[str], NoDecode] = []

    # Weather feed (Open-Meteo: free, no API key; data licensed CC BY 4.0).
    weather_forecast_url: str = "https://api.open-meteo.com/v1/forecast"
    weather_archive_url: str = "https://archive-api.open-meteo.com/v1/archive"
    weather_timeout_seconds: float = Field(default=20, gt=0, le=120)
    # Optional key for Open-Meteo's paid API (with its customer-* URLs). The free tier needs none.
    weather_api_key: SecretStr | None = None

    # WhatsApp (self-hosted WAHA, https://github.com/devlikeapro/waha). "none" turns it off;
    # "log" only logs messages (development and tests).
    whatsapp_provider: Literal["none", "log", "waha"] = "none"
    waha_url: str = "http://localhost:3000"
    waha_api_key: SecretStr | None = None
    waha_session: str = "default"
    # WAHA signs webhooks with this key (WHATSAPP_HOOK_HMAC_KEY on the WAHA side).
    waha_webhook_hmac_key: SecretStr | None = None
    # The bot's own number, shown to farmers so they know where to message (digits only).
    whatsapp_bot_number: str | None = None
    # Pause between outgoing messages, to look less like a bulk sender.
    whatsapp_send_delay_seconds: float = Field(default=3, ge=0, le=60)
    # Shared secret for the scheduled notification run (sent as X-Cron-Secret).
    cron_secret: SecretStr | None = None

    artifacts_dir: Path = BACKEND_DIR / "artifacts"
    dataset_path: Path = BACKEND_DIR / "data" / "crop_recommendation.csv"

    @field_validator("database_url")
    @classmethod
    def _use_psycopg_driver(cls, value: str) -> str:
        """Accept URLs as hosting providers show them (postgres://, postgresql://)."""
        for prefix in ("postgres://", "postgresql://"):
            if value.startswith(prefix):
                return "postgresql+psycopg://" + value.removeprefix(prefix)
        return value

    @field_validator("cors_origins", "admin_emails", mode="before")
    @classmethod
    def _split_list(cls, value: object) -> object:
        if isinstance(value, str):
            return [item.strip() for item in value.split(",") if item.strip()]
        return value

    @field_validator("admin_emails")
    @classmethod
    def _lowercase_emails(cls, value: list[str]) -> list[str]:
        return [email.lower() for email in value]

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
