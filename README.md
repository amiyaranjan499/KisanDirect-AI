# KisanDirect AI

## AI-Based Direct Farmer-to-Consumer Crop Selling Platform

KisanDirect AI is a Phase-I web application that connects farmers and consumers through a database-backed crop marketplace. It provides authenticated role-specific workflows for farmer listings, consumer purchasing, administration, delivery/pickup, notifications, and reviews.

The system addresses the gap between farm production and consumer access by giving farmers a direct listing and order workflow. Consumers can browse real listings, search by location, manage a cart, place orders, use the deterministic sandbox payment flow, choose fulfillment, and review eligible purchases. AI integration is represented by explicit crop-quality and fair-price inference boundaries; when trained model artifacts are unavailable, the API reports `MODEL_UNAVAILABLE` rather than fabricating predictions.

## Implemented Features

- JWT authentication and FARMER/CONSUMER/ADMIN role-based access control
- Farmer registration, profile, listings, images, orders, fulfillment, notifications, and dashboard
- Consumer registration, profile, marketplace, nearby farmer search, cart, orders, reviews, notifications, and dashboard
- AI crop quality assessment boundary with image validation and prediction history
- AI fair-price recommendation boundary with persisted prediction history
- PostgreSQL/PostGIS marketplace and location-aware search
- Server-validated cart, checkout, stock, totals, and order ownership
- `TEST_SANDBOX` payment flow only; no real payment gateway is connected
- Delivery and farmer-pickup fulfillment
- Ratings and reviews with purchase eligibility checks
- User-owned notifications and read-state management
- Admin dashboard with platform summaries and user status management
- Responsive React/Vite frontend with role-aware navigation

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

Start with the [documentation index](docs/README.md). It includes architecture, modules, APIs, database, AI limitations, workflows, security, testing, setup, project structure, technology stack, limitations, and future enhancements.

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

This repository documents and verifies the implemented Phase-I system. It does not claim production deployment, trained AI performance, real payment processing, or final demonstration materials.
