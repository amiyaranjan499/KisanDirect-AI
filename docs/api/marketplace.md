# Marketplace API

The consumer-authenticated marketplace reads active listings from PostgreSQL and exposes paginated crop, farmer, image, location, AI, and rating fields when those records exist.

## Endpoints

- `GET /api/v1/marketplace/listings`
- `GET /api/v1/marketplace/listings/{listing_id}`
- `GET /api/v1/marketplace/farmers/{farmer_id}`

Listing queries support crop/farmer search, category, quality, price range, rating, pagination, and sorting by newest, price, nearest, or highest rated. Distance options require `latitude` and `longitude` and use PostGIS geography distance in kilometers.

AI quality and recommended price fields are nullable. The API returns `null` when no valid Step 7 or Step 8 result exists; it does not synthesize marketplace values. Farmer contact details and user credentials are not exposed.