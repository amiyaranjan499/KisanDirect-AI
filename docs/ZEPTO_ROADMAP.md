# Zepto-Style Quick-Commerce Roadmap

This roadmap describes the approved hub-based direction for KisanDirect AI. It targets local farm produce delivered from a Kisan Hub, generally in a 45-90 minute window or a selected delivery slot. It does not promise ten-minute delivery. Phase 1 introduces the schema and authentication baseline; later phases must make that schema operational through the service layer.

## Order Lifecycle

1. A farmer listing is reviewed and eligible produce is received or allocated to a local hub.
2. A consumer selects one hub's stock by pincode or location. A cart spanning multiple hubs is rejected.
3. Checkout validates prices and quantities on the server, calculates configured fees, and places expiring stock holds under row locks.
4. The consumer pays or selects an available hub delivery slot. A successful checkout commits its reservation; failure, cancellation, or expiry releases it.
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
- `DELIVERY_FEE` and `PLATFORM_FEE` are Decimal settings, currently defaulting to `0.00` because the existing checkout has no fee calculation.
- Public registration is limited to FARMER and CONSUMER. ADMIN and HUB_STAFF are not publicly registerable; RIDER accounts require approval and default to PENDING_APPROVAL.
- Do not edit existing order or delivery data in a way that breaks current API contracts.

## Nine Phases

1. **Data model and roles (current):** add hub/rider/shipment/slot/reservation/event models, database constraints and indexes, role values, operational settings, and secure password login/registration with configurable throttling. No checkout or transition wiring.
2. **Transition and audit services:** define allowed order, payment, and shipment transitions; enforce actor roles/ownership; write order events; migrate existing state-change paths through the single service boundary.
3. **Hub inventory and checkout:** establish listing-to-hub stock intake/reconciliation, reject mixed-hub carts, reserve stock transactionally with row locks and expiry, commit/release holds, and calculate configured Decimal fees on the server.
4. **Delivery windows and promises:** create/query capacity-backed slots, protect booking counts transactionally, and calculate promised windows using configured packing, rider-speed, radius, and buffer values.
5. **Hub operations:** implement hub and staff provisioning/authorization, pick lists, packing workflow, and shipment readiness without bypassing transition/audit rules.
6. **Rider onboarding and dispatch:** add approval controls, rider availability/location updates, eligibility checks, assignment, and location retention/privacy rules.
7. **Shipment execution and proof:** implement pickup, transit, arrival, OTP verification/expiry/attempt limits, failed-delivery and return paths, notifications, and payment/stock reconciliation.
8. **Role-based user experiences:** build consumer hub/slot checkout and order tracking, hub-staff operations, and rider workflow in separate frontend role folders with loading, empty, and error states and translated UI strings.
9. **Admin operations and release hardening:** provide audited read/manage operations over real platform data, operational monitoring, retention/access controls, deployment configuration, migration rehearsal, and end-to-end verification.

## Risks and Controls

- **PostgreSQL enums:** a newly added value cannot be used before its enum alteration commits. Keep enum additions in new Alembic revisions and separate the role-label operation from use of those labels.
- **Legacy delivery compatibility:** `Delivery` remains the API-facing one-to-one model while `Shipment` is introduced alongside it. Define a deliberate migration/adapter policy before routing reads or writes through shipment state.
- **Inventory divergence:** current checkout consumes crop-listing quantity immediately, while future checkout must use hub stock and reservations. Define ownership and reconciliation before enabling both quantities as stock authorities.
- **Concurrent booking:** reservation and slot counters must be protected in the same database transaction with row locks and database constraints; background expiry must be idempotent.
- **Authorization:** role values alone do not grant an operational workflow. Verify hub membership, rider approval, ownership, and actor permissions in services for every state change.
- **OTP and location privacy:** store OTP hashes rather than plaintext, enforce expiry/attempt limits, minimize rider-location access and retention, and never log secrets or OTP values.
- **Rate-limit topology:** Phase 1's in-process auth limiter does not coordinate across workers/instances. Production deployment needs a shared backend or edge rate limiting.
- **Fees and money:** use Decimal/Numeric throughout; fees default to zero until product values are approved and applied server-side.
- **Old generated accounts:** numeric `@kisan.direct` addresses are candidates for manual review only; do not bulk-delete or silently convert them.
