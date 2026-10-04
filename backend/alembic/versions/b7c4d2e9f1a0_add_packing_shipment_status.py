"""add packing as the initial shipment state

Revision ID: b7c4d2e9f1a0
Revises: a6f3c9d8e2b1
Create Date: 2026-10-03
"""
from typing import Sequence, Union

from alembic import op

revision: str = "b7c4d2e9f1a0"
down_revision: Union[str, Sequence[str], None] = "a6f3c9d8e2b1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.get_context().autocommit_block():
        op.execute("ALTER TYPE shipment_status ADD VALUE IF NOT EXISTS 'PACKING'")
    op.execute("ALTER TABLE shipments ALTER COLUMN status SET DEFAULT 'PACKING'")


def downgrade() -> None:
    op.execute("ALTER TABLE shipments ALTER COLUMN status SET DEFAULT 'READY_FOR_PICKUP'")
