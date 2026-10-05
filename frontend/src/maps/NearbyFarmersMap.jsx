import { useCallback, useEffect, useState } from "react";
import { MapContainer, Marker, Popup, TileLayer, useMap } from "react-leaflet";
import { nearbyFarmers } from "../services/api";
import { useI18n } from "../i18n";

function Recenter({ center }) {
  const map = useMap();
  useEffect(() => map.setView(center), [center, map]);
  return null;
}

export default function NearbyFarmers({ onFarmer }) {
  const { t } = useI18n();
  const [position, setPosition] = useState(null);
  const [radius, setRadius] = useState("25");
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [loadingLocation, setLoadingLocation] = useState(true);
  const [loadingFarmers, setLoadingFarmers] = useState(false);
  const [locationError, setLocationError] = useState("");
  const [searchError, setSearchError] = useState("");
  const center = position ? [position.latitude, position.longitude] : null;

  const requestCurrentLocation = useCallback(() => {
    setLoadingLocation(true);
    setLocationError("");
    setSearchError("");
    if (!navigator.geolocation) {
      setLocationError(t("nearbyLocationUnavailable"));
      setLoadingLocation(false);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setPosition({
          latitude: coords.latitude,
          longitude: coords.longitude,
        });
        setLoadingLocation(false);
      },
      (error) => {
        setLocationError(
          error.code === error.PERMISSION_DENIED
            ? t("nearbyPermissionRequired")
            : t("nearbyLocationUnavailable"),
        );
        setLoadingLocation(false);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    );
  }, [t]);

  useEffect(() => {
    requestCurrentLocation();
  }, [requestCurrentLocation]);

  useEffect(() => {
    if (!position) return undefined;
    let active = true;
    setLoadingFarmers(true);
    setSearchError("");
    setData(null);
    nearbyFarmers({
      latitude: position.latitude,
      longitude: position.longitude,
      radius_km: radius,
      page,
      page_size: 6,
    })
      .then((result) => {
        if (active) setData(result);
      })
      .catch((error) => {
        if (active) setSearchError(error.message);
      })
      .finally(() => {
        if (active) setLoadingFarmers(false);
      });
    return () => {
      active = false;
    };
  }, [position, radius, page]);

  return (
    <section className="nearby-view">
      <div className="nearby-heading">
        <div>
          <span className="eyebrow">Location discovery</span>
          <h1>Farmers within reach.</h1>
          <p>Find farms near your current location.</p>
        </div>
        <button className="back-button" onClick={() => onFarmer(null)}>
          ← Marketplace
        </button>
      </div>

      <div className="nearby-controls nearby-search-panel">
        <label className="nearby-field">
          <span>{t("nearbyRadius")}</span>
          <select
            value={radius}
            onChange={(event) => {
              setRadius(event.target.value);
              setPage(1);
            }}
          >
            <option value="5">5 km</option>
            <option value="25">25 km</option>
            <option value="50">50 km</option>
            <option value="100">100 km</option>
            <option value="250">250 km</option>
          </select>
        </label>
      </div>

      {loadingLocation && <div className="loading">{t("nearbyRequestingLocation")}</div>}
      {locationError && (
        <div className="error" role="alert">
          <p>{locationError}</p>
          <button className="secondary-button" type="button" onClick={requestCurrentLocation}>
            {t("nearbyRetryLocation")}
          </button>
        </div>
      )}
      {searchError && <div className="error" role="alert">{searchError}</div>}
      {loadingFarmers && <div className="loading">{t("nearbyFindingFarmers")}</div>}

      {!loadingLocation && !locationError && !loadingFarmers && data && center && (
        <div className="nearby-layout">
          <MapContainer center={center} zoom={9} className="map">
            <Recenter center={center} />
            <TileLayer
              attribution="&copy; OpenStreetMap contributors"
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            <Marker position={center}>
              <Popup>Your current location</Popup>
            </Marker>
            {data.items.map((farmer) => (
              <Marker
                key={farmer.id}
                position={[farmer.location.latitude, farmer.location.longitude]}
              >
                <Popup>
                  <b>{farmer.name}</b>
                  <br />
                  {farmer.distance_km.toFixed(1)} km away
                </Popup>
              </Marker>
            ))}
          </MapContainer>
          <div className="nearby-results">
            {data.items.length ? (
              data.items.map((farmer) => (
                <article className="farmer-card nearby-farmer-card" key={farmer.id}>
                  <div>
                    <span className="eyebrow">{farmer.distance_km.toFixed(1)} km away</span>
                    <h2>{farmer.name}</h2>
                    <p className="muted">
                      {farmer.active_listing_count} active listing
                      {farmer.active_listing_count === 1 ? "" : "s"} · Rating:{" "}
                      {farmer.rating ? `${farmer.rating.toFixed(1)} / 5` : "Unavailable"}
                    </p>
                  </div>
                  <button className="farmer-link" onClick={() => onFarmer(farmer.id)}>
                    View farm →
                  </button>
                </article>
              ))
            ) : (
              <div className="empty">No active farmers found in this radius.</div>
            )}
            {data.pages > 1 && (
              <nav className="pagination">
                <button
                  disabled={data.page <= 1}
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                >
                  Previous
                </button>
                <span>Page {data.page} of {data.pages}</span>
                <button
                  disabled={data.page >= data.pages}
                  onClick={() => setPage((current) => Math.min(data.pages, current + 1))}
                >
                  Next
                </button>
              </nav>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
