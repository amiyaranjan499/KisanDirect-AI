# User Workflows

## Farmer Workflow

1. Register with the `FARMER` role.
2. Log in and receive a JWT.
3. Open the farmer profile and update supported profile fields.
4. Create and manage crop listings.
5. Upload listing images and request AI quality or fair-price predictions (honestly reports `MODEL_UNAVAILABLE` when model artifacts are absent).
6. Publish available listings to the consumer marketplace.
7. Submit stock deliveries for owned listings to local active Kisan Hubs (`/farmer/orders`).
8. View incoming consumer orders containing the farmer's listings.
9. Confirm or complete order status where permitted.
10. Manage delivery or farmer-pickup fulfillment status.
11. Receive event notifications and review feedback.
12. View dashboard summaries, listing data, sales analytics, reviews, and AI records.

All farmer-owned operations use the authenticated JWT user and service-level ownership checks.

## Consumer Workflow

1. Register with the `CONSUMER` role.
2. Log in and receive a JWT.
3. Browse marketplace listings and apply search, filters, category selection, and pagination.
4. Discover nearby farmers with interactive Leaflet map and radius search.
5. Open crop and farmer detail views.
6. Add items to cart and adjust quantities within minimum order quantity and stock limits.
7. Proceed to checkout: select active serving Kisan Hub, choose standard (45–90 min) or scheduled delivery slot, provide delivery address.
8. Server places row-locked hub stock reservation and creates order.
9. Execute `TEST_SANDBOX` payment (or Cash on Delivery).
10. Live-track shipment with auto-refreshing 7s timeline, Leaflet map with fresh rider location marker, and in-app delivery OTP code.
11. Provide 6-digit delivery OTP to rider upon physical arrival.
12. Confirm receipt and submit verified reviews for purchased crops.
13. View consumer dashboard summaries, purchase history, reviews, and notifications.

## Hub Staff Workflow

1. Authenticate using credentials created by an administrator (public registration disabled).
2. Open `/hub-staff/operations`.
3. Select assigned Kisan Hub.
4. Inspect incoming farmer stock deliveries and click **Receive delivery** to increment local inventory idempotently.
5. View orders ready to pack, click **Start packing** to create `PACKING` shipment.
6. Assemble order and click **Mark ready for pickup** to transition shipment to `READY_FOR_PICKUP` and cascade order to `SHIPPED`.

## Rider Workflow

1. Register with the `RIDER` role (starts in `PENDING_APPROVAL` and `OFFLINE`).
2. Await administrator approval.
3. Once approved, log in and toggle **Go online** (`/rider/dashboard`), granting browser Geolocation permission.
4. Background polling queries nearest available shipments (`RIDER_OFFER_TIMEOUT_SECONDS`).
5. Accept sequential offer $\to$ transitions shipment to `RIDER_ASSIGNED` and sets rider status to `BUSY`.
6. Navigate to hub, click **Confirm pickup from hub** $\to$ transitions to `PICKED_UP`.
7. Click **Start delivery to customer** $\to$ transitions to `OUT_FOR_DELIVERY` (triggers cryptographically hashed OTP creation for consumer).
8. Click **Mark arrived at destination** $\to$ transitions to `ARRIVED`.
9. For COD orders, collect cash and click **Record cash collected**.
10. Enter consumer's 6-digit OTP code and click **Verify OTP & Complete Delivery**. Transitions shipment to `DELIVERED` and rider availability returns to `AVAILABLE`.
11. View completed delivery count and history on `/rider/history`.

## Admin Workflow

1. Authenticate as an `ADMIN` user created via interactive bootstrap (`scripts/create_admin.py`).
2. Open the admin dashboard (`/admin/dashboard`) and range-filtered analytics (`/admin/analytics`).
3. Manage users: toggle consumer/farmer active status (`/admin/users`).
4. Rider operations: approve pending riders, suspend active riders, reinstate suspended riders with audit reasons (`/admin/riders`).
5. Hub operations: create and edit Kisan Hubs using browser location or interactive map pins (`/admin/hubs`).
6. Hub staff management: provision hub staff accounts with initial passwords and assign/unassign to hubs (`/admin/hub-staff`).
7. Delivery oversight: reassign unpicked shipments to active riders, cancel cancellable shipments, or reset locked delivery OTPs (`/admin/delivery`).
8. Review listings, orders, payments, reviews, and categories.

All admin state-changing operations are audited via `admin_audit_events` or `order_events`.

## AI Workflow

A farmer selects an owned listing and submits an image or price query. The API validates ownership and input, calls the inference boundary, persists the prediction record, and returns its status. When no trained model artifact is configured, the response honestly reports `MODEL_UNAVAILABLE` rather than fabricating a result.
