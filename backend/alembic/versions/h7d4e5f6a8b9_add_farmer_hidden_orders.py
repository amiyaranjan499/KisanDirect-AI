"""add farmer hidden orders

Revision ID: h7d4e5f6a8b9
Revises: g6c3d4e5f6a7
Create Date: 2026-11-03 22:10:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'h7d4e5f6a8b9'
down_revision = 'g6c3d4e5f6a7'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'farmer_hidden_orders',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('farmer_id', sa.Uuid(), nullable=False),
        sa.Column('order_id', sa.Uuid(), nullable=False),
        sa.Column('hidden_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(['farmer_id'], ['farmers.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['order_id'], ['orders.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('farmer_id', 'order_id', name='uq_farmer_hidden_orders_farmer_order')
    )
    op.create_index('ix_farmer_hidden_orders_farmer_id', 'farmer_hidden_orders', ['farmer_id'], unique=False)
    op.create_index('ix_farmer_hidden_orders_order_id', 'farmer_hidden_orders', ['order_id'], unique=False)


def downgrade() -> None:
    op.drop_index('ix_farmer_hidden_orders_order_id', table_name='farmer_hidden_orders')
    op.drop_index('ix_farmer_hidden_orders_farmer_id', table_name='farmer_hidden_orders')
    op.drop_table('farmer_hidden_orders')

