"""add profile_image and cover_image to farmers table

Revision ID: f5b2c3d4e6f7
Revises: e4a1b2c3d4e5
Create Date: 2026-10-19
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "f5b2c3d4e6f7"
down_revision: Union[str, Sequence[str], None] = "e4a1b2c3d4e5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("farmers", sa.Column("profile_image", sa.String(length=512), nullable=True))
    op.add_column("farmers", sa.Column("cover_image", sa.String(length=512), nullable=True))


def downgrade() -> None:
    op.drop_column("farmers", "cover_image")
    op.drop_column("farmers", "profile_image")

