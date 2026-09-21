# Project Structure

```text
D:\KisanDirect-AI\
|-- backend/
|   |-- app/
|   |   |-- ai/                 AI-facing application helpers
|   |   |-- core/               settings and security
|   |   |-- database/           async engine/session setup
|   |   |-- models/             SQLAlchemy models
|   |   |-- repositories/       database access
|   |   |-- routers/            FastAPI route modules
|   |   |-- schemas/            Pydantic request/response schemas
|   |   |-- services/           application workflows
|   |   |-- tests/              backend test suite
|   |   |-- main.py             FastAPI application and router registration
|   |   |-- run.py              canonical backend runner
|   |   `-- uvicorn_loop.py     Windows-compatible loop factory
|   |-- alembic/
|   |   `-- versions/           versioned migrations
|   `-- requirements.txt
|-- frontend/
|   |-- src/
|   |   |-- app/                application views and components
|   |   |-- lib/api/            centralized API client
|   |   |-- maps/               Leaflet map components
|   |   |-- styles.css          global styling
|   |   `-- main.jsx            React entry point
|   |-- package.json
|   `-- vite.config.js
|-- database/
|   |-- documentation/         database notes
|   |-- migrations/             project migration resources
|   `-- seeds/                  seed-resource directory
|-- docs/
|   |-- api/                   API reference and module endpoint notes
|   |-- ai/                    AI architecture, quality, price, and evaluation
|   |-- database/              schema, PostGIS, and migration documentation
|   |-- architecture/          frontend, backend, ML, and security architecture
|   |-- deployment/            local, environment, and production notes
|   |-- README.md              documentation index
|   |-- system-architecture.md
|   |-- modules.md
|   |-- setup.md, testing.md   setup and verification
|   `-- ...                     project documentation
|-- ml/
|   |-- crop_quality/          quality preprocessing, inference, metadata
|   |-- price_prediction/      price features, inference, metadata
|   |-- preprocessing/
|   |-- training/
|   |-- evaluation/
|   |-- models/
|   `-- datasets/
|-- scripts/
|   `-- inspect_db.py
|-- sitecustomize.py            Windows startup policy helper
`-- README.md
```

The actual runtime code is under `backend/app` and `frontend/src`. The `ml` directories contain the inference boundaries and supporting project structure; no trained production artifact is assumed by the application.
