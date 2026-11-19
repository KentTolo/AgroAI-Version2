"""Sensor devices (with hashed API keys) and the telemetry they post.

Revision ID: 0003
Revises: 0002
Create Date: 2026-11-19 07:03:54.147185
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op


revision: str = "0003"
down_revision: str | None = "0002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "devices",
        sa.Column("field_id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(length=80), nullable=False),
        sa.Column("key_hash", sa.String(length=64), nullable=False),
        sa.Column("key_prefix", sa.String(length=12), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("last_seen_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.ForeignKeyConstraint(
            ["field_id"], ["fields.id"], name=op.f("fk_devices_field_id_fields"), ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_devices")),
        sa.UniqueConstraint("key_hash", name=op.f("uq_devices_key_hash")),
    )
    op.create_index(op.f("ix_devices_field_id"), "devices", ["field_id"], unique=False)
    op.create_table(
        "telemetry",
        sa.Column("device_id", sa.Uuid(), nullable=False),
        sa.Column("field_id", sa.Uuid(), nullable=False),
        sa.Column("recorded_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("received_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("air_temperature", sa.Double(), nullable=True),
        sa.Column("air_humidity", sa.Double(), nullable=True),
        sa.Column("soil_moisture", sa.Double(), nullable=True),
        sa.Column("soil_temperature", sa.Double(), nullable=True),
        sa.Column("battery_voltage", sa.Double(), nullable=True),
        sa.Column("signal_strength", sa.Integer(), nullable=True),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.ForeignKeyConstraint(
            ["device_id"],
            ["devices.id"],
            name=op.f("fk_telemetry_device_id_devices"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["field_id"],
            ["fields.id"],
            name=op.f("fk_telemetry_field_id_fields"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_telemetry")),
    )
    op.create_index(op.f("ix_telemetry_device_id"), "telemetry", ["device_id"], unique=False)
    op.create_index(
        "ix_telemetry_field_recorded", "telemetry", ["field_id", "recorded_at"], unique=False
    )


def downgrade() -> None:
    op.drop_index("ix_telemetry_field_recorded", table_name="telemetry")
    op.drop_index(op.f("ix_telemetry_device_id"), table_name="telemetry")
    op.drop_table("telemetry")
    op.drop_index(op.f("ix_devices_field_id"), table_name="devices")
    op.drop_table("devices")
