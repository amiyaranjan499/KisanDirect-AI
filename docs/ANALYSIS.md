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
- There is no `order_events` table write in the order or delivery paths. Phase 1 adds the table/model only; state changes are not yet audited there.
- Existing order transitions use `OrderStatus` and the separate legacy order service/repository logic. Shipment statuses are new and are not wired into those transitions.
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
