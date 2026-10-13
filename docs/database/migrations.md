# Migrations

Alembic migrations are stored in `backend/alembic/versions`. The chain begins with the phase-one schema and adds listing details, fulfillment, order/payment fields, reviews, notification metadata, AI prediction fields, profile state, missing farmer-profile backfill, structured address/delivery snapshot fields, and the admin audit-event table.

Apply migrations:

```powershell
cd backend
..\venv\Scripts\python.exe -m alembic upgrade head
```

Inspect current revision:

```powershell
..\venv\Scripts\python.exe -m alembic current
..\venv\Scripts\python.exe -m alembic heads
```

The current Phase 7 migration head has not been applied or drift-checked against the isolated test database in this work because `TEST_DATABASE_URL` was unavailable. Temporary inspection revisions must be removed after a drift check.
