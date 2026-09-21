# Backend Architecture

The backend is a FastAPI application registered in `backend/app/main.py`. Routers define HTTP endpoints and dependency checks; services coordinate workflows and business validation; repositories access PostgreSQL through asynchronous SQLAlchemy sessions; Pydantic schemas define request and response contracts.

Shared dependencies implement JWT decoding, active-user lookup, role checks, and ownership boundaries. Alembic manages migrations. The canonical Windows runner is `\.\venv\Scripts\python.exe -m backend.run` from the repository root.
