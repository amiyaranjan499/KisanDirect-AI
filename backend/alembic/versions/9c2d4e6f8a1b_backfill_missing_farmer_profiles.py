"""backfill missing farmer profiles

Revision ID: 9c2d4e6f8a1b
Revises: 8f7a1c2d4e6b
"""

from alembic import op


revision = "9c2d4e6f8a1b"
down_revision = "8f7a1c2d4e6b"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
         INSERT INTO farmers (id, user_id, name, created_at, updated_at)
        SELECT md5(users.id::text || chr(58) || 'farmer-profile')::uuid,
             users.id,
             split_part(users.email, '@', 1),
             now(),
             now()
        FROM users
        WHERE users.role = 'FARMER'
          AND NOT EXISTS (
              SELECT 1
              FROM farmers
              WHERE farmers.user_id = users.id
          )
        """
    )


def downgrade() -> None:
    # This data repair is intentionally non-destructive. Existing profiles and users
    # must not be removed if the migration is downgraded.
    pass
