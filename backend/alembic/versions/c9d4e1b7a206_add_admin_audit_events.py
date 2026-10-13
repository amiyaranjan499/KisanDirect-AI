"""add admin audit events

Revision ID: c9d4e1b7a206
Revises: f4a9c2d1b730
Create Date: 2026-10-11
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "c9d4e1b7a206"
down_revision: Union[str, Sequence[str], None] = "f4a9c2d1b730"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "admin_audit_events",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("actor_user_id", sa.Uuid(), nullable=True),
        sa.Column("action", sa.String(length=80), nullable=False),
        sa.Column("entity_type", sa.String(length=40), nullable=False),
        sa.Column("entity_id", sa.Uuid(), nullable=False),
        sa.Column("from_value", sa.Text(), nullable=True),
        sa.Column("to_value", sa.Text(), nullable=True),
        sa.Column("reason", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["actor_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_admin_audit_entity_created",
        "admin_audit_events",
        ["entity_type", "entity_id", "created_at"],
    )
    op.create_index(
        "ix_admin_audit_actor_created",
        "admin_audit_events",
        ["actor_user_id", "created_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_admin_audit_actor_created", table_name="admin_audit_events")
    op.drop_index("ix_admin_audit_entity_created", table_name="admin_audit_events")
    op.drop_table("admin_audit_events")
