# Authentication API

- `POST /api/v1/auth/register`: creates a user and initializes the matching FARMER or CONSUMER profile.
- `POST /api/v1/auth/login`: accepts the frontend JSON contract and Swagger OAuth2 form data; returns a JWT bearer token.
- `GET /api/v1/auth/me`: returns the active authenticated user.

Passwords are validated and hashed server-side. Protected routes use JWT decoding plus role and ownership checks. See [security](../security.md) for the implementation boundaries.
