# Hub-Aware Checkout, Reservations, and ETA

## Checkout contract

1. The consumer grants browser location access. Coordinates are sent for the
   current checkout request and saved only as an order destination snapshot;
   they are not added to the consumer profile.
2. `GET /api/v1/checkout/options` uses PostGIS distance and
   `HUB_SERVICE_RADIUS_KM` to return active servicing hubs, availability for
   every cart item at each hub, server-calculated prices/fees, ETA ranges, and
   future slots with remaining capacity. An empty `hubs` list means the
   location is outside service range.
3. `POST /api/v1/orders` accepts `hub_id`, `latitude`, `longitude`, `address`,
   and an optional `delivery_slot_id`. It never accepts price or total fields
   as authoritative inputs. The server snapshots listing prices and configured
   fees.
4. A cart must be fulfillable entirely from the selected hub. The request
   returns a conflict naming unavailable items when it is not.

## Stock and payment lifecycle

Checkout locks each selected `hub_stock` row with `SELECT ... FOR UPDATE`,
subtracts unexpired HOLD quantities from available stock, then creates one
HOLD reservation per order/listing-stock row. The hold expires after
`RESERVATION_TTL_MINUTES`. The physical `hub_stock.available_quantity` is not
decremented while payment is pending.

- Sandbox payment success changes each HOLD to COMMITTED and decrements the
  corresponding physical hub stock in the same transaction.
- Sandbox failure or cancellation changes HOLD reservations to RELEASED,
  cancels the checkout order through the lifecycle service, frees any selected
  slot, and does not change physical stock.
- Consumer/operator order cancellation releases holds. If stock was committed,
  the same lifecycle service restores it and marks the reservation RELEASED.
- Expiry changes HOLD to EXPIRED, cancels an unpaid checkout order through the
  lifecycle service, and releases its slot capacity.

Reservation state changes are constrained by `RESERVATION_TRANSITIONS` and
recorded as `order_events`. Payment, order, reservation, and slot changes share
the lifecycle service's savepoint when the caller owns a transaction, or a
service-owned transaction otherwise.

## Expiry operation

Run the included idempotent management command periodically using the
application's configured Python environment:

```powershell
python -m backend.app.expire_reservations
```

Schedule this command (for example, every minute) with Windows Task Scheduler
or the deployment platform's scheduler. A management command was selected
instead of adding an in-process scheduler dependency: it does not create
duplicate workers when the API is scaled to multiple processes, and the
database row locks make concurrent invocations safe. The command prints only
the number of reservations expired.

Expired holds are excluded from checkout availability even before the next
sweep. The sweep is still required to persist EXPIRED states, cancel the stale
order, release its slot, and write audit events.

## Fees and promised time

Amounts use `Decimal` in Python and `Numeric(12, 2)` in PostgreSQL:

```text
subtotal = sum(round_to_cents(current_listing_price * cart_quantity))
total = subtotal + DELIVERY_FEE + PLATFORM_FEE
```

The client displays the amounts from the options/order response and submits no
amount values. Existing order totals are migrated into `subtotal`; historical
delivery/platform fees are zero.

For ASAP fulfillment, distance is the PostGIS hub-to-checkout-point distance:

```text
travel_minutes = ceil(distance_km / RIDER_SPEED_KMPH * 60)
eta_min_minutes = PACKING_MINUTES + travel_minutes
eta_max_minutes = eta_min_minutes + DELIVERY_BUFFER_MINUTES
```

The order stores the corresponding absolute promise timestamps. Selecting a
future delivery slot atomically increments its `booked_count` and snapshots
the slot's start/end as the order promise instead. Checkout re-locks and
revalidates capacity so concurrent requests cannot oversell a slot.

## Fulfillment destination consistency

The checkout address and coordinates are stored on the order, not on the
consumer profile. When the consumer later creates the API-facing delivery
fulfillment, the service requires the address to match the checkout snapshot
and supplies the stored coordinates and selected slot time. Hub checkout
orders cannot switch to farmer pickup after reserving hub stock.
