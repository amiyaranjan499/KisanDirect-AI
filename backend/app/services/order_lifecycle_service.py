from collections.abc import AsyncGenerator, Awaitable, Callable
from contextlib import asynccontextmanager
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from decimal import Decimal, ROUND_CEILING
import hashlib
import hmac
import secrets
from uuid import UUID, uuid4

from geoalchemy2 import Geography
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from backend.app.core.config import Settings
from backend.app.models import (
    AvailabilityStatus,
    Cart,
    CartItem,
    Consumer,
    CropListing,
    Delivery,
    DeliverySlot,
    DeliveryStatus,
    Farmer,
    HubStaff,
    Hub,
    HubStatus,
    HubStock,
    NotificationType,
    Order,
    OrderEvent,
    OrderItem,
    OrderStatus,
    Payment,
    PaymentStatus,
    ReservationStatus,
    Rider,
    RiderApprovalStatus,
    RiderAvailability,
    RiderOffer,
    Shipment,
    ShipmentStatus,
    StockReservation,
    User,
    UserRole,
)
from backend.app.repositories.notifications_repository import NotificationRepository
from backend.app.services.notifications_service import NotificationsService
from backend.app.services.order_state import (
    DELIVERY_TRANSITIONS,
    ORDER_TRANSITIONS,
    PAYMENT_TRANSITIONS,
    RESERVATION_TRANSITIONS,
    SHIPMENT_TRANSITIONS,
    assert_transition,
)


class LifecycleConflict(ValueError):
    pass


class LifecyclePermissionError(PermissionError):
    pass


class LifecycleNotFound(LookupError):
    pass


@dataclass(frozen=True)
class LifecycleActor:
    user_id: UUID | None
    role: UserRole | None


class OrderLifecycleService:
    def __init__(
        self,
        session: AsyncSession,
        notifications: NotificationsService | None = None,
        phase6_otp_generation_hook: Callable[[Shipment], Awaitable[None]] | None = None,
        shipment_ready_hook: Callable[[UUID], Awaitable[None]] | None = None,
        settings: Settings | None = None,
    ) -> None:
        self.session = session
        self.notifications = notifications or NotificationsService(NotificationRepository(session))
        self.settings = settings or Settings()
        self.phase6_otp_generation_hook = (
            phase6_otp_generation_hook or self._generate_delivery_otp_for_shipment
        )
        self.shipment_ready_hook = shipment_ready_hook

    async def create_checkout_order(
        self,
        actor: LifecycleActor,
        *,
        hub_id: UUID,
        delivery_slot_id: UUID | None,
        latitude: float,
        longitude: float,
        address: str,
        settings: Settings,
    ) -> UUID:
        if actor.role is not UserRole.CONSUMER or actor.user_id is None:
            raise LifecyclePermissionError("Only a consumer may place an order")
        async with self._transaction():
            await self._validate_actor(actor)
            consumer_id = await self.session.scalar(
                select(Consumer.id).where(Consumer.user_id == actor.user_id)
            )
            if consumer_id is None:
                raise LifecyclePermissionError("Consumer profile not found")

            cart_result = await self.session.execute(
                select(Cart)
                .where(Cart.consumer_id == consumer_id)
                .options(
                    selectinload(Cart.items)
                    .selectinload(CartItem.listing)
                    .selectinload(CropListing.crop),
                    selectinload(Cart.items)
                    .selectinload(CartItem.listing)
                    .selectinload(CropListing.farmer),
                )
                .with_for_update()
            )
            cart = cart_result.scalar_one_or_none()
            if cart is None or not cart.items:
                raise LifecycleConflict("Cart is empty")

            point = func.ST_SetSRID(
                func.ST_MakePoint(longitude, latitude), 4326
            ).cast(Geography(geometry_type="POINT", srid=4326))
            hub_result = await self.session.execute(
                select(Hub)
                .where(
                    Hub.id == hub_id,
                    Hub.status == HubStatus.ACTIVE,
                    func.ST_DWithin(
                        Hub.location,
                        point,
                        float(settings.hub_service_radius_km * 1000),
                    ),
                )
            )
            hub = hub_result.scalar_one_or_none()
            if hub is None:
                raise LifecycleConflict(
                    "Delivery address is not serviceable by the selected hub."
                )
            distance_meters = await self.session.scalar(
                select(func.ST_Distance(Hub.location, point)).where(Hub.id == hub.id)
            )
            distance_km = Decimal(str(distance_meters)) / Decimal("1000")

            listing_ids = [item.listing_id for item in cart.items]
            await self.session.execute(
                select(CropListing)
                .where(CropListing.id.in_(listing_ids))
                .options(
                    selectinload(CropListing.crop),
                    selectinload(CropListing.farmer),
                )
                .order_by(CropListing.id)
                .with_for_update()
                .execution_options(populate_existing=True)
            )
            stock_result = await self.session.execute(
                select(HubStock)
                .where(
                    HubStock.hub_id == hub.id,
                    HubStock.listing_id.in_(listing_ids),
                )
                .order_by(HubStock.listing_id)
                .with_for_update()
            )
            stock_by_listing = {
                row.listing_id: row for row in stock_result.scalars().all()
            }
            stock_ids = [row.id for row in stock_by_listing.values()]
            active_holds: dict[UUID, Decimal] = {}
            if stock_ids:
                holds_result = await self.session.execute(
                    select(
                        StockReservation.hub_stock_id,
                        func.sum(StockReservation.quantity),
                    )
                    .where(
                        StockReservation.hub_stock_id.in_(stock_ids),
                        StockReservation.status == ReservationStatus.HOLD,
                        StockReservation.expires_at > datetime.now(timezone.utc),
                    )
                    .group_by(StockReservation.hub_stock_id)
                )
                active_holds = {
                    stock_id: Decimal(quantity) for stock_id, quantity in holds_result
                }

            unavailable: list[str] = []
            for cart_item in cart.items:
                listing = cart_item.listing
                stock = stock_by_listing.get(cart_item.listing_id)
                free_quantity = (
                    max(
                        Decimal("0"),
                        stock.available_quantity
                        - active_holds.get(stock.id, Decimal("0")),
                    )
                    if stock is not None
                    else Decimal("0")
                )
                if (
                    listing.availability_status is not AvailabilityStatus.AVAILABLE
                    or stock is None
                    or free_quantity < cart_item.quantity
                ):
                    unavailable.append(
                        f"{listing.crop.name} (requested {cart_item.quantity} "
                        f"{listing.unit}, available {free_quantity} {listing.unit})"
                    )
            if unavailable:
                raise LifecycleConflict(
                    "Items unavailable at the selected hub: " + "; ".join(unavailable)
                )

            slot: DeliverySlot | None = None
            if delivery_slot_id is not None:
                slot = await self.session.scalar(
                    select(DeliverySlot)
                    .where(
                        DeliverySlot.id == delivery_slot_id,
                        DeliverySlot.hub_id == hub.id,
                    )
                    .with_for_update()
                )
                if (
                    slot is None
                    or slot.starts_at <= datetime.now(timezone.utc)
                    or slot.booked_count >= slot.capacity
                ):
                    raise LifecycleConflict(
                        "The selected delivery slot is no longer available."
                    )

            subtotal = sum(
                (
                    Decimal(item.listing.asking_price) * item.quantity
                ).quantize(Decimal("0.01"))
                for item in cart.items
            )
            delivery_fee = settings.delivery_fee.quantize(Decimal("0.01"))
            platform_fee = settings.platform_fee.quantize(Decimal("0.01"))
            total = subtotal + delivery_fee + platform_fee
            travel_minutes = int(
                (distance_km / settings.rider_speed_kmph * Decimal("60")).to_integral_value(
                    rounding=ROUND_CEILING
                )
            )
            eta_min = settings.packing_minutes + travel_minutes
            eta_max = eta_min + settings.delivery_buffer_minutes
            now = datetime.now(timezone.utc)
            if slot is not None:
                promised_start, promised_end = slot.starts_at, slot.ends_at
                slot.booked_count += 1
            else:
                promised_start = now + timedelta(minutes=eta_min)
                promised_end = now + timedelta(minutes=eta_max)

            order = Order(
                consumer_id=consumer_id,
                hub_id=hub.id,
                delivery_slot_id=slot.id if slot else None,
                status=OrderStatus.PENDING,
                subtotal=subtotal,
                delivery_fee=delivery_fee,
                platform_fee=platform_fee,
                total_amount=total,
                delivery_address=address,
                delivery_latitude=Decimal(str(latitude)),
                delivery_longitude=Decimal(str(longitude)),
                promised_window_start=promised_start,
                promised_window_end=promised_end,
            )
            self.session.add(order)
            await self.session.flush()
            expires_at = now + timedelta(minutes=settings.reservation_ttl_minutes)
            await self._record_event(
                order,
                actor,
                None,
                OrderStatus.PENDING.value,
                "Order placed; stock reservation held",
            )
            for cart_item in cart.items:
                listing = cart_item.listing
                unit_price = Decimal(listing.asking_price)
                line_subtotal = (unit_price * cart_item.quantity).quantize(
                    Decimal("0.01")
                )
                self.session.add(
                    OrderItem(
                        order_id=order.id,
                        listing_id=listing.id,
                        quantity=cart_item.quantity,
                        unit_price=unit_price,
                        subtotal=line_subtotal,
                    )
                )
                stock = stock_by_listing[cart_item.listing_id]
                reservation = StockReservation(
                    order_id=order.id,
                    hub_stock_id=stock.id,
                    quantity=cart_item.quantity,
                    status=ReservationStatus.HOLD,
                    expires_at=expires_at,
                )
                self.session.add(reservation)
                await self._record_event(
                    order,
                    actor,
                    None,
                    ReservationStatus.HOLD.value,
                    f"Stock held until {expires_at.isoformat()}",
                )
                await self.session.delete(cart_item)
        return order.id

    async def expire_holds(self, *, limit: int = 500) -> int:
        now = datetime.now(timezone.utc)
        async with self._transaction():
            order_ids_result = await self.session.execute(
                select(StockReservation.order_id)
                .where(
                    StockReservation.status == ReservationStatus.HOLD,
                    StockReservation.expires_at <= now,
                )
                .distinct()
                .order_by(StockReservation.order_id)
                .limit(limit)
            )
            count = 0
            for order_id in order_ids_result.scalars():
                order = await self._lock_order(order_id)
                reservations_result = await self.session.execute(
                    select(StockReservation)
                    .where(
                        StockReservation.order_id == order.id,
                        StockReservation.status == ReservationStatus.HOLD,
                        StockReservation.expires_at <= now,
                    )
                    .with_for_update(skip_locked=True)
                )
                expired_count = 0
                for reservation in reservations_result.scalars():
                    await self._transition_reservation_locked(
                        order,
                        reservation,
                        ReservationStatus.EXPIRED,
                        LifecycleActor(None, None),
                        "Reservation TTL expired",
                    )
                    count += 1
                    expired_count += 1
                if expired_count and order.status in {
                    OrderStatus.PENDING,
                    OrderStatus.CONFIRMED,
                }:
                    await self._transition_order_locked(
                        order,
                        LifecycleActor(None, None),
                        OrderStatus.CANCELLED,
                        reason="Checkout reservation expired",
                        cascade=True,
                    )
        return count

    async def transition_order(
        self,
        order_id: UUID,
        actor: LifecycleActor,
        target: OrderStatus,
        *,
        reason: str | None = None,
    ) -> Order:
        async with self._transaction():
            order = await self._lock_order(order_id)
            await self._transition_order_locked(order, actor, target, reason=reason)
        return order

    async def _complete_order_after_delivery(self, order_id: UUID) -> Order:
        async with self._transaction():
            order = await self._lock_order(order_id)
            await self._transition_order_locked(
                order,
                LifecycleActor(None, None),
                OrderStatus.COMPLETED,
                reason="System completion after delivery",
                cascade=True,
            )
        return order

    async def transition_delivery(
        self,
        order_id: UUID,
        actor: LifecycleActor,
        target: DeliveryStatus,
        *,
        reason: str | None = None,
    ) -> Delivery:
        async with self._transaction():
            order = await self._lock_order(order_id)
            delivery_result = await self.session.execute(
                select(Delivery).where(Delivery.order_id == order_id).with_for_update()
            )
            delivery = delivery_result.scalar_one_or_none()
            if delivery is None:
                raise LifecycleNotFound("Fulfillment not found")
            if actor.role is not UserRole.FARMER or actor.user_id is None:
                raise LifecyclePermissionError("Only the order's farmer may update delivery")
            await self._validate_actor(actor)
            if not await self._farmer_owns_order(order.id, actor.user_id):
                raise LifecycleNotFound("Fulfillment not found")
            self._require_reason(reason, required=target is DeliveryStatus.CANCELLED)
            self._assert_not_repeat(delivery.status, target, "Delivery")
            try:
                assert_transition(
                    DELIVERY_TRANSITIONS,
                    delivery.status,
                    target,
                    method=delivery.fulfillment_method,
                )
            except ValueError as exc:
                raise LifecycleConflict(str(exc)) from exc

            from_status = delivery.status
            delivery.status = target
            await self._record_event(
                order,
                actor,
                from_status.value,
                target.value,
                reason,
                shipment_id=order.shipment.id if order.shipment else None,
            )

            await self._cascade_legacy_delivery(order, actor, target, reason)
            await self._notify_order_parties(
                order,
                actor,
                NotificationType.DELIVERY,
                "Delivery status updated",
                f"Fulfillment for order {str(order.id)[:8]} is now {target.value}.",
                shipment_id=order.shipment.id if order.shipment else None,
            )
            await self.session.refresh(delivery)
        return delivery

    async def create_shipment(
        self,
        order_id: UUID,
        actor: LifecycleActor,
        *,
        hub_id: UUID,
        promised_window_start: datetime | None = None,
        promised_window_end: datetime | None = None,
        pickup_address_snapshot: str | None = None,
        dropoff_address_snapshot: str | None = None,
        reason: str | None = None,
    ) -> Shipment:
        async with self._transaction():
            order = await self._lock_order(order_id)
            await self._authorize_hub_operation(order, actor, hub_id)
            if order.hub_id is not None and order.hub_id != hub_id:
                raise LifecyclePermissionError(
                    "Shipment hub must match the hub selected at checkout"
                )
            if order.status is not OrderStatus.PROCESSING:
                raise LifecycleConflict("Shipment can only be prepared while the order is PROCESSING")
            existing = await self.session.scalar(
                select(Shipment).where(Shipment.order_id == order.id).with_for_update()
            )
            if existing is not None:
                raise LifecycleConflict("A shipment already exists for this order")
            if (
                promised_window_start is None
                or promised_window_end is None
                or pickup_address_snapshot is None
                or dropoff_address_snapshot is None
            ):
                hub = await self.session.get(Hub, hub_id)
                if hub is None:
                    raise LifecycleNotFound("Hub not found")
                promised_window_start = (
                    promised_window_start or order.promised_window_start
                )
                promised_window_end = promised_window_end or order.promised_window_end
                pickup_address_snapshot = pickup_address_snapshot or hub.address
                dropoff_address_snapshot = (
                    dropoff_address_snapshot or order.delivery_address
                )
                if promised_window_start is None or promised_window_end is None:
                    raise LifecycleConflict(
                        "Order has no promised delivery window for shipment preparation"
                    )
                if not dropoff_address_snapshot:
                    raise LifecycleConflict(
                        "Order has no delivery address for shipment preparation"
                    )

            shipment = Shipment(
                order_id=order.id,
                hub_id=hub_id,
                status=ShipmentStatus.PACKING,
                promised_window_start=promised_window_start,
                promised_window_end=promised_window_end,
                pickup_address_snapshot=pickup_address_snapshot,
                dropoff_address_snapshot=dropoff_address_snapshot,
            )
            self.session.add(shipment)
            await self.session.flush()
            await self._record_event(
                order,
                actor,
                None,
                ShipmentStatus.PACKING.value,
                reason or "Shipment packing started",
                shipment_id=shipment.id,
            )
            await self._notify_order_parties(
                order,
                actor,
                NotificationType.DELIVERY,
                "Shipment packing started",
                f"Shipment for order {str(order.id)[:8]} is being packed.",
                shipment_id=shipment.id,
            )
        return shipment

    async def transition_shipment(
        self,
        shipment_id: UUID,
        actor: LifecycleActor,
        target: ShipmentStatus,
        *,
        reason: str | None = None,
        assigned_rider_user_id: UUID | None = None,
    ) -> Shipment:
        if target is ShipmentStatus.DELIVERED:
            raise LifecyclePermissionError(
                "Shipment delivery requires the internal OTP-verified delivery path"
            )
        shipment: Shipment | None = None
        try:
            async with self._transaction():
                shipment_order_id = await self.session.scalar(
                    select(Shipment.order_id).where(Shipment.id == shipment_id)
                )
                if shipment_order_id is None:
                    raise LifecycleNotFound("Shipment not found")
                order = await self._lock_order(shipment_order_id)
                shipment_result = await self.session.execute(
                    select(Shipment).where(Shipment.id == shipment_id).with_for_update()
                )
                shipment = shipment_result.scalar_one_or_none()
                if shipment is None:
                    raise LifecycleNotFound("Shipment not found")
                await self._transition_shipment_locked(
                    order,
                    shipment,
                    actor,
                    target,
                    reason=reason,
                    assigned_rider_user_id=assigned_rider_user_id,
                )
                await self.session.refresh(shipment)
        except (LifecycleConflict, LifecyclePermissionError, ValueError):
            if shipment is not None:
                service_owned_transaction = not self.session.in_transaction()
                await self.session.refresh(shipment)
                if service_owned_transaction:
                    await self.session.commit()
            raise
        assert shipment is not None
        return shipment

    async def reassign_shipment(
        self,
        shipment_id: UUID,
        rider_user_id: UUID,
        actor: LifecycleActor,
        *,
        reason: str,
    ) -> Shipment:
        async with self.session.begin_nested():
            self._require_reason(reason, required=True)
            if actor.role is not UserRole.ADMIN:
                raise LifecyclePermissionError("Only an admin may reassign a shipment")
            await self._validate_actor(actor)
            order_id = await self.session.scalar(
                select(Shipment.order_id).where(Shipment.id == shipment_id)
            )
            if order_id is None:
                raise LifecycleNotFound("Shipment not found")
            await self._lock_order(order_id)
            result = await self.session.execute(
                select(Shipment).where(Shipment.id == shipment_id).with_for_update()
            )
            shipment = result.scalar_one_or_none()
            if shipment is None:
                raise LifecycleNotFound("Shipment not found")
            if shipment.status in {ShipmentStatus.DELIVERED, ShipmentStatus.CANCELLED}:
                raise LifecycleConflict("A delivered or cancelled shipment cannot be reassigned")
            if shipment.status not in {
                ShipmentStatus.READY_FOR_PICKUP,
                ShipmentStatus.RIDER_ASSIGNED,
            }:
                raise LifecycleConflict("Shipment can only be reassigned before pickup")

            target_result = await self.session.execute(
                select(Rider)
                .join(User, User.id == Rider.user_id)
                .where(
                    Rider.user_id == rider_user_id,
                    Rider.approval_status == RiderApprovalStatus.APPROVED,
                    Rider.availability == RiderAvailability.AVAILABLE,
                    User.is_active.is_(True),
                )
                .with_for_update(of=Rider)
            )
            target_rider = target_result.scalar_one_or_none()
            if target_rider is None:
                raise LifecycleConflict("Target rider must be active, approved, and available")
            if shipment.rider_id == target_rider.id:
                raise LifecycleConflict("Shipment is already assigned to this rider")

            current_status = shipment.status
            current_rider_id = shipment.rider_id
            active_offers = await self.session.execute(
                select(RiderOffer)
                .where(
                    RiderOffer.shipment_id == shipment.id,
                    RiderOffer.status.in_(("OFFERED", "ACCEPTED")),
                )
                .with_for_update()
            )
            for offer in active_offers.scalars():
                offer.status = "SUPERSEDED"
                offer.responded_at = datetime.now(timezone.utc)
            if current_rider_id is not None:
                old_rider_result = await self.session.execute(
                    select(Rider).where(Rider.id == current_rider_id).with_for_update()
                )
                old_rider = old_rider_result.scalar_one_or_none()
                if old_rider is not None:
                    other_active = await self.session.scalar(
                        select(func.count(Shipment.id)).where(
                            Shipment.rider_id == old_rider.id,
                            Shipment.id != shipment.id,
                            Shipment.status.not_in(
                                (
                                    ShipmentStatus.DELIVERED,
                                    ShipmentStatus.CANCELLED,
                                    ShipmentStatus.RETURNED,
                                )
                            ),
                        )
                    )
                    old_rider.availability = (
                        RiderAvailability.BUSY
                        if other_active
                        else RiderAvailability.AVAILABLE
                    )

            if current_status is ShipmentStatus.RIDER_ASSIGNED:
                await self.transition_shipment(
                    shipment.id,
                    actor,
                    ShipmentStatus.READY_FOR_PICKUP,
                    reason=f"Admin reassigning rider: {reason.strip()}",
                )
            reassigned = await self.transition_shipment(
                shipment.id,
                actor,
                ShipmentStatus.RIDER_ASSIGNED,
                reason=f"Admin assigned rider {rider_user_id}: {reason.strip()}",
                assigned_rider_user_id=rider_user_id,
            )
            target_rider.availability = RiderAvailability.BUSY
            await self.session.flush()
        return reassigned

    async def _deliver_shipment_after_otp(
        self,
        shipment_id: UUID,
        actor: LifecycleActor,
        *,
        otp_verified: bool,
    ) -> Shipment:
        if otp_verified is not True:
            raise LifecyclePermissionError("A verified delivery OTP is required")
        async with self._transaction():
            shipment_order_id = await self.session.scalar(
                select(Shipment.order_id).where(Shipment.id == shipment_id)
            )
            if shipment_order_id is None:
                raise LifecycleNotFound("Shipment not found")
            order = await self._lock_order(shipment_order_id)
            shipment_result = await self.session.execute(
                select(Shipment).where(Shipment.id == shipment_id).with_for_update()
            )
            shipment = shipment_result.scalar_one_or_none()
            if shipment is None:
                raise LifecycleNotFound("Shipment not found")
            await self._transition_shipment_locked(
                order,
                shipment,
                actor,
                ShipmentStatus.DELIVERED,
                reason="Delivery OTP verified",
                otp_verified=True,
            )
        return shipment

    async def verify_delivery_otp(
        self, shipment_id: UUID, actor: LifecycleActor, code: str
    ) -> bool:
        if actor.role is not UserRole.RIDER or actor.user_id is None:
            raise LifecyclePermissionError("Only the assigned rider may verify delivery")

        verified = False
        async with self.session.begin_nested():
            await self._validate_actor(actor)
            order_id = await self.session.scalar(
                select(Shipment.order_id).where(Shipment.id == shipment_id)
            )
            if order_id is None:
                raise LifecycleNotFound("Shipment not found")
            order = await self._lock_order(order_id)
            shipment_result = await self.session.execute(
                select(Shipment)
                .where(Shipment.id == shipment_id)
                .with_for_update()
                .execution_options(populate_existing=True)
            )
            shipment = shipment_result.scalar_one_or_none()
            if shipment is None:
                raise LifecycleNotFound("Shipment not found")
            rider_id = await self.session.scalar(
                select(Rider.id).where(Rider.user_id == actor.user_id)
            )
            if rider_id is None or shipment.rider_id != rider_id:
                raise LifecyclePermissionError(
                    "Only the assigned rider may verify delivery"
                )
            if shipment.status not in {
                ShipmentStatus.OUT_FOR_DELIVERY,
                ShipmentStatus.ARRIVED,
            }:
                raise LifecycleConflict(
                    "Delivery OTP can only be verified after arrival"
                )

            now = datetime.now(timezone.utc)
            is_eligible = (
                shipment.otp_consumed_at is None
                and shipment.otp_expires_at is not None
                and shipment.otp_expires_at > now
                and shipment.otp_attempts < self.settings.otp_max_attempts
                and shipment.delivery_otp_hash is not None
            )
            if is_eligible and self._matches_otp(code, shipment.delivery_otp_hash):
                shipment.otp_consumed_at = now
                await self._deliver_shipment_after_otp(
                    shipment.id, actor, otp_verified=True
                )
                if shipment.rider_id is not None:
                    rider = await self.session.scalar(
                        select(Rider)
                        .where(Rider.id == shipment.rider_id)
                        .with_for_update()
                    )
                    if rider is not None:
                        rider.availability = RiderAvailability.AVAILABLE
                verified = True
            elif is_eligible:
                shipment.otp_attempts += 1
                if shipment.otp_attempts == self.settings.otp_max_attempts:
                    await self._record_event(
                        order,
                        actor,
                        "OTP_ACTIVE",
                        "OTP_LOCKED",
                        "Maximum delivery OTP attempts reached",
                        shipment_id=shipment.id,
                    )
            await self.session.flush()
        return verified

    async def reset_delivery_otp(
        self, shipment_id: UUID, actor: LifecycleActor, reason: str
    ) -> None:
        if actor.role is not UserRole.ADMIN:
            raise LifecyclePermissionError("Admin role required")
        if not reason.strip():
            raise LifecycleConflict("A non-empty reason is required")
        async with self.session.begin_nested():
            await self._validate_actor(actor)
            order_id = await self.session.scalar(
                select(Shipment.order_id).where(Shipment.id == shipment_id)
            )
            if order_id is None:
                raise LifecycleNotFound("Shipment not found")
            order = await self._lock_order(order_id)
            shipment_result = await self.session.execute(
                select(Shipment)
                .where(Shipment.id == shipment_id)
                .with_for_update()
                .execution_options(populate_existing=True)
            )
            shipment = shipment_result.scalar_one_or_none()
            if shipment is None:
                raise LifecycleNotFound("Shipment not found")
            if (
                shipment.status
                not in {ShipmentStatus.OUT_FOR_DELIVERY, ShipmentStatus.ARRIVED}
                or shipment.otp_consumed_at is not None
                or shipment.otp_attempts < self.settings.otp_max_attempts
            ):
                raise LifecycleConflict("Only a locked delivery OTP can be reset")

            await self._issue_delivery_otp(order, shipment)
            await self._record_event(
                order,
                actor,
                "OTP_LOCKED",
                "OTP_RESET",
                reason.strip(),
                shipment_id=shipment.id,
            )
            await self.session.flush()

    async def _generate_delivery_otp_for_shipment(
        self, shipment: Shipment
    ) -> None:
        async with self.session.begin_nested():
            result = await self.session.execute(
                select(Order)
                .where(Order.id == shipment.order_id)
                .options(selectinload(Order.consumer))
            )
            order = result.scalar_one_or_none()
            if order is None:
                raise LifecycleNotFound("Order not found for delivery OTP")
            await self._issue_delivery_otp(order, shipment)
            await self.session.flush()

    async def _issue_delivery_otp(self, order: Order, shipment: Shipment) -> None:
        code = f"{secrets.randbelow(1_000_000):06d}"
        shipment.delivery_otp_hash = self._hash_otp(code)
        shipment.otp_expires_at = datetime.now(timezone.utc) + timedelta(
            minutes=self.settings.otp_ttl_minutes
        )
        shipment.otp_attempts = 0
        shipment.otp_consumed_at = None
        await self.notifications.stage(
            user_id=order.consumer.user_id,
            notification_type=NotificationType.DELIVERY,
            title="Delivery verification code",
            message=f"Your delivery verification code is {code}.",
            related_entity_type="shipment_otp",
            related_entity_id=shipment.id,
            deduplicate=False,
        )

    @staticmethod
    def _hash_otp(code: str) -> str:
        salt = secrets.token_bytes(16)
        digest = hashlib.pbkdf2_hmac(
            "sha256", code.encode("utf-8"), salt, 120_000
        )
        return f"{salt.hex()}:{digest.hex()}"

    @staticmethod
    def _matches_otp(code: str, encoded_hash: str) -> bool:
        salt_hex, separator, digest_hex = encoded_hash.partition(":")
        if not separator:
            return False
        digest = hashlib.pbkdf2_hmac(
            "sha256", code.encode("utf-8"), bytes.fromhex(salt_hex), 120_000
        )
        return hmac.compare_digest(digest.hex(), digest_hex)

    async def initiate_sandbox_payment(
        self,
        consumer_user_id: UUID,
        order_id: UUID,
        outcome: str,
    ) -> UUID:
        target_by_outcome = {
            "success": PaymentStatus.SUCCESSFUL,
            "failed": PaymentStatus.FAILED,
            "cancelled": PaymentStatus.CANCELLED,
        }
        if outcome not in target_by_outcome:
            raise ValueError("Invalid sandbox payment outcome")

        async with self._transaction():
            await self._validate_actor(
                LifecycleActor(consumer_user_id, UserRole.CONSUMER)
            )
            order = await self._lock_order(order_id)
            consumer_user = await self.session.scalar(
                select(Consumer.user_id).where(Consumer.id == order.consumer_id)
            )
            if consumer_user != consumer_user_id:
                raise LifecycleNotFound("Order not found")
            if order.status not in {OrderStatus.PENDING, OrderStatus.CONFIRMED}:
                expired_reservation = await self.session.scalar(
                    select(StockReservation.id).where(
                        StockReservation.order_id == order.id,
                        StockReservation.status == ReservationStatus.EXPIRED,
                    )
                )
                if expired_reservation is not None:
                    raise LifecycleConflict(
                        "Checkout reservation expired. Please place your order again."
                    )
                raise LifecycleConflict("Order is not payable")
            payment_result = await self.session.execute(
                select(Payment).where(Payment.order_id == order.id).with_for_update()
            )
            payment = payment_result.scalar_one_or_none()
            if payment is not None and payment.status in {
                PaymentStatus.PAID,
                PaymentStatus.SUCCESSFUL,
            }:
                raise LifecycleConflict("Order already has a successful payment")
            if payment is not None and payment.status is not PaymentStatus.PENDING:
                raise LifecycleConflict("Payment is terminal and cannot be retried")
            if payment is not None and (
                not payment.is_test
                or payment.payment_method != "TEST_SANDBOX"
                or payment.amount != order.total_amount
            ):
                raise LifecycleConflict("Existing payment is not a matching TEST_SANDBOX payment")
            if payment is None:
                payment = Payment(
                    order_id=order.id,
                    amount=order.total_amount,
                    provider_reference=f"TEST-{uuid4()}",
                    payment_method="TEST_SANDBOX",
                    is_test=True,
                )
                self.session.add(payment)
                await self.session.flush()
                await self._record_event(
                    order,
                    LifecycleActor(None, None),
                    None,
                    PaymentStatus.PENDING.value,
                    "TEST_SANDBOX payment initiated",
                )
            if (
                not payment.is_test
                or payment.payment_method != "TEST_SANDBOX"
                or payment.amount != order.total_amount
            ):
                raise LifecycleConflict("Only matching TEST_SANDBOX payments may use sandbox outcomes")
            await self._transition_payment_locked(
                order,
                payment,
                LifecycleActor(None, None),
                target_by_outcome[outcome],
                reason=f"TEST_SANDBOX outcome: {outcome}",
                sandbox_outcome=True,
            )
            if outcome == "success":
                await self._commit_checkout_reservations(order)
            elif outcome in {"failed", "cancelled"}:
                if order.hub_id is not None:
                    await self._transition_order_locked(
                        order,
                        LifecycleActor(None, None),
                        OrderStatus.CANCELLED,
                        reason=f"Checkout payment {outcome}",
                        cascade=True,
                    )
                else:
                    await self._restore_checkout_stock(order)
        return payment.id

    async def record_cod_cash_collected(
        self,
        order_id: UUID,
        rider_user_id: UUID,
    ) -> UUID:
        async with self._transaction():
            await self._validate_actor(LifecycleActor(rider_user_id, UserRole.RIDER))
            order = await self._lock_order(order_id)
            shipment = await self.session.scalar(
                select(Shipment).where(Shipment.order_id == order.id).with_for_update()
            )
            if shipment is None or shipment.status is not ShipmentStatus.ARRIVED:
                raise LifecycleConflict("COD can only be collected after shipment arrival")
            rider = await self.session.scalar(
                select(Rider).where(
                    Rider.user_id == rider_user_id,
                    Rider.id == shipment.rider_id,
                    Rider.approval_status == RiderApprovalStatus.APPROVED,
                )
            )
            if rider is None:
                raise LifecyclePermissionError("Only the assigned rider may collect COD")
            payment = await self.session.scalar(
                select(Payment).where(Payment.order_id == order.id).with_for_update()
            )
            if payment is None:
                payment = Payment(
                    order_id=order.id,
                    amount=order.total_amount,
                    payment_method="COD",
                    is_test=False,
                )
                self.session.add(payment)
                await self.session.flush()
                await self._record_event(
                    order,
                    LifecycleActor(rider_user_id, UserRole.RIDER),
                    None,
                    PaymentStatus.PENDING.value,
                    "COD payment created",
                    shipment_id=shipment.id,
                )
            elif (
                payment.payment_method != "COD"
                or payment.is_test
                or payment.amount != order.total_amount
            ):
                raise LifecycleConflict("Existing payment is not a matching COD payment")
            await self._transition_payment_locked(
                order,
                payment,
                LifecycleActor(rider_user_id, UserRole.RIDER),
                PaymentStatus.PAID,
                reason="COD cash collected",
                shipment=shipment,
            )
        return payment.id

    async def refund_test_payment(
        self,
        order_id: UUID,
        actor: LifecycleActor,
        *,
        reason: str,
    ) -> None:
        if actor.role is not UserRole.ADMIN or actor.user_id is None:
            raise LifecyclePermissionError("Only an authenticated admin may request a refund")
        async with self._transaction():
            await self._validate_actor(actor)
            order = await self._lock_order(order_id)
            payment = await self.session.scalar(
                select(Payment).where(Payment.order_id == order.id).with_for_update()
            )
            if payment is None:
                raise LifecycleNotFound("Payment not found")
            await self._transition_payment_locked(
                order,
                payment,
                actor,
                PaymentStatus.REFUNDED,
                reason=reason,
            )

    async def _transition_order_locked(
        self,
        order: Order,
        actor: LifecycleActor,
        target: OrderStatus,
        *,
        reason: str | None,
        cascade: bool = False,
        shipment_id: UUID | None = None,
    ) -> None:
        self._assert_not_repeat(order.status, target, "Order")
        try:
            assert_transition(ORDER_TRANSITIONS, order.status, target)
        except ValueError as exc:
            raise LifecycleConflict(str(exc)) from exc
        self._require_reason(
            reason,
            required=target is OrderStatus.CANCELLED
            and actor.role
            in {UserRole.FARMER, UserRole.HUB_STAFF, UserRole.ADMIN},
        )
        await self._authorize_order_transition(order, actor, target, cascade=cascade)

        shipment_to_cancel = None
        if target is OrderStatus.CANCELLED:
            shipment_to_cancel = await self.session.scalar(
                select(Shipment)
                .where(Shipment.order_id == order.id)
                .with_for_update()
            )

        from_status = order.status
        order.status = target
        await self._record_event(
            order,
            actor,
            from_status.value,
            target.value,
            reason,
            shipment_id=shipment_id
            or (
                shipment_to_cancel.id
                if shipment_to_cancel is not None
                else None
            ),
        )
        if target is OrderStatus.CANCELLED:
            if (
                shipment_to_cancel is not None
                and shipment_to_cancel.status is ShipmentStatus.PACKING
            ):
                await self._transition_shipment_locked(
                    order,
                    shipment_to_cancel,
                    actor,
                    ShipmentStatus.CANCELLED,
                    reason=reason,
                    cascade_order=False,
                )
            await self._restore_checkout_stock(order)
            await self._release_delivery_slot(order)
            await self._refund_on_cancellation(order)
        await self._notify_order_parties(
            order,
            actor,
            NotificationType.ORDER,
            "Order status updated",
            f"Order {str(order.id)[:8]} is now {target.value}.",
            shipment_id=shipment_id,
        )

    async def _transition_shipment_locked(
        self,
        order: Order,
        shipment: Shipment,
        actor: LifecycleActor,
        target: ShipmentStatus,
        *,
        reason: str | None,
        assigned_rider_user_id: UUID | None = None,
        otp_verified: bool = False,
        cascade_order: bool = True,
    ) -> None:
        self._assert_not_repeat(shipment.status, target, "Shipment")
        try:
            assert_transition(SHIPMENT_TRANSITIONS, shipment.status, target)
        except ValueError as exc:
            raise LifecycleConflict(str(exc)) from exc
        if target is ShipmentStatus.DELIVERED and not otp_verified:
            raise LifecyclePermissionError("A verified delivery OTP is required")
        self._require_reason(
            reason,
            required=target in {ShipmentStatus.FAILED_DELIVERY, ShipmentStatus.CANCELLED},
        )
        await self._authorize_shipment_transition(
            order,
            shipment,
            actor,
            target,
            assigned_rider_user_id=assigned_rider_user_id,
        )
        if target is ShipmentStatus.CANCELLED:
            offers_result = await self.session.execute(
                select(RiderOffer)
                .where(
                    RiderOffer.shipment_id == shipment.id,
                    RiderOffer.status.in_(("OFFERED", "ACCEPTED")),
                )
                .with_for_update()
            )
            for offer in offers_result.scalars():
                offer.status = "SUPERSEDED"
                offer.responded_at = datetime.now(timezone.utc)
            if shipment.rider_id is not None:
                rider = await self.session.scalar(
                    select(Rider).where(Rider.id == shipment.rider_id).with_for_update()
                )
                if rider is not None:
                    other_active = await self.session.scalar(
                        select(func.count(Shipment.id)).where(
                            Shipment.rider_id == rider.id,
                            Shipment.id != shipment.id,
                            Shipment.status.not_in(
                                (
                                    ShipmentStatus.DELIVERED,
                                    ShipmentStatus.CANCELLED,
                                    ShipmentStatus.RETURNED,
                                )
                            ),
                        )
                    )
                    rider.availability = (
                        RiderAvailability.BUSY
                        if other_active
                        else RiderAvailability.AVAILABLE
                    )
        from_status = shipment.status
        if target is ShipmentStatus.READY_FOR_PICKUP and from_status is ShipmentStatus.PACKING:
            shipment.ready_for_pickup_at = datetime.now(timezone.utc)
        elif target is ShipmentStatus.RIDER_ASSIGNED:
            assigned_id = assigned_rider_user_id
            if actor.role is UserRole.RIDER:
                assigned_id = actor.user_id
            shipment.rider_id = await self._rider_id(assigned_id)
            shipment.rider_assigned_at = datetime.now(timezone.utc)
        elif target is ShipmentStatus.READY_FOR_PICKUP:
            shipment.rider_id = None
            shipment.rider_assigned_at = None
        elif target is ShipmentStatus.PICKED_UP:
            shipment.picked_up_at = datetime.now(timezone.utc)
        elif target is ShipmentStatus.OUT_FOR_DELIVERY:
            shipment.out_for_delivery_at = datetime.now(timezone.utc)
        elif target is ShipmentStatus.ARRIVED:
            shipment.arrived_at = datetime.now(timezone.utc)
        elif target is ShipmentStatus.DELIVERED:
            shipment.delivered_at = datetime.now(timezone.utc)
        elif target is ShipmentStatus.FAILED_DELIVERY:
            shipment.failed_delivery_at = datetime.now(timezone.utc)
        elif target is ShipmentStatus.RETURNED:
            shipment.returned_at = datetime.now(timezone.utc)
        elif target is ShipmentStatus.CANCELLED:
            shipment.cancelled_at = datetime.now(timezone.utc)
        shipment.status = target
        await self._record_event(
            order,
            actor,
            from_status.value,
            target.value,
            reason,
            shipment_id=shipment.id,
        )

        if target is ShipmentStatus.READY_FOR_PICKUP and from_status is ShipmentStatus.PACKING:
            await self._transition_order_locked(
                order,
                LifecycleActor(None, None),
                OrderStatus.SHIPPED,
                reason="Shipment ready for pickup",
                cascade=True,
                shipment_id=shipment.id,
            )
        if target is ShipmentStatus.OUT_FOR_DELIVERY and self.phase6_otp_generation_hook is not None:
            await self.phase6_otp_generation_hook(shipment)
        if target is ShipmentStatus.DELIVERED:
            await self._transition_order_locked(
                order,
                LifecycleActor(None, None),
                OrderStatus.DELIVERED,
                reason="Shipment delivered after OTP verification",
                cascade=True,
                shipment_id=shipment.id,
            )
        elif cascade_order and target in {ShipmentStatus.CANCELLED, ShipmentStatus.RETURNED}:
            await self._transition_order_locked(
                order,
                LifecycleActor(None, None),
                OrderStatus.CANCELLED,
                reason=f"Shipment {target.value.lower()}",
                cascade=True,
                shipment_id=shipment.id,
            )
        await self._notify_order_parties(
            order,
            actor,
            NotificationType.DELIVERY,
            "Shipment status updated",
            f"Shipment for order {str(order.id)[:8]} is now {target.value}.",
            shipment_id=shipment.id,
        )
        if (
            target is ShipmentStatus.READY_FOR_PICKUP
            and self.shipment_ready_hook is not None
        ):
            await self.shipment_ready_hook(shipment.id)

    async def _transition_payment_locked(
        self,
        order: Order,
        payment: Payment,
        actor: LifecycleActor,
        target: PaymentStatus,
        *,
        reason: str,
        shipment: Shipment | None = None,
        sandbox_outcome: bool = False,
    ) -> None:
        current = payment.status
        if current is target:
            raise LifecycleConflict(f"Payment is already {target.value}")
        try:
            assert_transition(PAYMENT_TRANSITIONS, current, target)
        except ValueError as exc:
            raise LifecycleConflict(str(exc)) from exc
        if target in {PaymentStatus.PAID, PaymentStatus.SUCCESSFUL, PaymentStatus.FAILED}:
            if current is not PaymentStatus.PENDING:
                raise LifecycleConflict(
                    f"Invalid payment transition: {current.value} -> {target.value}"
                )
            if not sandbox_outcome and actor.role is not None:
                if target is not PaymentStatus.PAID or actor.role is not UserRole.RIDER:
                    raise LifecyclePermissionError("Only the system can record this payment transition")
                if shipment is None or shipment.status is not ShipmentStatus.ARRIVED:
                    raise LifecycleConflict("COD can only be collected after shipment arrival")
        elif target is PaymentStatus.CANCELLED:
            if not sandbox_outcome or current is not PaymentStatus.PENDING:
                raise LifecycleConflict(
                    f"Invalid payment transition: {current.value} -> {target.value}"
                )
            if not payment.is_test or payment.payment_method != "TEST_SANDBOX":
                raise LifecycleConflict("Only TEST_SANDBOX payments can be cancelled this way")
        elif target is PaymentStatus.REFUNDED:
            self._require_reason(reason, required=actor.role is UserRole.ADMIN)
            if current not in {PaymentStatus.PAID, PaymentStatus.SUCCESSFUL}:
                raise LifecycleConflict(
                    f"Invalid payment transition: {current.value} -> {target.value}"
                )
            if not payment.is_test or payment.payment_method != "TEST_SANDBOX":
                raise LifecycleConflict("Refunds are supported only for TEST_SANDBOX payments")
            if actor.role not in {None, UserRole.ADMIN}:
                raise LifecyclePermissionError("Only the system or an admin may refund a payment")
        else:
            raise LifecycleConflict(f"Unsupported payment transition to {target.value}")

        payment.status = target
        await self._record_event(
            order,
            actor,
            current.value,
            target.value,
            reason,
            shipment_id=(
                shipment.id
                if shipment is not None
                else order.shipment.id
                if order.shipment is not None
                else None
            ),
        )
        await self._notify_order_parties(
            order,
            actor,
            NotificationType.PAYMENT,
            "Payment status updated",
            f"Payment for order {str(order.id)[:8]} is now {target.value}.",
            shipment_id=(
                shipment.id
                if shipment is not None
                else order.shipment.id
                if order.shipment is not None
                else None
            ),
        )

    async def _cascade_legacy_delivery(
        self,
        order: Order,
        actor: LifecycleActor,
        delivery_status: DeliveryStatus,
        reason: str | None,
    ) -> None:
        if delivery_status is DeliveryStatus.CONFIRMED:
            if order.status is OrderStatus.PENDING:
                await self._transition_order_locked(
                    order,
                    actor,
                    OrderStatus.CONFIRMED,
                    reason="Legacy delivery confirmed",
                )
            if order.status is OrderStatus.CONFIRMED:
                await self._transition_order_locked(
                    order,
                    actor,
                    OrderStatus.PROCESSING,
                    reason="Legacy delivery packing started",
                )
        elif delivery_status in {DeliveryStatus.READY, DeliveryStatus.OUT_FOR_DELIVERY}:
            if order.status is OrderStatus.PROCESSING:
                await self._transition_order_locked(
                    order,
                    LifecycleActor(None, None),
                    OrderStatus.SHIPPED,
                    reason="Legacy delivery entered dispatch",
                    cascade=True,
                    shipment_id=order.shipment.id if order.shipment else None,
                )
        elif delivery_status in {DeliveryStatus.DELIVERED, DeliveryStatus.PICKED_UP}:
            if order.status is OrderStatus.SHIPPED:
                await self._transition_order_locked(
                    order,
                    LifecycleActor(None, None),
                    OrderStatus.DELIVERED,
                    reason="Legacy delivery completed",
                    cascade=True,
                    shipment_id=order.shipment.id if order.shipment else None,
                )
        elif delivery_status is DeliveryStatus.CANCELLED:
            if order.status in {
                OrderStatus.PENDING,
                OrderStatus.CONFIRMED,
                OrderStatus.PROCESSING,
                OrderStatus.SHIPPED,
            }:
                await self._transition_order_locked(
                    order,
                    actor,
                    OrderStatus.CANCELLED,
                    reason=reason,
                    shipment_id=order.shipment.id if order.shipment else None,
                )

    async def _authorize_order_transition(
        self,
        order: Order,
        actor: LifecycleActor,
        target: OrderStatus,
        *,
        cascade: bool,
    ) -> None:
        if cascade and actor.user_id is None and actor.role is None:
            return
        await self._validate_actor(actor)
        role = actor.role
        if target is OrderStatus.CONFIRMED or target is OrderStatus.PROCESSING:
            if role is UserRole.ADMIN:
                return
            if role is UserRole.FARMER and await self._farmer_owns_order(order.id, actor.user_id):
                return
            if role is UserRole.HUB_STAFF and await self._hub_staff_for_order(order.id, actor.user_id):
                return
            raise LifecyclePermissionError("Only the order's farmer, assigned hub staff, or admin may do this")
        if target is OrderStatus.CANCELLED:
            if role is UserRole.CONSUMER:
                if (
                    order.status in {OrderStatus.PENDING, OrderStatus.CONFIRMED}
                    and self._consumer_cancel(order, actor)
                ):
                    return
                raise LifecyclePermissionError("Only the order's consumer may cancel as a consumer")
            if order.status is OrderStatus.SHIPPED and role is not UserRole.ADMIN:
                raise LifecyclePermissionError("Only an admin may cancel a shipped order")
            if role is UserRole.ADMIN:
                return
            if role is UserRole.FARMER and await self._farmer_owns_order(order.id, actor.user_id):
                return
            if role is UserRole.HUB_STAFF and await self._hub_staff_for_order(order.id, actor.user_id):
                return
            raise LifecyclePermissionError("Only the order's farmer, assigned hub staff, or admin may cancel")
        if target is OrderStatus.COMPLETED:
            if role is UserRole.CONSUMER and self._consumer_cancel(order, actor):
                return
            raise LifecyclePermissionError("Only the order's consumer may confirm receipt")
        if target in {OrderStatus.SHIPPED, OrderStatus.DELIVERED}:
            raise LifecyclePermissionError("This order transition is system-only")
        raise LifecyclePermissionError("Actor is not permitted to update this order")

    async def _authorize_shipment_transition(
        self,
        order: Order,
        shipment: Shipment,
        actor: LifecycleActor,
        target: ShipmentStatus,
        *,
        assigned_rider_user_id: UUID | None,
    ) -> None:
        if order.hub_id is not None and order.hub_id != shipment.hub_id:
            raise LifecyclePermissionError(
                "Shipment hub must match the hub selected at checkout"
            )
        if actor.user_id is None and actor.role is None:
            if target is ShipmentStatus.RIDER_ASSIGNED and shipment.status is ShipmentStatus.READY_FOR_PICKUP:
                await self._rider_id(assigned_rider_user_id)
                return
            if target is ShipmentStatus.READY_FOR_PICKUP and shipment.status is ShipmentStatus.RIDER_ASSIGNED:
                return
            raise LifecyclePermissionError("System actor is not permitted for this shipment transition")
        await self._validate_actor(actor)
        role = actor.role
        if target is ShipmentStatus.RIDER_ASSIGNED:
            if role is UserRole.ADMIN:
                if assigned_rider_user_id is None:
                    raise ValueError("An admin must specify the rider to assign")
                await self._rider_id(assigned_rider_user_id)
                return
            if role is UserRole.RIDER:
                if actor.user_id is None:
                    raise LifecyclePermissionError("Rider identity is required")
                return
            raise LifecyclePermissionError("Only an accepting rider or admin may assign a rider")
        if target is ShipmentStatus.READY_FOR_PICKUP and shipment.status is ShipmentStatus.PACKING:
            if role is UserRole.ADMIN:
                return
            if role is UserRole.FARMER:
                owns_hub_supply = (
                    await self._farmer_supplies_hub_order(
                        order.id, shipment.hub_id, actor.user_id
                    )
                    if order.hub_id is not None
                    else await self._farmer_owns_order(order.id, actor.user_id)
                )
                if owns_hub_supply:
                    return
            if role is UserRole.HUB_STAFF and await self._hub_staff_for_hub(
                shipment.hub_id, actor.user_id
            ):
                return
            raise LifecyclePermissionError("Only the farmer, assigned hub staff, or admin may mark it ready")
        if target is ShipmentStatus.READY_FOR_PICKUP and shipment.status is ShipmentStatus.RIDER_ASSIGNED:
            if role is UserRole.ADMIN:
                return
            raise LifecyclePermissionError("Only an admin may unassign a rider")
        if target is ShipmentStatus.OUT_FOR_DELIVERY and shipment.status is ShipmentStatus.FAILED_DELIVERY:
            if role is UserRole.ADMIN:
                return
            raise LifecyclePermissionError("Only an admin may retry a failed delivery")
        if target in {
            ShipmentStatus.PICKED_UP,
            ShipmentStatus.OUT_FOR_DELIVERY,
            ShipmentStatus.ARRIVED,
            ShipmentStatus.FAILED_DELIVERY,
        }:
            if role is not UserRole.RIDER or not await self._is_assigned_rider(shipment, actor.user_id):
                raise LifecyclePermissionError("Only the assigned rider may update this shipment")
            return
        if target is ShipmentStatus.DELIVERED:
            if role is not UserRole.RIDER or not await self._is_assigned_rider(shipment, actor.user_id):
                raise LifecyclePermissionError("Only the assigned rider may complete delivery")
            return
        if target is ShipmentStatus.RETURNED:
            if role is UserRole.ADMIN:
                return
            if role is UserRole.HUB_STAFF and await self._hub_staff_for_hub(shipment.hub_id, actor.user_id):
                return
            raise LifecyclePermissionError("Only assigned hub staff or admin may return a shipment")
        if target is ShipmentStatus.CANCELLED:
            if role is UserRole.ADMIN:
                return
            if role is UserRole.FARMER and await self._farmer_owns_order(order.id, actor.user_id):
                return
            if role is UserRole.HUB_STAFF and await self._hub_staff_for_hub(shipment.hub_id, actor.user_id):
                return
        raise LifecyclePermissionError("Actor is not permitted to update this shipment")

    async def _authorize_hub_operation(
        self,
        order: Order,
        actor: LifecycleActor,
        hub_id: UUID,
    ) -> None:
        await self._validate_actor(actor)
        if actor.role is UserRole.ADMIN:
            return
        if actor.role is UserRole.FARMER and await self._farmer_owns_order(order.id, actor.user_id):
            return
        if actor.role is UserRole.HUB_STAFF and await self._hub_staff_for_hub(hub_id, actor.user_id):
            return
        raise LifecyclePermissionError("Actor cannot prepare a shipment for this hub")

    async def _refund_on_cancellation(self, order: Order) -> None:
        payment = await self.session.scalar(
            select(Payment).where(Payment.order_id == order.id).with_for_update()
        )
        if payment is None or payment.status not in {
            PaymentStatus.PAID,
            PaymentStatus.SUCCESSFUL,
        }:
            return
        await self._transition_payment_locked(
            order,
            payment,
            LifecycleActor(None, None),
            PaymentStatus.REFUNDED,
            reason="TEST_SANDBOX refund on order cancellation",
            shipment=order.shipment,
        )

    @asynccontextmanager
    async def _transaction(self) -> AsyncGenerator[None, None]:
        if self.session.in_transaction():
            async with self.session.begin_nested():
                yield
            return

        async with self.session.begin():
            yield

    async def _restore_checkout_stock(self, order: Order) -> None:
        if order.stock_restored:
            return
        if order.hub_id is not None:
            await self._release_checkout_reservations(order, restore_committed=True)
            order.stock_restored = True
            return
        items_result = await self.session.execute(
            select(OrderItem).where(OrderItem.order_id == order.id).with_for_update()
        )
        for item in items_result.scalars():
            listing_result = await self.session.execute(
                select(CropListing)
                .where(CropListing.id == item.listing_id)
                .with_for_update()
            )
            listing = listing_result.scalar_one_or_none()
            if listing is None:
                raise LifecycleConflict("Cannot restore stock for a missing listing")
            listing.quantity += item.quantity
            if listing.availability_status is AvailabilityStatus.SOLD_OUT:
                listing.availability_status = AvailabilityStatus.AVAILABLE
        order.stock_restored = True

    async def _commit_checkout_reservations(self, order: Order) -> None:
        reservations_result = await self.session.execute(
            select(StockReservation)
            .where(StockReservation.order_id == order.id)
            .order_by(StockReservation.hub_stock_id)
            .with_for_update()
        )
        reservations = list(reservations_result.scalars())
        if order.hub_id is None or not reservations:
            return
        now = datetime.now(timezone.utc)
        stocks_result = await self.session.execute(
            select(HubStock)
            .where(HubStock.id.in_([reservation.hub_stock_id for reservation in reservations]))
            .order_by(HubStock.id)
            .with_for_update()
        )
        stocks = {stock.id: stock for stock in stocks_result.scalars()}
        for reservation in reservations:
            if reservation.status is not ReservationStatus.HOLD or reservation.expires_at <= now:
                raise LifecycleConflict(
                    "Checkout reservation expired. Please place your order again."
                )
            stock = stocks.get(reservation.hub_stock_id)
            if stock is None or stock.available_quantity < reservation.quantity:
                raise LifecycleConflict("Reserved hub stock is no longer available.")
            stock.available_quantity -= reservation.quantity
            await self._transition_reservation_locked(
                order,
                reservation,
                ReservationStatus.COMMITTED,
                LifecycleActor(None, None),
                "Payment succeeded; hub stock committed",
            )

    async def _release_checkout_reservations(
        self,
        order: Order,
        *,
        restore_committed: bool,
    ) -> None:
        reservations_result = await self.session.execute(
            select(StockReservation)
            .where(StockReservation.order_id == order.id)
            .order_by(StockReservation.hub_stock_id)
            .with_for_update()
        )
        reservations = list(reservations_result.scalars())
        stocks_result = await self.session.execute(
            select(HubStock)
            .where(
                HubStock.id.in_(
                    [reservation.hub_stock_id for reservation in reservations]
                )
            )
            .order_by(HubStock.id)
            .with_for_update()
        ) if reservations else None
        stocks = (
            {stock.id: stock for stock in stocks_result.scalars()}
            if stocks_result is not None
            else {}
        )
        for reservation in reservations:
            if reservation.status is ReservationStatus.HOLD:
                await self._transition_reservation_locked(
                    order,
                    reservation,
                    ReservationStatus.RELEASED,
                    LifecycleActor(None, None),
                    "Payment failed, cancelled, or order cancelled",
                )
            elif (
                restore_committed
                and reservation.status is ReservationStatus.COMMITTED
            ):
                stock = stocks.get(reservation.hub_stock_id)
                if stock is None:
                    raise LifecycleConflict("Cannot restore missing hub stock.")
                stock.available_quantity += reservation.quantity
                await self._transition_reservation_locked(
                    order,
                    reservation,
                    ReservationStatus.RELEASED,
                    LifecycleActor(None, None),
                    "Committed hub stock restored after order cancellation",
                )

    async def _transition_reservation_locked(
        self,
        order: Order,
        reservation: StockReservation,
        target: ReservationStatus,
        actor: LifecycleActor,
        note: str,
    ) -> None:
        current = reservation.status
        try:
            assert_transition(RESERVATION_TRANSITIONS, current, target)
        except ValueError as exc:
            raise LifecycleConflict(str(exc)) from exc
        reservation.status = target
        await self._record_event(
            order,
            actor,
            current.value,
            target.value,
            f"{note} (reservation {reservation.id})",
        )

    async def _release_delivery_slot(self, order: Order) -> None:
        if order.delivery_slot_id is None:
            return
        slot = await self.session.scalar(
            select(DeliverySlot)
            .where(DeliverySlot.id == order.delivery_slot_id)
            .with_for_update()
        )
        if slot is not None and slot.booked_count > 0:
            slot.booked_count -= 1

    async def _notify_order_parties(
        self,
        order: Order,
        actor: LifecycleActor,
        notification_type: NotificationType,
        title: str,
        message: str,
        *,
        shipment_id: UUID | None = None,
    ) -> None:
        user_ids: set[UUID] = set()
        consumer_user_id = await self.session.scalar(
            select(Consumer.user_id).where(Consumer.id == order.consumer_id)
        )
        if consumer_user_id is not None:
            user_ids.add(consumer_user_id)
        farmer_result = await self.session.execute(
            select(Farmer.user_id)
            .join(CropListing, CropListing.farmer_id == Farmer.id)
            .join(OrderItem, OrderItem.listing_id == CropListing.id)
            .where(OrderItem.order_id == order.id)
            .distinct()
        )
        user_ids.update(farmer_result.scalars())
        if shipment_id is not None:
            rider_user_id = await self.session.scalar(
                select(Rider.user_id)
                .join(Shipment, Shipment.rider_id == Rider.id)
                .where(Shipment.id == shipment_id)
            )
            if rider_user_id is not None:
                user_ids.add(rider_user_id)
        if order.hub_id is not None:
            staff_result = await self.session.execute(
                select(HubStaff.user_id).where(HubStaff.hub_id == order.hub_id)
            )
            user_ids.update(staff_result.scalars())
        if actor.user_id is not None:
            user_ids.discard(actor.user_id)
        for user_id in user_ids:
            await self.notifications.stage(
                user_id=user_id,
                notification_type=notification_type,
                title=title,
                message=message,
                related_entity_type="order",
                related_entity_id=order.id,
            )

    async def _record_event(
        self,
        order: Order,
        actor: LifecycleActor,
        from_status: str | None,
        to_status: str,
        reason: str | None,
        *,
        shipment_id: UUID | None = None,
    ) -> None:
        self.session.add(
            OrderEvent(
                order_id=order.id,
                shipment_id=shipment_id,
                actor_user_id=actor.user_id,
                actor_role=actor.role,
                from_status=from_status,
                to_status=to_status,
                note=reason,
            )
        )

    async def _lock_order(self, order_id: UUID) -> Order:
        result = await self.session.execute(
            select(Order)
            .where(Order.id == order_id)
            .options(
                selectinload(Order.items)
                .selectinload(OrderItem.listing)
                .selectinload(CropListing.farmer),
                selectinload(Order.items)
                .selectinload(OrderItem.listing)
                .selectinload(CropListing.crop),
                selectinload(Order.consumer),
                selectinload(Order.payment),
                selectinload(Order.shipment),
            )
            .with_for_update()
            .execution_options(populate_existing=True)
        )
        order = result.scalar_one_or_none()
        if order is None:
            raise LifecycleNotFound("Order not found")
        return order

    async def _validate_actor(self, actor: LifecycleActor) -> None:
        if actor.user_id is None or actor.role is None:
            raise LifecyclePermissionError("An authenticated user actor is required")
        stored_role = await self.session.scalar(
            select(User.role).where(User.id == actor.user_id, User.is_active.is_(True))
        )
        if stored_role != actor.role:
            raise LifecyclePermissionError("Actor role does not match the active user")

    def _consumer_cancel(self, order: Order, actor: LifecycleActor) -> bool:
        return (
            actor.role is UserRole.CONSUMER
            and actor.user_id is not None
            and order.consumer is not None
            and order.consumer.user_id == actor.user_id
        )

    async def _farmer_owns_order(self, order_id: UUID, user_id: UUID) -> bool:
        return (
            await self.session.scalar(
                select(OrderItem.id)
                .join(CropListing, CropListing.id == OrderItem.listing_id)
                .join(Farmer, Farmer.id == CropListing.farmer_id)
                .where(OrderItem.order_id == order_id, Farmer.user_id == user_id)
                .limit(1)
            )
            is not None
        )

    async def _farmer_supplies_hub_order(
        self, order_id: UUID, hub_id: UUID, user_id: UUID
    ) -> bool:
        return (
            await self.session.scalar(
                select(OrderItem.id)
                .join(CropListing, CropListing.id == OrderItem.listing_id)
                .join(Farmer, Farmer.id == CropListing.farmer_id)
                .join(HubStock, HubStock.listing_id == CropListing.id)
                .where(
                    OrderItem.order_id == order_id,
                    Farmer.user_id == user_id,
                    HubStock.hub_id == hub_id,
                )
                .limit(1)
            )
            is not None
        )

    async def _hub_staff_for_order(self, order_id: UUID, user_id: UUID) -> bool:
        return (
            await self.session.scalar(
                select(HubStaff.user_id)
                .where(
                    HubStaff.user_id == user_id,
                    or_(
                        HubStaff.hub_id.in_(
                            select(Shipment.hub_id).where(Shipment.order_id == order_id)
                        ),
                        HubStaff.hub_id.in_(
                            select(HubStock.hub_id)
                            .join(OrderItem, OrderItem.listing_id == HubStock.listing_id)
                            .where(OrderItem.order_id == order_id)
                        ),
                    ),
                )
                .limit(1)
            )
            is not None
        )

    async def _hub_staff_for_hub(self, hub_id: UUID, user_id: UUID) -> bool:
        return (
            await self.session.scalar(
                select(HubStaff.user_id)
                .where(HubStaff.hub_id == hub_id, HubStaff.user_id == user_id)
                .limit(1)
            )
            is not None
        )

    async def _is_assigned_rider(self, shipment: Shipment, user_id: UUID) -> bool:
        return (
            shipment.rider_id is not None
            and await self.session.scalar(
                select(Rider.id).where(
                    Rider.id == shipment.rider_id,
                    Rider.user_id == user_id,
                    Rider.approval_status == RiderApprovalStatus.APPROVED,
                )
            )
            is not None
        )

    async def _rider_id(self, user_id: UUID | None) -> UUID:
        if user_id is None:
            raise ValueError("A rider must be specified")
        rider_id = await self.session.scalar(
            select(Rider.id).where(
                Rider.user_id == user_id,
                Rider.approval_status == RiderApprovalStatus.APPROVED,
            )
        )
        if rider_id is None:
            raise LifecycleNotFound("Rider profile not found")
        return rider_id

    @staticmethod
    def _assert_not_repeat(current, target, entity: str) -> None:
        if current is target:
            raise LifecycleConflict(f"{entity} is already {target.value}")

    @staticmethod
    def _require_reason(reason: str | None, *, required: bool) -> None:
        if required and (reason is None or not reason.strip()):
            raise ValueError("A non-empty reason is required")
