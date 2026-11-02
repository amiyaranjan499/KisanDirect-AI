"""add farmer withdrawals table

Revision ID: e4a1b2c3d4e5
Revises: e3c7b1d9a205
Create Date: 2026-10-19
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "e4a1b2c3d4e5"
down_revision: Union[str, Sequence[str], None] = "e3c7b1d9a205"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "farmer_withdrawals",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("farmer_id", sa.Uuid(), nullable=False),
        sa.Column("amount", sa.Numeric(precision=12, scale=2), nullable=False),
        sa.Column("payout_method", sa.String(length=32), nullable=False),
        sa.Column("account_holder_name", sa.String(length=160), nullable=False),
        sa.Column("account_number", sa.String(length=64), nullable=True),
        sa.Column("ifsc_code", sa.String(length=32), nullable=True),
        sa.Column("bank_name", sa.String(length=120), nullable=True),
        sa.Column("upi_id", sa.String(length=80), nullable=True),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("reference_id", sa.String(length=80), nullable=False),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("processed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint("amount > 0", name="ck_farmer_withdrawals_amount_positive"),
        sa.ForeignKeyConstraint(["farmer_id"], ["farmers.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("reference_id"),
    )
    op.create_index("ix_farmer_withdrawals_farmer_id", "farmer_withdrawals", ["farmer_id"])
    op.create_index("ix_farmer_withdrawals_created_at", "farmer_withdrawals", ["created_at"])
    op.create_index("ix_farmer_withdrawals_farmer_status", "farmer_withdrawals", ["farmer_id", "status"])


def downgrade() -> None:
    op.drop_index("ix_farmer_withdrawals_farmer_status", table_name="farmer_withdrawals")
    op.drop_index("ix_farmer_withdrawals_created_at", table_name="farmer_withdrawals")
    op.drop_index("ix_farmer_withdrawals_farmer_id", table_name="farmer_withdrawals")
    op.drop_table("farmer_withdrawals")

