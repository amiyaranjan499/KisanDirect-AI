import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { MapContainer, Marker, Popup, TileLayer } from "react-leaflet";
import { getConsumerProfile, mediaUrl, nearbyFarmers } from "../services/api";
import { getStoredLocation, subscribeLocation } from "../services/locationService";

const DEFAULT_LAT = 19.9975;
const DEFAULT_LNG = 73.7898;

export default function NearbyFarmers({ onFarmer }) {
  const navigate = useNavigate();
  const [farmers, setFarmers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showMap, setShowMap] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalFarmers, setTotalFarmers] = useState(0);
  const PAGE_SIZE = 6;

  const storedLoc = getStoredLocation();
  const [locationName, setLocationName] = useState(storedLoc?.formatted || "Nearby");
  const [userCoords, setUserCoords] = useState({
    latitude: storedLoc?.latitude || DEFAULT_LAT,
    longitude: storedLoc?.longitude || DEFAULT_LNG,
  });

  const handleSelectFarmer = (farmerId) => {
    if (onFarmer) {
      onFarmer(farmerId);
    } else {
      navigate(`/c/${farmerId}`);
    }
  };

  const fetchFarmersForCoords = useCallback(async (lat, lng, radiusKm = 15, pageNum = 1) => {
    setLoading(true);
    setError("");
    try {
      const res = await nearbyFarmers({
        latitude: lat,
        longitude: lng,
        radius_km: radiusKm,
        page: pageNum,
        page_size: PAGE_SIZE,
      });
      const items = res?.items || (Array.isArray(res) ? res : []);
      setFarmers(items);
      const total = res?.total != null ? res.total : items.length;
      setTotalFarmers(total);
      setTotalPages(res?.pages != null ? res.pages : Math.max(1, Math.ceil(total / PAGE_SIZE)));
      setPage(pageNum);
    } catch (err) {
      console.warn("Error fetching nearby farmers:", err);
      setError(err.message || "Failed to load nearby farmers.");
    } finally {
      setLoading(false);
    }
  }, []);

  const handlePageChange = (newPage) => {
    if (newPage < 1 || newPage > totalPages || newPage === page) return;
    fetchFarmersForCoords(userCoords.latitude, userCoords.longitude, 15, newPage);
  };

  useEffect(() => {
    // 0. Listen to location changes from locationService
    const unsub = subscribeLocation((loc) => {
      if (loc?.formatted) setLocationName(loc.formatted);
      if (loc?.latitude && loc?.longitude) {
        setUserCoords({ latitude: loc.latitude, longitude: loc.longitude });
        fetchFarmersForCoords(loc.latitude, loc.longitude, 15);
      }
    });

    const stored = getStoredLocation();
    if (stored?.latitude && stored?.longitude) {
      if (stored.formatted) setLocationName(stored.formatted);
      setUserCoords({ latitude: stored.latitude, longitude: stored.longitude });
      fetchFarmersForCoords(stored.latitude, stored.longitude, 15);
      return unsub;
    }

    // 1. Check profile location
    getConsumerProfile()
      .then((profile) => {
        if (profile?.city || profile?.state) {
          setLocationName(`${profile.city || ""}${profile.city && profile.state ? ", " : ""}${profile.state || ""}`);
        }
        if (profile?.location?.latitude && profile?.location?.longitude) {
          const coords = { latitude: profile.location.latitude, longitude: profile.location.longitude };
          setUserCoords(coords);
          fetchFarmersForCoords(coords.latitude, coords.longitude, 15);
          return;
        }
        // 2. Try browser geolocation if available
        if (navigator.geolocation) {
          navigator.geolocation.getCurrentPosition(
            (pos) => {
              const coords = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
              setUserCoords(coords);
              fetchFarmersForCoords(coords.latitude, coords.longitude, 15);
            },
            () => {
              fetchFarmersForCoords(DEFAULT_LAT, DEFAULT_LNG, 15);
            },
            { timeout: 8000 }
          );
        } else {
          fetchFarmersForCoords(DEFAULT_LAT, DEFAULT_LNG, 15);
        }
      })
      .catch(() => {
        fetchFarmersForCoords(DEFAULT_LAT, DEFAULT_LNG, 15);
      });

    return unsub;
  }, [fetchFarmersForCoords]);


  return (
    <div className="nearby-farmers-page wrap" style={{ maxWidth: "1200px", margin: "0 auto", padding: "8px 16px 48px" }}>
      {/* 1. Page Header */}
      <div className="section-title" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
        <h2 style={{ fontSize: "24px", fontWeight: 700, color: "var(--forest, #1B6B34)", margin: 0, fontFamily: "var(--font-display, 'Fraunces', Georgia, serif)" }}>
          Nearby Farmers
        </h2>
      </div>

      {/* 2. Map View Info Banner (Interactive Toggle) */}
      <div
        className="card card-pad"
        onClick={() => setShowMap((prev) => !prev)}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "10px",
          marginBottom: "20px",
          background: "var(--sage-light, #E3F5E4)",
          border: "none",
          borderRadius: "12px",
          padding: "14px 18px",
          cursor: "pointer",
          transition: "background 0.15s ease",
        }}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setShowMap((prev) => !prev);
          }
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <i className="bi bi-map" style={{ fontSize: "18px", color: "var(--forest-2, #22883F)" }} />
          <span style={{ fontSize: "13.5px", fontWeight: 500, color: "var(--forest-2, #22883F)" }}>
            Map view — showing farmers within 10 km of {locationName}
          </span>
        </div>
        <span style={{ fontSize: "12.5px", fontWeight: 600, color: "var(--forest, #1B6B34)" }}>
          {showMap ? "Hide Map ▲" : "Show Map ▼"}
        </span>
      </div>

      {/* 3. Interactive Leaflet Map when toggled */}
      {showMap && (
        <div
          style={{
            height: "340px",
            width: "100%",
            borderRadius: "14px",
            overflow: "hidden",
            marginBottom: "24px",
            border: "1px solid var(--line, #E4DFD1)",
            boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
          }}
        >
          <MapContainer
            center={[userCoords.latitude, userCoords.longitude]}
            zoom={12}
            scrollWheelZoom={false}
            style={{ height: "100%", width: "100%" }}
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            {/* User marker */}
            <Marker position={[userCoords.latitude, userCoords.longitude]}>
              <Popup>
                <b>Your Location</b>
                <br />
                {locationName}
              </Popup>
            </Marker>
            {/* Farmer markers */}
            {farmers.map((farmer) => {
              const lat = farmer.location?.latitude;
              const lng = farmer.location?.longitude;
              if (!lat || !lng) return null;
              return (
                <Marker key={farmer.id} position={[lat, lng]}>
                  <Popup>
                    <div style={{ padding: "4px" }}>
                      <b>{farmer.name}</b>
                      <div style={{ fontSize: "11px", color: "#666" }}>{farmer.farm_name || "Farm"}</div>
                      <div style={{ fontSize: "11px", color: "#22883F" }}>
                        ★ {farmer.rating ? Number(farmer.rating).toFixed(1) : "4.8"}
                      </div>
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        style={{ marginTop: "6px", width: "100%", padding: "3px 8px", fontSize: "11px" }}
                        onClick={() => handleSelectFarmer(farmer.id)}
                      >
                        View Farm
                      </button>
                    </div>
                  </Popup>
                </Marker>
              );
            })}
          </MapContainer>
        </div>
      )}

      {/* Error state */}
      {error ? (
        <div className="alert alert-warning" style={{ borderRadius: "10px", marginBottom: "16px" }}>
          {error}
        </div>
      ) : null}

      {/* 4. Farmers 3-column Grid (matches Screenshot 5 and nearbyfarmar.png) */}
      {loading ? (
        <div className="loading" style={{ padding: "40px 0", textAlign: "center" }}>
          Loading nearby farmers...
        </div>
      ) : farmers.length > 0 ? (
        <>
          <div
            className="consumer-farmers-grid"
            style={{
              display: "grid",
              gap: "18px",
            }}
          >
          {farmers.map((farmer) => {
            const rawDp =
              farmer.profile_image ||
              farmer.avatar_url ||
              farmer.profile_photo ||
              farmer.avatar ||
              farmer.photo ||
              farmer.image ||
              (typeof localStorage !== "undefined" &&
                (localStorage.getItem(`kisandirect_farmer_avatar_${farmer.id}`) ||
                  localStorage.getItem("kisandirect_farmer_avatar"))) ||
              null;
            const dp = rawDp ? mediaUrl(rawDp) : null;
            const cover = farmer.cover_image ? mediaUrl(farmer.cover_image) : null;
            const initial = (farmer.name || "F").slice(0, 1).toUpperCase();
            const rating = farmer.rating ? Number(farmer.rating).toFixed(1) : "4.8";
            const dist =
              farmer.distance_km != null
                ? Number(farmer.distance_km) < 0.1
                  ? "Near you (< 0.5 km)"
                  : `${Number(farmer.distance_km).toFixed(1)} km`
                : "Near you";
            const locParts = [farmer.city, farmer.district, farmer.state].filter(Boolean);
            const loc =
              locParts.length > 0
                ? farmer.city && farmer.state
                  ? `${farmer.city}, ${farmer.state}`
                  : locParts.join(", ")
                : farmer.address
                ? farmer.address.split(",")[0].trim()
                : "Local Farm";
            const farmName = farmer.farm_name || `${farmer.name.split(" ")[0]} Farm`;

            return (
              <div
                key={farmer.id}
                className="card"
                onClick={() => handleSelectFarmer(farmer.id)}
                style={{
                  overflow: "hidden",
                  cursor: "pointer",
                  borderRadius: "14px",
                  border: "1px solid var(--line, #E4DFD1)",
                  background: "#FFFFFF",
                  boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
                  transition: "transform 0.15s ease, box-shadow 0.15s ease",
                }}
              >
                {/* Farmer Banner: only real uploaded cover if present, otherwise clean brand header */}
                {cover ? (
                  <img
                    src={cover}
                    alt={farmer.name}
                    style={{ height: "85px", width: "100%", objectFit: "cover" }}
                    onError={(e) => {
                      e.currentTarget.style.display = "none";
                      if (e.currentTarget.nextSibling) {
                        e.currentTarget.nextSibling.style.display = "block";
                      }
                    }}
                  />
                ) : null}
                <div
                  style={{
                    height: "85px",
                    width: "100%",
                    display: cover ? "none" : "block",
                    background: "linear-gradient(135deg, #EAF3E7 0%, #D8F2DC 100%)",
                    borderBottom: "1px solid #D6E8D2",
                  }}
                />

                {/* Card Pad with Overlapping Real DP Avatar */}
                <div style={{ padding: "16px", position: "relative" }}>
                  <div style={{ display: "flex", gap: "10px", alignItems: "center", marginTop: "-38px" }}>
                    {dp ? (
                      <img
                        src={dp}
                        alt={farmer.name}
                        style={{
                          width: "52px",
                          height: "52px",
                          borderRadius: "50%",
                          objectFit: "cover",
                          border: "3px solid #FFFFFF",
                          boxShadow: "0 2px 6px rgba(0,0,0,0.14)",
                          background: "#FFFFFF",
                        }}
                        onError={(e) => {
                          e.currentTarget.style.display = "none";
                          if (e.currentTarget.nextSibling) {
                            e.currentTarget.nextSibling.style.display = "flex";
                          }
                        }}
                      />
                    ) : null}
                    <div
                      className="avatar avatar-round"
                      style={{
                        display: dp ? "none" : "flex",
                        width: "52px",
                        height: "52px",
                        borderRadius: "50%",
                        border: "3px solid #FFFFFF",
                        background: "var(--sage-light, #E3F5E4)",
                        color: "var(--forest, #1B6B34)",
                        alignItems: "center",
                        justifyContent: "center",
                        fontWeight: 700,
                        fontSize: "18px",
                        boxShadow: "0 2px 6px rgba(0,0,0,0.12)",
                      }}
                    >
                      {initial}
                    </div>
                  </div>

                  {/* Name and Farm Name */}
                  <div style={{ fontWeight: 700, fontSize: "14.5px", marginTop: "8px", color: "var(--ink, #1C1C16)" }}>
                    {farmer.name}
                  </div>
                  <div style={{ fontSize: "12px", color: "var(--clay, #79705F)" }}>
                    {farmName}
                  </div>

                  {/* Location & Distance */}
                  <div style={{ fontSize: "12px", color: "var(--clay, #79705F)", marginTop: "4px", display: "flex", alignItems: "center", gap: "4px" }}>
                    <i className="bi bi-geo-alt" style={{ fontSize: "11px" }} />
                    <span>{loc} · {dist}</span>
                  </div>

                  {/* Footer: Rating + View Farm Button */}
                  <div style={{ marginTop: "12px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: "13px", fontWeight: 700, color: "#D97706", display: "inline-flex", alignItems: "center", gap: "3px" }}>
                      <i className="bi bi-star-fill" style={{ fontSize: "11px" }} /> {rating}
                    </span>

                    <button
                      type="button"
                      className="btn btn-outline btn-sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleSelectFarmer(farmer.id);
                      }}
                      style={{
                        padding: "5px 16px",
                        fontSize: "12.5px",
                        fontWeight: 600,
                        borderRadius: "8px",
                        border: "1px solid var(--line, #E4DFD1)",
                        background: "#FFFFFF",
                        color: "var(--ink, #1C1C16)",
                        cursor: "pointer",
                      }}
                    >
                      View Farm
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Pagination Controls - only show when there is more than 1 page (totalFarmers > 6) */}
        {totalPages > 1 && (
          <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: "12px", marginTop: "28px" }}>
            <button
              type="button"
              className="btn btn-outline btn-sm"
              disabled={page <= 1 || loading}
              onClick={() => handlePageChange(page - 1)}
              style={{ padding: "5px 14px", borderRadius: "6px" }}
            >
              Previous
            </button>
            <span style={{ fontSize: "13px", color: "var(--clay, #79705F)" }}>
              Page {page} of {totalPages}
            </span>
            <button
              type="button"
              className="btn btn-outline btn-sm"
              disabled={page >= totalPages || loading}
              onClick={() => handlePageChange(page + 1)}
              style={{ padding: "5px 14px", borderRadius: "6px" }}
            >
              Next
            </button>
          </div>
        )}
      </>
      ) : (
        <div className="empty" style={{ padding: "40px", background: "#FFFFFF", borderRadius: "12px", border: "1px solid var(--line, #E4DFD1)", textAlign: "center" }}>
          <h3 style={{ color: "var(--forest, #1B6B34)", fontFamily: "var(--font-display, 'Fraunces', Georgia, serif)" }}>No farmers found near your location</h3>
          <p style={{ color: "var(--clay, #79705F)" }}>Try expanding your search radius or exploring other regions.</p>
        </div>
      )}
    </div>
  );
}
