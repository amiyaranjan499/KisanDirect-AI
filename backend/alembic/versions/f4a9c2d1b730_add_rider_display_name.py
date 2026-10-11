"""add rider display name

Revision ID: f4a9c2d1b730
Revises: e8a2d4c6b9f1
Create Date: 2026-10-18
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "f4a9c2d1b730"
down_revision: Union[str, Sequence[str], None] = "e8a2d4c6b9f1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("riders", sa.Column("display_name", sa.String(length=160), nullable=True))


def downgrade() -> None:
    op.drop_column("riders", "display_name")
