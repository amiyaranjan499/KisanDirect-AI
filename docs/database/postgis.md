# PostGIS

Farmer and crop-listing locations use PostGIS `Geography(Point, 4326)` fields. Nearby farmer queries use PostGIS distance and radius operations, including `ST_Distance` and `ST_DWithin`, where coordinates are available.

Farmer pickup reuses the farmer's stored location. Missing coordinates are handled as unavailable; the application does not fabricate distances or silently collect browser GPS.
