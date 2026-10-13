# Admin Operations

Phase 7 adds operational admin screens under the existing admin shell. There
was no Phase 7 reference screenshot; the rider, hub, staff, and delivery views
reuse the existing admin navigation, panel, table, badge, and responsive layout
patterns.

## Rider oversight

The Riders page displays each real rider's approval status, availability,
active shipment count, and delivered shipment count. Admins can approve pending
riders, suspend approved riders, and reinstate suspended riders. Suspension is
refused while a rider has an active shipment and sets availability to offline.
The rider service continues to enforce approval status when a rider attempts to
go online.

The only allowed approval transitions are:

| Current status | Allowed admin action |
|---|---|
| `PENDING_APPROVAL` | `APPROVED` |
| `APPROVED` | `SUSPENDED` |
| `SUSPENDED` | `APPROVED` |

## Hubs and location

Admins can create and edit hubs, set address, pincode, service radius, and
active status, and inspect current hub-stock quantities plus the latest five
farmer stock deliveries per hub. Hub location is chosen with a one-tap browser
geolocation request or by clicking the Leaflet map. The interface does not
offer latitude/longitude text inputs. When creating a hub, browser location is
used to center the map before the admin can choose or adjust its point.

Hub status changes are limited to `ACTIVE <-> INACTIVE`. Every hub create or
edit is written to `admin_audit_events`.

## Hub staff

There is no public HUB_STAFF registration. Admins create a hub staff account
with an email, an initial password, and a hub assignment, or assign/unassign
existing HUB_STAFF accounts to hubs. The initial password is hashed with the
existing Argon2 helper, is never returned by the API, and is never written to
the audit event. Assignments and account creation are audited.

## Delivery operations

The Delivery page reads actual `Shipment` rows, showing lifecycle status,
assigned rider, hub, ETA window, pickup snapshot, and delivery snapshot.
Admins may reassign only a pre-pickup shipment to an active, approved, available
rider; reassignment is performed through the lifecycle transition service and
requires a reason. Delivered and cancelled shipments are terminal and cannot be
reassigned.

Admin cancellation requires a reason and goes through the shipment lifecycle
transition table. The UI offers cancellation only in cancellable lifecycle
states; the service remains authoritative. The OTP reset action is shown for
locked delivery OTPs and uses the lifecycle service, which records an
`order_events` audit event.

## Auditing and analytics

Hub, rider, hub-staff, and user administration actions use savepoint-backed
service operations and write `admin_audit_events`, including actor, action,
target entity, before/after values where applicable, reason, and timestamp.
Shipment lifecycle changes and OTP resets use `order_events`.

Dashboard delivery metrics are database-derived: active shipments, average
time from the order's `PENDING` event to its `DELIVERED` event, and failed
delivery events. The Analytics range selector is passed to the server; its
active-shipment count, completed-delivery average, and failed-delivery count
use the selected range.

## Access

Admin routers require an authenticated active `ADMIN` account. Services
revalidate the acting admin within the transaction. Target rider, user, hub,
and shipment identifiers identify the object being managed; the actor is
always derived from the authenticated request.
