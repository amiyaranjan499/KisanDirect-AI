# Testing

## Verified Results

The Phase 9 verification results recorded for the project are:

- Backend suite: 105 passed, 0 failed, 0 skipped, 2 deprecation warnings in test tooling.
- Focused integration workflow tests: end-to-end full platform journey (`test_end_to_end_journey.py`), order lifecycle transitions, OTP lockout/reset, and metrics verification passed.
- Python compile checks: passed (`python -m compileall -q backend`).
- Alembic autogenerate drift check: no drift against PostgreSQL/PostGIS.
- Frontend production build: passed (`npm run build`).
- Frontend diagnostics: no runtime or route errors reported.
- Health endpoint: HTTP 200 with `{"status":"ok"}`.
- Manual walkthrough: fully documented in [End-to-End Manual Testing Guide](E2E_MANUAL_TEST.md).

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
