# Cart and Orders API

## Cart

- `GET /api/v1/cart`
- `POST /api/v1/cart/items`
- `PATCH /api/v1/cart/items/{item_id}`
- `DELETE /api/v1/cart/items/{item_id}`
- `DELETE /api/v1/cart`

Cart operations derive ownership from the authenticated consumer. Listing availability, stock, minimum order quantity, and current price are read from PostgreSQL. Client totals are never trusted.

## Orders

- `GET /api/v1/checkout/options?latitude={latitude}&longitude={longitude}`
- `POST /api/v1/orders`
- `GET /api/v1/orders`
- `GET /api/v1/farmer/orders`
- `GET /api/v1/orders/{order_id}`
- `PATCH /api/v1/orders/{order_id}/status`

Checkout options use PostGIS to list active hubs in the configured service radius, show hub stock availability and capacity-backed future slots, and return the server subtotal, fee breakdown, total, and calculated ETA. A cart must be wholly available at the selected hub.

`POST /api/v1/orders` requires the selected hub, checkout latitude/longitude, delivery address, and optional slot ID. It does not accept client amounts. The service locks the cart, matching `hub_stock` rows, and selected slot in one transaction; it creates order snapshots and expiring HOLD reservations and clears the cart. Insufficient stock, an unserviceable destination, or a full/invalid slot rejects checkout atomically.

See [checkout reservations and ETA](../checkout-reservations.md) for payment, expiry, and pricing behavior.

Consumers can view and cancel their own PENDING or CONFIRMED orders, and confirm receipt after delivery. Farmers can view orders containing their listings, confirm them, begin processing, and cancel with a reason. Order status changes are checked by `OrderLifecycleService`; each successful transition is locked, audited in `order_events`, and has its notifications staged in the same transaction. Shipment-driven `SHIPPED` and `DELIVERED` aggregate transitions are system-only cascades. See [order lifecycle](../order-lifecycle.md).
