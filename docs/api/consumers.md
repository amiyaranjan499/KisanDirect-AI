# Consumer API

Consumer profile and dashboard routes are under `/api/v1/consumers`.

- `GET/PUT /api/v1/consumers/me`: read or update the authenticated consumer profile.
- `GET /api/v1/consumers/dashboard/summary`: totals and recent activity.
- `GET /api/v1/consumers/dashboard/orders`: dashboard order summaries.
- `GET /api/v1/consumers/dashboard/purchase-history`: purchase history.
- `GET /api/v1/consumers/dashboard/cart-summary`: cart summary.
- `GET /api/v1/consumers/dashboard/reviews`: consumer reviews.
- `GET /api/v1/consumers/dashboard/notifications`: notification summary.

Routes require the CONSUMER role and derive ownership from the JWT user.
