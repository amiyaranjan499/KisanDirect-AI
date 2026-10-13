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
- `GET /api/v1/admins/riders`
- `PATCH /api/v1/admins/riders/{rider_id}/approval`
- `GET /api/v1/admins/hubs`
- `POST /api/v1/admins/hubs`
- `PATCH /api/v1/admins/hubs/{hub_id}`
- `GET /api/v1/admins/hub-staff`
- `POST /api/v1/admins/hub-staff`
- `POST /api/v1/admins/hub-staff/assignments`
- `DELETE /api/v1/admins/hub-staff/{user_id}/assignments/{hub_id}`
- `GET /api/v1/admins/shipments`
- `POST /api/v1/admins/shipments/{shipment_id}/reassign`
- `POST /api/v1/admins/shipments/{shipment_id}/cancel`
- `POST /api/v1/admins/shipments/{shipment_id}/otp-reset`

Every route requires an authenticated ADMIN role. Dashboard and analytics values come from database queries; the analytics `range` query parameter filters delivery metrics server-side.

Hub create/update bodies contain the hub fields and `latitude`/`longitude`; the admin UI obtains these coordinates through browser geolocation or map selection, not manual text fields. `service_radius_km` is a decimal quantity. Hub responses include current hub stock and recent real farmer stock deliveries.

Rider approval accepts `PENDING_APPROVAL -> APPROVED -> SUSPENDED -> APPROVED` transitions and rejects suspension while the rider has active shipments. HUB_STAFF creation is admin-only and accepts `email`, `initial_password`, and `hub_id`; passwords are never included in responses or audit records.

Shipment reassignment requires an approved, active, available rider and a non-empty reason. Cancellation requires a reason and is limited by the shipment lifecycle transition table. OTP reset delegates to the lifecycle service and succeeds only for a locked OTP. All writes are transactional savepoint operations. Hub, rider, staff, and user changes write `admin_audit_events`; shipment state changes write `order_events`.

For the operations matrix and retention/audit details, see [Admin Operations](../ADMIN_OPERATIONS.md).
