from datetime import datetime
from uuid import UUID

from geoalchemy2 import Geography
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased, selectinload

from backend.app.models import (
    Hub,
    Order,
    Rider,
    RiderLocation,
    RiderOffer,
    Shipment,
    ShipmentStatus,
    User,
    UserRole,
)


class RiderRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def get_actor_rider(
        self, user_id: UUID, *, for_update: bool = False
    ) -> Rider | None:
        statement = (
            select(Rider)
            .join(User, User.id == Rider.user_id)
            .where(
                Rider.user_id == user_id,
                User.role == UserRole.RIDER,
                User.is_active.is_(True),
            )
        )
        if for_update:
            statement = statement.with_for_update(of=Rider)
        return await self.session.scalar(statement)

    async def get_offer(
        self, offer_id: UUID, *, for_update: bool = False
    ) -> RiderOffer | None:
        statement = select(RiderOffer).where(RiderOffer.id == offer_id)
        if for_update:
            statement = statement.with_for_update().execution_options(
                populate_existing=True
            )
        return await self.session.scalar(statement)

    async def lock_shipment(self, shipment_id: UUID) -> Shipment | None:
        return await self.session.scalar(
            select(Shipment)
            .where(Shipment.id == shipment_id)
            .with_for_update()
        )

    async def get_active_shipment(self, rider_id: UUID) -> Shipment | None:
        result = await self.session.execute(
            select(Shipment)
            .where(
                Shipment.rider_id == rider_id,
                Shipment.status.in_(
                    [
                        ShipmentStatus.RIDER_ASSIGNED,
                        ShipmentStatus.PICKED_UP,
                        ShipmentStatus.OUT_FOR_DELIVERY,
                        ShipmentStatus.ARRIVED,
                    ]
                ),
            )
            .options(
                selectinload(Shipment.hub),
                selectinload(Shipment.order).selectinload(Order.payment),
            )
            .order_by(Shipment.rider_assigned_at.desc(), Shipment.id)
            .limit(1)
        )
        return result.scalar_one_or_none()

    async def shipment_for_actor(
        self, shipment_id: UUID, rider_id: UUID
    ) -> Shipment | None:
        return await self.session.scalar(
            select(Shipment)
            .where(Shipment.id == shipment_id, Shipment.rider_id == rider_id)
            .options(
                selectinload(Shipment.hub),
                selectinload(Shipment.order).selectinload(Order.payment),
            )
        )

    async def completed_shipments(
        self, rider_id: UUID
    ) -> list[Shipment]:
        result = await self.session.execute(
            select(Shipment)
            .where(
                Shipment.rider_id == rider_id,
                Shipment.status == ShipmentStatus.DELIVERED,
                Shipment.delivered_at.is_not(None),
            )
            .options(selectinload(Shipment.hub))
            .order_by(Shipment.delivered_at.desc(), Shipment.id)
        )
        return list(result.scalars().all())

    async def nearest_eligible_rider(
        self, shipment_id: UUID, hub_id: UUID
    ) -> Rider | None:
        latest_rider_location = aliased(RiderLocation)
        latest_location = (
            select(latest_rider_location.location)
            .where(latest_rider_location.rider_id == Rider.id)
            .order_by(
                latest_rider_location.recorded_at.desc(),
                latest_rider_location.id.desc(),
            )
            .limit(1)
            .correlate(Rider)
            .scalar_subquery()
        )
        has_location = (
            select(RiderLocation.id)
            .where(RiderLocation.rider_id == Rider.id)
            .exists()
        )
        result = await self.session.execute(
            select(Rider)
            .join(User, User.id == Rider.user_id)
            .join(Shipment, Shipment.id == shipment_id)
            .join(Hub, Hub.id == Shipment.hub_id)
            .where(
                Hub.id == hub_id,
                Rider.approval_status == "APPROVED",
                Rider.availability == "AVAILABLE",
                User.is_active.is_(True),
                has_location,
                ~select(RiderOffer.id)
                .where(
                    RiderOffer.shipment_id == shipment_id,
                    RiderOffer.rider_id == Rider.id,
                )
                .exists(),
            )
            .order_by(func.ST_Distance(Hub.location, latest_location), Rider.id)
            .limit(1)
        )
        return result.scalar_one_or_none()

    async def expired_offer_ids(self, now: datetime) -> list[tuple[UUID, UUID]]:
        result = await self.session.execute(
            select(RiderOffer.id, RiderOffer.shipment_id)
            .where(
                RiderOffer.status == "OFFERED",
                RiderOffer.expires_at <= now,
            )
            .order_by(RiderOffer.expires_at, RiderOffer.id)
        )
        return list(result.all())

    async def pending_ready_shipments(self) -> list[UUID]:
        result = await self.session.execute(
            select(Shipment.id)
            .where(Shipment.status == ShipmentStatus.READY_FOR_PICKUP)
            .order_by(Shipment.ready_for_pickup_at, Shipment.id)
        )
        return list(result.scalars().all())

    async def active_offers_for_rider(
        self, rider_id: UUID, now: datetime
    ) -> list[RiderOffer]:
        result = await self.session.execute(
            select(RiderOffer)
            .where(
                RiderOffer.rider_id == rider_id,
                RiderOffer.status == "OFFERED",
                RiderOffer.expires_at > now,
            )
            .options(
                selectinload(RiderOffer.shipment).selectinload(Shipment.hub),
            )
            .order_by(RiderOffer.offered_at, RiderOffer.id)
        )
        return list(result.scalars().unique().all())
