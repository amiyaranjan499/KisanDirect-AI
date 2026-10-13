from datetime import datetime
from decimal import Decimal
from enum import Enum
from typing import Any
from uuid import UUID, uuid4

from geoalchemy2 import Geography
from sqlalchemy import (
    JSON,
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    Uuid,
    func,
    text,
)
from sqlalchemy import (
    Enum as SqlEnum,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.app.core.config import get_settings
from backend.app.models.base import Base


class UserRole(str, Enum):
    FARMER = "FARMER"
    CONSUMER = "CONSUMER"
    ADMIN = "ADMIN"
    RIDER = "RIDER"
    HUB_STAFF = "HUB_STAFF"


class AvailabilityStatus(str, Enum):
    AVAILABLE = "AVAILABLE"
    UNAVAILABLE = "UNAVAILABLE"
    SOLD_OUT = "SOLD_OUT"


class OrderStatus(str, Enum):
    PENDING = "PENDING"
    CONFIRMED = "CONFIRMED"
    PROCESSING = "PROCESSING"
    SHIPPED = "SHIPPED"
    DELIVERED = "DELIVERED"
    COMPLETED = "COMPLETED"
    CANCELLED = "CANCELLED"


class PaymentStatus(str, Enum):
    PENDING = "PENDING"
    PAID = "PAID"
    SUCCESSFUL = "SUCCESSFUL"
    FAILED = "FAILED"
    CANCELLED = "CANCELLED"
    REFUNDED = "REFUNDED"


class DeliveryStatus(str, Enum):
    PENDING = "PENDING"
    CONFIRMED = "CONFIRMED"
    READY = "READY"
    ASSIGNED = "ASSIGNED"
    IN_TRANSIT = "IN_TRANSIT"
    OUT_FOR_DELIVERY = "OUT_FOR_DELIVERY"
    DELIVERED = "DELIVERED"
    PICKED_UP = "PICKED_UP"
    CANCELLED = "CANCELLED"
    FAILED = "FAILED"


class FulfillmentMethod(str, Enum):
    DELIVERY = "DELIVERY"
    FARMER_PICKUP = "FARMER_PICKUP"


class HubStatus(str, Enum):
    ACTIVE = "ACTIVE"
    INACTIVE = "INACTIVE"


class RiderAvailability(str, Enum):
    OFFLINE = "OFFLINE"
    AVAILABLE = "AVAILABLE"
    BUSY = "BUSY"


class RiderApprovalStatus(str, Enum):
    PENDING_APPROVAL = "PENDING_APPROVAL"
    APPROVED = "APPROVED"
    SUSPENDED = "SUSPENDED"


class ShipmentStatus(str, Enum):
    PACKING = "PACKING"
    READY_FOR_PICKUP = "READY_FOR_PICKUP"
    RIDER_ASSIGNED = "RIDER_ASSIGNED"
    PICKED_UP = "PICKED_UP"
    OUT_FOR_DELIVERY = "OUT_FOR_DELIVERY"
    ARRIVED = "ARRIVED"
    DELIVERED = "DELIVERED"
    FAILED_DELIVERY = "FAILED_DELIVERY"
    RETURNED = "RETURNED"
    CANCELLED = "CANCELLED"


class ReservationStatus(str, Enum):
    HOLD = "HOLD"
    COMMITTED = "COMMITTED"
    RELEASED = "RELEASED"
    EXPIRED = "EXPIRED"


class NotificationType(str, Enum):
    SYSTEM = "SYSTEM"
    ORDER = "ORDER"
    LISTING = "LISTING"
    PAYMENT = "PAYMENT"
    DELIVERY = "DELIVERY"
    REVIEW = "REVIEW"
    AI = "AI"


def enum_type(enum_class: type[Enum], name: str) -> SqlEnum:
    return SqlEnum(enum_class, name=name, native_enum=True)


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False, index=True
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )


class User(TimestampMixin, Base):
    __tablename__ = "users"
    __table_args__ = (Index("ix_users_role", "role"),)

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    email: Mapped[str] = mapped_column(String(320), unique=True, index=True, nullable=False)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[UserRole] = mapped_column(enum_type(UserRole, "user_role"), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    farmer: Mapped["Farmer | None"] = relationship(back_populates="user", uselist=False)
    consumer: Mapped["Consumer | None"] = relationship(back_populates="user", uselist=False)
    admin: Mapped["Admin | None"] = relationship(back_populates="user", uselist=False)
    notifications: Mapped[list["Notification"]] = relationship(back_populates="user")
    hub_staff_assignments: Mapped[list["HubStaff"]] = relationship(back_populates="user")
    rider: Mapped["Rider | None"] = relationship(back_populates="user", uselist=False)


class Farmer(TimestampMixin, Base):
    __tablename__ = "farmers"

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    user_id: Mapped[UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), unique=True)
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    phone: Mapped[str | None] = mapped_column(String(32))
    address: Mapped[str | None] = mapped_column(Text)
    state: Mapped[str | None] = mapped_column(String(80))
    village: Mapped[str | None] = mapped_column(String(160))
    post_office: Mapped[str | None] = mapped_column(String(160))
    city: Mapped[str | None] = mapped_column(String(160))
    district: Mapped[str | None] = mapped_column(String(160))
    pin_code: Mapped[str | None] = mapped_column(String(6))
    address_line: Mapped[str | None] = mapped_column(Text)
    location: Mapped[Any | None] = mapped_column(Geography(geometry_type="POINT", srid=4326))

    user: Mapped[User] = relationship(back_populates="farmer")
    listings: Mapped[list["CropListing"]] = relationship(back_populates="farmer")


class Consumer(TimestampMixin, Base):
    __tablename__ = "consumers"

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    user_id: Mapped[UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), unique=True)
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    phone: Mapped[str | None] = mapped_column(String(32))
    address: Mapped[str | None] = mapped_column(Text)
    state: Mapped[str | None] = mapped_column(String(80))
    village: Mapped[str | None] = mapped_column(String(160))
    post_office: Mapped[str | None] = mapped_column(String(160))
    city: Mapped[str | None] = mapped_column(String(160))
    district: Mapped[str | None] = mapped_column(String(160))
    pin_code: Mapped[str | None] = mapped_column(String(6))
    address_line: Mapped[str | None] = mapped_column(Text)

    user: Mapped[User] = relationship(back_populates="consumer")
    cart: Mapped["Cart | None"] = relationship(back_populates="consumer", uselist=False)
    orders: Mapped[list["Order"]] = relationship(back_populates="consumer")
    reviews: Mapped[list["Review"]] = relationship(back_populates="consumer")
    payment_methods: Mapped[list["PaymentMethod"]] = relationship(back_populates="consumer")


class PaymentMethod(TimestampMixin, Base):
    __tablename__ = "payment_methods"

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    consumer_id: Mapped[UUID] = mapped_column(ForeignKey("consumers.id", ondelete="CASCADE"), index=True)
    method_type: Mapped[str] = mapped_column(String(20), nullable=False)
    provider: Mapped[str] = mapped_column(String(80), nullable=False)
    masked_value: Mapped[str] = mapped_column(String(80), nullable=False)
    last4: Mapped[str | None] = mapped_column(String(4))
    provider_reference: Mapped[str | None] = mapped_column(String(255))

    consumer: Mapped[Consumer] = relationship(back_populates="payment_methods")


class Admin(TimestampMixin, Base):
    __tablename__ = "admins"

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    user_id: Mapped[UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), unique=True)
    name: Mapped[str] = mapped_column(String(160), nullable=False)

    user: Mapped[User] = relationship(back_populates="admin")


class Crop(TimestampMixin, Base):
    __tablename__ = "crops"
    __table_args__ = (Index("ix_crops_name", "name"),)

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    name: Mapped[str] = mapped_column(String(120), unique=True, nullable=False)
    category: Mapped[str | None] = mapped_column(String(120))
    description: Mapped[str | None] = mapped_column(Text)

    listings: Mapped[list["CropListing"]] = relationship(back_populates="crop")


class CropListing(TimestampMixin, Base):
    __tablename__ = "crop_listings"
    __table_args__ = (
        Index("ix_crop_listings_status", "availability_status"),
        CheckConstraint("quantity > 0", name="ck_crop_listings_quantity_positive"),
        CheckConstraint("asking_price >= 0", name="ck_crop_listings_price_nonnegative"),
    )

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    crop_id: Mapped[UUID] = mapped_column(ForeignKey("crops.id", ondelete="RESTRICT"), index=True)
    farmer_id: Mapped[UUID] = mapped_column(ForeignKey("farmers.id", ondelete="RESTRICT"), index=True)
    quantity: Mapped[Decimal] = mapped_column(Numeric(12, 3), nullable=False)
    unit: Mapped[str] = mapped_column(String(32), nullable=False)
    asking_price: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    minimum_order_quantity: Mapped[Decimal] = mapped_column(Numeric(12, 3), nullable=False, default=1)
    location: Mapped[Any | None] = mapped_column(Geography(geometry_type="POINT", srid=4326))
    description: Mapped[str | None] = mapped_column(Text)
    harvest_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    availability_status: Mapped[AvailabilityStatus] = mapped_column(
        enum_type(AvailabilityStatus, "availability_status"), default=AvailabilityStatus.AVAILABLE, nullable=False
    )
    quality_information: Mapped[str | None] = mapped_column(Text)

    crop: Mapped[Crop] = relationship(back_populates="listings")
    farmer: Mapped[Farmer] = relationship(back_populates="listings")
    images: Mapped[list["CropImage"]] = relationship(back_populates="listing", cascade="all, delete-orphan")
    cart_items: Mapped[list["CartItem"]] = relationship(back_populates="listing")
    order_items: Mapped[list["OrderItem"]] = relationship(back_populates="listing")
    reviews: Mapped[list["Review"]] = relationship(back_populates="listing")
    quality_predictions: Mapped[list["AIQualityPrediction"]] = relationship(back_populates="listing")
    price_predictions: Mapped[list["AIPricePrediction"]] = relationship(back_populates="listing")


class CropImage(TimestampMixin, Base):
    __tablename__ = "crop_images"

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    listing_id: Mapped[UUID] = mapped_column(ForeignKey("crop_listings.id", ondelete="CASCADE"), index=True)
    storage_url: Mapped[str] = mapped_column(String(1000), nullable=False)
    content_type: Mapped[str | None] = mapped_column(String(120))

    listing: Mapped[CropListing] = relationship(back_populates="images")


class Cart(TimestampMixin, Base):
    __tablename__ = "carts"

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    consumer_id: Mapped[UUID] = mapped_column(ForeignKey("consumers.id", ondelete="CASCADE"), unique=True)

    consumer: Mapped[Consumer] = relationship(back_populates="cart")
    items: Mapped[list["CartItem"]] = relationship(back_populates="cart", cascade="all, delete-orphan")


class CartItem(TimestampMixin, Base):
    __tablename__ = "cart_items"
    __table_args__ = (CheckConstraint("quantity > 0", name="ck_cart_items_quantity_positive"),)

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    cart_id: Mapped[UUID] = mapped_column(ForeignKey("carts.id", ondelete="CASCADE"), index=True)
    listing_id: Mapped[UUID] = mapped_column(ForeignKey("crop_listings.id", ondelete="RESTRICT"), index=True)
    quantity: Mapped[Decimal] = mapped_column(Numeric(12, 3), nullable=False)

    cart: Mapped[Cart] = relationship(back_populates="items")
    listing: Mapped[CropListing] = relationship(back_populates="cart_items")


class Order(TimestampMixin, Base):
    __tablename__ = "orders"
    __table_args__ = (Index("ix_orders_status", "status"),)

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    consumer_id: Mapped[UUID] = mapped_column(ForeignKey("consumers.id", ondelete="RESTRICT"), index=True)
    hub_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("hubs.id", ondelete="SET NULL"), index=True
    )
    delivery_slot_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("delivery_slots.id", ondelete="SET NULL"), index=True
    )
    status: Mapped[OrderStatus] = mapped_column(enum_type(OrderStatus, "order_status"), default=OrderStatus.PENDING, nullable=False)
    subtotal: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, default=0)
    delivery_fee: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, default=0)
    platform_fee: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, default=0)
    total_amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, default=0)
    delivery_address: Mapped[str | None] = mapped_column(Text)
    delivery_latitude: Mapped[Decimal | None] = mapped_column(Numeric(9, 6))
    delivery_longitude: Mapped[Decimal | None] = mapped_column(Numeric(9, 6))
    promised_window_start: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    promised_window_end: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    stock_restored: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    consumer: Mapped[Consumer] = relationship(back_populates="orders")
    hub: Mapped["Hub | None"] = relationship(back_populates="orders")
    items: Mapped[list["OrderItem"]] = relationship(back_populates="order", cascade="all, delete-orphan")
    payment: Mapped["Payment | None"] = relationship(back_populates="order", uselist=False)
    delivery: Mapped["Delivery | None"] = relationship(back_populates="order", uselist=False)
    shipment: Mapped["Shipment | None"] = relationship(back_populates="order", uselist=False)
    delivery_slot: Mapped["DeliverySlot | None"] = relationship()
    reviews: Mapped[list["Review"]] = relationship(back_populates="order")


class OrderItem(TimestampMixin, Base):
    __tablename__ = "order_items"
    __table_args__ = (CheckConstraint("quantity > 0", name="ck_order_items_quantity_positive"),)

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    order_id: Mapped[UUID] = mapped_column(ForeignKey("orders.id", ondelete="CASCADE"), index=True)
    listing_id: Mapped[UUID] = mapped_column(ForeignKey("crop_listings.id", ondelete="RESTRICT"), index=True)
    quantity: Mapped[Decimal] = mapped_column(Numeric(12, 3), nullable=False)
    unit_price: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    subtotal: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)

    order: Mapped[Order] = relationship(back_populates="items")
    listing: Mapped[CropListing] = relationship(back_populates="order_items")


class Payment(TimestampMixin, Base):
    __tablename__ = "payments"

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    order_id: Mapped[UUID] = mapped_column(ForeignKey("orders.id", ondelete="CASCADE"), unique=True)
    status: Mapped[PaymentStatus] = mapped_column(enum_type(PaymentStatus, "payment_status"), default=PaymentStatus.PENDING, nullable=False)
    provider_reference: Mapped[str | None] = mapped_column(String(255), unique=True)
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    payment_method: Mapped[str] = mapped_column(String(40), nullable=False, default="TEST_SANDBOX")
    is_test: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    order: Mapped[Order] = relationship(back_populates="payment")


class Delivery(TimestampMixin, Base):
    __tablename__ = "deliveries"

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    order_id: Mapped[UUID] = mapped_column(ForeignKey("orders.id", ondelete="CASCADE"), unique=True)
    status: Mapped[DeliveryStatus] = mapped_column(enum_type(DeliveryStatus, "delivery_status"), default=DeliveryStatus.PENDING, nullable=False)
    fulfillment_method: Mapped[FulfillmentMethod] = mapped_column(enum_type(FulfillmentMethod, "fulfillment_method"), nullable=False, default=FulfillmentMethod.DELIVERY)
    address: Mapped[str | None] = mapped_column(Text)
    recipient_name: Mapped[str | None] = mapped_column(String(160))
    recipient_phone: Mapped[str | None] = mapped_column(String(32))
    village: Mapped[str | None] = mapped_column(String(160))
    post_office: Mapped[str | None] = mapped_column(String(160))
    city: Mapped[str | None] = mapped_column(String(160))
    district: Mapped[str | None] = mapped_column(String(160))
    state: Mapped[str | None] = mapped_column(String(80))
    pin_code: Mapped[str | None] = mapped_column(String(6))
    address_line: Mapped[str | None] = mapped_column(Text)
    latitude: Mapped[Any | None] = mapped_column(Numeric(9, 6))
    longitude: Mapped[Any | None] = mapped_column(Numeric(9, 6))
    pickup_location: Mapped[str | None] = mapped_column(Text)
    scheduled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    tracking_reference: Mapped[str | None] = mapped_column(String(255), unique=True)

    order: Mapped[Order] = relationship(back_populates="delivery")


class Review(TimestampMixin, Base):
    __tablename__ = "reviews"
    __table_args__ = (
        CheckConstraint("rating BETWEEN 1 AND 5", name="ck_reviews_rating_range"),
        UniqueConstraint("consumer_id", "order_id", "listing_id", name="uq_reviews_consumer_order_listing"),
    )

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    consumer_id: Mapped[UUID] = mapped_column(ForeignKey("consumers.id", ondelete="CASCADE"), index=True)
    order_id: Mapped[UUID] = mapped_column(ForeignKey("orders.id", ondelete="CASCADE"), index=True, nullable=False)
    listing_id: Mapped[UUID] = mapped_column(ForeignKey("crop_listings.id", ondelete="CASCADE"), index=True)
    rating: Mapped[int] = mapped_column(Integer, nullable=False)
    comment: Mapped[str] = mapped_column(Text, nullable=False)

    consumer: Mapped[Consumer] = relationship(back_populates="reviews")
    listing: Mapped[CropListing] = relationship(back_populates="reviews")
    order: Mapped[Order] = relationship(back_populates="reviews")


class Notification(TimestampMixin, Base):
    __tablename__ = "notifications"

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    user_id: Mapped[UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    notification_type: Mapped[NotificationType] = mapped_column(enum_type(NotificationType, "notification_type"), nullable=False)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    related_entity_type: Mapped[str | None] = mapped_column(String(80), nullable=True)
    related_entity_id: Mapped[UUID | None] = mapped_column(Uuid(as_uuid=True), nullable=True, index=True)
    is_read: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    user: Mapped[User] = relationship(back_populates="notifications")


class AIQualityPrediction(TimestampMixin, Base):
    __tablename__ = "ai_quality_predictions"

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    listing_id: Mapped[UUID | None] = mapped_column(ForeignKey("crop_listings.id", ondelete="CASCADE"), index=True)
    image_id: Mapped[UUID | None] = mapped_column(ForeignKey("crop_images.id", ondelete="SET NULL"), index=True)
    model_name: Mapped[str] = mapped_column(String(160), nullable=False)
    model_version: Mapped[str | None] = mapped_column(String(80))
    quality_label: Mapped[str | None] = mapped_column(String(80))
    prediction_status: Mapped[str] = mapped_column(String(40), nullable=False, default="MODEL_UNAVAILABLE")
    confidence: Mapped[Decimal | None] = mapped_column(Numeric(6, 5))
    result_metadata: Mapped[dict[str, Any] | None] = mapped_column(JSON)

    listing: Mapped[CropListing] = relationship(back_populates="quality_predictions")
    image: Mapped[CropImage | None] = relationship()


class AIPricePrediction(TimestampMixin, Base):
    __tablename__ = "ai_price_predictions"

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    listing_id: Mapped[UUID] = mapped_column(ForeignKey("crop_listings.id", ondelete="CASCADE"), index=True)
    model_name: Mapped[str] = mapped_column(String(160), nullable=False)
    model_version: Mapped[str | None] = mapped_column(String(80))
    predicted_price: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))
    currency: Mapped[str] = mapped_column(String(3), nullable=False, default="INR")
    unit: Mapped[str | None] = mapped_column(String(32))
    prediction_status: Mapped[str] = mapped_column(String(40), nullable=False, default="MODEL_UNAVAILABLE")
    input_features: Mapped[dict[str, Any] | None] = mapped_column(JSON)
    confidence: Mapped[Decimal | None] = mapped_column(Numeric(6, 5))
    result_metadata: Mapped[dict[str, Any] | None] = mapped_column(JSON)

    listing: Mapped[CropListing] = relationship(back_populates="price_predictions")


class Hub(TimestampMixin, Base):
    __tablename__ = "hubs"
    __table_args__ = (
        Index("ix_hubs_status_pincode", "status", "pincode"),
        CheckConstraint("service_radius_km > 0", name="ck_hubs_service_radius_positive"),
    )

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    address: Mapped[str] = mapped_column(Text, nullable=False)
    location: Mapped[Any] = mapped_column(Geography(geometry_type="POINT", srid=4326), nullable=False)
    pincode: Mapped[str] = mapped_column(String(6), nullable=False, index=True)
    service_radius_km: Mapped[Decimal] = mapped_column(
        Numeric(8, 2),
        nullable=False,
        default=lambda: get_settings().hub_service_radius_km,
        server_default="8",
    )
    status: Mapped[HubStatus] = mapped_column(
        enum_type(HubStatus, "hub_status"), default=HubStatus.ACTIVE, nullable=False
    )

    staff_assignments: Mapped[list["HubStaff"]] = relationship(back_populates="hub")
    stock: Mapped[list["HubStock"]] = relationship(back_populates="hub")
    orders: Mapped[list[Order]] = relationship(back_populates="hub")
    shipments: Mapped[list["Shipment"]] = relationship(back_populates="hub")


class HubStaff(Base):
    __tablename__ = "hub_staff"

    user_id: Mapped[UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    hub_id: Mapped[UUID] = mapped_column(
        ForeignKey("hubs.id", ondelete="CASCADE"), primary_key=True
    )

    user: Mapped[User] = relationship(back_populates="hub_staff_assignments")
    hub: Mapped[Hub] = relationship(back_populates="staff_assignments")


class HubStock(TimestampMixin, Base):
    __tablename__ = "hub_stock"
    __table_args__ = (
        UniqueConstraint("hub_id", "listing_id", name="uq_hub_stock_hub_listing"),
        CheckConstraint("available_quantity >= 0", name="ck_hub_stock_quantity_nonnegative"),
        Index("ix_hub_stock_listing_id", "listing_id"),
    )

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    hub_id: Mapped[UUID] = mapped_column(ForeignKey("hubs.id", ondelete="CASCADE"))
    listing_id: Mapped[UUID] = mapped_column(ForeignKey("crop_listings.id", ondelete="RESTRICT"))
    available_quantity: Mapped[Decimal] = mapped_column(Numeric(12, 3), nullable=False)

    hub: Mapped[Hub] = relationship(back_populates="stock")


class HubStockDelivery(TimestampMixin, Base):
    __tablename__ = "hub_stock_deliveries"
    __table_args__ = (
        CheckConstraint("quantity > 0", name="ck_hub_stock_deliveries_quantity_positive"),
        CheckConstraint(
            "status IN ('PENDING', 'RECEIVED')",
            name="ck_hub_stock_deliveries_status",
        ),
        Index("ix_hub_stock_deliveries_hub_status", "hub_id", "status"),
        Index("ix_hub_stock_deliveries_farmer_created", "farmer_user_id", "created_at"),
    )

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    hub_id: Mapped[UUID] = mapped_column(ForeignKey("hubs.id", ondelete="CASCADE"))
    listing_id: Mapped[UUID] = mapped_column(
        ForeignKey("crop_listings.id", ondelete="RESTRICT")
    )
    farmer_user_id: Mapped[UUID] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT")
    )
    quantity: Mapped[Decimal] = mapped_column(Numeric(12, 3), nullable=False)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="PENDING")
    received_by_user_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL")
    )
    received_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class Rider(TimestampMixin, Base):
    __tablename__ = "riders"

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    user_id: Mapped[UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), unique=True, nullable=False
    )
    display_name: Mapped[str | None] = mapped_column(String(160))
    vehicle_type: Mapped[str | None] = mapped_column(String(40))
    availability: Mapped[RiderAvailability] = mapped_column(
        enum_type(RiderAvailability, "rider_availability"),
        default=RiderAvailability.OFFLINE,
        nullable=False,
    )
    approval_status: Mapped[RiderApprovalStatus] = mapped_column(
        enum_type(RiderApprovalStatus, "rider_approval_status"),
        default=RiderApprovalStatus.PENDING_APPROVAL,
        nullable=False,
    )
    last_seen_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    user: Mapped[User] = relationship(back_populates="rider")
    locations: Mapped[list["RiderLocation"]] = relationship(back_populates="rider")
    shipments: Mapped[list["Shipment"]] = relationship(back_populates="rider")


class RiderLocation(Base):
    __tablename__ = "rider_locations"
    __table_args__ = (
        CheckConstraint("accuracy IS NULL OR accuracy >= 0", name="ck_rider_locations_accuracy_nonnegative"),
        Index("ix_rider_locations_rider_recorded", "rider_id", "recorded_at"),
    )

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    rider_id: Mapped[UUID] = mapped_column(ForeignKey("riders.id", ondelete="CASCADE"))
    location: Mapped[Any] = mapped_column(Geography(geometry_type="POINT", srid=4326), nullable=False)
    accuracy: Mapped[Decimal | None] = mapped_column(Numeric(8, 2))
    recorded_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    rider: Mapped[Rider] = relationship(back_populates="locations")


class RiderOffer(TimestampMixin, Base):
    __tablename__ = "rider_offers"
    __table_args__ = (
        CheckConstraint(
            "status IN ('OFFERED', 'ACCEPTED', 'DECLINED', 'EXPIRED', 'SUPERSEDED')",
            name="ck_rider_offers_status",
        ),
        CheckConstraint("expires_at > offered_at", name="ck_rider_offers_expiry_after_offer"),
        Index("ix_rider_offers_rider_status_expiry", "rider_id", "status", "expires_at"),
        Index("ix_rider_offers_shipment_status", "shipment_id", "status"),
        Index("ix_rider_offers_status_expiry", "status", "expires_at"),
        Index(
            "uq_rider_offers_one_active_per_shipment",
            "shipment_id",
            unique=True,
            postgresql_where=text("status IN ('OFFERED', 'ACCEPTED')"),
        ),
    )

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    shipment_id: Mapped[UUID] = mapped_column(
        ForeignKey("shipments.id", ondelete="CASCADE"), nullable=False
    )
    rider_id: Mapped[UUID] = mapped_column(
        ForeignKey("riders.id", ondelete="CASCADE"), nullable=False
    )
    status: Mapped[str] = mapped_column(String(12), nullable=False, default="OFFERED")
    offered_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    responded_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    rider: Mapped[Rider] = relationship()
    shipment: Mapped["Shipment"] = relationship()


class DeliverySlot(TimestampMixin, Base):
    __tablename__ = "delivery_slots"
    __table_args__ = (
        CheckConstraint("capacity > 0", name="ck_delivery_slots_capacity_positive"),
        CheckConstraint("booked_count >= 0", name="ck_delivery_slots_booked_nonnegative"),
        CheckConstraint("booked_count <= capacity", name="ck_delivery_slots_booked_within_capacity"),
        CheckConstraint("ends_at > starts_at", name="ck_delivery_slots_end_after_start"),
        Index("ix_delivery_slots_hub_starts", "hub_id", "starts_at"),
    )

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    hub_id: Mapped[UUID] = mapped_column(ForeignKey("hubs.id", ondelete="CASCADE"))
    starts_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    ends_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    capacity: Mapped[int] = mapped_column(Integer, nullable=False)
    booked_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")


class Shipment(TimestampMixin, Base):
    __tablename__ = "shipments"
    __table_args__ = (
        UniqueConstraint("order_id", name="uq_shipments_order_id"),
        CheckConstraint("otp_attempts >= 0", name="ck_shipments_otp_attempts_nonnegative"),
        CheckConstraint(
            "promised_window_end > promised_window_start",
            name="ck_shipments_promised_window_valid",
        ),
        Index("ix_shipments_hub_status", "hub_id", "status"),
        Index("ix_shipments_rider_status", "rider_id", "status"),
    )

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    order_id: Mapped[UUID] = mapped_column(ForeignKey("orders.id", ondelete="CASCADE"), nullable=False)
    hub_id: Mapped[UUID] = mapped_column(ForeignKey("hubs.id", ondelete="RESTRICT"), nullable=False)
    rider_id: Mapped[UUID | None] = mapped_column(ForeignKey("riders.id", ondelete="SET NULL"))
    status: Mapped[ShipmentStatus] = mapped_column(
        enum_type(ShipmentStatus, "shipment_status"),
        default=ShipmentStatus.PACKING,
        nullable=False,
    )
    promised_window_start: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    promised_window_end: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    pickup_address_snapshot: Mapped[str] = mapped_column(Text, nullable=False)
    dropoff_address_snapshot: Mapped[str] = mapped_column(Text, nullable=False)
    ready_for_pickup_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    rider_assigned_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    picked_up_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    out_for_delivery_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    arrived_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    delivered_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    failed_delivery_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    returned_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    cancelled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    delivery_otp_hash: Mapped[str | None] = mapped_column(String(255))
    otp_expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    otp_attempts: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    otp_consumed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    order: Mapped[Order] = relationship(back_populates="shipment")
    hub: Mapped[Hub] = relationship(back_populates="shipments")
    rider: Mapped[Rider | None] = relationship(back_populates="shipments")


class StockReservation(TimestampMixin, Base):
    __tablename__ = "stock_reservations"
    __table_args__ = (
        UniqueConstraint("order_id", "hub_stock_id", name="uq_stock_reservations_order_stock"),
        CheckConstraint("quantity > 0", name="ck_stock_reservations_quantity_positive"),
        Index("ix_stock_reservations_status_expires", "status", "expires_at"),
    )

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    order_id: Mapped[UUID] = mapped_column(ForeignKey("orders.id", ondelete="CASCADE"))
    hub_stock_id: Mapped[UUID] = mapped_column(ForeignKey("hub_stock.id", ondelete="RESTRICT"))
    quantity: Mapped[Decimal] = mapped_column(Numeric(12, 3), nullable=False)
    status: Mapped[ReservationStatus] = mapped_column(
        enum_type(ReservationStatus, "reservation_status"),
        default=ReservationStatus.HOLD,
        nullable=False,
    )
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class OrderEvent(Base):
    __tablename__ = "order_events"
    __table_args__ = (
        Index("ix_order_events_order_created", "order_id", "created_at"),
        Index("ix_order_events_shipment_created", "shipment_id", "created_at"),
    )

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    order_id: Mapped[UUID] = mapped_column(ForeignKey("orders.id", ondelete="CASCADE"), nullable=False)
    shipment_id: Mapped[UUID | None] = mapped_column(ForeignKey("shipments.id", ondelete="SET NULL"))
    actor_user_id: Mapped[UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    actor_role: Mapped[UserRole | None] = mapped_column(enum_type(UserRole, "user_role"))
    from_status: Mapped[str | None] = mapped_column(String(40))
    to_status: Mapped[str] = mapped_column(String(40), nullable=False)
    note: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class AdminAuditEvent(Base):
    __tablename__ = "admin_audit_events"
    __table_args__ = (
        Index("ix_admin_audit_entity_created", "entity_type", "entity_id", "created_at"),
        Index("ix_admin_audit_actor_created", "actor_user_id", "created_at"),
    )

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    actor_user_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL")
    )
    action: Mapped[str] = mapped_column(String(80), nullable=False)
    entity_type: Mapped[str] = mapped_column(String(40), nullable=False)
    entity_id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), nullable=False)
    from_value: Mapped[str | None] = mapped_column(Text)
    to_value: Mapped[str | None] = mapped_column(Text)
    reason: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
