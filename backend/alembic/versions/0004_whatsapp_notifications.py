"""WhatsApp linking on users, and the notifications sent to them.

Revision ID: 0004
Revises: 0003
Create Date: 2026-11-19 18:32:08.426943
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op


revision: str = "0004"
down_revision: str | None = "0003"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "notifications",
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("key", sa.String(length=160), nullable=False),
        sa.Column("kind", sa.String(length=40), nullable=False),
        sa.Column("message", sa.Text(), nullable=False),
        sa.Column(
            "status",
            sa.Enum("sent", "failed", name="notificationstatus", native_enum=False, length=20),
            nullable=False,
        ),
        sa.Column("error", sa.String(length=300), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name=op.f("fk_notifications_user_id_users"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_notifications")),
        sa.UniqueConstraint("user_id", "key", name="uq_notifications_user_key"),
    )
    with op.batch_alter_table("notifications", schema=None) as batch_op:
        batch_op.create_index(batch_op.f("ix_notifications_user_id"), ["user_id"], unique=False)

    with op.batch_alter_table("users", schema=None) as batch_op:
        batch_op.add_column(sa.Column("whatsapp_number", sa.String(length=20), nullable=True))
        batch_op.add_column(sa.Column("whatsapp_alerts", sa.Boolean(), nullable=False, server_default=sa.true()))
        batch_op.add_column(
            sa.Column("whatsapp_link_code_hash", sa.String(length=64), nullable=True)
        )
        batch_op.add_column(
            sa.Column(
                "whatsapp_link_expires_at", sa.DateTime(timezone=True), nullable=True
            )
        )
        batch_op.create_unique_constraint(
            batch_op.f("uq_users_whatsapp_number"), ["whatsapp_number"]
        )



def downgrade() -> None:
    with op.batch_alter_table("users", schema=None) as batch_op:
        batch_op.drop_constraint(batch_op.f("uq_users_whatsapp_number"), type_="unique")
        batch_op.drop_column("whatsapp_link_expires_at")
        batch_op.drop_column("whatsapp_link_code_hash")
        batch_op.drop_column("whatsapp_alerts")
        batch_op.drop_column("whatsapp_number")

    with op.batch_alter_table("notifications", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_notifications_user_id"))

    op.drop_table("notifications")
