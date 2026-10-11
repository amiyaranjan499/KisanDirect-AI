# OTP Delivery Confirmation and Tracking

## OTP lifecycle

When a shipment enters `OUT_FOR_DELIVERY`, the lifecycle service generates a
six-digit numeric code using a cryptographically secure random source. Only a
salted PBKDF2-HMAC-SHA256 hash is written to `shipments.delivery_otp_hash`;
`otp_expires_at`, `otp_attempts`, and `otp_consumed_at` track its validity.
The plaintext is placed in an in-app notification for the owning consumer and
is available in that consumer's authenticated tracking response while the code
is valid. It is not sent by SMS, returned to a rider, or written to an order
event or application log.

The rider submits the code while the shipment is out for delivery or arrived.
Verification locks the order and
shipment rows, checks the assigned rider, shipment state, expiry, attempt
limit, and consumed state, then invokes the lifecycle service's internal
OTP-verified delivery transition. Public shipment transitions cannot set
`DELIVERED`.

The configured lockout choice is a permanent lock for that code after
`OTP_MAX_ATTEMPTS` failed submissions. A generic error response is used for
wrong, expired, and locked codes; an already delivered shipment is rejected by
the shipment state check. Failed attempts are saved before
the generic HTTP error response is returned. An authenticated admin can reset
only a locked, not-yet-delivered shipment by posting a non-empty reason to
`POST /api/v1/admins/shipments/{shipment_id}/otp-reset`. The lifecycle service
issues a new code to the owning consumer, clears attempts, and writes an
`OTP_RESET` order event containing the reason and admin identity. The action
does not expose the new code to the admin.

## Tracking and location

`GET /api/v1/orders/{order_id}/tracking` returns the order/shipment event
timeline, delivery promise, pickup and destination points, rider name/vehicle,
and a latest rider point only when it is no older than
`RIDER_LOCATION_STALE_SECONDS` (default 30). The consumer screen polls every
seven seconds. If the latest rider point is stale or absent, the UI says the
location is unavailable and does not reuse an older marker. Hub and destination
points come from the persisted order/hub records; rider coordinates come only
from browser Geolocation posts.

## Access matrix

| Actor | Timeline | Delivery OTP | Rider location | Addresses, rider name/vehicle, promise |
|---|---|---|---|---|
| Owning consumer | Yes | Yes, while valid | Yes, while fresh | Yes |
| Assigned rider | Yes | No | Yes, while fresh | No, through this tracking endpoint |
| Farmer with an order listing | Yes | No | No | No |
| Staff assigned to the shipment hub | Yes | No | No | No |
| Admin | Yes | No | Yes, while fresh | Yes |
| Uninvolved user / another consumer | No | No | No | No |

The rider's active-delivery endpoint remains the operational source for
pickup/drop-off instructions. Tracking access does not grant shipment update
permissions.

New rider registrations can supply a display name, which is stored on the rider
profile and shown to the owning consumer. Existing profiles without a display
name are labeled "Delivery rider" rather than exposing the account email.

## Reviews and cancellation

The consumer tracking screen exposes cancellation only while the order is
`PENDING` or `CONFIRMED`; the request still passes through the order lifecycle
service. After `DELIVERED`, the screen links to each purchased listing's
existing review panel. The review service remains authoritative for purchase
eligibility.
