"""Initial schema: users, fields, sensor readings, recommendations and crop cycles.

Revision ID: 0001
Revises:
Create Date: 2026-11-18 12:19:22.417496
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op


revision: str = "0001"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("email", sa.String(length=320), nullable=False),
        sa.Column("full_name", sa.String(length=120), nullable=False),
        sa.Column("hashed_password", sa.String(length=255), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("last_login_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_users")),
    )
    op.create_index(op.f("ix_users_email"), "users", ["email"], unique=True)
    op.create_table(
        "fields",
        sa.Column("owner_id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("latitude", sa.Double(), nullable=True),
        sa.Column("longitude", sa.Double(), nullable=True),
        sa.Column("area_hectares", sa.Double(), nullable=True),
        sa.Column("soil_type", sa.String(length=40), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("area_hectares > 0", name=op.f("ck_fields_area_positive")),
        sa.CheckConstraint("latitude BETWEEN -90 AND 90", name=op.f("ck_fields_latitude_range")),
        sa.CheckConstraint(
            "longitude BETWEEN -180 AND 180", name=op.f("ck_fields_longitude_range")
        ),
        sa.ForeignKeyConstraint(
            ["owner_id"], ["users.id"], name=op.f("fk_fields_owner_id_users"), ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_fields")),
        sa.UniqueConstraint("owner_id", "name", name="uq_fields_owner_id_name"),
    )
    op.create_index(op.f("ix_fields_owner_id"), "fields", ["owner_id"], unique=False)
    op.create_table(
        "crop_cycles",
        sa.Column("field_id", sa.Uuid(), nullable=False),
        sa.Column("crop", sa.String(length=40), nullable=False),
        sa.Column("planted_on", sa.Date(), nullable=False),
        sa.Column("expected_harvest_on", sa.Date(), nullable=False),
        sa.Column("harvested_on", sa.Date(), nullable=True),
        sa.Column(
            "status",
            sa.Enum(
                "active", "harvested", "failed", name="cyclestatus", native_enum=False, length=20
            ),
            nullable=False,
        ),
        sa.Column("yield_kg", sa.Double(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "expected_harvest_on > planted_on", name=op.f("ck_crop_cycles_harvest_after_planting")
        ),
        sa.CheckConstraint("yield_kg >= 0", name=op.f("ck_crop_cycles_yield_non_negative")),
        sa.ForeignKeyConstraint(
            ["field_id"],
            ["fields.id"],
            name=op.f("fk_crop_cycles_field_id_fields"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_crop_cycles")),
    )
    op.create_index(op.f("ix_crop_cycles_field_id"), "crop_cycles", ["field_id"], unique=False)
    op.create_table(
        "recommendations",
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("field_id", sa.Uuid(), nullable=True),
        sa.Column("inputs", sa.JSON(), nullable=False),
        sa.Column("predictions", sa.JSON(), nullable=False),
        sa.Column("recommended_crop", sa.String(length=40), nullable=False),
        sa.Column("model_version", sa.String(length=64), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.ForeignKeyConstraint(
            ["field_id"],
            ["fields.id"],
            name=op.f("fk_recommendations_field_id_fields"),
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name=op.f("fk_recommendations_user_id_users"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_recommendations")),
    )
    op.create_index(
        op.f("ix_recommendations_field_id"), "recommendations", ["field_id"], unique=False
    )
    op.create_index(
        "ix_recommendations_user_created",
        "recommendations",
        ["user_id", "created_at"],
        unique=False,
    )
    op.create_table(
        "sensor_readings",
        sa.Column("field_id", sa.Uuid(), nullable=False),
        sa.Column("recorded_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column(
            "source",
            sa.Enum(
                "manual", "simulated", "device", name="readingsource", native_enum=False, length=20
            ),
            nullable=False,
        ),
        sa.Column("nitrogen", sa.Double(), nullable=False),
        sa.Column("phosphorus", sa.Double(), nullable=False),
        sa.Column("potassium", sa.Double(), nullable=False),
        sa.Column("temperature", sa.Double(), nullable=False),
        sa.Column("humidity", sa.Double(), nullable=False),
        sa.Column("ph", sa.Double(), nullable=False),
        sa.Column("rainfall", sa.Double(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.ForeignKeyConstraint(
            ["field_id"],
            ["fields.id"],
            name=op.f("fk_sensor_readings_field_id_fields"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_sensor_readings")),
    )
    op.create_index(
        "ix_sensor_readings_field_recorded",
        "sensor_readings",
        ["field_id", "recorded_at"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_sensor_readings_field_recorded", table_name="sensor_readings")
    op.drop_table("sensor_readings")
    op.drop_index("ix_recommendations_user_created", table_name="recommendations")
    op.drop_index(op.f("ix_recommendations_field_id"), table_name="recommendations")
    op.drop_table("recommendations")
    op.drop_index(op.f("ix_crop_cycles_field_id"), table_name="crop_cycles")
    op.drop_table("crop_cycles")
    op.drop_index(op.f("ix_fields_owner_id"), table_name="fields")
    op.drop_table("fields")
    op.drop_index(op.f("ix_users_email"), table_name="users")
    op.drop_table("users")
