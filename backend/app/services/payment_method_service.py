from uuid import UUID

from backend.app.models import PaymentMethod
from backend.app.repositories.payment_method_repository import PaymentMethodRepository
from backend.app.schemas.consumer import PaymentMethodCreate, PaymentMethodResponse


class PaymentMethodService:
    def __init__(self, repository: PaymentMethodRepository) -> None:
        self.repository = repository

    @staticmethod
    def _mask_card(value: str) -> str:
        digits = "".join(ch for ch in value if ch.isdigit())
        if len(digits) < 4:
            return "••••"
        last4 = digits[-4:]
        return f"•••• •••• •••• {last4}"

    @staticmethod
    def _mask_upi(value: str) -> str:
        return value.strip()

    @staticmethod
    def _normalize_method_type(value: str) -> str:
        normalized = (value or "").upper()
        if normalized not in {"CARD", "UPI"}:
            raise ValueError("Payment method type must be CARD or UPI")
        return normalized

    async def list_for_consumer(self, user_id: UUID) -> list[PaymentMethodResponse]:
        consumer = await self.repository.get_consumer(user_id)
        if consumer is None:
            raise LookupError("Consumer profile not found")
        return [self._response(item) for item in await self.repository.list_for_consumer(consumer.id)]

    async def add_for_consumer(self, user_id: UUID, payload: PaymentMethodCreate) -> PaymentMethodResponse:
        consumer = await self.repository.get_consumer(user_id)
        if consumer is None:
            raise LookupError("Consumer profile not found")

        method_type = self._normalize_method_type(payload.method_type)
        raw_value = payload.value.strip()

        if method_type == "CARD":
            digits = "".join(ch for ch in raw_value if ch.isdigit())
            if len(digits) < 4:
                raise ValueError("Card number is invalid")
            masked_value = self._mask_card(raw_value)
            last4 = digits[-4:]
            provider_reference = f"card-{last4}"
        else:
            if "@" not in raw_value:
                raise ValueError("UPI handle must include '@'")
            masked_value = self._mask_upi(raw_value)
            last4 = None
            provider_reference = f"upi-{raw_value.lower()}"

        record = PaymentMethod(
            consumer_id=consumer.id,
            method_type=method_type,
            provider=payload.provider.strip(),
            masked_value=masked_value,
            last4=last4,
            provider_reference=provider_reference,
        )
        saved = await self.repository.create(record)
        return self._response(saved)

    async def remove_for_consumer(self, user_id: UUID, payment_method_id: UUID) -> PaymentMethodResponse:
        consumer = await self.repository.get_consumer(user_id)
        if consumer is None:
            raise LookupError("Consumer profile not found")
        payment_method = await self.repository.get_for_consumer(consumer.id, payment_method_id)
        if payment_method is None:
            raise LookupError("Payment method not found")
        deleted = await self.repository.delete(payment_method)
        return self._response(deleted)

    @staticmethod
    def _response(record: PaymentMethod) -> PaymentMethodResponse:
        return PaymentMethodResponse(
            id=record.id,
            consumer_id=record.consumer_id,
            method_type=record.method_type,
            provider=record.provider,
            masked_value=record.masked_value,
            last4=record.last4,
            provider_reference=record.provider_reference,
            created_at=record.created_at,
            updated_at=record.updated_at,
        )
