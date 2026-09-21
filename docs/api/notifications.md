# Notifications API

- `GET /api/v1/notifications`: list notifications owned by the authenticated user.
- `GET /api/v1/notifications/{notification_id}`: retrieve one owned notification.
- `PATCH /api/v1/notifications/{notification_id}/read`: mark one notification read.
- `POST /api/v1/notifications/read-all`: mark all current-user notifications read.
- `POST /api/v1/notifications/test-create`: existing notification test event.

Notification ownership is derived from the authenticated user. The frontend displays unread counts and read state.
