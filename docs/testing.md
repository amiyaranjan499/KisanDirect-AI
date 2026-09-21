# Testing

## Verified Results

The Step 20 and regression verification results recorded for the current project are:

- Backend suite: 56 passed, 0 failed, 0 skipped.
- Focused integration workflow tests: 23 passed.
- Database tests: 20 passed.
- Python compile checks: passed.
- Alembic autogenerate drift check: no drift.
- Frontend production build: passed.
- Frontend diagnostics: no errors reported.
- CORS preflight checks: passed for localhost and 127.0.0.1 frontend origins.
- Health endpoint: HTTP 200 with `{"status":"ok"}`.

The backend suite emitted two dependency deprecation warnings from Starlette/httpx test tooling. These warnings did not fail tests.

## Test Categories

The backend tests cover security and JWT handling, registration/login, role authorization, farmer and consumer modules, dashboards, nearby search, marketplace behavior, cart and orders, sandbox payments, fulfillment, reviews, notifications, AI quality and price model-unavailable behavior, database metadata/PostGIS behavior, and administration.

The frontend is verified through the Vite production build, source diagnostics, API client inspection, OpenAPI route comparison, CORS checks, and responsive browser checks. The frontend package does not currently contain a separate browser test suite.

## Interpretation

These tests verify implemented behavior and integration contracts. They do not establish production performance, real-world AI accuracy, security certification, or operational readiness. AI tests intentionally verify honest model-unavailable behavior where no trained artifact is configured.

## Useful Commands

```powershell
cd backend
$env:PYTHONPATH='..'
..\venv\Scripts\python.exe -m pytest -q
cd ..
.\venv\Scripts\python.exe -m compileall -q backend
cd frontend
npm run build
```
