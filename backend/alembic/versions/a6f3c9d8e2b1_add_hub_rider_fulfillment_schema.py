"""add hub, rider, shipment, reservation, and order-event schema

Revision ID: a6f3c9d8e2b1
Revises: e2b6c8a9d1f2
Create Date: 2026-09-29
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from geoalchemy2 import Geography
from sqlalchemy.dialects import postgresql

revision: str = "a6f3c9d8e2b1"
down_revision: Union[str, Sequence[str], None] = "e2b6c8a9d1f2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.get_context().autocommit_block():
        op.execute("ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'RIDER'")
        op.execute("ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'HUB_STAFF'")

    enum_specs = (
        ("hub_status", ("ACTIVE", "INACTIVE")),
        ("rider_availability", ("OFFLINE", "AVAILABLE", "BUSY")),
        ("rider_approval_status", ("PENDING_APPROVAL", "APPROVED", "SUSPENDED")),
        (
            "shipment_status",
            (
                "READY_FOR_PICKUP",
                "RIDER_ASSIGNED",
                "PICKED_UP",
                "OUT_FOR_DELIVERY",
                "ARRIVED",
                "DELIVERED",
                "FAILED_DELIVERY",
                "RETURNED",
                "CANCELLED",
            ),
        ),
        ("reservation_status", ("HOLD", "COMMITTED", "RELEASED", "EXPIRED")),
    )
    for name, values in enum_specs:
        postgresql.ENUM(*values, name=name).create(op.get_bind(), checkfirst=True)

    user_role = postgresql.ENUM(
        "FARMER", "CONSUMER", "ADMIN", "RIDER", "HUB_STAFF", name="user_role", create_type=False
    )

    op.create_table(
        "hubs",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(length=160), nullable=False),
        sa.Column("address", sa.Text(), nullable=False),
        sa.Column("location", Geography(geometry_type="POINT", srid=4326), nullable=False),
        sa.Column("pincode", sa.String(length=6), nullable=False),
        sa.Column("service_radius_km", sa.Numeric(precision=8, scale=2), server_default="8", nullable=False),
        sa.Column("status", postgresql.ENUM(name="hub_status", create_type=False), server_default="ACTIVE", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint("service_radius_km > 0", name="ck_hubs_service_radius_positive"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_hubs_pincode", "hubs", ["pincode"])
    op.create_index("ix_hubs_status_pincode", "hubs", ["status", "pincode"])
    op.create_index("ix_hubs_created_at", "hubs", ["created_at"])

    op.create_table(
        "hub_staff",
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("hub_id", sa.Uuid(), nullable=False),
        sa.ForeignKeyConstraint(["hub_id"], ["hubs.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("user_id", "hub_id"),
    )

    op.create_table(
        "hub_stock",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("hub_id", sa.Uuid(), nullable=False),
        sa.Column("listing_id", sa.Uuid(), nullable=False),
        sa.Column("available_quantity", sa.Numeric(precision=12, scale=3), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint("available_quantity >= 0", name="ck_hub_stock_quantity_nonnegative"),
        sa.ForeignKeyConstraint(["hub_id"], ["hubs.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["listing_id"], ["crop_listings.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("hub_id", "listing_id", name="uq_hub_stock_hub_listing"),
    )
    op.create_index("ix_hub_stock_listing_id", "hub_stock", ["listing_id"])
    op.create_index("ix_hub_stock_created_at", "hub_stock", ["created_at"])

    op.create_table(
        "riders",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("vehicle_type", sa.String(length=40), nullable=False),
        sa.Column("availability", postgresql.ENUM(name="rider_availability", create_type=False), server_default="OFFLINE", nullable=False),
        sa.Column("approval_status", postgresql.ENUM(name="rider_approval_status", create_type=False), server_default="PENDING_APPROVAL", nullable=False),
        sa.Column("last_seen_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id"),
    )
    op.create_index("ix_riders_created_at", "riders", ["created_at"])

    op.create_table(
        "rider_locations",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("rider_id", sa.Uuid(), nullable=False),
        sa.Column("location", Geography(geometry_type="POINT", srid=4326), nullable=False),
        sa.Column("accuracy", sa.Numeric(precision=8, scale=2), nullable=True),
        sa.Column("recorded_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint("accuracy IS NULL OR accuracy >= 0", name="ck_rider_locations_accuracy_nonnegative"),
        sa.ForeignKeyConstraint(["rider_id"], ["riders.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_rider_locations_rider_recorded", "rider_locations", ["rider_id", "recorded_at"])

    op.create_table(
        "delivery_slots",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("hub_id", sa.Uuid(), nullable=False),
        sa.Column("starts_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("ends_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("capacity", sa.Integer(), nullable=False),
        sa.Column("booked_count", sa.Integer(), server_default="0", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint("capacity > 0", name="ck_delivery_slots_capacity_positive"),
        sa.CheckConstraint("booked_count >= 0", name="ck_delivery_slots_booked_nonnegative"),
        sa.CheckConstraint("booked_count <= capacity", name="ck_delivery_slots_booked_within_capacity"),
        sa.CheckConstraint("ends_at > starts_at", name="ck_delivery_slots_end_after_start"),
        sa.ForeignKeyConstraint(["hub_id"], ["hubs.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_delivery_slots_hub_starts", "delivery_slots", ["hub_id", "starts_at"])
    op.create_index("ix_delivery_slots_created_at", "delivery_slots", ["created_at"])

    op.create_table(
        "shipments",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("order_id", sa.Uuid(), nullable=False),
        sa.Column("hub_id", sa.Uuid(), nullable=False),
        sa.Column("rider_id", sa.Uuid(), nullable=True),
        sa.Column("status", postgresql.ENUM(name="shipment_status", create_type=False), server_default="READY_FOR_PICKUP", nullable=False),
        sa.Column("promised_window_start", sa.DateTime(timezone=True), nullable=False),
        sa.Column("promised_window_end", sa.DateTime(timezone=True), nullable=False),
        sa.Column("pickup_address_snapshot", sa.Text(), nullable=False),
        sa.Column("dropoff_address_snapshot", sa.Text(), nullable=False),
        sa.Column("ready_for_pickup_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("rider_assigned_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("picked_up_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("out_for_delivery_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("arrived_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("delivered_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("failed_delivery_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("returned_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("cancelled_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("delivery_otp_hash", sa.String(length=255), nullable=True),
        sa.Column("otp_expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("otp_attempts", sa.Integer(), server_default="0", nullable=False),
        sa.Column("otp_consumed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint("otp_attempts >= 0", name="ck_shipments_otp_attempts_nonnegative"),
        sa.CheckConstraint("promised_window_end > promised_window_start", name="ck_shipments_promised_window_valid"),
        sa.ForeignKeyConstraint(["hub_id"], ["hubs.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["order_id"], ["orders.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["rider_id"], ["riders.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("order_id", name="uq_shipments_order_id"),
    )
    op.create_index("ix_shipments_hub_status", "shipments", ["hub_id", "status"])
    op.create_index("ix_shipments_rider_status", "shipments", ["rider_id", "status"])
    op.create_index("ix_shipments_created_at", "shipments", ["created_at"])

    op.create_table(
        "stock_reservations",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("order_id", sa.Uuid(), nullable=False),
        sa.Column("hub_stock_id", sa.Uuid(), nullable=False),
        sa.Column("quantity", sa.Numeric(precision=12, scale=3), nullable=False),
        sa.Column("status", postgresql.ENUM(name="reservation_status", create_type=False), server_default="HOLD", nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint("quantity > 0", name="ck_stock_reservations_quantity_positive"),
        sa.ForeignKeyConstraint(["hub_stock_id"], ["hub_stock.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["order_id"], ["orders.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("order_id", "hub_stock_id", name="uq_stock_reservations_order_stock"),
    )
    op.create_index("ix_stock_reservations_status_expires", "stock_reservations", ["status", "expires_at"])
    op.create_index("ix_stock_reservations_created_at", "stock_reservations", ["created_at"])

    op.create_table(
        "order_events",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("order_id", sa.Uuid(), nullable=False),
        sa.Column("shipment_id", sa.Uuid(), nullable=True),
        sa.Column("actor_user_id", sa.Uuid(), nullable=True),
        sa.Column("actor_role", user_role, nullable=True),
        sa.Column("from_status", sa.String(length=40), nullable=True),
        sa.Column("to_status", sa.String(length=40), nullable=False),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["actor_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["order_id"], ["orders.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["shipment_id"], ["shipments.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_order_events_order_created", "order_events", ["order_id", "created_at"])
    op.create_index("ix_order_events_shipment_created", "order_events", ["shipment_id", "created_at"])


def downgrade() -> None:
    op.drop_table("order_events")
    op.drop_table("stock_reservations")
    op.drop_table("shipments")
    op.drop_table("delivery_slots")
    op.drop_table("rider_locations")
    op.drop_table("riders")
    op.drop_table("hub_stock")
    op.drop_table("hub_staff")
    op.drop_table("hubs")
    for enum_name in (
        "reservation_status",
        "shipment_status",
        "rider_approval_status",
        "rider_availability",
        "hub_status",
    ):
        postgresql.ENUM(name=enum_name).drop(op.get_bind(), checkfirst=True)