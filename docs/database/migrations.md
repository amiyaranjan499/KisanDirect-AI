# Migrations

Alembic migrations are stored in `backend/alembic/versions`. The chain begins with the phase-one schema and adds listing details, fulfillment, order/payment fields, reviews, notification metadata, AI prediction fields, profile state, missing farmer-profile backfill, and structured address/delivery snapshot fields.

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

The verified project state has no autogenerate drift. Temporary inspection revisions must be removed after a drift check.
