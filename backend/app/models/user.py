from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, Timestamps, UUIDPrimaryKey

if TYPE_CHECKING:
    from app.models.field import Field
    from app.models.notification import Notification
    from app.models.recommendation import Recommendation


class User(UUIDPrimaryKey, Timestamps, Base):
    __tablename__ = "users"

    email: Mapped[str] = mapped_column(String(320), unique=True, index=True)
    full_name: Mapped[str] = mapped_column(String(120))
    hashed_password: Mapped[str] = mapped_column(String(255))
    is_active: Mapped[bool] = mapped_column(default=True)
    last_login_at: Mapped[datetime | None] = mapped_column(default=None)

    # WhatsApp: the number is set only after the farmer messages the bot from it (proof of
    # ownership). The one-time link code is stored as a SHA-256 hash.
    whatsapp_number: Mapped[str | None] = mapped_column(String(20), unique=True, default=None)
    whatsapp_alerts: Mapped[bool] = mapped_column(default=True)
    whatsapp_link_code_hash: Mapped[str | None] = mapped_column(String(64), default=None)
    whatsapp_link_expires_at: Mapped[datetime | None] = mapped_column(default=None)

    fields: Mapped[list[Field]] = relationship(
        back_populates="owner", cascade="all, delete-orphan", passive_deletes=True
    )
    recommendations: Mapped[list[Recommendation]] = relationship(
        back_populates="user", cascade="all, delete-orphan", passive_deletes=True
    )
    notifications: Mapped[list[Notification]] = relationship(
        back_populates="user", cascade="all, delete-orphan", passive_deletes=True
    )
