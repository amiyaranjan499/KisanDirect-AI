from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.models import Consumer, PaymentMethod


class PaymentMethodRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def get_consumer(self, user_id: UUID) -> Consumer | None:
        result = await self.session.execute(select(Consumer).where(Consumer.user_id == user_id))
        return result.scalar_one_or_none()

    async def list_for_consumer(self, consumer_id: UUID) -> list[PaymentMethod]:
        result = await self.session.execute(select(PaymentMethod).where(PaymentMethod.consumer_id == consumer_id).order_by(PaymentMethod.created_at.desc()))
        return list(result.scalars().all())

    async def get_for_consumer(self, consumer_id: UUID, payment_method_id: UUID) -> PaymentMethod | None:
        result = await self.session.execute(
            select(PaymentMethod).where(PaymentMethod.consumer_id == consumer_id, PaymentMethod.id == payment_method_id)
        )
        return result.scalar_one_or_none()

    async def create(self, payment_method: PaymentMethod) -> PaymentMethod:
        self.session.add(payment_method)
        await self.session.commit()
        await self.session.refresh(payment_method)
        return payment_method

    async def delete(self, payment_method: PaymentMethod) -> PaymentMethod:
        await self.session.delete(payment_method)
        await self.session.commit()
        return payment_method
