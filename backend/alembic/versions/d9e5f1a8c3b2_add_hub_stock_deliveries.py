"""add farmer-to-hub stock delivery receipts

Revision ID: d9e5f1a8c3b2
Revises: c4e8f2a1b6d9
Create Date: 2026-10-18
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "d9e5f1a8c3b2"
down_revision: Union[str, Sequence[str], None] = "c4e8f2a1b6d9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "hub_stock_deliveries",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("hub_id", sa.Uuid(), nullable=False),
        sa.Column("listing_id", sa.Uuid(), nullable=False),
        sa.Column("farmer_user_id", sa.Uuid(), nullable=False),
        sa.Column("quantity", sa.Numeric(12, 3), nullable=False),
        sa.Column(
            "status",
            sa.String(length=16),
            server_default="PENDING",
            nullable=False,
        ),
        sa.Column("received_by_user_id", sa.Uuid(), nullable=True),
        sa.Column("received_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.CheckConstraint(
            "quantity > 0",
            name="ck_hub_stock_deliveries_quantity_positive",
        ),
        sa.CheckConstraint(
            "status IN ('PENDING', 'RECEIVED')",
            name="ck_hub_stock_deliveries_status",
        ),
        sa.ForeignKeyConstraint(
            ["hub_id"], ["hubs.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["listing_id"], ["crop_listings.id"], ondelete="RESTRICT"
        ),
        sa.ForeignKeyConstraint(
            ["farmer_user_id"], ["users.id"], ondelete="RESTRICT"
        ),
        sa.ForeignKeyConstraint(
            ["received_by_user_id"], ["users.id"], ondelete="SET NULL"
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_hub_stock_deliveries_hub_status",
        "hub_stock_deliveries",
        ["hub_id", "status"],
    )
    op.create_index(
        "ix_hub_stock_deliveries_farmer_created",
        "hub_stock_deliveries",
        ["farmer_user_id", "created_at"],
    )
    op.create_index(
        "ix_hub_stock_deliveries_created_at",
        "hub_stock_deliveries",
        ["created_at"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_hub_stock_deliveries_created_at",
        table_name="hub_stock_deliveries",
    )
    op.drop_index(
        "ix_hub_stock_deliveries_farmer_created",
        table_name="hub_stock_deliveries",
    )
    op.drop_index(
        "ix_hub_stock_deliveries_hub_status",
        table_name="hub_stock_deliveries",
    )
    op.drop_table("hub_stock_deliveries")
