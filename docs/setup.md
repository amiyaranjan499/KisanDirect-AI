# Setup

## Requirements

- Windows development environment
- Python and a virtual environment
- Node.js and npm
- PostgreSQL with PostGIS enabled
- A database configured for the application

Exact dependency versions are bounded in `backend/requirements.txt`; frontend packages are declared in `frontend/package.json`.

## Python Environment

From the repository root:

```powershell
python -m venv venv
.\venv\Scripts\Activate.ps1
pip install -r backend\requirements.txt
```

## Environment Configuration

Copy the backend template:

```powershell
Copy-Item backend\.env.example backend\.env
```

Set `DATABASE_URL` to the local PostgreSQL/PostGIS connection string and set a JWT secret of at least 32 characters. Keep `backend/.env` private. The template contains placeholders only.

For the frontend, copy or adapt `frontend/.env.example` if an API base URL override is needed. The local default is `http://127.0.0.1:8000`.

## Database Migration

```powershell
cd backend
..\venv\Scripts\python.exe -m alembic upgrade head
cd ..
```

## Start the Backend

Use the canonical Windows-safe runner:

```powershell
.\venv\Scripts\python.exe -m backend.run
```

The API is normally available at `http://127.0.0.1:8000`. Health is available at `/health`; Swagger UI is available at `/docs`.

## Start the Frontend

In a second terminal:

```powershell
cd frontend
npm install
npm run dev
```

The Vite development server is normally available at `http://localhost:5173`.

## Verification

```powershell
cd backend
$env:PYTHONPATH='..'
..\venv\Scripts\python.exe -m pytest -q
cd ..
.\venv\Scripts\python.exe -m compileall -q backend
cd frontend
npm run build
```

Alembic drift can be checked with a temporary autogenerate revision. Remove the temporary file after inspecting that the upgrade contains no operations.
