# Technology Stack

## Backend

- Python
- FastAPI
- Uvicorn
- Pydantic and pydantic-settings
- SQLAlchemy 2 asynchronous ORM
- psycopg asynchronous PostgreSQL driver
- GeoAlchemy2
- Alembic
- PyJWT
- pwdlib with Argon2 password hashing
- python-multipart for form and upload handling
- Pillow for image validation/preprocessing support

## Database

- PostgreSQL
- PostGIS
- Geography `POINT` fields with SRID 4326

## Frontend

- JavaScript
- React
- React DOM
- Vite
- Leaflet
- React Leaflet
- CSS
- Fetch API

The frontend does not use a router library or a separate component library; application view state is coordinated in the existing React application.

## Architecture

- REST API
- JWT bearer authentication
- Role-based access control
- Router/service/repository backend layering
- Centralized frontend API client
- Versioned Alembic migrations

## AI/ML

- Python inference boundaries
- Pillow image handling for quality input
- Future CNN/transfer-learning boundary for quality
- Future `RandomForestRegressor` boundary for price

No trained model performance is claimed by this project state.
