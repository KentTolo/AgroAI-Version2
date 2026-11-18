from __future__ import annotations

import uuid
from datetime import datetime
from typing import TYPE_CHECKING, Any

from sqlalchemy import ForeignKey, Index, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, UUIDPrimaryKey, utcnow

if TYPE_CHECKING:
    from app.models.field import Field
    from app.models.user import User


class Recommendation(UUIDPrimaryKey, Base):
    """An audit record of one model prediction: its inputs, ranked output and model version."""

    __tablename__ = "recommendations"
    __table_args__ = (Index("ix_recommendations_user_created", "user_id", "created_at"),)

    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    field_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("fields.id", ondelete="SET NULL"), index=True
    )
    inputs: Mapped[dict[str, Any]]
    predictions: Mapped[list[dict[str, Any]]]
    recommended_crop: Mapped[str] = mapped_column(String(40))
    model_version: Mapped[str] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(default=utcnow)

    user: Mapped[User] = relationship(back_populates="recommendations")
    field: Mapped[Field | None] = relationship()
