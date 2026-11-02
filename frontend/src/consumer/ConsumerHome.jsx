import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { addCartItem, getConsumerProfile, getCurrentUser, listListings, mediaUrl, nearbyFarmers } from "../services/api";
import { detectRealLocation, getStoredLocation, subscribeLocation } from "../services/locationService";
import ConsumerProductCard from "./ConsumerProductCard";
import "./consumer-shell.css";

export default function ConsumerHome({ user: propUser }) {
  const navigate = useNavigate();
  const [user, setUser] = useState(propUser || null);
  const [consumerProfile, setConsumerProfile] = useState(null);
  const [liveLocation, setLiveLocation] = useState(() => getStoredLocation());
  const [listings, setListings] = useState([]);
  const [farmers, setFarmers] = useState([]);
  const [loadingListings, setLoadingListings] = useState(true);
  const [loadingFarmers, setLoadingFarmers] = useState(true);
  const [cartToast, setCartToast] = useState("");

  useEffect(() => {
    // If location is not yet detected, trigger location detection so it auto-saves into the address section
    if (!getStoredLocation() && typeof navigator !== "undefined" && navigator.geolocation) {
      detectRealLocation(true).catch(() => null);
    }
    return subscribeLocation((loc) => {
      setLiveLocation(loc);
    });
  }, []);

  useEffect(() => {
    if (!user) {
      getCurrentUser().then(setUser).catch(() => null);
    }
    getConsumerProfile().then(setConsumerProfile).catch(() => null);

    // Fetch real crop listings for "Fresh crops near you"
    listListings({ page: 1, page_size: 8 })
      .then((res) => {
        const items = Array.isArray(res) ? res : res?.items || [];
        setListings(items);
      })
      .catch((err) => console.warn("Failed to load listings:", err))
      .finally(() => setLoadingListings(false));
  }, []);

  useEffect(() => {
    // Fetch real nearby farmers
    const lat = liveLocation?.latitude || consumerProfile?.location?.latitude || 19.9975;
    const lng = liveLocation?.longitude || consumerProfile?.location?.longitude || 73.7898;
    nearbyFarmers({ latitude: lat, longitude: lng, radius_km: 25, page: 1, page_size: 4 })
      .then((res) => {
        const items = res?.items || (Array.isArray(res) ? res : []);
        setFarmers(items);
      })
      .catch((err) => console.warn("Failed to load nearby farmers:", err))
      .finally(() => setLoadingFarmers(false));
  }, [liveLocation?.latitude, liveLocation?.longitude, consumerProfile?.location?.latitude, consumerProfile?.location?.longitude]);

  const handleAddToCart = async (item) => {
    try {
      await addCartItem({ listing_id: item.id, quantity: 1 });
      window.dispatchEvent(new CustomEvent("kisandirect_cart_updated"));
      setCartToast(`Added ${item.crop_name} to cart.`);
      setTimeout(() => setCartToast(""), 2500);
    } catch (err) {
      setCartToast(err.message || "Failed to add to cart.");
      setTimeout(() => setCartToast(""), 3000);
    }
  };

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const displayName = user?.name ? user.name.split(" ")[0] : consumerProfile?.name ? consumerProfile.name.split(" ")[0] : (user?.email ? user.email.split("@")[0] : "Friend");

  const categories = [
    { name: "Vegetables", emoji: "🥬" },
    { name: "Fruits", emoji: "🍊" },
    { name: "Grains", emoji: "🌾" },
    { name: "Pulses", emoji: "🫘" },
    { name: "Roots & Tubers", emoji: "🥔" },
    { name: "Spices", emoji: "🌶️" },
    { name: "Millets", emoji: "🌱" },
    { name: "Organic", emoji: "🍃" },
  ];



  return (
    <div className="consumer-home-page wrap" style={{ maxWidth: "1200px", margin: "0 auto", padding: "0 16px 48px" }}>
      {/* Toast Notification */}
      {cartToast ? (
        <div
          style={{
            position: "fixed",
            bottom: "74px",
            right: "20px",
            zIndex: 9999,
            background: "var(--forest, #1B6B34)",
            color: "#FFFFFF",
            padding: "10px 18px",
            borderRadius: "8px",
            fontSize: "13.5px",
            boxShadow: "0 4px 12px rgba(0,0,0,0.18)",
            display: "flex",
            alignItems: "center",
            gap: "8px",
          }}
        >
          <i className="bi bi-check-circle-fill text-white" />
          <span>{cartToast}</span>
        </div>
      ) : null}

      {/* 1. Hero Greeting Banner (Premium quick-commerce gradient mesh) */}
      <section
        className="hero"
        style={{
          background: "linear-gradient(135deg, #0F4926 0%, #176837 55%, #228448 100%)",
          borderRadius: "18px",
          padding: "36px 30px",
          color: "#FFFFFF",
          marginBottom: "28px",
          position: "relative",
          overflow: "hidden",
          boxShadow: "0 8px 28px -6px rgba(15, 73, 38, 0.28)",
        }}
      >
        {/* Subtle ambient light rings */}
        <div
          style={{
            position: "absolute",
            right: "-40px",
            top: "-50px",
            width: "280px",
            height: "280px",
            borderRadius: "50%",
            background: "radial-gradient(circle, rgba(255, 255, 255, 0.14) 0%, rgba(255, 255, 255, 0) 70%)",
            pointerEvents: "none",
          }}
        />
        <div
          style={{
            position: "absolute",
            right: "80px",
            bottom: "-60px",
            width: "200px",
            height: "200px",
            borderRadius: "50%",
            background: "radial-gradient(circle, rgba(198, 138, 61, 0.18) 0%, rgba(198, 138, 61, 0) 70%)",
            pointerEvents: "none",
          }}
        />

        <div style={{ maxWidth: "560px", position: "relative", zIndex: 1 }}>
          {/* Quick Commerce Live Hub Status Pill */}
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "7px",
              background: "rgba(255, 255, 255, 0.18)",
              backdropFilter: "blur(8px)",
              WebkitBackdropFilter: "blur(8px)",
              border: "1px solid rgba(255, 255, 255, 0.3)",
              padding: "4px 12px",
              borderRadius: "99px",
              fontSize: "12px",
              fontWeight: 600,
              color: "#F0FDF4",
              marginBottom: "14px",
              boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
            }}
          >
            <span
              style={{
                display: "inline-block",
                width: "7px",
                height: "7px",
                borderRadius: "50%",
                background: "#4ADE80",
                boxShadow: "0 0 10px #4ADE80",
              }}
            />
            <span>Kisan Hub Live · Direct Farm Delivery in 45-90 min</span>
          </div>

          <h1
            style={{
              fontSize: "28px",
              fontWeight: 700,
              margin: "0 0 8px 0",
              color: "#FFFFFF",
              letterSpacing: "-0.4px",
              fontFamily: "Fraunces, Georgia, serif",
              lineHeight: 1.25,
            }}
          >
            {greeting}, {displayName} 🌿
          </h1>
          <p
            style={{
              fontSize: "15px",
              color: "rgba(255, 255, 255, 0.92)",
              margin: "0 0 20px 0",
              lineHeight: 1.45,
            }}
          >
            Fresh harvest straight from local verified farms, picked and delivered today.
          </p>
          <button
            type="button"
            className="btn btn-accent"
            onClick={() => navigate("/marketplace")}
            style={{
              background: "linear-gradient(135deg, #D49343 0%, #C68A3D 100%)",
              color: "#2A1B05",
              border: "none",
              padding: "11px 24px",
              borderRadius: "10px",
              fontWeight: 700,
              fontSize: "14px",
              cursor: "pointer",
              boxShadow: "0 4px 14px rgba(198, 138, 61, 0.32)",
              display: "inline-flex",
              alignItems: "center",
              gap: "8px",
              transition: "transform 0.15s ease, box-shadow 0.15s ease",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = "translateY(-1px)";
              e.currentTarget.style.boxShadow = "0 6px 18px rgba(198, 138, 61, 0.42)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = "translateY(0)";
              e.currentTarget.style.boxShadow = "0 4px 14px rgba(198, 138, 61, 0.32)";
            }}
          >
            <span>Shop Fresh Crops</span>
            <i className="bi bi-arrow-right" style={{ fontSize: "13px" }} />
          </button>
        </div>
      </section>

      {/* 2. Categories Row (horizontal scroll on mobile, flex row on desktop) */}
      <section style={{ marginBottom: "32px" }}>
        <div className="section-title" style={{ marginBottom: "14px" }}>
          <h2 style={{ fontSize: "20px", fontWeight: 700, color: "var(--forest, #1B6B34)", margin: 0, fontFamily: "Fraunces, Georgia, serif" }}>
            Categories
          </h2>
        </div>

        <div
          className="scrollx"
          style={{
            display: "flex",
            gap: "12px",
            overflowX: "auto",
            paddingBottom: "6px",
            WebkitOverflowScrolling: "touch",
          }}
        >
          {categories.map((c) => (
            <button
              key={c.name}
              type="button"
              onClick={() => navigate(`/marketplace?category=${encodeURIComponent(c.name)}`)}
              style={{
                flex: "0 0 auto",
                width: "104px",
                textAlign: "center",
                background: "var(--paper, #FFFFFF)",
                border: "1px solid var(--line, #E4DFD1)",
                borderRadius: "14px",
                padding: "14px 6px",
                cursor: "pointer",
                transition: "transform 0.12s ease, border-color 0.12s ease",
              }}
            >
              <div style={{ fontSize: "26px", lineHeight: 1 }}>{c.emoji}</div>
              <div style={{ fontSize: "11.5px", fontWeight: 600, marginTop: "6px", color: "var(--ink, #1C1C16)", whiteSpace: "nowrap" }}>
                {c.name}
              </div>
            </button>
          ))}
        </div>
      </section>

      {/* 3. Fresh Crops Near You (2 cols on mobile, 4 cols on desktop) */}
      <section style={{ marginBottom: "36px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px" }}>
          <h2 style={{ fontSize: "20px", fontWeight: 700, color: "var(--forest, #1B6B34)", margin: 0, fontFamily: "Fraunces, Georgia, serif" }}>
            Fresh crops near you
          </h2>
          <Link
            to="/marketplace"
            className="link-more"
            style={{ fontSize: "13px", fontWeight: 600, color: "var(--ochre, #C68A3D)", textDecoration: "none", display: "flex", alignItems: "center", gap: "3px" }}
          >
            See all &gt;
          </Link>
        </div>

        {loadingListings ? (
          <div className="loading" style={{ padding: "30px 0", textAlign: "center" }}>Loading fresh crops...</div>
        ) : listings.length > 0 ? (
          <div className="consumer-marketplace-grid">
            {listings.map((item) => (
              <ConsumerProductCard
                key={item.id}
                item={item}
                onOpen={(id) => navigate(`/p/${id}`)}
                onAddToCart={handleAddToCart}
              />
            ))}
          </div>
        ) : (
          <div className="empty" style={{ padding: "30px", background: "#FFFFFF", borderRadius: "12px", border: "1px solid var(--line, #E4DFD1)", textAlign: "center" }}>
            <h3 style={{ color: "var(--forest, #1B6B34)" }}>No crops listed near you right now</h3>
            <p style={{ color: "var(--clay, #79705F)" }}>Check back soon as local farmers add their new harvest.</p>
          </div>
        )}
      </section>

      {/* 4. Nearby Farmers (exact match to reference home2.png and screenshot 3) */}
      <section>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px" }}>
          <h2 style={{ fontSize: "20px", fontWeight: 700, color: "var(--forest, #1B6B34)", margin: 0, fontFamily: "Fraunces, Georgia, serif" }}>
            Nearby farmers
          </h2>
          <Link
            to="/farmers"
            className="link-more"
            style={{ fontSize: "13px", fontWeight: 600, color: "var(--ochre, #C68A3D)", textDecoration: "none", display: "flex", alignItems: "center", gap: "3px" }}
          >
            See all &gt;
          </Link>
        </div>

        {loadingFarmers ? (
          <div className="loading" style={{ padding: "30px 0", textAlign: "center" }}>Loading nearby farms...</div>
        ) : farmers.length > 0 ? (
          <div
            className="farmer-row-grid"
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
              gap: "16px",
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
              const dist = farmer.distance_km != null ? `${Number(farmer.distance_km).toFixed(1)} km` : "2.3 km";
              const rating = farmer.rating ? Number(farmer.rating).toFixed(1) : "4.8";

              return (
                <div
                  key={farmer.id}
                  className="card"
                  onClick={() => navigate(`/c/${farmer.id}`)}
                  style={{
                    borderRadius: "14px",
                    overflow: "hidden",
                    cursor: "pointer",
                    border: "1px solid var(--line, #E4DFD1)",
                    background: "#FFFFFF",
                    boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
                    transition: "transform 0.15s ease, box-shadow 0.15s ease",
                  }}
                >
                  {/* Farmer Banner / Background Cover */}
                  {cover ? (
                    <img
                      src={cover}
                      alt={`${farmer.name} farm cover`}
                      style={{
                        height: "80px",
                        width: "100%",
                        objectFit: "cover",
                        display: "block",
                      }}
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
                      height: "80px",
                      width: "100%",
                      display: cover ? "none" : "block",
                      background: "linear-gradient(135deg, #0F4926 0%, #1B6B34 60%, #2A8C4A 100%)",
                    }}
                  />

                  {/* Card Content with Overlapping Avatar */}
                  <div style={{ padding: "0 14px 14px", position: "relative" }}>
                    <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginTop: "-26px", marginBottom: "8px" }}>
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
                            boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
                            background: "#FFFFFF",
                            flexShrink: 0,
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
                          boxShadow: "0 2px 8px rgba(0,0,0,0.12)",
                          flexShrink: 0,
                        }}
                      >
                        {initial}
                      </div>

                      <span style={{ fontSize: "12px", fontWeight: 700, color: "#D97706", display: "inline-flex", alignItems: "center", gap: "3px", background: "#FEF3C7", padding: "2px 8px", borderRadius: "99px" }}>
                        <i className="bi bi-star-fill" style={{ fontSize: "10px" }} /> {rating}
                      </span>
                    </div>

                    <div
                      style={{
                        fontWeight: 700,
                        fontSize: "14.5px",
                        color: "var(--ink, #1C1C16)",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {farmer.name}
                    </div>
                    <div
                      style={{
                        fontSize: "12px",
                        color: "var(--clay, #79705F)",
                        marginTop: "2px",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {farmer.farm_name || `${farmer.name.split(" ")[0]} Farm`}
                    </div>
                    <div style={{ marginTop: "6px", display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "11.5px", color: "var(--clay, #79705F)" }}>
                      <span><i className="bi bi-geo-alt me-1" />{farmer.city || farmer.district || "Nearby"}</span>
                      <span style={{ fontWeight: 600, color: "var(--forest, #1B6B34)" }}>{dist}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="empty" style={{ padding: "30px", background: "#FFFFFF", borderRadius: "12px", border: "1px solid var(--line, #E4DFD1)", textAlign: "center" }}>
            <h3 style={{ color: "var(--forest, #1B6B34)" }}>No local farmers found within 25 km</h3>
            <p style={{ color: "var(--clay, #79705F)" }}>Farmers in neighboring districts will appear here as they register.</p>
          </div>
        )}
      </section>
    </div>
  );
}

