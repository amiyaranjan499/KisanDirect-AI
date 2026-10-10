# Farmer-to-Hub Stock and Hub Operations

Farmers can submit a stock-delivery record for one of their crop listings and an active Kisan Hub. Submitting the record does not change hub inventory. The record starts in `PENDING`; only hub staff assigned to that hub can receive it.

Receiving is an idempotent service transition (`PENDING` to `RECEIVED`). In one database transaction it locks the delivery row, verifies the staff assignment, increments or creates the corresponding `hub_stock` row, and records the receiving staff user and timestamp. A repeated receive request returns the existing receipt without incrementing stock again. The stock increment uses PostgreSQL's unique `(hub_id, listing_id)` constraint to serialize concurrent deliveries.

Hub staff can view pending deliveries, orders in `PROCESSING` that were checked out from their hub, and that hub's shipments in `PACKING`. Starting packing calls `OrderLifecycleService.create_shipment`; marking a shipment ready calls `OrderLifecycleService.transition_shipment`. The lifecycle service writes `order_events` and cascades `READY_FOR_PICKUP` to order `SHIPPED`. The API also checks hub-staff assignment, and the lifecycle service checks the shipment/order hub relationship. A farmer can mark a hub shipment ready only when they own an order listing stocked at that shipment's hub. Legacy farmer-pickup delivery continues to use the existing fulfillment flow.

## API operations

- `GET /api/v1/hub-operations/farmer/hubs`: list active hubs a farmer may select.
- `POST /api/v1/hub-operations/farmer/stock-deliveries`: submit a positive Decimal quantity against a listing owned by the authenticated farmer.
- `GET /api/v1/hub-operations/farmer/stock-deliveries`: view that farmer's own delivery records.
- `GET /api/v1/hub-operations/hub-staff/hubs`: list assigned hubs.
- `GET /api/v1/hub-operations/hub-staff/hubs/{hub_id}/overview`: view pending receipts, eligible orders, and packing shipments for an assigned hub.
- `POST /api/v1/hub-operations/hub-staff/hubs/{hub_id}/stock-deliveries/{delivery_id}/receive`: receive a pending supply record.
- `POST /api/v1/hub-operations/hub-staff/hubs/{hub_id}/orders/{order_id}/start-packing`: create a PACKING shipment for a PROCESSING order at the selected hub.
- `POST /api/v1/hub-operations/hub-staff/hubs/{hub_id}/shipments/{shipment_id}/ready`: mark a packing shipment READY_FOR_PICKUP through the lifecycle service.

The `d9e5f1a8c3b2` Alembic revision adds the auditable `hub_stock_deliveries` table. Apply migrations before deploying these endpoints. The Hub Staff screen follows existing farmer table/button styles; there was no design reference screenshot for this screen.
