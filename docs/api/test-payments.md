# Test Payments

Step 12 provides a deterministic `TEST_SANDBOX` payment flow only. It does not connect to Razorpay, Stripe, PayPal, banks, cards, UPI, or any real-money system.

## APIs

- `POST /api/v1/payments/test/{order_id}` with `{ "outcome": "success|failed|cancelled" }`
- `GET /api/v1/payments/test/{payment_id}`

The authenticated consumer must own the order. The server reads the order total, allows payment only for pending/confirmed orders, locks the order/payment rows, prevents duplicate successful payments, and records the transition through `OrderLifecycleService`. A successful payment does not confirm the order; order confirmation is performed by an authorized farmer, assigned hub staff, or admin. Failed and cancelled payment rows are terminal and cannot be retried in place.

The API retains the `successful` status value as the legacy `PAID` mapping. The legacy `cancelled` outcome is recorded as `PaymentStatus.CANCELLED`. No payment credentials are collected or stored. Payment records are marked `is_test=true` and `payment_method=TEST_SANDBOX`. Refunds are only state changes on TEST_SANDBOX records; no gateway or real-money refund is connected.
