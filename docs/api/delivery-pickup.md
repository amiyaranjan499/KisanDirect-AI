# Delivery and Farmer Pickup

Step 13 adds fulfillment to eligible paid orders.

- `POST /api/v1/orders/{order_id}/fulfillment`
- `GET /api/v1/orders/{order_id}/fulfillment`
- `PATCH /api/v1/orders/{order_id}/fulfillment/status`

Consumers choose `DELIVERY` with a validated address or `FARMER_PICKUP`, which reuses the real PostGIS farmer location. Consumers can read only their own fulfillment. Farmers can update fulfillment only for orders containing their listings.

Delivery status progression is `PENDING -> CONFIRMED -> OUT_FOR_DELIVERY -> DELIVERED`. Pickup progression is `PENDING -> CONFIRMED -> READY -> PICKED_UP`. Invalid transitions, duplicate fulfillment, cancelled/completed orders, missing addresses, unavailable pickup locations, and unauthorized access are rejected. No external logistics service or tracking is implemented.
