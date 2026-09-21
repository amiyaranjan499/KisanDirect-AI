# API Reference

The API is served by FastAPI. The live machine-readable contract is available at `/openapi.json` and Swagger UI at `/docs`. Unless noted otherwise, application routes use the `/api/v1` prefix.

## Authentication

| Method | Endpoint | Auth | Purpose |
|---|---|---|---|
| POST | `/api/v1/auth/register` | Public | Register a user with email, password, and role. |
| POST | `/api/v1/auth/login` | Public | JSON or OAuth2 form login; returns a bearer token. |
| GET | `/api/v1/auth/me` | Authenticated | Return the current active user. |

## Core Route Groups

- Farmer: `/api/v1/farmers/me`, `/api/v1/farmers/me/listings`, and `/api/v1/farmers/dashboard/*`.
- Consumer: `/api/v1/consumers/me` and `/api/v1/consumers/dashboard/*`.
- Marketplace: `/api/v1/marketplace/*`.
- Cart and orders: `/api/v1/cart`, `/api/v1/cart/items`, `/api/v1/orders`, and `/api/v1/farmer/orders`.
- Payments: `/api/v1/payments/test/*`.
- Fulfillment: `/api/v1/orders/{order_id}/fulfillment`.
- Reviews: `/api/v1/reviews`, `/api/v1/listings/{listing_id}/reviews`, and farmer review routes.
- Notifications: `/api/v1/notifications/*`.
- Administration: `/api/v1/admins/*`.
- AI quality: `/api/v1/ai/quality/*`.
- AI price: `/api/v1/ai/price/*`.

Detailed endpoint notes are grouped in the neighboring documents in this directory. The authoritative route contract remains the generated FastAPI OpenAPI document.

## Common Errors

- `401`: missing or invalid bearer token.
- `403`: wrong role or ownership.
- `404`: requested resource or profile does not exist.
- `409`: business conflict such as stock, duplicate review, or payment state.
- `422`: request validation failure.
- `503`: unavailable database or JWT configuration.
