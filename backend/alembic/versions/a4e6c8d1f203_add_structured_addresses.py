"""add structured address and delivery snapshot fields"""

import sqlalchemy as sa
from alembic import op

revision = "a4e6c8d1f203"
down_revision = "9c2d4e6f8a1b"
branch_labels = None
depends_on = None


def upgrade() -> None:
    for table in ("farmers", "consumers"):
        for name, type_ in (("village", sa.String(160)), ("post_office", sa.String(160)), ("city", sa.String(160)), ("district", sa.String(160)), ("pin_code", sa.String(6)), ("address_line", sa.Text())):
            op.add_column(table, sa.Column(name, type_, nullable=True))
    for name, type_ in (("recipient_name", sa.String(160)), ("recipient_phone", sa.String(32)), ("village", sa.String(160)), ("post_office", sa.String(160)), ("city", sa.String(160)), ("district", sa.String(160)), ("state", sa.String(80)), ("pin_code", sa.String(6)), ("address_line", sa.Text()), ("latitude", sa.Numeric(9, 6)), ("longitude", sa.Numeric(9, 6))):
        op.add_column("deliveries", sa.Column(name, type_, nullable=True))


def downgrade() -> None:
    for name in ("longitude", "latitude", "address_line", "pin_code", "state", "district", "city", "post_office", "village", "recipient_phone", "recipient_name"):
        op.drop_column("deliveries", name)
    for table in ("consumers", "farmers"):
        for name in ("address_line", "pin_code", "district", "city", "post_office", "village"):
            op.drop_column(table, name)