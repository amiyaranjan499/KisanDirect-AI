from datetime import datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, Field

from backend.app.schemas.payments import PaymentResponse


class CartItemCreate(BaseModel):
    listing_id: UUID
    quantity: Decimal = Field(gt=0, max_digits=12, decimal_places=3)


class CartItemUpdate(BaseModel):
    quantity: Decimal = Field(gt=0, max_digits=12, decimal_places=3)


class CartItemResponse(BaseModel):
    id: UUID
    listing_id: UUID
    crop_name: str
    farmer_name: str
    quantity: Decimal
    available_quantity: Decimal
    minimum_order_quantity: Decimal
    unit: str
    unit_price: Decimal
    subtotal: Decimal


class CartResponse(BaseModel):
    id: UUID
    items: list[CartItemResponse]
    subtotal: Decimal
    total_quantity: Decimal


class OrderItemResponse(BaseModel):
    id: UUID
    listing_id: UUID
    crop_name: str
    farmer_name: str
    quantity: Decimal
    unit: str
    unit_price: Decimal
    subtotal: Decimal


class OrderResponse(BaseModel):
    id: UUID
    consumer_id: UUID
    status: str
    total_amount: Decimal
    created_at: datetime
    updated_at: datetime
    items: list[OrderItemResponse]
    payment: "PaymentResponse | None" = None


class OrderPage(BaseModel):
    items: list[OrderResponse]
    page: int
    page_size: int
    total: int
    pages: int


class OrderStatusUpdate(BaseModel):
    status: str = Field(pattern="^(CONFIRMED|CANCELLED|COMPLETED)$")
