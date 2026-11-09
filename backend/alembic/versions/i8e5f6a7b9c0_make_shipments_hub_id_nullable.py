"""make shipments hub_id nullable

Revision ID: i8e5f6a7b9c0
Revises: h7d4e5f6a8b9
Create Date: 2026-11-08 00:15:00.000000

"""
from alembic import op

# revision identifiers, used by Alembic.
revision = 'i8e5f6a7b9c0'
down_revision = 'h7d4e5f6a8b9'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column('shipments', 'hub_id', nullable=True)
    op.drop_constraint('shipments_hub_id_fkey', 'shipments', type_='foreignkey')
    op.create_foreign_key(
        'shipments_hub_id_fkey',
        'shipments',
        'hubs',
        ['hub_id'],
        ['id'],
        ondelete='SET NULL',
    )


def downgrade() -> None:
    op.drop_constraint('shipments_hub_id_fkey', 'shipments', type_='foreignkey')
    op.create_foreign_key(
        'shipments_hub_id_fkey',
        'shipments',
        'hubs',
        ['hub_id'],
        ['id'],
        ondelete='RESTRICT',
    )
    op.alter_column('shipments', 'hub_id', nullable=False)
