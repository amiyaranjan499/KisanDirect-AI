from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from urllib.parse import quote
from uuid import UUID, uuid4

from geoalchemy2 import Geography
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.core.config import Settings
from backend.app.models import (
    NotificationType,
    Rider,
    RiderApprovalStatus,
    RiderAvailability,
    RiderLocation,
    RiderOffer,
    Shipment,
    ShipmentStatus,
    User,
    UserRole,
)
from backend.app.repositories.notifications_repository import NotificationRepository
from backend.app.repositories.rider_repository import RiderRepository
from backend.app.schemas.rider import (
    RiderCompletedShipmentResponse,
    RiderHistoryResponse,
    RiderOfferResponse,
    RiderSelfResponse,
    RiderShipmentResponse,
)
from backend.app.services.notifications_service import NotificationsService
from backend.app.services.order_lifecycle_service import (
    LifecycleActor,
    LifecycleConflict,
    LifecycleNotFound,
    LifecyclePermissionError,
    OrderLifecycleService,
)


class RiderService:
    def __init__(
        self,
        session: AsyncSession,
        repository: RiderRepository,
        lifecycle: OrderLifecycleService,
        settings: Settings,
    ) -> None:
        self.session = session
        self.repository = repository
        self.lifecycle = lifecycle
        self.settings = settings
        self.notifications = NotificationsService(NotificationRepository(session))

    async def self_status(self, actor: LifecycleActor) -> RiderSelfResponse:
        rider = await self._rider_for_actor(actor)
        return RiderSelfResponse(
            approval_status=rider.approval_status.value,
            availability=rider.availability.value,
        )

    async def set_availability(
        self, actor: LifecycleActor, *, online: bool
    ) -> RiderSelfResponse:
        async with self._transaction():
            rider = await self._rider_for_actor(actor, for_update=True)
            self._require_approved(rider)
            if online:
                if rider.availability is RiderAvailability.BUSY:
                    raise LifecycleConflict(
                        "Availability cannot change while a delivery is active"
                    )
                rider.availability = RiderAvailability.AVAILABLE
            else:
                if rider.availability is RiderAvailability.BUSY:
                    raise LifecycleConflict(
                        "Complete the active delivery before going offline"
                    )
                rider.availability = RiderAvailability.OFFLINE
            await self.session.flush()
            return RiderSelfResponse(
                approval_status=rider.approval_status.value,
                availability=rider.availability.value,
            )

    async def post_location(
        self,
        actor: LifecycleActor,
        *,
        latitude: float,
        longitude: float,
        accuracy: Decimal | None,
    ) -> None:
        async with self._transaction():
            rider = await self._rider_for_actor(actor, for_update=True)
            self._require_approved(rider)
            if rider.availability is RiderAvailability.OFFLINE:
                raise LifecyclePermissionError(
                    "Go online before sharing your location"
                )
            location = func_point(longitude, latitude)
            self.session.add(
                RiderLocation(
                    rider_id=rider.id,
                    location=location,
                    accuracy=accuracy,
                )
            )
            rider.last_seen_at = datetime.now(timezone.utc)
            await self._dispatch_waiting_shipments()
            await self.session.flush()

    async def poll_offers(
        self, actor: LifecycleActor
    ) -> list[RiderOfferResponse]:
        async with self._transaction():
            rider = await self._rider_for_actor(actor, for_update=True)
            self._require_approved(rider)
            if rider.availability is not RiderAvailability.AVAILABLE:
                raise LifecyclePermissionError(
                    "Only an online available rider can view offers"
                )
            now = datetime.now(timezone.utc)
            await self._advance_expired_offers(now)
            await self._dispatch_waiting_shipments()
            offers = await self.repository.active_offers_for_rider(rider.id, now)
            return [self._offer_response(offer) for offer in offers]

    async def dispatch_ready_shipment(self, shipment_id: UUID) -> None:
        async with self._transaction():
            shipment = await self.repository.lock_shipment(shipment_id)
            if shipment is None:
                raise LifecycleNotFound("Shipment not found")
            if shipment.status is not ShipmentStatus.READY_FOR_PICKUP:
                raise LifecycleConflict("Shipment is not ready for rider dispatch")
            await self._offer_next(shipment)

    async def accept_offer(
        self, actor: LifecycleActor, offer_id: UUID
    ) -> RiderShipmentResponse:
        conflict: LifecycleConflict | None = None
        async with self._transaction():
            rider = await self._rider_for_actor(actor, for_update=True)
            self._require_approved(rider)
            if rider.availability is not RiderAvailability.AVAILABLE:
                raise LifecyclePermissionError(
                    "Only an online available rider can accept an offer"
                )
            offer = await self.repository.get_offer(offer_id)
            if offer is None:
                raise LifecycleNotFound("Offer not found")
            shipment = await self.repository.lock_shipment(offer.shipment_id)
            offer = await self.repository.get_offer(offer_id, for_update=True)
            if shipment is None or offer is None:
                raise LifecycleNotFound("Offer or shipment not found")
            if offer.rider_id != rider.id:
                raise LifecyclePermissionError(
                    "This delivery offer belongs to another rider"
                )
            now = datetime.now(timezone.utc)
            if offer.status != "OFFERED":
                raise LifecycleConflict("Offer is no longer available")
            if offer.expires_at <= now:
                offer.status = "EXPIRED"
                offer.responded_at = now
                if shipment.status is ShipmentStatus.READY_FOR_PICKUP:
                    await self._offer_next(shipment)
                conflict = LifecycleConflict("Offer has expired")
            elif shipment.status is not ShipmentStatus.READY_FOR_PICKUP:
                offer.status = "SUPERSEDED"
                offer.responded_at = now
                conflict = LifecycleConflict("Shipment is no longer available")
            else:
                await self.lifecycle.transition_shipment(
                    shipment.id,
                    actor,
                    ShipmentStatus.RIDER_ASSIGNED,
                )
                offer.status = "ACCEPTED"
                offer.responded_at = now
                other_offers = await self.session.scalars(
                    select(RiderOffer)
                    .where(
                        RiderOffer.shipment_id == shipment.id,
                        RiderOffer.id != offer.id,
                        RiderOffer.status == "OFFERED",
                    )
                    .with_for_update()
                )
                for other_offer in other_offers:
                    other_offer.status = "SUPERSEDED"
                    other_offer.responded_at = now
                rider.availability = RiderAvailability.BUSY
                await self.session.flush()
        if conflict is not None:
            raise conflict
        shipment = await self.repository.get_active_shipment(rider.id)
        if shipment is None:
            raise LifecycleConflict("Accepted shipment could not be loaded")
        return self._shipment_response(shipment)

    async def decline_offer(
        self, actor: LifecycleActor, offer_id: UUID
    ) -> str:
        async with self._transaction():
            rider = await self._rider_for_actor(actor, for_update=True)
            self._require_approved(rider)
            if rider.availability is not RiderAvailability.AVAILABLE:
                raise LifecyclePermissionError(
                    "Only an online available rider can decline an offer"
                )
            offer = await self.repository.get_offer(offer_id)
            if offer is None:
                raise LifecycleNotFound("Offer not found")
            shipment = await self.repository.lock_shipment(offer.shipment_id)
            offer = await self.repository.get_offer(offer_id, for_update=True)
            if shipment is None or offer is None:
                raise LifecycleNotFound("Offer or shipment not found")
            if offer.rider_id != rider.id:
                raise LifecyclePermissionError(
                    "This delivery offer belongs to another rider"
                )
            now = datetime.now(timezone.utc)
            if offer.status != "OFFERED":
                raise LifecycleConflict("Offer is no longer available")
            if shipment.status is not ShipmentStatus.READY_FOR_PICKUP:
                offer.status = "SUPERSEDED"
                offer.responded_at = now
                await self.session.flush()
                return offer.status
            offer.status = "EXPIRED" if offer.expires_at <= now else "DECLINED"
            offer.responded_at = now
            await self._offer_next(shipment)
            await self.session.flush()
            return offer.status

    async def active_shipment(
        self, actor: LifecycleActor
    ) -> RiderShipmentResponse | None:
        rider = await self._rider_for_actor(actor)
        self._require_approved(rider)
        shipment = await self.repository.get_active_shipment(rider.id)
        return self._shipment_response(shipment) if shipment is not None else None

    async def update_shipment_status(
        self,
        actor: LifecycleActor,
        shipment_id: UUID,
        target: ShipmentStatus,
    ) -> RiderShipmentResponse:
        async with self._transaction():
            rider = await self._rider_for_actor(actor, for_update=True)
            self._require_approved(rider)
            await self.lifecycle.transition_shipment(
                shipment_id,
                actor,
                target,
            )
            shipment = await self.repository.shipment_for_actor(
                shipment_id, rider.id
            )
            if shipment is None:
                raise LifecycleNotFound("Assigned shipment not found")
            return self._shipment_response(shipment)

    async def record_cod_cash_collected(
        self, actor: LifecycleActor, shipment_id: UUID
    ) -> None:
        async with self._transaction():
            rider = await self._rider_for_actor(actor, for_update=True)
            self._require_approved(rider)
            shipment = await self.repository.shipment_for_actor(
                shipment_id, rider.id
            )
            if shipment is None:
                raise LifecycleNotFound("Assigned shipment not found")
            await self.lifecycle.record_cod_cash_collected(
                shipment.order_id,
                actor.user_id,
            )

    async def verify_delivery_otp(
        self,
        actor: LifecycleActor,
        shipment_id: UUID,
        code: str,
    ) -> bool:
        async with self._transaction():
            rider = await self._rider_for_actor(actor, for_update=True)
            self._require_approved(rider)
            return await self.lifecycle.verify_delivery_otp(
                shipment_id, actor, code
            )

    async def history(self, actor: LifecycleActor) -> RiderHistoryResponse:
        rider = await self._rider_for_actor(actor)
        self._require_approved(rider)
        shipments = await self.repository.completed_shipments(rider.id)
        completed = [
            RiderCompletedShipmentResponse(
                id=shipment.id,
                order_id=shipment.order_id,
                hub_name=shipment.hub.name,
                delivered_at=shipment.delivered_at,
            )
            for shipment in shipments
            if shipment.delivered_at is not None
        ]
        return RiderHistoryResponse(
            completed_deliveries=completed,
            delivery_count=len(completed),
            earnings_message="Earnings calculation is not configured.",
        )

    async def _rider_for_actor(
        self, actor: LifecycleActor, *, for_update: bool = False
    ) -> Rider:
        if actor.role is not UserRole.RIDER or actor.user_id is None:
            raise LifecyclePermissionError("Rider role required")
        rider = await self.repository.get_actor_rider(
            actor.user_id, for_update=for_update
        )
        if rider is None:
            exists = await self.session.scalar(
                select(User.id).where(
                    User.id == actor.user_id,
                    User.role == UserRole.RIDER,
                    User.is_active.is_(True),
                )
            )
            if exists is None:
                raise LifecyclePermissionError(
                    "Actor is not an active rider account"
                )
            raise LifecycleNotFound("Rider profile not found")
        return rider

    @staticmethod
    def _require_approved(rider: Rider) -> None:
        if rider.approval_status is RiderApprovalStatus.PENDING_APPROVAL:
            raise LifecyclePermissionError("Rider approval is pending")
        if rider.approval_status is RiderApprovalStatus.SUSPENDED:
            raise LifecyclePermissionError("Rider account is suspended")

    async def _dispatch_waiting_shipments(self) -> None:
        async with self._transaction():
            for shipment_id in await self.repository.pending_ready_shipments():
                shipment = await self.repository.lock_shipment(shipment_id)
                if (
                    shipment is not None
                    and shipment.status is ShipmentStatus.READY_FOR_PICKUP
                ):
                    await self._offer_next(shipment)

    async def _advance_expired_offers(self, now: datetime) -> None:
        async with self._transaction():
            expired = await self.repository.expired_offer_ids(now)
            for offer_id, shipment_id in expired:
                shipment = await self.repository.lock_shipment(shipment_id)
                if shipment is None:
                    continue
                offer = await self.session.scalar(
                    select(RiderOffer)
                    .where(RiderOffer.id == offer_id)
                    .with_for_update()
                )
                if (
                    offer is None
                    or offer.status != "OFFERED"
                    or offer.expires_at > now
                ):
                    continue
                offer.status = (
                    "EXPIRED"
                    if shipment.status is ShipmentStatus.READY_FOR_PICKUP
                    else "SUPERSEDED"
                )
                offer.responded_at = now
                if shipment.status is ShipmentStatus.READY_FOR_PICKUP:
                    await self._offer_next(shipment)

    async def _offer_next(self, shipment: Shipment) -> None:
        async with self._transaction():
            existing = await self.session.scalar(
                select(RiderOffer.id)
                .where(
                    RiderOffer.shipment_id == shipment.id,
                    RiderOffer.status.in_(["OFFERED", "ACCEPTED"]),
                )
                .limit(1)
            )
            if existing is not None:
                return
            rider = await self.repository.nearest_eligible_rider(
                shipment.id, shipment.hub_id
            )
            if rider is None:
                return
            now = datetime.now(timezone.utc)
            offer = RiderOffer(
                id=uuid4(),
                shipment_id=shipment.id,
                rider_id=rider.id,
                status="OFFERED",
                offered_at=now,
                expires_at=now
                + timedelta(seconds=self.settings.rider_offer_timeout_seconds),
            )
            self.session.add(offer)
            await self.session.flush()
            await self.notifications.stage(
                user_id=rider.user_id,
                notification_type=NotificationType.DELIVERY,
                title="New delivery offer",
                message="A nearby ready shipment is available for pickup.",
                related_entity_type="rider_offer",
                related_entity_id=offer.id,
            )

    @staticmethod
    def _offer_response(offer: RiderOffer) -> RiderOfferResponse:
        shipment = offer.shipment
        return RiderOfferResponse(
            id=offer.id,
            shipment_id=shipment.id,
            offered_at=offer.offered_at,
            expires_at=offer.expires_at,
            hub_name=shipment.hub.name,
            pickup_address=shipment.pickup_address_snapshot,
            dropoff_address=shipment.dropoff_address_snapshot,
        )

    @staticmethod
    def _shipment_response(shipment: Shipment) -> RiderShipmentResponse:
        address = shipment.pickup_address_snapshot
        return RiderShipmentResponse(
            id=shipment.id,
            order_id=shipment.order_id,
            status=shipment.status.value,
            hub_name=shipment.hub.name,
            pickup_address=address,
            pickup_maps_url=(
                "https://www.google.com/maps/search/?api=1&query="
                + quote(address, safe="")
            ),
            dropoff_address=shipment.dropoff_address_snapshot,
            promised_window_start=shipment.promised_window_start,
            promised_window_end=shipment.promised_window_end,
            payment_method=(
                shipment.order.payment.payment_method
                if shipment.order.payment is not None
                else None
            ),
            payment_status=(
                shipment.order.payment.status.value
                if shipment.order.payment is not None
                else None
            ),
        )

    @asynccontextmanager
    async def _transaction(self) -> AsyncGenerator[None, None]:
        async with self.session.begin_nested():
            yield


def func_point(longitude: float, latitude: float):
    from sqlalchemy import func

    return func.ST_SetSRID(
        func.ST_MakePoint(longitude, latitude), 4326
    ).cast(Geography(geometry_type="POINT", srid=4326))
