# KisanDirect AI

## Hub-Based Farm Produce Quick Commerce

KisanDirect AI connects farmers, Kisan Hubs, and consumers through a database-backed farm produce marketplace and delivery workflow. It provides authenticated role-specific workflows for farmer listings, consumer purchasing and tracking, rider delivery, hub operations, administration, notifications, and reviews.

The system addresses the gap between farm production and consumer access by giving farmers a direct listing and order workflow. Consumers can browse real listings, search by location, manage a cart, place orders, use the deterministic sandbox payment flow, choose fulfillment, and review eligible purchases. AI integration is represented by explicit crop-quality and fair-price inference boundaries; when trained model artifacts are unavailable, the API reports `MODEL_UNAVAILABLE` rather than fabricating predictions.

## Implemented Features

- JWT authentication for FARMER/CONSUMER/RIDER/ADMIN workflows, with public ADMIN and HUB_STAFF registration disabled; rider accounts begin pending approval
- Password-based login and registration with configurable per-IP throttling; OTP login is not implemented
- Farmer registration, profile, listings, images, orders, fulfillment, notifications, and dashboard
- Consumer registration, profile, marketplace, nearby farmer search, cart, orders, reviews, notifications, and dashboard
- AI crop quality assessment boundary with image validation and prediction history
- AI fair-price recommendation boundary with persisted prediction history
- PostgreSQL/PostGIS marketplace and location-aware search
- Server-priced, PostGIS hub-aware checkout with row-locked hub-stock reservations, capacity-backed delivery slots, and calculated ETA windows
- Farmer-to-hub stock delivery submissions with idempotent, hub-staff-confirmed inventory receipt and audited hub packing/readiness operations
- Approval-gated rider availability, nearest-rider offers with configurable timeouts, audited shipment pickup/progress, browser GPS sharing, and completed-delivery history
- Consumer order-event tracking with fresh rider-location polling, consumer-only in-app delivery OTP, lifecycle-gated OTP confirmation, lockout, and audited admin reset
- Order destination, fee, and ETA snapshots; reservation commit, release, and expiry lifecycle
- `TEST_SANDBOX` payment flow only; no real payment gateway is connected
- Legacy delivery and farmer-pickup fulfillment; hub checkout keeps the delivery destination and slot from its order snapshot
- Ratings and reviews with purchase eligibility checks
- User-owned notifications and read-state management
- Admin dashboard and range-filtered delivery analytics backed by shipments and lifecycle events
- Admin rider approval/suspension, hub setup and stock/delivery visibility, admin-created hub staff assignments, shipment reassignment/cancellation, and OTP-lockout reset; non-shipment admin changes are recorded in `admin_audit_events`
- Responsive React/Vite frontend with role-aware navigation

Checkout location is requested from the browser for an individual order and is
not stored in the consumer profile. Expired holds are swept with
`python -m backend.app.expire_reservations`; see
[checkout reservations and ETA](docs/checkout-reservations.md).

## Technology

- Frontend: React, React DOM, Vite, JavaScript, CSS, Leaflet, React Leaflet
- Backend: Python, FastAPI, Uvicorn, Pydantic, SQLAlchemy async ORM
- Database: PostgreSQL, PostGIS, GeoAlchemy2, Alembic
- Security: JWT bearer tokens, Argon2 password hashing, role and ownership checks
- AI: Python inference boundaries, Pillow image handling, persisted prediction records

## Run Locally

### Backend

From the repository root, configure `backend/.env` from `backend/.env.example`, apply migrations, and start the canonical Windows-safe runner:

```powershell
cd backend
$env:PYTHONPATH='..'
..\venv\Scripts\python.exe -m alembic upgrade head
cd ..
.\venv\Scripts\python.exe -m backend.run
```

The API runs at `http://127.0.0.1:8000`. Health is available at `/health`; Swagger UI is available at `/docs`.

To create an administrator, run the interactive bootstrap after configuring `backend/.env` and applying migrations:

```powershell
python scripts/create_admin.py
```

Demo data can be loaded idempotently with `python scripts/seed_data.py`. Demo credentials are for local development only and must be changed before shared use.

Rider dispatch timeout is configured by `RIDER_OFFER_TIMEOUT_SECONDS` (default
`60`); tracking hides rider positions older than
`RIDER_LOCATION_STALE_SECONDS` (default `30`). Riders register with role
`RIDER`, remain pending until approval, and share only browser-provided
location while online or on an active delivery.
See [rider operations](docs/RIDER_OPERATIONS.md) and
[OTP delivery confirmation and tracking](docs/OTP_AND_TRACKING.md).
Admin operational flows and their audit rules are documented in
[Admin Operations](docs/ADMIN_OPERATIONS.md).

Sandbox payments and test notification creation are enabled by default only in `development` and `test`. Set `ENABLE_SANDBOX_PAYMENTS=false` to disable them; production rejects the setting when it is true.

### Frontend

In a second terminal:

```powershell
cd frontend
npm install
npm run dev
```

The frontend normally runs at `http://localhost:5173` and uses `http://127.0.0.1:8000` as its local API base URL.

## Verify

Backend tests require an isolated `TEST_DATABASE_URL`. It must be set, must be migrated, and must differ from `DATABASE_URL`:

```powershell
$env:DATABASE_URL='postgresql+psycopg://user:password@localhost:5432/kisandirect'
$env:TEST_DATABASE_URL='postgresql+psycopg://user:password@localhost:5432/kisandirect_test'
```

```powershell
cd backend
$env:PYTHONPATH='..'
..\venv\Scripts\python.exe -m pytest -q
cd ..
.\venv\Scripts\python.exe -m compileall -q backend
cd frontend
npm run build
```

## Documentation

Start with the [documentation index](docs/README.md). It includes architecture, modules, APIs, database, AI limitations, workflows, security, testing, setup, project structure, technology stack, limitations, future enhancements, and the [End-to-End Manual Testing Guide](docs/E2E_MANUAL_TEST.md).

## Release Archive

From a Git checkout, create a tracked-source archive with:

```powershell
python scripts/make_release_zip.py
```

The archive is generated from `git archive` and excludes environment files, virtual environments, `node_modules`, and uploaded media.

## Known Issues

- Payment processing is still a deterministic test sandbox; no live payment gateway is connected.
- AI predictions report unavailable status when trained model artifacts are not installed.
- Release archive creation requires running from a Git checkout.
- The local test database must be available for the backend integration tests.

## Scope

This repository implements and verifies the complete hub-based quick-commerce platform across all roles (Farmer, Consumer, Hub Staff, Rider, Admin). Backend test coverage spans 105 passed tests, and frontend production builds pass cleanly. For step-by-step role verification, consult [End-to-End Manual Testing Guide](docs/E2E_MANUAL_TEST.md). The project does not claim production deployment, trained AI performance, real payment processing, or external SMS gateway integration.
