import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import { useI18n, languageOptions } from "../i18n";

export default function AppFrame({ user, logout }) {
  const navigate = useNavigate();
  const { language, setLanguage, t } = useI18n();

  if (user?.role === "ADMIN") {
    return <Outlet />;
  }

  const home = user?.role === "FARMER"
    ? "/farmer/dashboard"
    : user?.role === "ADMIN"
      ? "/admin/dashboard"
      : user?.role === "HUB_STAFF"
        ? "/hub-staff/operations"
        : user?.role === "RIDER"
          ? "/rider/dashboard"
        : "/";
  const links = user?.role === "FARMER"
    ? [["Home", "/farmer/dashboard"], ["Crops", "/farmer/crops"], ["Orders", "/farmer/orders"], ["Sales", "/farmer/sales"], ["Profile", "/farmer/profile"]]
    : user?.role === "ADMIN"
      ? [["Dashboard", "/admin/dashboard"]]
      : user?.role === "HUB_STAFF"
        ? [[t("hubOperations.staff.nav"), "/hub-staff/operations"]]
        : user?.role === "RIDER"
          ? [[t("rider.navActive"), "/rider/dashboard"], [t("rider.navHistory"), "/rider/history"]]
        : [["Marketplace", "/"], ["Dashboard", "/consumer/dashboard"], ["Cart", "/cart"], ["Orders", "/orders"], ["Notifications", "/notifications"], ["Profile", "/profile"]];

  const consumer = user?.role === "CONSUMER";
  const consumerLinks = [["Home", "/"], ["Marketplace", "/?view=marketplace"], ["Farmers", "/farmers"], ["Orders", "/orders"], ["Profile", "/profile"]];

  return (
    <main className={`app-shell ${consumer ? "consumer-shell" : ""} ${user?.role === "FARMER" || user?.role === "HUB_STAFF" ? "farmer-app" : ""}`}>
      <header className="topbar">
        <div className="topbar-row">
          <Link className="brand" to={home}>
            <img className="brand-logo" src="/assets/logos/KisanDirect%20Ai%20logo.png" alt="KisanDirect AI" />
            <span><b>KisanDirect</b><small>Farm to table, with clarity.</small></span>
          </Link>

          {consumer ? (
            <div className="consumer-header-actions">
              <NavLink className="consumer-icon-button" to="/notifications" aria-label="Notifications">
                <i className="bi bi-bell" />
                <span className="header-dot" />
              </NavLink>
              <NavLink className="consumer-icon-button" to="/cart" aria-label="Cart">
                <i className="bi bi-cart3" />
                <span className="header-dot" />
              </NavLink>
              <NavLink className="consumer-avatar" to="/profile" aria-label="Profile">
                {(user?.name || user?.email || "U").slice(0, 1).toUpperCase()}
              </NavLink>
            </div>
          ) : (
            <div className="topbar-actions">
              <span className="session-user">{user?.email}</span>
              <label className="header-language">
                <select value={language} onChange={(event) => setLanguage(event.target.value)} aria-label={t("language.label")}>
                  {Object.entries(languageOptions).map(([code, label]) => (
                    <option key={code} value={code}>{label}</option>
                  ))}
                </select>
              </label>
              <button
                className="secondary-button"
                onClick={() => {
                  logout();
                  navigate("/login");
                }}
              >
                Sign out
              </button>
            </div>
          )}
        </div>

        {!consumer && (
          <nav className="header-nav" aria-label="Main navigation">
            {links.map(([label, path]) => (
              <NavLink end={path === "/"} className={({ isActive }) => `nav-item${isActive ? " active" : ""}`} key={path} to={path}>
                {label}
              </NavLink>
            ))}
          </nav>
        )}
      </header>

      {consumer && (
        <div className="consumer-delivery-bar">
          <i className="bi bi-geo-alt" />
          <span>Delivering to</span>
          <b>Delivery location</b>
          <i className="bi bi-chevron-right" />
        </div>
      )}

      <div className="page-shell">
        <Outlet />
      </div>

      <nav className="mobile-bottom-nav" aria-label="Mobile navigation">
        {(consumer ? consumerLinks : links).map(([label, path]) => (
          <NavLink end={path === "/"} className={({ isActive }) => `mobile-nav-item${isActive ? " active" : ""}`} key={`${label}-${path}`} to={path}>
            <i className={`bi ${label === "Home" || label === "Dashboard" ? "bi-house" : label === "Marketplace" ? "bi-basket2" : label === "Farmers" ? "bi-people" : label === "Cart" ? "bi-basket2" : label === "Orders" ? "bi-receipt" : label === "Sales" ? "bi-graph-up" : label === "Profile" ? "bi-person" : label === "Notifications" ? "bi-bell" : label === "Crops" ? "bi-flower1" : "bi-grid-3x3-gap"}`} />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>
    </main>
  );
}
