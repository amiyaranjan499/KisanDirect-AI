# Current-State Analysis

This snapshot reflects the repository after the Phase 1 schema and authentication changes. It describes implemented code separately from work that is only planned. The new schema migration is `a6f3c9d8e2b1`; it applies cleanly to a fresh database.

## Implemented Baseline

- The existing application has farmer, consumer, and admin workflows, with PostgreSQL/PostGIS persistence, JWT authentication, Argon2 password hashing, and a one-to-one `orders` to `deliveries` relationship.
- The original `UserRole` values were FARMER, CONSUMER, and ADMIN. The Phase 1 model/migration adds RIDER and HUB_STAFF, but does not add rider/hub APIs or screens. Public registration remains limited to FARMER and CONSUMER; rider records default to PENDING_APPROVAL.
- New schema models cover hubs, hub staff, hub stock, riders and locations, delivery slots, shipments, stock reservations, and order events. Their presence does not imply checkout or fulfillment uses them yet.
- `Shipment` is a separate one-to-one record on `Order`, alongside the existing one-to-one `Delivery`. Existing endpoints, API schemas, and service logic continue using `Delivery`; Phase 1 does not dual-write or reinterpret existing delivery records. A later phase must explicitly choose how old delivery data maps to shipment lifecycle and avoid conflicting status sources.

## Remaining Functional Gaps

- `OrdersRepository.checkout` locks the cart, validates each existing crop listing, decrements `crop_listings.quantity` immediately, and creates order lines in one transaction. It does not reserve `hub_stock`, hold stock until payment, or enforce one hub per cart.
- `stock_reservations` and `hub_stock` are schema-only. No hold, commit, release, expiry worker, or hub stock reconciliation logic exists yet.
- Order, legacy delivery, shipment, and payment status changes now go through `OrderLifecycleService`; successful transitions write `order_events` and stage notifications in the same transaction. Phase 2 implementation is pending the owner's backend verification run.
- Legacy `Delivery` remains the API-facing fulfillment record. Its farmer delivery/pickup statuses map to aggregate order transitions through an audited compatibility cascade; it does not create a `Shipment`.
- New shipments begin in `PACKING` (migration `b7c4d2e9f1a0`), then can become `READY_FOR_PICKUP`; shipment delivery requires the internal OTP-verified path, which has no endpoint yet.
- The current platform fee and delivery fee are not included in checkout totals. `DELIVERY_FEE` and `PLATFORM_FEE` are now Decimal Settings with zero defaults for later use; checkout does not apply them.
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

- The migration `a6f3c9d8e2b1` applies cleanly on a fresh database; the duplicate GiST index issue has been fixed.
- The backend suite passes: 66 passed, 0 failed (confirmed by the user after the migration and test assertion fixes).
- The frontend production build passes with `npm run build`; the API wrapper exports required by admin analytics and consumer payment methods are present.
- Phase 2 adds migration `b7c4d2e9f1a0` for the initial shipment `PACKING` state. Apply this revision and rerun the backend suite with the isolated `TEST_DATABASE_URL` before considering Phase 2 verified.

See [order-lifecycle.md](./order-lifecycle.md) for transition rules, permissions,
legacy delivery mapping, and the lifecycle diagram.
