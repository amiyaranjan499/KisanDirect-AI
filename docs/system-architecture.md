# System Architecture

## Overview

KisanDirect AI is a React/Vite frontend backed by a FastAPI REST API. The API uses SQLAlchemy's asynchronous PostgreSQL integration, PostGIS geography fields for locations, and Alembic for schema migrations. AI inference is isolated behind service and inference boundaries so unavailable models are represented explicitly rather than replaced with fabricated predictions.

## Layers

```text
React/Vite frontend
    |
    | fetch API client with bearer token
    v
FastAPI routers and dependencies
    |
    | JWT decoding and role checks
    v
Application services
    |
    | validation, ownership, transactions, orchestration
    v
Repositories and SQLAlchemy async sessions
    |
    v
PostgreSQL + PostGIS
```

The backend follows a router -> service -> repository structure. Routers define HTTP contracts and dependency checks. Services contain workflow rules. Repositories contain database access. Pydantic schemas define request and response validation.

## Authentication Flow

1. A user registers through `POST /api/v1/auth/register`.
2. The user logs in through `POST /api/v1/auth/login` using JSON or the OAuth2 form used by Swagger UI.
3. The API returns a JWT access token.
4. The frontend stores the token in local storage for the current application session and sends it as a bearer header.
5. `get_current_user` decodes the token and loads the active user.
6. Role-specific dependencies enforce farmer, consumer, or admin access.

## Frontend Integration

The frontend entry point is `frontend/src/main.jsx`. The central API wrapper is `frontend/src/lib/api/client.js`. It resolves the API base URL from `VITE_API_BASE_URL`, defaults to `http://127.0.0.1:8000`, adds the bearer token, handles JSON responses, and leaves multipart boundaries to the browser for image uploads.

The main application view is coordinated by `frontend/src/app/App.jsx`. Existing views include authentication, marketplace, nearby farmers, cart/orders, farmer profile/dashboard, consumer dashboard, notifications, reviews, and admin dashboard. Leaflet and React Leaflet provide the nearby-farmer map.

## Data Flow

A normal marketplace request follows this path:

```text
Marketplace UI -> client.js -> FastAPI marketplace router
-> authentication dependency -> ConsumerService
-> ConsumerRepository -> PostgreSQL/PostGIS -> response schema -> UI
```

A quality prediction follows this path:

```text
Uploaded image -> quality router -> image validation/storage
-> quality service -> quality inference boundary
-> prediction record -> response schema -> farmer dashboard/UI
```

A price prediction follows the same service boundary using listing and query features. Both inference boundaries currently report model-unavailable status when no trained artifact is configured.

## Payments and Fulfillment

Payments are intentionally limited to the `TEST_SANDBOX` flow. The server derives the payment amount from the order and prevents duplicate successful payments. Fulfillment supports delivery and farmer pickup, with consumer creation, shared visibility, and farmer-controlled status updates.

## Runtime

On Windows, the canonical backend runner is:

```powershell
.\venv\Scripts\python.exe -m backend.run
```

The runner selects a selector event loop factory compatible with psycopg asynchronous mode.
