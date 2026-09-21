from datetime import datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, Field


class TestPaymentRequest(BaseModel):
    outcome: str = Field(pattern="^(success|failed|cancelled)$")


class PaymentResponse(BaseModel):
    id: UUID
    order_id: UUID
    provider_reference: str | None
    amount: Decimal
    status: str
    payment_method: str
    is_test: bool
    created_at: datetime
    updated_at: datetime
