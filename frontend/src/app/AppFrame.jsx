import { useState, useEffect } from "react";
import { Link, NavLink, Outlet, useNavigate, useLocation } from "react-router-dom";
import { useI18n } from "../i18n";
import { getStoredLocation, subscribeLocation, detectRealLocation, setManualLocation } from "../services/locationService";
import { getConsumerProfile, cartRequest } from "../services/api";
import "../consumer/consumer-shell.css";

export default function AppFrame({ user, logout }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useI18n();

  // Non-consumer roles have their own dedicated shells
  if (user?.role === "ADMIN" || user?.role === "FARMER" || user?.role === "RIDER" || user?.role === "HUB_STAFF") {
    return <Outlet />;
  }

  // Sidebar collapse & mobile drawer state
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  // Close mobile drawer on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  // Consumer Profile & Avatar
  const [consumerProfile, setConsumerProfile] = useState(null);
  const [consumerAvatar, setConsumerAvatar] = useState(() => {
    return typeof localStorage !== "undefined"
      ? localStorage.getItem("kisandirect_consumer_avatar")
      : null;
  });

  useEffect(() => {
    getConsumerProfile()
      .then((profile) => {
        setConsumerProfile(profile);
      })
      .catch(() => null);
  }, []);

  useEffect(() => {
    const handleAvatarUpdate = (e) => {
      setConsumerAvatar(e.detail !== undefined ? e.detail : localStorage.getItem("kisandirect_consumer_avatar"));
    };
    window.addEventListener("kisandirect_avatar_changed", handleAvatarUpdate);
    window.addEventListener("storage", handleAvatarUpdate);
    return () => {
      window.removeEventListener("kisandirect_avatar_changed", handleAvatarUpdate);
      window.removeEventListener("storage", handleAvatarUpdate);
    };
  }, []);

  // Real-time Delivery Location
  const [liveLocation, setLiveLocation] = useState(() => getStoredLocation());
  const [showLocationModal, setShowLocationModal] = useState(false);
  const [detectingLocation, setDetectingLocation] = useState(false);
  const [locationError, setLocationError] = useState("");
  const [manualCity, setManualCity] = useState("");
  const [manualState, setManualState] = useState("");
  const [manualPin, setManualPin] = useState("");

  useEffect(() => {
    const unsub = subscribeLocation((loc) => {
      setLiveLocation(loc);
    });
    return unsub;
  }, []);

  const handleDetectGPS = async () => {
    setDetectingLocation(true);
    setLocationError("");
    try {
      await detectRealLocation(true);
      setShowLocationModal(false);
    } catch (err) {
      setLocationError(err.message || "Failed to detect location. Please check browser permissions.");
    } finally {
      setDetectingLocation(false);
    }
  };

  const handleSaveManualLocation = (e) => {
    e.preventDefault();
    if (!manualCity.trim()) {
      setLocationError("Please enter your city.");
      return;
    }
    setManualLocation(
      {
        city: manualCity.trim(),
        state: manualState.trim(),
        pin_code: manualPin.trim(),
      },
      true
    );
    setShowLocationModal(false);
  };

  // Real Cart Item Count
  const [cartCount, setCartCount] = useState(0);

  const refreshCart = () => {
    cartRequest("/cart")
      .then((data) => {
        setCartCount(data?.items?.length || 0);
      })
      .catch(() => null);
  };

  useEffect(() => {
    refreshCart();
    const handleCartUpdate = () => refreshCart();
    window.addEventListener("kisandirect_cart_updated", handleCartUpdate);
    return () => window.removeEventListener("kisandirect_cart_updated", handleCartUpdate);
  }, []);

  // Display string for delivery location
  const locationDisplay =
    liveLocation?.formatted ||
    (consumerProfile?.city
      ? `${consumerProfile.city}${consumerProfile.state ? `, ${consumerProfile.state}` : ""}${consumerProfile.pin_code ? ` — ${consumerProfile.pin_code}` : ""}`
      : "Yelahanka, Karnataka — 560064");

  return (
    <div className={`consumer-shell ${collapsed ? "sidebar-collapsed" : ""}`}>
      {/* Mobile Drawer Backdrop */}
      <div
        className={`consumer-sidebar-backdrop ${mobileOpen ? "open" : ""}`}
        onClick={() => setMobileOpen(false)}
        aria-hidden="true"
      />

      {/* Main Persistent Dark-Green Sidebar */}
      <aside
        className={`consumer-sidebar ${mobileOpen ? "open" : ""}`}
        aria-label="Customer Navigation"
      >
        {/* Sidebar Header */}
        <div className="consumer-sidebar-header">
          <Link className="consumer-brand" to="/" onClick={() => setMobileOpen(false)}>
            <img
              className="brand-logo"
              src="/assets/logos/KisanDirect%20Ai%20logo.png"
              alt="KisanDirect AI"
            />
            {!collapsed && (
              <div className="brand-text">
                <b>KisanDirect</b>
                <span className="consumer-role-pill">CONSUMER</span>
              </div>
            )}
          </Link>
          <button
            type="button"
            className="consumer-collapse-toggle hide-mobile"
            onClick={() => setCollapsed(!collapsed)}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            <i className={`bi ${collapsed ? "bi-chevron-right" : "bi-chevron-left"}`} />
          </button>
        </div>

        {/* Sidebar Navigation Items */}
        <nav className="consumer-sidebar-nav">
          <div className="consumer-nav-group-label">{t?.("overview") || "OVERVIEW"}</div>
          <NavLink
            to="/"
            end
            className={({ isActive }) => `consumer-nav-item${isActive || location.pathname === "/consumer/dashboard" ? " active" : ""}`}
            onClick={() => setMobileOpen(false)}
          >
            <i className="bi bi-grid-1x2-fill" />
            {!collapsed && <span>{t?.("dashboard") || "Dashboard"}</span>}
          </NavLink>
          <div className="consumer-nav-group-label">SHOPPING</div>
          <NavLink
            to="/marketplace"
            className={({ isActive }) => `consumer-nav-item${isActive ? " active" : ""}`}
            onClick={() => setMobileOpen(false)}
          >
            <i className="bi bi-shop" />
            {!collapsed && <span>Marketplace</span>}
          </NavLink>
          <NavLink
            to="/farmers"
            className={({ isActive }) => `consumer-nav-item${isActive ? " active" : ""}`}
            onClick={() => setMobileOpen(false)}
          >
            <i className="bi bi-flower1" />
            {!collapsed && <span>Nearby Farmers</span>}
          </NavLink>

          <div className="consumer-nav-group-label">ORDERS & CART</div>
          <NavLink
            to="/cart"
            className={({ isActive }) => `consumer-nav-item${isActive ? " active" : ""}`}
            onClick={() => setMobileOpen(false)}
          >
            <i className="bi bi-cart3" />
            {!collapsed && <span>My Cart</span>}
            {!collapsed && cartCount > 0 && (
              <span className="consumer-nav-badge">{cartCount}</span>
            )}
          </NavLink>
          <NavLink
            to="/orders"
            className={({ isActive }) => `consumer-nav-item${isActive ? " active" : ""}`}
            onClick={() => setMobileOpen(false)}
          >
            <i className="bi bi-receipt" />
            {!collapsed && <span>My Orders</span>}
          </NavLink>
          <NavLink
            to="/profile?section=reviews"
            className={() => `consumer-nav-item${location.pathname === "/profile" && location.search.includes("reviews") ? " active" : ""}`}
            onClick={() => setMobileOpen(false)}
          >
            <i className="bi bi-star" />
            {!collapsed && <span>My Reviews</span>}
          </NavLink>

          <div className="consumer-nav-group-label">ACCOUNT</div>
          <NavLink
            to="/profile"
            end
            className={() => `consumer-nav-item${location.pathname === "/profile" && !location.search ? " active" : ""}`}
            onClick={() => setMobileOpen(false)}
          >
            <i className="bi bi-person" />
            {!collapsed && <span>My Profile</span>}
          </NavLink>
          <NavLink
            to="/profile?section=addresses"
            className={() => `consumer-nav-item${location.pathname === "/profile" && location.search.includes("addresses") ? " active" : ""}`}
            onClick={() => setMobileOpen(false)}
          >
            <i className="bi bi-geo-alt" />
            {!collapsed && <span>Addresses</span>}
          </NavLink>
          <NavLink
            to="/payment-methods"
            className={({ isActive }) => `consumer-nav-item${isActive ? " active" : ""}`}
            onClick={() => setMobileOpen(false)}
          >
            <i className="bi bi-credit-card" />
            {!collapsed && <span>Payment Methods</span>}
          </NavLink>
          <NavLink
            to="/notifications"
            className={({ isActive }) => `consumer-nav-item${isActive ? " active" : ""}`}
            onClick={() => setMobileOpen(false)}
          >
            <i className="bi bi-bell" />
            {!collapsed && <span>Notifications</span>}
          </NavLink>
          <NavLink
            to="/settings"
            className={({ isActive }) => `consumer-nav-item${isActive ? " active" : ""}`}
            onClick={() => setMobileOpen(false)}
          >
            <i className="bi bi-gear" />
            {!collapsed && <span>Settings</span>}
          </NavLink>
          <NavLink
            to="/help"
            className={({ isActive }) => `consumer-nav-item${isActive ? " active" : ""}`}
            onClick={() => setMobileOpen(false)}
          >
            <i className="bi bi-question-circle" />
            {!collapsed && <span>Help & Support</span>}
          </NavLink>
        </nav>

        {/* Sidebar Footer with Real User Data */}
        <div className="consumer-sidebar-footer">
          <Link to="/profile" className="consumer-user-tile" onClick={() => setMobileOpen(false)}>
            <div className="consumer-avatar-tile">
              {consumerAvatar ? (
                <img src={consumerAvatar} alt="Profile" />
              ) : (
                (user?.name || user?.email || "C").slice(0, 1).toUpperCase()
              )}
            </div>
            {!collapsed && (
              <div className="consumer-user-meta">
                <span className="consumer-user-name">{user?.name || "Customer"}</span>
                <span className="consumer-user-email">{user?.email || "customer@kisandirect.in"}</span>
              </div>
            )}
          </Link>
          {!collapsed && (
            <button
              type="button"
              className="consumer-signout-btn"
              onClick={() => {
                logout();
                navigate("/login");
              }}
            >
              <i className="bi bi-box-arrow-right" />
              <span>Sign Out</span>
            </button>
          )}
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="consumer-main-layout">
        {/* Topbar Header */}
        <header className="consumer-topbar">
          <div className="consumer-topbar-left">
            <button
              type="button"
              className="consumer-hamburger"
              onClick={() => setMobileOpen(true)}
              aria-label="Open navigation sidebar"
            >
              <i className="bi bi-list" />
            </button>

            {/* Real Delivery Location Pill */}
            <div
              className="consumer-location-chip"
              onClick={() => {
                setManualCity(liveLocation?.city || consumerProfile?.city || "");
                setManualState(liveLocation?.state || consumerProfile?.state || "");
                setManualPin(liveLocation?.pin_code || consumerProfile?.pin_code || "");
                setLocationError("");
                setShowLocationModal(true);
              }}
              role="button"
              tabIndex={0}
              title="Click to change delivery location"
            >
              <i className="bi bi-geo-alt-fill" />
              <span className="loc-label">Delivering to:</span>
              <span className="loc-val">{locationDisplay}</span>
              <i className="bi bi-chevron-right ms-1" style={{ fontSize: "10px" }} />
            </div>
          </div>

          <div className="consumer-topbar-right">
            <NavLink to="/marketplace" className="consumer-topbar-iconbtn" title="Search crops">
              <i className="bi bi-search" />
            </NavLink>
            <NavLink to="/notifications" className="consumer-topbar-iconbtn" title="Notifications">
              <i className="bi bi-bell" />
            </NavLink>
            <NavLink to="/cart" className="consumer-topbar-iconbtn" title="Cart">
              <i className="bi bi-cart3" />
              {cartCount > 0 && (
                <span className="consumer-topbar-badge">{cartCount}</span>
              )}
            </NavLink>
            <NavLink to="/profile" className="consumer-topbar-avatar" title="Profile">
              {consumerAvatar ? (
                <img src={consumerAvatar} alt="Profile" />
              ) : (
                (user?.name || user?.email || "C").slice(0, 1).toUpperCase()
              )}
            </NavLink>
          </div>
        </header>

        {/* Real-time Location Picker Modal */}
        {showLocationModal && (
          <div
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(18, 38, 26, 0.5)",
              backdropFilter: "blur(6px)",
              WebkitBackdropFilter: "blur(6px)",
              zIndex: 9999,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "16px",
            }}
            onClick={() => setShowLocationModal(false)}
          >
            <div
              style={{
                background: "#FFFFFF",
                borderRadius: "18px",
                maxWidth: "440px",
                width: "100%",
                padding: "24px",
                boxShadow: "0 20px 50px rgba(0, 0, 0, 0.22)",
                border: "1px solid var(--consumer-border)",
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <div style={{ width: "36px", height: "36px", borderRadius: "10px", background: "rgba(27, 107, 52, 0.1)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <i className="bi bi-geo-alt-fill" style={{ color: "#1B6B34", fontSize: "18px" }} />
                  </div>
                  <div>
                    <h3 style={{ margin: 0, fontSize: "18px", fontWeight: 700, color: "var(--forest, #1B6B34)", fontFamily: "'Fraunces', Georgia, serif" }}>
                      Delivery Location
                    </h3>
                    <div style={{ fontSize: "12px", color: "#79705F" }}>
                      Connect directly with local hubs near you
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowLocationModal(false)}
                  style={{
                    background: "transparent",
                    border: "none",
                    color: "#79705F",
                    fontSize: "20px",
                    cursor: "pointer",
                    padding: "4px",
                  }}
                  aria-label="Close"
                >
                  <i className="bi bi-x-lg" />
                </button>
              </div>

              {locationError ? (
                <div style={{ background: "#FEE2E2", color: "#991B1B", padding: "10px 14px", borderRadius: "8px", fontSize: "13px", marginBottom: "14px" }}>
                  {locationError}
                </div>
              ) : null}

              {/* GPS Auto-detect Button */}
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleDetectGPS}
                disabled={detectingLocation}
                style={{
                  width: "100%",
                  padding: "12px 16px",
                  borderRadius: "10px",
                  fontWeight: 600,
                  fontSize: "14px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "8px",
                  cursor: detectingLocation ? "not-allowed" : "pointer",
                  background: "#1B6B34",
                  border: "none",
                }}
              >
                {detectingLocation ? (
                  <>
                    <span className="spinner-border spinner-border-sm" role="status" aria-hidden="true" />
                    <span>Locating via GPS...</span>
                  </>
                ) : (
                  <>
                    <i className="bi bi-crosshair2" style={{ fontSize: "16px" }} />
                    <span>Use Live GPS Location</span>
                  </>
                )}
              </button>

              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                  margin: "18px 0 16px",
                  color: "#79705F",
                  fontSize: "11.5px",
                  fontWeight: 600,
                  textTransform: "uppercase",
                  letterSpacing: "0.5px",
                }}
              >
                <div style={{ flex: 1, height: "1px", background: "#E4DFD1" }} />
                <span>or enter manually</span>
                <div style={{ flex: 1, height: "1px", background: "#E4DFD1" }} />
              </div>

              <form onSubmit={handleSaveManualLocation}>
                <div style={{ display: "flex", flexDirection: "column", gap: "12px", marginBottom: "18px" }}>
                  <div>
                    <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "#79705F", marginBottom: "4px" }}>
                      City / Town *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Pune, Nashik, Mumbai, Bengaluru"
                      value={manualCity}
                      onChange={(e) => setManualCity(e.target.value)}
                      style={{
                        width: "100%",
                        padding: "10px 14px",
                        borderRadius: "10px",
                        border: "1px solid #E4DFD1",
                        fontSize: "14px",
                      }}
                    />
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                    <div>
                      <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "#79705F", marginBottom: "4px" }}>
                        State
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. Karnataka"
                        value={manualState}
                        onChange={(e) => setManualState(e.target.value)}
                        style={{
                          width: "100%",
                          padding: "10px 14px",
                          borderRadius: "10px",
                          border: "1px solid #E4DFD1",
                          fontSize: "14px",
                        }}
                      />
                    </div>
                    <div>
                      <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "#79705F", marginBottom: "4px" }}>
                        Pin Code
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. 560064"
                        value={manualPin}
                        onChange={(e) => setManualPin(e.target.value)}
                        style={{
                          width: "100%",
                          padding: "10px 14px",
                          borderRadius: "10px",
                          border: "1px solid #E4DFD1",
                          fontSize: "14px",
                        }}
                      />
                    </div>
                  </div>
                </div>

                <div style={{ display: "flex", gap: "10px" }}>
                  <button
                    type="button"
                    className="btn btn-outline"
                    onClick={() => setShowLocationModal(false)}
                    style={{
                      flex: 1,
                      padding: "10px",
                      fontSize: "13.5px",
                      cursor: "pointer",
                      borderRadius: "8px",
                      border: "1px solid #E4DFD1",
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="btn btn-success"
                    style={{
                      flex: 2,
                      padding: "10px",
                      fontSize: "13.5px",
                      cursor: "pointer",
                      borderRadius: "8px",
                      background: "#1B6B34",
                      border: "none",
                    }}
                  >
                    Save & Deliver Here
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Page Content View */}
        <main className="consumer-page-content">
          <Outlet />
        </main>

        {/* Mobile Bottom Navigation Bar */}
        <nav className="consumer-mobile-nav" aria-label="Mobile navigation">
          {[
            { path: "/marketplace", icon: "bi-shop", label: "Shop" },
            { path: "/farmers", icon: "bi-flower1", label: "Farmers" },
            { path: "/cart", icon: "bi-cart3", label: "Cart", badge: cartCount },
            { path: "/orders", icon: "bi-receipt", label: "Orders" },
            { path: "/profile", icon: "bi-person", label: "Profile" },
          ].map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) => `consumer-mobile-nav-item${isActive ? " active" : ""}`}
            >
              <i className={`bi ${item.icon}`} />
              <span>{item.label}</span>
              {item.badge > 0 && <span className="mobile-badge">{item.badge}</span>}
            </NavLink>
          ))}
        </nav>
      </div>
    </div>
  );
}
