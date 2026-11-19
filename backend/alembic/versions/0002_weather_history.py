"""Weather history per field, and the context (e.g. climate basis) of each recommendation.

Revision ID: 0002
Revises: 0001
Create Date: 2026-11-19 06:51:17.294548
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op


revision: str = "0002"
down_revision: str | None = "0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "weather_days",
        sa.Column("field_id", sa.Uuid(), nullable=False),
        sa.Column("day", sa.Date(), nullable=False),
        sa.Column("temperature_mean", sa.Double(), nullable=False),
        sa.Column("temperature_min", sa.Double(), nullable=True),
        sa.Column("temperature_max", sa.Double(), nullable=True),
        sa.Column("precipitation", sa.Double(), nullable=False),
        sa.Column("humidity_mean", sa.Double(), nullable=True),
        sa.Column("source", sa.String(length=20), nullable=False),
        sa.Column("fetched_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.ForeignKeyConstraint(
            ["field_id"],
            ["fields.id"],
            name=op.f("fk_weather_days_field_id_fields"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_weather_days")),
        sa.UniqueConstraint("field_id", "day", name="uq_weather_days_field_id_day"),
    )
    op.create_index(op.f("ix_weather_days_field_id"), "weather_days", ["field_id"], unique=False)
    op.add_column("recommendations", sa.Column("context", sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column("recommendations", "context")
    op.drop_index(op.f("ix_weather_days_field_id"), table_name="weather_days")
    op.drop_table("weather_days")
