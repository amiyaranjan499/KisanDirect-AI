# Rider Operations

## Signup and approval

Public registration accepts the `RIDER` role through the existing rate-limited
registration endpoint. Registration creates a rider profile with
`PENDING_APPROVAL` approval status and `OFFLINE` availability. An administrator
approval workflow is not part of this phase. The rider API checks approval
status server-side before availability changes, offer polling or response,
shipment access, and location writes. Pending and suspended accounts cannot
perform those operations.

## Offers and assignment

When hub staff mark a shipment `READY_FOR_PICKUP`, the dispatch service selects
the nearest approved, active, `AVAILABLE` rider with a recorded location. The
distance is calculated from that rider's latest PostGIS geography point to the
shipment hub. One rider receives an offer at a time; previous recipients are
not offered the same shipment again. The offer expires after
`RIDER_OFFER_TIMEOUT_SECONDS` (default `60`). Declining advances immediately.
Expired offers are advanced when an online rider polls for offers; offer polling
occurs every six seconds in the rider app. This application does not currently
run a separate background worker for offer expiry.

Accepting an offer locks the shipment inside a savepoint-backed transaction,
then calls `OrderLifecycleService.transition_shipment` to perform the audited
`READY_FOR_PICKUP` to `RIDER_ASSIGNED` transition. The accepted rider becomes
`BUSY`; shipment progress can only be changed by the authenticated assigned
rider through the lifecycle service. The offer record is scoped to the rider
who received it, and repeated or stale accepts are rejected.

## Location privacy and GPS

The rider app requests coordinates only through the browser Geolocation API.
There are no manually entered or inferred coordinates. While an approved rider
is online or has an active delivery, location updates are posted no more often
than every seven seconds. The server accepts updates only for the authenticated
rider's own profile while that rider is not offline, stores them in
`rider_locations`, and updates `riders.last_seen_at`.

Location rows are used for nearest-rider dispatch. Rider location history is not
exposed through the rider API. A denied browser permission produces an in-app
message and retry action; the app does not fabricate a fallback location.

## Delivery progress and Phase 6 boundary

The active delivery view links to the hub pickup address in an external maps
search and uses lifecycle transitions for `PICKED_UP`, `OUT_FOR_DELIVERY`, and
`ARRIVED`. For COD orders, the rider records cash collection through the
existing lifecycle service before using the OTP entry field. The OTP endpoint
intentionally responds `501` with “OTP verification is not available until
Phase 6”; it does not store or validate the submitted code. Shipment delivery
completion remains unavailable until Phase 6.

The rider history contains only shipments that are actually `DELIVERED`. The
history reports a delivery count; earnings remain unconfigured and no amount is
estimated.

## Interface

No rider reference screenshot was provided. The mobile-first pages reuse the
existing application frame, green theme, panel, button, loading, empty, and
bottom-navigation patterns rather than introducing a separate visual system.
