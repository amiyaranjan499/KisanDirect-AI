# Test Payments

Step 12 provides a deterministic `TEST_SANDBOX` payment flow only. It does not connect to Razorpay, Stripe, PayPal, banks, cards, UPI, or any real-money system.

## APIs

- `POST /api/v1/payments/test/{order_id}` with `{ "outcome": "success|failed|cancelled" }`
- `GET /api/v1/payments/test/{payment_id}`

The authenticated consumer must own the order. The server reads the order total, allows payment only for pending/confirmed orders, locks the order/payment rows, prevents duplicate successful payments, and updates a pending order to confirmed after a successful test outcome. Failed and cancelled outcomes preserve the order for retry according to the sandbox state.

No payment credentials are collected or stored. Payment records are marked `is_test=true` and `payment_method=TEST_SANDBOX`.
