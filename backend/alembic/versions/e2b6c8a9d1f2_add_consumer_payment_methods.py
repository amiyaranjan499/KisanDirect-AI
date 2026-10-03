"""add consumer payment methods

Revision ID: e2b6c8a9d1f2
Revises: 264848013578
Create Date: 2026-09-27 00:00:00.000000
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "e2b6c8a9d1f2"
down_revision: Union[str, Sequence[str], None] = "f3a1b2c4d5e6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "payment_methods",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("consumer_id", sa.Uuid(), nullable=False),
        sa.Column("method_type", sa.String(length=20), nullable=False),
        sa.Column("provider", sa.String(length=80), nullable=False),
        sa.Column("masked_value", sa.String(length=80), nullable=False),
        sa.Column("last4", sa.String(length=4), nullable=True),
        sa.Column("provider_reference", sa.String(length=255), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["consumer_id"], ["consumers.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_payment_methods_consumer_id"), "payment_methods", ["consumer_id"], unique=False)
    op.create_index(op.f("ix_payment_methods_created_at"), "payment_methods", ["created_at"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_payment_methods_created_at"), table_name="payment_methods")
    op.drop_index(op.f("ix_payment_methods_consumer_id"), table_name="payment_methods")
    op.drop_table("payment_methods")
