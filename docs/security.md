# Security

## Authentication

Authentication uses JWT bearer tokens. Passwords are hashed with `pwdlib`/Argon2 and are not stored in plaintext. JWT secrets, database URLs, and other environment-specific values are loaded from `.env` and are not committed or documented.

The login endpoint accepts the JSON frontend contract and the OAuth2 form used by Swagger UI. Protected routes use the shared `get_current_user` dependency.

## Authorization

Role dependencies separate FARMER, CONSUMER, and ADMIN operations. Ownership-sensitive services load records using the authenticated user's identifier. Examples include farmer profiles/listings, consumer carts/orders, payments, notifications, reviews, and AI prediction records.

The backend does not trust a user-supplied owner ID for authenticated self-service routes such as `/farmers/me` and `/consumers/me`.

## Validation

Pydantic schemas validate email, password length, quantities, prices, coordinates, ratings, status values, image input, and request shapes. Database constraints reinforce positive quantities, price/rating ranges, foreign keys, unique ownership relationships, and status-related invariants.

## Orders and Payments

Checkout recalculates order values on the server. Sandbox payment amounts come from persisted orders, and payment ownership is checked. No real card, bank, UPI, CVV, or payment gateway credentials are collected.

## CORS and Runtime

CORS is restricted to the configured local development origins. The default development configuration supports `http://localhost:5173` and `http://127.0.0.1:5173` through application settings. The backend runs locally on `127.0.0.1:8000` by default.

## Notifications and Data Separation

Notifications are queried by authenticated user ownership. Farmer, consumer, and admin dashboards use role-specific dependencies and service queries. Cross-user access is covered by backend tests.

## Operational Limits

This is a development/local application. It does not claim production hardening, external identity management, rate limiting, deployment isolation, or a real payment gateway unless those are added separately.
