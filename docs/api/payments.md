# Payment API

The project implements a deterministic sandbox payment flow only:

- `POST /api/v1/payments/test/{order_id}` with a success, failed, or cancelled outcome.
- `GET /api/v1/payments/test/{payment_id}` for an owned sandbox payment.

The server owns the payment amount and checks consumer ownership, order state, and duplicate successful payments. No real payment gateway or financial credentials are used. See [test-payments](test-payments.md).
