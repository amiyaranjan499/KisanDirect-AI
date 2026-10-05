# Current-State Analysis

This snapshot reflects the repository after the Phase 3 checkout implementation. Phase 3 adds migration `c4e8f2a1b6d9`; apply it before running backend tests or using hub-aware checkout.

## Implemented Baseline

- The existing application has farmer, consumer, and admin workflows, with PostgreSQL/PostGIS persistence, JWT authentication, Argon2 password hashing, and a one-to-one `orders` to `deliveries` relationship.
- The original `UserRole` values were FARMER, CONSUMER, and ADMIN. The Phase 1 model/migration adds RIDER and HUB_STAFF, but does not add rider/hub APIs or screens. Public registration remains limited to FARMER and CONSUMER; rider records default to PENDING_APPROVAL.
- Hub stock, capacity-backed delivery slots, and reservations are now used by checkout. The destination is saved on the order, not the consumer profile, and reused when delivery fulfillment is created.
- `Shipment` is a separate one-to-one record on `Order`, alongside the existing one-to-one `Delivery`. Existing endpoints, API schemas, and service logic continue using `Delivery`; Phase 1 does not dual-write or reinterpret existing delivery records. A later phase must explicitly choose how old delivery data maps to shipment lifecycle and avoid conflicting status sources.

## Remaining Functional Gaps

- Checkout options resolve active hubs within `HUB_SERVICE_RADIUS_KM` using PostGIS and show hub stock, server-calculated fees, ETA, and future slots. Checkout locks the cart, matching `hub_stock` rows, and selected slot; every cart item must be available from the one selected hub.
- `OrderLifecycleService` creates HOLD reservations. Sandbox success commits the reservation and decrements hub stock; payment failure/cancellation releases holds. Expired holds are handled by `python -m backend.app.expire_reservations`, intended for a periodic OS scheduler.
- Order, legacy delivery, shipment, payment, and reservation transitions use `OrderLifecycleService`; successful state changes write `order_events` and stage notifications in the same transaction. The owner-confirmed pre-Phase-3 backend baseline was 79 passed; the changed Phase 3 suite still requires verification.
- Legacy `Delivery` remains the API-facing fulfillment record. Its farmer delivery/pickup statuses map to aggregate order transitions through an audited compatibility cascade; it does not create a `Shipment`.
- New shipments begin in `PACKING` (migration `b7c4d2e9f1a0`), then can become `READY_FOR_PICKUP`; shipment delivery requires the internal OTP-verified path, which has no endpoint yet.
- Delivery and platform fees use Decimal settings (`DELIVERY_FEE`, `PLATFORM_FEE`) and are included in server-computed order totals.
- Checkout ETA uses `PACKING_MINUTES + ceil(distance_km / RIDER_SPEED_KMPH * 60)` as the minimum, plus `DELIVERY_BUFFER_MINUTES` for the maximum. A selected slot replaces the calculated timestamp promise.
- The existing `Delivery` model stores fulfillment method, recipient/address fields, coordinates, schedule, and tracking reference. It does not represent hub assignment, rider assignment, staged shipment timestamps, or delivery OTP verification.

## Authentication and Roles

- Login now accepts the supplied email and password and returns an authentication error on failure; it no longer creates an account or retries with a generated password.
- Registration uses the existing password-required API, which hashes passwords with Argon2. The frontend has an explicit `/register` route. Registration does not accept ADMIN, HUB_STAFF, or RIDER.
- Login and registration have a configurable per-IP, in-process request limit. Defaults are five requests per 60 seconds. The limiter is local to each application process; a multi-worker or multi-instance deployment will need a shared rate-limit store or gateway policy.
- No OTP login or shipment OTP verification flow is implemented. Shipment OTP columns are storage only.

Old suspected auto-registered accounts can be reviewed without changing them using this read-only PostgreSQL query:

```sql
SELECT id, email, role, is_active, created_at
FROM users
WHERE email ~ '^[0-9]+@kisan[.]direct$'
ORDER BY created_at, email;
```

Review the returned accounts before deciding what to do. This phase does not delete or modify any account.

## Verification

- Before Phase 3 edits, the project owner confirmed 79 passed, 0 failed. Phase 3 verification has not yet been run.
- Phase 3 migration and tests require verification against the isolated `TEST_DATABASE_URL`; the frontend build is also pending.

See [order-lifecycle.md](./order-lifecycle.md) for transition rules, permissions,
legacy delivery mapping, and the lifecycle diagram.
See [checkout-reservations.md](./checkout-reservations.md) for stock holds,
fees, ETA calculations, slots, and the expiry command.
