from collections.abc import Mapping

from backend.app.models import DeliveryStatus, FulfillmentMethod, OrderStatus


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


def assert_transition(table, current, requested, *, method=None) -> None:
    allowed = table[method] if method is not None else table
    if requested not in allowed.get(current, frozenset()):
        raise ValueError(f"Invalid status transition: {current.value} -> {requested.value}")