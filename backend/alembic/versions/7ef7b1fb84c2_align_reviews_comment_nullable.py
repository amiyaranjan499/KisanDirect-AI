"""align reviews comment nullable

Revision ID: 7ef7b1fb84c2
Revises: 4e5fc9a74d2a
Create Date: 2026-09-12 00:00:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "7ef7b1fb84c2"
down_revision: Union[str, Sequence[str], None] = "4e5fc9a74d2a"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("UPDATE reviews SET comment = '' WHERE comment IS NULL")
    op.alter_column("reviews", "comment", existing_type=sa.Text(), nullable=False)


def downgrade() -> None:
    op.alter_column("reviews", "comment", existing_type=sa.Text(), nullable=True)
