"""add crop listings composite indexes for fast pagination and immediate display

Revision ID: g6c3d4e5f6a7
Revises: f5b2c3d4e6f7
Create Date: 2026-10-20 00:44:00.000000

"""
from alembic import op

# revision identifiers, used by Alembic.
revision = 'g6c3d4e5f6a7'
down_revision = 'f5b2c3d4e6f7'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_index('ix_crop_listings_farmer_created', 'crop_listings', ['farmer_id', 'created_at'], unique=False)
    op.create_index('ix_crop_listings_status_created', 'crop_listings', ['availability_status', 'created_at'], unique=False)


def downgrade() -> None:
    op.drop_index('ix_crop_listings_status_created', table_name='crop_listings')
    op.drop_index('ix_crop_listings_farmer_created', table_name='crop_listings')

