# Database Overview

KisanDirect AI uses PostgreSQL with PostGIS through SQLAlchemy's asynchronous engine and GeoAlchemy2. Alembic manages versioned schema changes. Database credentials are loaded from `backend/.env` and are not documented.

The ORM defines users and role profiles, crops and listings, carts and orders, payments, deliveries, reviews, notifications, and AI prediction records. See [schema](schema.md) for relationships and [postgis](postgis.md) for spatial behavior.
