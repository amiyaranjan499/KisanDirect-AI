from collections.abc import Mapping

from backend.app.models import (
    DeliveryStatus,
    FulfillmentMethod,
    OrderStatus,
    PaymentStatus,
    ShipmentStatus,
)

ORDER_TRANSITIONS: Mapping[OrderStatus, frozenset[OrderStatus]] = {
    OrderStatus.PENDING: frozenset({OrderStatus.CONFIRMED, OrderStatus.CANCELLED}),
    OrderStatus.CONFIRMED: frozenset({OrderStatus.PROCESSING, OrderStatus.CANCELLED}),
    OrderStatus.PROCESSING: frozenset({OrderStatus.SHIPPED, OrderStatus.CANCELLED}),
    OrderStatus.SHIPPED: frozenset({OrderStatus.DELIVERED, OrderStatus.CANCELLED}),
    OrderStatus.DELIVERED: frozenset({OrderStatus.COMPLETED}),
    OrderStatus.COMPLETED: frozenset(),
    OrderStatus.CANCELLED: frozenset(),
}

DELIVERY_TRANSITIONS: Mapping[FulfillmentMethod, Mapping[DeliveryStatus, frozenset[DeliveryStatus]]] = {
    FulfillmentMethod.DELIVERY: {
        DeliveryStatus.PENDING: frozenset({DeliveryStatus.CONFIRMED, DeliveryStatus.CANCELLED}),
        DeliveryStatus.CONFIRMED: frozenset({DeliveryStatus.OUT_FOR_DELIVERY, DeliveryStatus.CANCELLED}),
        DeliveryStatus.OUT_FOR_DELIVERY: frozenset({DeliveryStatus.DELIVERED}),
    },
    FulfillmentMethod.FARMER_PICKUP: {
        DeliveryStatus.PENDING: frozenset({DeliveryStatus.CONFIRMED, DeliveryStatus.CANCELLED}),
        DeliveryStatus.CONFIRMED: frozenset({DeliveryStatus.READY, DeliveryStatus.CANCELLED}),
        DeliveryStatus.READY: frozenset({DeliveryStatus.PICKED_UP}),
    },
}

SHIPMENT_TRANSITIONS: Mapping[ShipmentStatus, frozenset[ShipmentStatus]] = {
    ShipmentStatus.PACKING: frozenset(
        {ShipmentStatus.READY_FOR_PICKUP, ShipmentStatus.CANCELLED}
    ),
    ShipmentStatus.READY_FOR_PICKUP: frozenset(
        {ShipmentStatus.RIDER_ASSIGNED, ShipmentStatus.CANCELLED}
    ),
    ShipmentStatus.RIDER_ASSIGNED: frozenset(
        {
            ShipmentStatus.READY_FOR_PICKUP,
            ShipmentStatus.PICKED_UP,
            ShipmentStatus.CANCELLED,
        }
    ),
    ShipmentStatus.PICKED_UP: frozenset({ShipmentStatus.OUT_FOR_DELIVERY}),
    ShipmentStatus.OUT_FOR_DELIVERY: frozenset(
        {ShipmentStatus.ARRIVED, ShipmentStatus.FAILED_DELIVERY}
    ),
    ShipmentStatus.ARRIVED: frozenset(
        {ShipmentStatus.DELIVERED, ShipmentStatus.FAILED_DELIVERY}
    ),
    ShipmentStatus.FAILED_DELIVERY: frozenset(
        {ShipmentStatus.RETURNED, ShipmentStatus.OUT_FOR_DELIVERY}
    ),
    ShipmentStatus.DELIVERED: frozenset(),
    ShipmentStatus.RETURNED: frozenset(),
    ShipmentStatus.CANCELLED: frozenset(),
}

PAYMENT_TRANSITIONS: Mapping[PaymentStatus, frozenset[PaymentStatus]] = {
    PaymentStatus.PENDING: frozenset(
        {
            PaymentStatus.PAID,
            PaymentStatus.SUCCESSFUL,
            PaymentStatus.FAILED,
            PaymentStatus.CANCELLED,
        }
    ),
    PaymentStatus.PAID: frozenset({PaymentStatus.REFUNDED}),
    PaymentStatus.SUCCESSFUL: frozenset({PaymentStatus.REFUNDED}),
    PaymentStatus.FAILED: frozenset(),
    PaymentStatus.CANCELLED: frozenset(),
    PaymentStatus.REFUNDED: frozenset(),
}


def assert_transition(table, current, requested, *, method=None) -> None:
    allowed = table[method] if method is not None else table
    if requested not in allowed.get(current, frozenset()):
        raise ValueError(f"Invalid status transition: {current.value} -> {requested.value}")