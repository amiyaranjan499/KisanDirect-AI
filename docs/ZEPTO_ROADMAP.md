# Zepto-Style Quick-Commerce Roadmap

This roadmap describes the approved hub-based direction for KisanDirect AI. It targets local farm produce delivered from a Kisan Hub, generally in a 45-90 minute window or a selected delivery slot. It does not promise ten-minute delivery. Phases 1-4 established the schema, lifecycle, checkout, delivery windows, and hub operations. Phase 5 adds rider onboarding and dispatch; Phase 6 adds consumer tracking and OTP confirmation. The project owner confirmed 92 backend tests passed before Phase 6.

## Order Lifecycle

1. A farmer submits a stock delivery for one of their listings; assigned hub staff receive it into local hub inventory.
2. A consumer selects one hub's stock by pincode or location. A cart spanning multiple hubs is rejected.
3. Checkout validates prices and quantities on the server, calculates configured fees, and places expiring stock holds under row locks.
4. Checkout validates the destination, reserves stock, and optionally books a capacity-limited slot. Payment success commits the held stock; failure, cancellation, or expiry releases it.
5. Hub staff pick and pack the order, then mark its shipment READY_FOR_PICKUP.
6. An approved rider receives the nearest-rider offer, accepts the shipment, collects it, and updates pickup/transit/arrival progress.
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
- Delivery OTP codes expire after `OTP_TTL_MINUTES` (default 120) and lock after `OTP_MAX_ATTEMPTS` (default 5). Rider location is unavailable to tracking consumers after `RIDER_LOCATION_STALE_SECONDS` (default 30).
- Public registration supports FARMER, CONSUMER, and RIDER. ADMIN and HUB_STAFF are not publicly registerable; RIDER accounts default to PENDING_APPROVAL.
- Do not edit existing order or delivery data in a way that breaks current API contracts.

## Nine Phases

1. **Data model and roles (complete):** add hub/rider/shipment/slot/reservation/event models, database constraints and indexes, role values, operational settings, and secure password login/registration with configurable throttling.
2. **Transition and audit services (complete; 79 passed before Phase 3):** define allowed order, payment, shipment, and legacy-delivery transitions; enforce actor roles/ownership; lock rows, write order events, and stage notifications in the same transaction; migrate existing status-changing paths through the single service boundary. Shipment state `PACKING` is added by `b7c4d2e9f1a0`.
3. **Hub inventory and checkout (implemented; 85 backend tests confirmed by the project owner before current work):** resolve active hubs within `HUB_SERVICE_RADIUS_KM` using PostGIS, reject unavailable carts, reserve stock transactionally with row locks and expiry, commit/release holds, and calculate configured Decimal fees on the server. Farmer delivery submissions and staff receipt now populate hub stock; reconciliation and broader stock management remain future operational work.
4. **Delivery windows and promises (checkout foundation implemented; verification pending):** return capacity-backed future slots, protect booking counts transactionally, and calculate promised windows using configured packing, rider-speed, and buffer values. Broader slot administration remains future work.
5. **Rider onboarding and dispatch (implemented):** existing registration creates a pending rider profile; server-side approval gates availability, offers, location, and shipment access. Dispatch offers each ready shipment to the nearest available approved rider using PostGIS and an expiring, sequential offer. Accept uses the lifecycle service and row locks. The mobile-first rider app shares browser GPS, advances shipment through arrival, and shows completed deliveries without invented earnings. Offer expiry advances on rider offer polling; a background worker is not included. See [Rider Operations](./RIDER_OPERATIONS.md).
6. **Consumer live tracking and OTP delivery confirmation (implemented; verification pending):** consumer-scoped OTP notification and tracking, hashed/expiring codes, rider verification through the lifecycle service, lockout and audited admin reset, role-scoped event/location access, and polling map/timeline. See [OTP and Tracking](./OTP_AND_TRACKING.md).
7. **Admin operations:** add approval controls and audited read/manage operations over real platform data, including users, farmers, listings, orders, payments, delivery, reviews, and analytics.
8. **Consumer and Farmer completion:** remaining Farmer workflows, all within their role-specific UI areas.
9. **Release hardening:** operational monitoring, location retention/access controls, deployment configuration, migration rehearsal, and end-to-end verification.

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
