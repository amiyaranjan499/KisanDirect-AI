# Administration API

Admin-only routes use the `/api/v1/admins` prefix:

- `GET /api/v1/admins/dashboard/summary`
- `GET /api/v1/admins/farmers`
- `GET /api/v1/admins/consumers`
- `GET /api/v1/admins/listings`
- `GET /api/v1/admins/orders`
- `GET /api/v1/admins/payments`
- `GET /api/v1/admins/reviews`
- `GET /api/v1/admins/notifications`
- `GET /api/v1/admins/categories`
- `PATCH /api/v1/admins/users/{user_id}/status`

Every route requires an authenticated ADMIN role. Dashboard values come from database queries.
