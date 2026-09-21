# Modules

## 1. Authentication and User Management

**Purpose:** Register users, authenticate credentials, issue JWT access tokens, and expose the current user.

**Roles:** FARMER, CONSUMER, and ADMIN.

**APIs:** `POST /api/v1/auth/register`, `POST /api/v1/auth/login`, `GET /api/v1/auth/me`.

**Security:** Passwords are hashed with `pwdlib`/Argon2. JWT claims contain the subject, role, type, issued-at time, and expiry. Protected dependencies load the active user from the token.

## 2. Farmer Management

**Purpose:** Manage the authenticated farmer profile, listings, images, farmer orders, fulfillment, dashboard metrics, reviews, and AI summaries.

**APIs:** `/api/v1/farmers/me`, `/api/v1/farmers/me/listings`, and `/api/v1/farmers/dashboard/*`.

**Frontend:** Farmer profile and dashboard views use real API responses. Farmer ownership is derived from the JWT user rather than a submitted farmer ID.

## 3. Consumer Management

**Purpose:** Manage the authenticated consumer profile and consumer dashboard information.

**APIs:** `/api/v1/consumers/me` and `/api/v1/consumers/dashboard/*`.

**Frontend:** Consumer dashboard, cart/orders view, marketplace, reviews, and notifications use bearer-authenticated requests.

## 4. Crop Listing Management

**Purpose:** Create, update, deactivate, and attach validated images to farmer-owned listings.

**APIs:** `/api/v1/farmers/me/listings` and `/api/v1/farmers/me/listings/{listing_id}/images`.

**Validation:** Quantities must be positive, prices cannot be negative, and images are limited to validated JPEG, PNG, and WebP uploads.

## 5. AI Crop Quality Assessment

**Purpose:** Accept a farmer listing image and persist a quality prediction record.

**API:** `POST /api/v1/ai/quality/predict` and `GET /api/v1/ai/quality/{prediction_id}`.

**Current behavior:** The inference boundary explicitly returns `MODEL_UNAVAILABLE` with null label and confidence when no trained model artifact is configured.

## 6. AI Fair-Price Recommendation

**Purpose:** Produce and persist a price prediction record from listing and query features.

**API:** `POST /api/v1/ai/price/predict` and `GET /api/v1/ai/price/{prediction_id}`.

**Current behavior:** The price inference boundary explicitly returns `MODEL_UNAVAILABLE` with null prediction and confidence when no trained artifact is configured.

## 7. Marketplace and Nearby Farmer Discovery

**Purpose:** Let authenticated consumers browse available listings, inspect crop details, inspect farmer details, and search nearby farmers.

**APIs:** `/api/v1/marketplace/listings`, `/api/v1/marketplace/listings/{listing_id}`, `/api/v1/marketplace/farmers/{farmer_id}`, and `/api/v1/marketplace/farmers/nearby`.

**Data:** Search, filters, sorting, pagination, and location calculations use database data. Farmer and listing coordinates use PostGIS geography points.

## 8. Cart, Order and Payment Management

**Purpose:** Manage consumer carts, server-calculated checkout, order history, farmer order visibility, and sandbox payments.

**APIs:** `/api/v1/cart`, `/api/v1/cart/items`, `/api/v1/orders`, `/api/v1/farmer/orders`, and `/api/v1/payments/test`.

**Rules:** Cart quantities and stock are validated by the server. Order totals and sandbox payment amounts come from persisted order values.

## 9. Delivery/Pickup Management

**Purpose:** Create and track delivery or farmer-pickup fulfillment and enforce status transitions.

**APIs:** `/api/v1/orders/{order_id}/fulfillment` and `/api/v1/orders/{order_id}/fulfillment/status`.

**Roles:** Consumers create fulfillment choices; consumers and farmers can read authorized fulfillment; farmers update fulfillment status.

## 10. Ratings and Reviews

**Purpose:** Allow eligible consumers to review purchased listings and expose listing/farmer review summaries.

**APIs:** `/api/v1/reviews`, `/api/v1/listings/{listing_id}/reviews`, `/api/v1/farmers/{farmer_id}/reviews`, and rating summaries.

**Rules:** Reviews require purchase eligibility, ratings are constrained to 1-5, and duplicate consumer/order/listing reviews are prevented.

## 11. Notification Management

**Purpose:** Create and display user-owned event notifications and manage read state.

**APIs:** `/api/v1/notifications`, `/api/v1/notifications/{notification_id}/read`, and `/api/v1/notifications/read-all`.

**Frontend:** The application displays unread counts, read/unread styling, notification details, and mark-read actions.

## 12. Dashboards and Analytics

**Purpose:** Present real database summaries for farmers, consumers, and administrators.

**APIs:** Farmer dashboard routes, consumer dashboard routes, and admin dashboard routes.

**Data:** Metrics are calculated by backend services from persisted listings, orders, payments, reviews, notifications, and AI prediction records.

## 13. Administration

**Purpose:** Provide admin-only platform visibility and user status management.

**APIs:** `/api/v1/admins/dashboard/summary`, `/api/v1/admins/farmers`, `/consumers`, `/listings`, `/orders`, `/payments`, `/reviews`, `/notifications`, `/categories`, and user status updates.

**Security:** Admin routes require an authenticated user with the ADMIN role.
