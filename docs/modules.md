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

## 5. AI Crop Species Classification

**Purpose:** Classify uploaded crop produce photos using deep learning to accurately identify produce species without manual data entry.

**APIs:** `POST /api/v1/ai/crop/classify` and `GET /api/v1/ai/crop/supported`.

**Model:** MobileNetV2 Transfer Learning (`crop_classifier_mobilenet_v2.keras`) trained on genuine produce datasets (AFruitDB + high-resolution produce patches) achieving 99.01% validation accuracy across supported produce classes (potato, tomato, onion, apple, mango, papaya). Returns `crop_name`, `category`, `confidence`, `probabilities`, and `prediction_status`. Unrecognized or low-confidence images return `LOW_CONFIDENCE` or `UNSUPPORTED_CROP` rather than guessing or defaulting to an incorrect produce name.

## 6. AI Crop Quality Assessment

**Purpose:** Accept a farmer listing image and evaluate visual grade and defect level using computer vision.

**APIs:** `POST /api/v1/ai/quality/predict` and `GET /api/v1/ai/quality/{prediction_id}`.

**Model:** MobileNetV2 ONNX model (`crop_quality_mobilenet_v2.onnx`) evaluating produce image features to produce visual quality classes (Good / Grade A, Average / Grade B, Poor / Grade C) with normalized confidence probabilities and defect annotations.

## 7. Real APMC Market Price Feed

**Purpose:** Provide authentic agricultural benchmark prices from Agricultural Produce Market Committees (APMC) / Agmarknet (Directorate of Marketing & Inspection, Ministry of Agriculture & Farmers Welfare, Govt of India).

**API:** `GET /api/v1/market-prices/latest?crop={crop}&state={state}&district={district}`.

**Service:** `MarketPriceService` matches commodities hierarchically (District APMC Mandi -> State Mandi Benchmark -> Regional APMC Rate), reporting modal market price, minimum price, maximum price, mandi source, and arrival date.

## 8. AI Fair-Price Recommendation & Batch Valuation

**Purpose:** Produce fair price recommendations and estimate total harvest value from crop species, visual quality grade, available volume, location, and real APMC market prices.

**APIs:** `POST /api/v1/ai/price/predict` and `POST /api/v1/ai/price/estimate`.

**Model:** Multi-variable `RandomForestRegressor` pipeline (`fair_price_model.joblib`, $R^2 = 0.9960$, $MAE = 1.78$ INR) incorporating quality grade premiums (Grade A premium vs Grade C discount), quantity volume brackets, and APMC benchmark rates with ensemble estimator variance for confidence scoring.

## 9. Marketplace and Nearby Farmer Discovery

**Purpose:** Let authenticated consumers browse available listings, inspect crop details, inspect farmer details, and search nearby farmers.

**APIs:** `/api/v1/marketplace/listings`, `/api/v1/marketplace/listings/{listing_id}`, `/api/v1/marketplace/farmers/{farmer_id}`, and `/api/v1/marketplace/farmers/nearby`.

**Data:** Search, filters, sorting, pagination, and location calculations use database data. Farmer and listing coordinates use PostGIS geography points.

## 10. Cart, Order and Payment Management

**Purpose:** Manage consumer carts, server-calculated checkout, order history, farmer order visibility, and sandbox payments.

**APIs:** `/api/v1/cart`, `/api/v1/cart/items`, `/api/v1/orders`, `/api/v1/farmer/orders`, and `/api/v1/payments/test`.

**Rules:** Cart quantities and stock are validated by the server. Order totals and sandbox payment amounts come from persisted order values.

## 11. Delivery/Pickup Management

**Purpose:** Create and track delivery or farmer-pickup fulfillment and enforce status transitions.

**APIs:** `/api/v1/orders/{order_id}/fulfillment` and `/api/v1/orders/{order_id}/fulfillment/status`.

**Roles:** Consumers create fulfillment choices; consumers and farmers can read authorized fulfillment; farmers update fulfillment status.

## 12. Ratings and Reviews

**Purpose:** Allow eligible consumers to review purchased listings and expose listing/farmer review summaries.

**APIs:** `/api/v1/reviews`, `/api/v1/listings/{listing_id}/reviews`, `/api/v1/farmers/{farmer_id}/reviews`, and rating summaries.

**Rules:** Reviews require purchase eligibility, ratings are constrained to 1-5, and duplicate consumer/order/listing reviews are prevented.

## 13. Notification Management

**Purpose:** Create and display user-owned event notifications and manage read state.

**APIs:** `/api/v1/notifications`, `/api/v1/notifications/{notification_id}/read`, and `/api/v1/notifications/read-all`.

**Frontend:** The application displays unread counts, read/unread styling, notification details, and mark-read actions.

## 14. Dashboards and Analytics

**Purpose:** Present real database summaries for farmers, consumers, and administrators.

**APIs:** Farmer dashboard routes, consumer dashboard routes, and admin dashboard routes.

**Data:** Metrics are calculated by backend services from persisted listings, orders, payments, reviews, notifications, and AI prediction records.

## 15. Administration

**Purpose:** Provide admin-only platform visibility and user status management.

**APIs:** `/api/v1/admins/dashboard/summary`, `/api/v1/admins/farmers`, `/consumers`, `/listings`, `/orders`, `/payments`, `/reviews`, `/notifications`, `/categories`, and user status updates.

**Security:** Admin routes require an authenticated user with the ADMIN role.

## 16. AI Crop Classification & In-Memory Pre-Listing Pipeline

**Purpose:** Real-time deep learning crop identification (MobileNetV2 fine-tuned on multi-source produce imagery) and visual quality assessment (MobileNetV2 ONNX) coupled with live APMC mandi pricing and Random Forest fair-price prediction.

**APIs:**
- `POST /api/v1/ai/crop/classify`: In-memory multi-crop classification returning crop name, confidence score, and class probabilities.
- `POST /api/v1/ai/quality/analyze`: In-memory visual quality analysis without database listing dependencies.
- `GET /api/v1/market-prices/latest`: Real APMC / Agmarknet mandi market benchmark price lookup.
- `POST /api/v1/ai/price/estimate`: In-memory machine learning fair price prediction using crop, quality, location, quantity, and APMC benchmark.
- `POST /api/v1/farmers/me/listings`: Farmer-authenticated listing creation and publishing.

**Architectural Invariants:**
- Strict in-memory execution: No draft or intermediate listing is created in the database during photo selection, AI classification, visual quality grading, or quantity edits.
- Only an explicit click on the "Publish Crop" button creates the listing in the PostgreSQL database and attaches the image.
- Double-click prevention on publish button.
- Sub-second warm CPU inference enabled by FastAPI lifespan pre-warming and deterministic CPU session caching.

