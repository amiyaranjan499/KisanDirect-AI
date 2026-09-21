"""add notification metadata columns

Revision ID: 4e5fc9a74d2a
Revises: a0a032dcdf27
Create Date: 2026-09-12 00:00:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "4e5fc9a74d2a"
down_revision: Union[str, Sequence[str], None] = "a0a032dcdf27"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'PAYMENT'")
    op.execute("ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'DELIVERY'")
    op.execute("ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'REVIEW'")

    op.add_column("notifications", sa.Column("related_entity_type", sa.String(length=80), nullable=True))
    op.add_column("notifications", sa.Column("related_entity_id", sa.Uuid(), nullable=True))
    op.add_column("notifications", sa.Column("read_at", sa.DateTime(timezone=True), nullable=True))

    op.create_index(op.f("ix_notifications_related_entity_id"), "notifications", ["related_entity_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_notifications_related_entity_id"), table_name="notifications")
    op.drop_column("notifications", "read_at")
    op.drop_column("notifications", "related_entity_id")
    op.drop_column("notifications", "related_entity_type")
