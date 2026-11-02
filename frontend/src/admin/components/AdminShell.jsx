import { useState, useMemo, useRef } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useI18n } from "../../i18n";
import "../admin-operations.css";

const navItems = [
  { key: "adminNavDashboard", path: "/admin/dashboard", icon: "bi-grid-1x2-fill", label: "Dashboard" },
  { key: "adminNavUsers", path: "/admin/users", icon: "bi-people", label: "Users" },
  { key: "adminNavFarmers", path: "/admin/farmers", icon: "bi-person-lines-fill", label: "Farmers" },
  { key: "adminNavListings", path: "/admin/listings", icon: "bi-basket2", label: "Listings" },
  { key: "adminNavOrders", path: "/admin/orders", icon: "bi-receipt", label: "Orders" },
  { key: "adminNavPayments", path: "/admin/payments", icon: "bi-credit-card", label: "Payments" },
  { key: "adminNavDelivery", path: "/admin/delivery", icon: "bi-truck", label: "Delivery" },
  { key: "adminNavRiders", path: "/admin/riders", icon: "bi-bicycle", label: "Riders" },
  { key: "adminNavHubs", path: "/admin/hubs", icon: "bi-geo-alt", label: "Hubs" },
  { key: "adminNavHubStaff", path: "/admin/hub-staff", icon: "bi-person-badge", label: "Hub Staff" },
  { key: "adminNavReviews", path: "/admin/reviews", icon: "bi-star", label: "Reviews" },
  { key: "adminNavAnalytics", path: "/admin/analytics", icon: "bi-graph-up", label: "Analytics" },
];

export default function AdminShell({ user, logout }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useI18n();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [userDropdownOpen, setUserDropdownOpen] = useState(false);
  const navRef = useRef(null);

  const activeNavItem = useMemo(() => {
    return navItems.find((item) => location.pathname.startsWith(item.path)) || navItems[0];
  }, [location.pathname]);

  const handleLogout = () => {
    logout();
    navigate("/admin/login");
  };

  const handleSidebarWheel = (e) => {
    if (navRef.current) {
      navRef.current.scrollTop += e.deltaY;
    }
  };

  return (
    <div className={`admin-shell ${collapsed ? "sidebar-collapsed" : ""}`}>
      {/* Mobile Backdrop */}
      {mobileOpen && (
        <div
          className="admin-sidebar-backdrop"
          onClick={() => setMobileOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Main Sidebar */}
      <aside
        className={`admin-sidebar ${mobileOpen ? "open" : ""}`}
        aria-label="Admin Navigation"
        onWheel={handleSidebarWheel}
      >
        <div className="admin-sidebar-header">
          <div className="brand admin-brand">
            <button
              type="button"
              className="admin-hamburger admin-hamburger-inverse"
              onClick={() => setMobileOpen(false)}
              aria-label="Close admin menu"
            >
              <i className="bi bi-x-lg" />
            </button>
            <img
              className="brand-logo"
              src="/assets/logos/KisanDirect%20Ai%20logo.png"
              alt="KisanDirect AI"
            />
            {!collapsed && (
              <span className="brand-text">
                <b>KisanDirect</b>
                <small>ADMIN</small>
              </span>
            )}
          </div>
          <button
            type="button"
            className="admin-collapse-toggle d-none d-lg-flex"
            onClick={() => setCollapsed((v) => !v)}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            <i className={`bi ${collapsed ? "bi-chevron-right" : "bi-chevron-left"}`} />
          </button>
        </div>

        <nav ref={navRef} className="admin-sidebar-nav">
          <div className="admin-nav-group-label">{!collapsed ? "PLATFORM MANAGEMENT" : "•••"}</div>
          {navItems.map((item) => {
            const isItemActive = location.pathname.startsWith(item.path);
            const labelText = t(item.key) !== item.key ? t(item.key) : item.label;
            return (
              <NavLink
                key={item.path}
                to={item.path}
                className={`admin-nav-item ${isItemActive ? "active" : ""}`}
                onClick={() => setMobileOpen(false)}
                title={collapsed ? labelText : undefined}
              >
                <i className={`bi ${item.icon}`} aria-hidden="true" />
                {!collapsed && <span>{labelText}</span>}
              </NavLink>
            );
          })}
        </nav>

        <div className="admin-sidebar-footer">
          <div className={`admin-user-profile-tile ${collapsed ? "collapsed" : ""}`}>
            <div className="admin-avatar-tile">
              {(user?.name || user?.email || "A").slice(0, 1).toUpperCase()}
            </div>
            {!collapsed && (
              <div className="admin-user-details">
                <span className="admin-user-name">{user?.name || "Admin"}</span>
                <span className="admin-user-email" title={user?.email}>{user?.email || "admin@kisandirect.in"}</span>
              </div>
            )}
          </div>
          <button
            type="button"
            className="admin-logout-button"
            onClick={handleLogout}
            title="Log out of Admin Portal"
          >
            <i className="bi bi-box-arrow-right" aria-hidden="true" />
            {!collapsed && <span>Logout</span>}
          </button>
        </div>
      </aside>

      {/* Main Content Shell */}
      <div className="admin-shell-main">
        {/* Top Header */}
        <header className="admin-topbar">
          <div className="admin-topbar-left">
            <button
              type="button"
              className="admin-hamburger"
              onClick={() => setMobileOpen((open) => !open)}
              aria-label="Toggle navigation menu"
            >
              <i className="bi bi-list" />
            </button>

            {/* Breadcrumb / Page Title */}
            <nav className="admin-breadcrumbs" aria-label="Breadcrumb">
              <span className="breadcrumb-root">Admin</span>
              <i className="bi bi-chevron-right breadcrumb-separator" aria-hidden="true" />
              <span className="breadcrumb-current">
                {t(activeNavItem.key) !== activeNavItem.key ? t(activeNavItem.key) : activeNavItem.label}
              </span>
            </nav>
          </div>

          <div className="admin-topbar-actions">
            <div className="admin-status-indicator">
              <span className="pulse-dot" />
              <span className="status-label d-none d-sm-inline">System Live</span>
            </div>

            <div className="admin-user-menu-wrap">
              <button
                type="button"
                className="admin-avatar-btn"
                onClick={() => setUserDropdownOpen((v) => !v)}
                aria-expanded={userDropdownOpen}
                aria-label="User account menu"
              >
                <div className="admin-avatar">
                  {(user?.name || user?.email || "A").slice(0, 1).toUpperCase()}
                </div>
                <div className="admin-user-info d-none d-md-flex">
                  <span className="user-name">{user?.name || "Admin"}</span>
                  <span className="user-role-badge">PLATFORM ADMIN</span>
                </div>
                <i className="bi bi-chevron-down d-none d-md-inline ms-1" />
              </button>

              {userDropdownOpen && (
                <>
                  <div
                    className="admin-dropdown-backdrop"
                    onClick={() => setUserDropdownOpen(false)}
                    aria-hidden="true"
                  />
                  <div className="admin-user-dropdown" role="menu">
                    <div className="dropdown-user-header">
                      <strong>{user?.name || "Administrator"}</strong>
                      <small>{user?.email}</small>
                    </div>
                    <div className="dropdown-divider" />
                    <button
                      type="button"
                      className="dropdown-item text-danger"
                      onClick={() => {
                        setUserDropdownOpen(false);
                        handleLogout();
                      }}
                      role="menuitem"
                    >
                      <i className="bi bi-box-arrow-right me-2" />
                      Sign Out
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main className="admin-page-content">
          <Outlet />
        </main>

        {/* Mobile Navigation Bar */}
        <nav className="admin-mobile-nav" aria-label="Quick mobile navigation">
          {navItems.slice(0, 5).map((item) => {
            const isItemActive = location.pathname.startsWith(item.path);
            const labelText = t(item.key) !== item.key ? t(item.key) : item.label;
            return (
              <NavLink
                key={item.path}
                to={item.path}
                className={`admin-mobile-item ${isItemActive ? "active" : ""}`}
              >
                <i className={`bi ${item.icon}`} aria-hidden="true" />
                <span>{labelText}</span>
              </NavLink>
            );
          })}
          <button
            type="button"
            className="admin-mobile-item"
            onClick={() => setMobileOpen(true)}
            aria-label="More navigation options"
          >
            <i className="bi bi-grid" />
            <span>More</span>
          </button>
        </nav>
      </div>
    </div>
  );
}
