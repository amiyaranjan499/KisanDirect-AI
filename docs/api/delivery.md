# Delivery and Pickup API

- `POST /api/v1/orders/{order_id}/fulfillment`: consumer chooses DELIVERY or FARMER_PICKUP.
- `GET /api/v1/orders/{order_id}/fulfillment`: authorized consumer or farmer reads fulfillment.
- `PATCH /api/v1/orders/{order_id}/fulfillment/status`: authorized farmer updates fulfillment status.

Delivery and pickup use the existing status transition rules. Pickup uses the farmer's stored PostGIS location when available. The current API also supports structured delivery snapshot fields on fulfillment records.
