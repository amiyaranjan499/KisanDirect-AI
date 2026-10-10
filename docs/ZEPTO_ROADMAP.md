# Zepto-Style Quick-Commerce Roadmap

This roadmap describes the approved hub-based direction for KisanDirect AI. It targets local farm produce delivered from a Kisan Hub, generally in a 45-90 minute window or a selected delivery slot. It does not promise ten-minute delivery. Phase 1 introduced the schema and authentication baseline. Phase 2 added the central order lifecycle service and routes existing order, delivery, shipment, and sandbox-payment status changes through it. The project owner confirmed 85 backend tests passed before the current Hub Operations work began.

## Order Lifecycle

1. A farmer submits a stock delivery for one of their listings; assigned hub staff receive it into local hub inventory.
2. A consumer selects one hub's stock by pincode or location. A cart spanning multiple hubs is rejected.
3. Checkout validates prices and quantities on the server, calculates configured fees, and places expiring stock holds under row locks.
4. Checkout validates the destination, reserves stock, and optionally books a capacity-limited slot. Payment success commits the held stock; failure, cancellation, or expiry releases it.
5. Hub staff pick and pack the order, then mark its shipment READY_FOR_PICKUP.
6. An approved rider is assigned, collects the packed order, and updates shipment progress.
7. At the destination the rider records arrival and verifies the consumer's time-limited delivery OTP before marking delivery complete.
8. If delivery fails, the shipment follows an allowed retry/return/cancel path, stock and payment effects are reconciled, and each transition is audited.

Every order, payment, or shipment transition is intended to pass through one service boundary that checks actor role and an allowed-transition table and records an `order_events` row. Endpoints must not write status fields directly.

## Approved Decisions

- Keep existing order enum values. Do not rewrite old migrations; any PostgreSQL enum additions are made in new revisions.
- Shipment statuses are READY_FOR_PICKUP, RIDER_ASSIGNED, PICKED_UP, OUT_FOR_DELIVERY, ARRIVED, DELIVERED, FAILED_DELIVERY, RETURNED, and CANCELLED.
- One hub per checkout. Mixed-hub carts and multi-hub orders are out of scope.
- Reservation states are HOLD, COMMITTED, RELEASED, and EXPIRED.
- Business values belong in `Settings` and environment overrides, not code paths: `HUB_SERVICE_RADIUS_KM=8`, `PACKING_MINUTES=15`, `RIDER_SPEED_KMPH=20`, `DELIVERY_BUFFER_MINUTES=10`, `RESERVATION_TTL_MINUTES=10`, `OTP_TTL_MINUTES=120`, and `OTP_MAX_ATTEMPTS=5`.
- `DELIVERY_FEE` and `PLATFORM_FEE` are Decimal settings, currently defaulting to `0.00`; checkout snapshots and returns the server-calculated fees.
- Public registration is limited to FARMER and CONSUMER. ADMIN and HUB_STAFF are not publicly registerable; RIDER accounts require approval and default to PENDING_APPROVAL.
- Do not edit existing order or delivery data in a way that breaks current API contracts.

## Nine Phases

1. **Data model and roles (complete):** add hub/rider/shipment/slot/reservation/event models, database constraints and indexes, role values, operational settings, and secure password login/registration with configurable throttling.
2. **Transition and audit services (complete; 79 passed before Phase 3):** define allowed order, payment, shipment, and legacy-delivery transitions; enforce actor roles/ownership; lock rows, write order events, and stage notifications in the same transaction; migrate existing status-changing paths through the single service boundary. Shipment state `PACKING` is added by `b7c4d2e9f1a0`.
3. **Hub inventory and checkout (implemented; 85 backend tests confirmed by the project owner before current work):** resolve active hubs within `HUB_SERVICE_RADIUS_KM` using PostGIS, reject unavailable carts, reserve stock transactionally with row locks and expiry, commit/release holds, and calculate configured Decimal fees on the server. Farmer delivery submissions and staff receipt now populate hub stock; reconciliation and broader stock management remain future operational work.
4. **Delivery windows and promises (checkout foundation implemented; verification pending):** return capacity-backed future slots, protect booking counts transactionally, and calculate promised windows using configured packing, rider-speed, and buffer values. Broader slot administration remains future work.
5. **Hub operations (current implementation):** farmers submit listing quantities for delivery to an active hub; assigned hub staff receive each delivery exactly once into `hub_stock`. Staff can see their hub's incoming deliveries and PROCESSING orders, start packing through `OrderLifecycleService.create_shipment`, and mark PACKING shipments ready through `transition_shipment`. Hub access is enforced server-side and shipment/order changes are audited. Hub/staff provisioning and broader inventory reconciliation remain future work.
6. **Rider onboarding and dispatch:** add approval controls, rider availability/location updates, eligibility checks, assignment, and location retention/privacy rules.
7. **Shipment execution and proof:** implement pickup, transit, arrival, OTP verification/expiry/attempt limits, failed-delivery and return paths, notifications, and payment/stock reconciliation.
8. **Role-based user experiences:** consumer hub/slot checkout and Farmer/Hub Staff stock and packing screens are implemented in their separate role folders; consumer order tracking and rider workflow remain future work.
9. **Admin operations and release hardening:** provide audited read/manage operations over real platform data, operational monitoring, retention/access controls, deployment configuration, migration rehearsal, and end-to-end verification.

## Risks and Controls

- **PostgreSQL enums:** a newly added value cannot be used before its enum alteration commits. Keep enum additions in new Alembic revisions and separate the role-label operation from use of those labels.
- **Legacy delivery compatibility:** `Delivery` remains the API-facing one-to-one model while `Shipment` is introduced alongside it. Define a deliberate migration/adapter policy before routing reads or writes through shipment state.
- **Inventory divergence:** hub checkout uses `hub_stock` as its reservable stock authority; crop-listing quantity remains marketplace/cart availability metadata. Hub intake/reconciliation must keep hub stock populated and consistent.
- **Concurrent booking:** reservation and slot counters must be protected in the same database transaction with row locks and database constraints; background expiry must be idempotent.
- **Authorization:** role values alone do not grant an operational workflow. Verify hub membership, rider approval, ownership, and actor permissions in services for every state change.
- **OTP and location privacy:** store OTP hashes rather than plaintext, enforce expiry/attempt limits, minimize rider-location access and retention, and never log secrets or OTP values.
- **Rate-limit topology:** Phase 1's in-process auth limiter does not coordinate across workers/instances. Production deployment needs a shared backend or edge rate limiting.
- **Fees and money:** use Decimal/Numeric throughout; fees default to zero until product values are approved and applied server-side.
- **Old generated accounts:** numeric `@kisan.direct` addresses are candidates for manual review only; do not bulk-delete or silently convert them.
