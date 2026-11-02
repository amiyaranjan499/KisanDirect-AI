import { useState, useMemo, useRef, useEffect } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useI18n } from "../../i18n";
import { getFarmerProfile, mediaUrl } from "../../services/api";
import "../farmer-operations.css";

const navSections = [
  {
    groupTitle: "OVERVIEW",
    items: [
      { path: "/farmer/dashboard", icon: "bi-grid-1x2-fill", label: "Dashboard" },
    ],
  },
  {
    groupTitle: "FARM",
    items: [
      { path: "/farmer/crops", icon: "bi-basket2", label: "My Crops" },
      { path: "/farmer/crops/new", icon: "bi-plus-circle", label: "Add Crop" },
      { path: "/farmer/ai-insights", icon: "bi-cpu", label: "Crop Quality AI" },
      { path: "/farmer/orders", icon: "bi-receipt", label: "My Orders" },
      { path: "/farmer/sales", icon: "bi-graph-up", label: "Sales & Analytics" },
      { path: "/farmer/prices", icon: "bi-tag", label: "AI Fair Price" },
      { path: "/farmer/wallet", icon: "bi-wallet2", label: "My Wallet" },
    ],
  },
  {
    groupTitle: "HUB",
    items: [
      { path: "/farmer/hub", icon: "bi-building", label: "My Hub" },
      { path: "/farmer/staff", icon: "bi-people", label: "Hub Staff" },
    ],
  },
  {
    groupTitle: "ACCOUNT",
    items: [
      { path: "/farmer/notifications", icon: "bi-bell", label: "Notifications" },
      { path: "/farmer/profile", icon: "bi-person", label: "Profile" },
      { path: "/farmer/settings", icon: "bi-gear", label: "Settings" },
      { path: "/farmer/help", icon: "bi-question-circle", label: "Help" },
    ],
  },
];

const allNavItems = navSections.flatMap((s) => s.items);

export default function FarmerShell({ user, logout }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useI18n();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [userDropdownOpen, setUserDropdownOpen] = useState(false);
  const [profileImage, setProfileImage] = useState(null);
  const navRef = useRef(null);

  useEffect(() => {
    let mounted = true;
    getFarmerProfile()
      .then((p) => {
        if (mounted && p?.profile_image) {
          setProfileImage(p.profile_image);
        }
      })
      .catch(() => {});

    const handleProfileUpdate = (e) => {
      if (e?.detail?.profile_image !== undefined) {
        setProfileImage(e.detail.profile_image);
      }
    };

    window.addEventListener("farmer-profile-updated", handleProfileUpdate);
    return () => {
      mounted = false;
      window.removeEventListener("farmer-profile-updated", handleProfileUpdate);
    };
  }, []);

  const activeNavItem = useMemo(() => {
    return (
      allNavItems.find((item) => {
        if (item.path === "/farmer/dashboard") return location.pathname === "/farmer/dashboard";
        if (item.path === "/farmer/hub") return location.pathname === "/farmer/hub" || location.pathname === "/farmer/my-hub";
        return location.pathname.startsWith(item.path);
      }) || allNavItems[0]
    );
  }, [location.pathname]);

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  useEffect(() => {
    setUserDropdownOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!userDropdownOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === "Escape") setUserDropdownOpen(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [userDropdownOpen]);

  const handleSidebarWheel = (e) => {
    if (navRef.current) {
      navRef.current.scrollTop += e.deltaY;
    }
  };

  return (
    <div className={`farmer-shell ${collapsed ? "sidebar-collapsed" : ""}`}>
      {/* Mobile Backdrop */}
      {mobileOpen && (
        <div
          className="farmer-sidebar-backdrop"
          onClick={() => setMobileOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Main Persistent Sidebar */}
      <aside
        className={`farmer-sidebar ${mobileOpen ? "open" : ""}`}
        aria-label="Farmer Navigation"
        onWheel={handleSidebarWheel}
      >
        <div className="farmer-sidebar-header">
          <div className="brand farmer-brand">
            <button
              type="button"
              className="farmer-hamburger farmer-hamburger-inverse"
              onClick={() => setMobileOpen(false)}
              aria-label="Close farmer menu"
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
                <small>FARMER</small>
              </span>
            )}
          </div>
          <button
            type="button"
            className="farmer-collapse-toggle d-none d-lg-flex"
            onClick={() => setCollapsed((v) => !v)}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            <i className={`bi ${collapsed ? "bi-chevron-right" : "bi-chevron-left"}`} />
          </button>
        </div>

        <nav ref={navRef} className="farmer-sidebar-nav">
          {navSections.map((section) => (
            <div key={section.groupTitle}>
              <div className="farmer-nav-group-label">
                {!collapsed ? section.groupTitle : "•••"}
              </div>
              {section.items.map((item) => {
                const isItemActive =
                  item.path === "/farmer/dashboard"
                    ? location.pathname === "/farmer/dashboard"
                    : item.path === "/farmer/hub"
                    ? location.pathname === "/farmer/hub" || location.pathname === "/farmer/my-hub"
                    : location.pathname.startsWith(item.path);
                return (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    className={`farmer-nav-item ${isItemActive ? "active" : ""}`}
                    onClick={() => setMobileOpen(false)}
                    title={collapsed ? item.label : undefined}
                  >
                    <i className={`bi ${item.icon}`} aria-hidden="true" />
                    {!collapsed && <span>{item.label}</span>}
                  </NavLink>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="farmer-sidebar-footer">
          <div className={`farmer-user-profile-tile ${collapsed ? "collapsed" : ""}`}>
            <div className="farmer-avatar-tile">
              {profileImage ? (
                <img src={mediaUrl(profileImage)} alt={user?.name || "Farmer"} />
              ) : (
                (user?.name || user?.email || "F").slice(0, 1).toUpperCase()
              )}
            </div>
            {!collapsed && (
              <div className="farmer-user-details">
                <span className="farmer-user-name">{user?.name || "Farmer"}</span>
                <span className="farmer-user-email" title={user?.email}>
                  {user?.email || "farmer@kisandirect.in"}
                </span>
              </div>
            )}
          </div>
          <button
            type="button"
            className="farmer-logout-button"
            onClick={handleLogout}
            title="Log out of Farmer Portal"
          >
            <i className="bi bi-box-arrow-right" aria-hidden="true" />
            {!collapsed && <span>Logout</span>}
          </button>
        </div>
      </aside>

      {/* Main Content Shell */}
      <div className="farmer-shell-main">
        {/* Top Header */}
        <header className={`farmer-topbar ${userDropdownOpen ? "dropdown-active" : ""}`}>
          <div className="farmer-topbar-left">
            <button
              type="button"
              className="farmer-hamburger"
              onClick={() => setMobileOpen((open) => !open)}
              aria-label="Toggle navigation menu"
            >
              <i className="bi bi-list" />
            </button>

            {/* Breadcrumb / Page Title */}
            <nav className="farmer-breadcrumbs" aria-label="Breadcrumb">
              <span className="breadcrumb-root">Farmer</span>
              <i className="bi bi-chevron-right breadcrumb-separator" aria-hidden="true" />
              <span className="breadcrumb-current">{activeNavItem.label}</span>
            </nav>
          </div>

          <div className="farmer-topbar-actions">
            <div className="farmer-status-indicator">
              <span className="pulse-dot" />
              <span className="status-label d-none d-sm-inline">Store Live</span>
            </div>

            <NavLink
              to="/farmer/notifications"
              className="farmer-topbar-btn"
              aria-label="View notifications"
              title="Notifications"
            >
              <i className="bi bi-bell" />
              <span className="dot-badge" />
            </NavLink>

            <div className={`farmer-user-menu-wrap ${userDropdownOpen ? "menu-open" : ""}`}>
              <button
                type="button"
                className={`farmer-avatar-btn ${userDropdownOpen ? "active" : ""}`}
                onClick={() => setUserDropdownOpen((v) => !v)}
                aria-expanded={userDropdownOpen}
                aria-label="Farmer account menu"
              >
                <div className="farmer-avatar">
                  {profileImage ? (
                    <img src={mediaUrl(profileImage)} alt={user?.name || "Farmer"} />
                  ) : (
                    (user?.name || user?.email || "F").slice(0, 1).toUpperCase()
                  )}
                </div>
                <div className="farmer-user-info d-none d-md-flex">
                  <span className="user-name">{user?.name || "Farmer"}</span>
                  <span className="user-role-badge">PRODUCER PARTNER</span>
                </div>
                <i className={`bi bi-chevron-down d-none d-md-inline ms-1 ${userDropdownOpen ? "rotate-180" : ""}`} />
              </button>

              {userDropdownOpen && (
                <>
                  <div
                    className="farmer-dropdown-backdrop"
                    onClick={() => setUserDropdownOpen(false)}
                    aria-hidden="true"
                  />
                  <div className="farmer-user-dropdown" role="menu" aria-label="Farmer account options">
                    <div className="dropdown-user-header">
                      <div className="dropdown-user-avatar">
                        {profileImage ? (
                          <img src={mediaUrl(profileImage)} alt={user?.name || "Farmer"} />
                        ) : (
                          (user?.name || user?.email || "F").slice(0, 1).toUpperCase()
                        )}
                      </div>
                      <div className="dropdown-user-details">
                        <div className="dropdown-user-title-row">
                          <strong className="dropdown-user-name">{user?.name || "Farmer Partner"}</strong>
                          <span className="dropdown-user-badge">Partner</span>
                        </div>
                        <span className="dropdown-user-email" title={user?.email}>
                          {user?.email || "farmer@kisandirect.in"}
                        </span>
                      </div>
                    </div>

                    <div className="farmer-dropdown-nav">
                      <NavLink
                        to="/farmer/profile"
                        className="farmer-dropdown-item"
                        onClick={() => setUserDropdownOpen(false)}
                      >
                        <span className="farmer-dropdown-icon">
                          <i className="bi bi-person-badge" />
                        </span>
                        <div className="farmer-dropdown-text">
                          <span className="item-title">Farm Profile</span>
                          <span className="item-sub">Personal & farm details</span>
                        </div>
                      </NavLink>

                      <NavLink
                        to="/farmer/wallet"
                        className="farmer-dropdown-item"
                        onClick={() => setUserDropdownOpen(false)}
                      >
                        <span className="farmer-dropdown-icon wallet-icon">
                          <i className="bi bi-wallet2" />
                        </span>
                        <div className="farmer-dropdown-text">
                          <span className="item-title">My Wallet</span>
                          <span className="item-sub">Earnings & withdrawals</span>
                        </div>
                      </NavLink>

                      <NavLink
                        to="/farmer/settings"
                        className="farmer-dropdown-item"
                        onClick={() => setUserDropdownOpen(false)}
                      >
                        <span className="farmer-dropdown-icon settings-icon">
                          <i className="bi bi-gear" />
                        </span>
                        <div className="farmer-dropdown-text">
                          <span className="item-title">Settings</span>
                          <span className="item-sub">Preferences & security</span>
                        </div>
                      </NavLink>
                    </div>

                    <div className="farmer-dropdown-divider" />

                    <div className="farmer-dropdown-footer">
                      <button
                        type="button"
                        className="farmer-dropdown-item signout-item"
                        onClick={() => {
                          setUserDropdownOpen(false);
                          handleLogout();
                        }}
                        role="menuitem"
                      >
                        <span className="farmer-dropdown-icon signout-icon">
                          <i className="bi bi-box-arrow-right" />
                        </span>
                        <div className="farmer-dropdown-text">
                          <span className="item-title">Sign Out</span>
                        </div>
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main className="farmer-page-content">
          <Outlet />
        </main>

        {/* Mobile Navigation Bar */}
        <nav className="farmer-mobile-nav" aria-label="Quick mobile navigation">
          {[
            { path: "/farmer/dashboard", icon: "bi-grid-1x2-fill", label: "Dashboard" },
            { path: "/farmer/crops", icon: "bi-basket2", label: "Crops" },
            { path: "/farmer/orders", icon: "bi-receipt", label: "Orders" },
            { path: "/farmer/hub", icon: "bi-building", label: "My Hub" },
          ].map((item) => {
            const isItemActive =
              item.path === "/farmer/dashboard"
                ? location.pathname === "/farmer/dashboard"
                : location.pathname.startsWith(item.path);
            return (
              <NavLink
                key={item.path}
                to={item.path}
                className={`farmer-mobile-item ${isItemActive ? "active" : ""}`}
              >
                <i className={`bi ${item.icon}`} aria-hidden="true" />
                <span>{item.label}</span>
              </NavLink>
            );
          })}
          <button
            type="button"
            className="farmer-mobile-item"
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

