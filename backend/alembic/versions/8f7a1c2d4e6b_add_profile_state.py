"""add profile state"""

from alembic import op
import sqlalchemy as sa


revision = "8f7a1c2d4e6b"
down_revision = "7ef7b1fb84c2"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("farmers", sa.Column("state", sa.String(length=80), nullable=True))
    op.add_column("consumers", sa.Column("state", sa.String(length=80), nullable=True))


def downgrade() -> None:
    op.drop_column("consumers", "state")
    op.drop_column("farmers", "state")