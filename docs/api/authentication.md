# Authentication API

- `POST /api/v1/auth/register`: creates a user and initializes a FARMER, CONSUMER, or RIDER profile. RIDER accounts start with `PENDING_APPROVAL`; ADMIN and HUB_STAFF are not publicly registerable.
- `POST /api/v1/auth/login`: accepts the frontend JSON contract and Swagger OAuth2 form data; returns a JWT bearer token.
- `GET /api/v1/auth/me`: returns the active authenticated user.

Passwords are validated and hashed server-side. Protected routes use JWT decoding plus role and ownership checks. See [security](../security.md) for the implementation boundaries.
