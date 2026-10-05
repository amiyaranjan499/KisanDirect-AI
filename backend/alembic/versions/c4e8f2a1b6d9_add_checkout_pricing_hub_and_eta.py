"""store checkout hub, fees, slot, and delivery promise

Revision ID: c4e8f2a1b6d9
Revises: b7c4d2e9f1a0
Create Date: 2026-10-04
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "c4e8f2a1b6d9"
down_revision: Union[str, Sequence[str], None] = "b7c4d2e9f1a0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "orders",
        sa.Column("hub_id", sa.Uuid(), nullable=True),
    )
    op.add_column(
        "orders",
        sa.Column("delivery_slot_id", sa.Uuid(), nullable=True),
    )
    op.add_column(
        "orders",
        sa.Column("subtotal", sa.Numeric(12, 2), server_default="0.00", nullable=False),
    )
    op.add_column(
        "orders",
        sa.Column("delivery_fee", sa.Numeric(12, 2), server_default="0.00", nullable=False),
    )
    op.add_column(
        "orders",
        sa.Column("platform_fee", sa.Numeric(12, 2), server_default="0.00", nullable=False),
    )
    op.add_column("orders", sa.Column("delivery_address", sa.Text(), nullable=True))
    op.add_column("orders", sa.Column("delivery_latitude", sa.Numeric(9, 6), nullable=True))
    op.add_column("orders", sa.Column("delivery_longitude", sa.Numeric(9, 6), nullable=True))
    op.add_column(
        "orders",
        sa.Column("promised_window_start", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "orders",
        sa.Column("promised_window_end", sa.DateTime(timezone=True), nullable=True),
    )
    op.execute("UPDATE orders SET subtotal = total_amount")
    op.alter_column("orders", "subtotal", server_default=None)
    op.alter_column("orders", "delivery_fee", server_default=None)
    op.alter_column("orders", "platform_fee", server_default=None)
    op.create_foreign_key(
        "fk_orders_hub_id_hubs",
        "orders",
        "hubs",
        ["hub_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_orders_delivery_slot_id_delivery_slots",
        "orders",
        "delivery_slots",
        ["delivery_slot_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index("ix_orders_hub_id", "orders", ["hub_id"])
    op.create_index("ix_orders_delivery_slot_id", "orders", ["delivery_slot_id"])


def downgrade() -> None:
    op.drop_index("ix_orders_delivery_slot_id", table_name="orders")
    op.drop_index("ix_orders_hub_id", table_name="orders")
    op.drop_constraint(
        "fk_orders_delivery_slot_id_delivery_slots", "orders", type_="foreignkey"
    )
    op.drop_constraint("fk_orders_hub_id_hubs", "orders", type_="foreignkey")
    op.drop_column("orders", "promised_window_end")
    op.drop_column("orders", "promised_window_start")
    op.drop_column("orders", "platform_fee")
    op.drop_column("orders", "delivery_fee")
    op.drop_column("orders", "subtotal")
    op.drop_column("orders", "delivery_longitude")
    op.drop_column("orders", "delivery_latitude")
    op.drop_column("orders", "delivery_address")
    op.drop_column("orders", "delivery_slot_id")
    op.drop_column("orders", "hub_id")
