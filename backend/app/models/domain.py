from datetime import datetime
from decimal import Decimal
from enum import Enum
from typing import Any
from uuid import UUID, uuid4

from geoalchemy2 import Geography
from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    Enum as SqlEnum,
    ForeignKey,
    Index,
    Integer,
    JSON,
    Numeric,
    String,
    Text,
    Uuid,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.app.models.base import Base


class UserRole(str, Enum):
    FARMER = "FARMER"
    CONSUMER = "CONSUMER"
    ADMIN = "ADMIN"


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
    status: Mapped[OrderStatus] = mapped_column(enum_type(OrderStatus, "order_status"), default=OrderStatus.PENDING, nullable=False)
    total_amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, default=0)
    stock_restored: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    consumer: Mapped[Consumer] = relationship(back_populates="orders")
    items: Mapped[list["OrderItem"]] = relationship(back_populates="order", cascade="all, delete-orphan")
    payment: Mapped["Payment | None"] = relationship(back_populates="order", uselist=False)
    delivery: Mapped["Delivery | None"] = relationship(back_populates="order", uselist=False)
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
