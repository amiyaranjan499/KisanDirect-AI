"""add rider dispatch offers and optional vehicle details

Revision ID: e8a2d4c6b9f1
Revises: d9e5f1a8c3b2
Create Date: 2026-10-10
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "e8a2d4c6b9f1"
down_revision: Union[str, Sequence[str], None] = "d9e5f1a8c3b2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column(
        "riders",
        "vehicle_type",
        existing_type=sa.String(length=40),
        nullable=True,
    )
    op.create_table(
        "rider_offers",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("shipment_id", sa.Uuid(), nullable=False),
        sa.Column("rider_id", sa.Uuid(), nullable=False),
        sa.Column("status", sa.String(length=12), nullable=False),
        sa.Column("offered_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("responded_at", sa.DateTime(timezone=True), nullable=True),
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
            "status IN ('OFFERED', 'ACCEPTED', 'DECLINED', 'EXPIRED', 'SUPERSEDED')",
            name="ck_rider_offers_status",
        ),
        sa.CheckConstraint(
            "expires_at > offered_at",
            name="ck_rider_offers_expiry_after_offer",
        ),
        sa.ForeignKeyConstraint(
            ["rider_id"], ["riders.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["shipment_id"], ["shipments.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_rider_offers_rider_status_expiry",
        "rider_offers",
        ["rider_id", "status", "expires_at"],
    )
    op.create_index(
        "ix_rider_offers_shipment_status",
        "rider_offers",
        ["shipment_id", "status"],
    )
    op.create_index(
        "ix_rider_offers_status_expiry",
        "rider_offers",
        ["status", "expires_at"],
    )
    op.create_index(
        "uq_rider_offers_one_active_per_shipment",
        "rider_offers",
        ["shipment_id"],
        unique=True,
        postgresql_where=sa.text("status IN ('OFFERED', 'ACCEPTED')"),
    )


def downgrade() -> None:
    op.drop_index(
        "uq_rider_offers_one_active_per_shipment", table_name="rider_offers"
    )
    op.drop_index("ix_rider_offers_status_expiry", table_name="rider_offers")
    op.drop_index("ix_rider_offers_shipment_status", table_name="rider_offers")
    op.drop_index(
        "ix_rider_offers_rider_status_expiry", table_name="rider_offers"
    )
    op.drop_table("rider_offers")
    op.execute(
        "UPDATE riders SET vehicle_type = 'not specified' "
        "WHERE vehicle_type IS NULL"
    )
    op.alter_column(
        "riders",
        "vehicle_type",
        existing_type=sa.String(length=40),
        nullable=False,
    )
