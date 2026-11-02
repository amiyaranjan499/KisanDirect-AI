"""add farmer_id to hubs

Revision ID: e3c7b1d9a205
Revises: c9d4e1b7a206
Create Date: 2026-10-19
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "e3c7b1d9a205"
down_revision: Union[str, Sequence[str], None] = "c9d4e1b7a206"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "hubs",
        sa.Column("farmer_id", sa.Uuid(), sa.ForeignKey("farmers.id", ondelete="SET NULL"), nullable=True),
    )
    op.create_index("ix_hubs_farmer_id", "hubs", ["farmer_id"])


def downgrade() -> None:
    op.drop_index("ix_hubs_farmer_id", table_name="hubs")
    op.drop_column("hubs", "farmer_id")

