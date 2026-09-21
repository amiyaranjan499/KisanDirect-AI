"""add sandbox payment status values

Revision ID: b7f0c4a2e1d9
Revises: 8ca3d942eda8
"""
from typing import Sequence, Union

from alembic import op

revision: str = "b7f0c4a2e1d9"
down_revision: Union[str, Sequence[str], None] = "8ca3d942eda8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("ALTER TYPE payment_status ADD VALUE IF NOT EXISTS 'SUCCESSFUL'")
    op.execute("ALTER TYPE payment_status ADD VALUE IF NOT EXISTS 'CANCELLED'")


def downgrade() -> None:
    pass
