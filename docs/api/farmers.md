# Farmer API

Farmer self-service routes are under `/api/v1/farmers`.

- `GET/PUT /api/v1/farmers/me`: read or update the authenticated farmer profile.
- `GET/POST /api/v1/farmers/me/listings`: list or create owned listings.
- `PATCH/DELETE /api/v1/farmers/me/listings/{listing_id}`: update or deactivate an owned listing.
- `POST /api/v1/farmers/me/listings/{listing_id}/images`: upload a validated image.
- `/api/v1/farmers/dashboard/*`: summary, listings, orders, analytics, reviews, and AI summary.

All routes enforce FARMER role and ownership. Profile fields include legacy address/state data, structured address fields, and optional location coordinates.
