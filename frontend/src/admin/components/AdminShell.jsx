import { useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useI18n } from "../../i18n";
import "../admin-operations.css";

const navItems = [
  ["adminNavDashboard", "/admin/dashboard", "bi-grid-1x2-fill"],
  ["adminNavUsers", "/admin/users", "bi-people"],
  ["adminNavFarmers", "/admin/farmers", "bi-person-lines-fill"],
  ["adminNavOrders", "/admin/orders", "bi-receipt"],
  ["adminNavDelivery", "/admin/delivery", "bi-truck"],
  ["adminNavRiders", "/admin/riders", "bi-bicycle"],
  ["adminNavHubs", "/admin/hubs", "bi-geo-alt"],
  ["adminNavHubStaff", "/admin/hub-staff", "bi-person-badge"],
  ["adminNavAnalytics", "/admin/analytics", "bi-graph-up"],
];

export default function AdminShell({ user, logout }) {
  const navigate = useNavigate();
  const { t } = useI18n();
  const [open, setOpen] = useState(false);

  return (
    <div className="admin-shell">
      {open && <div className="admin-sidebar-backdrop" onClick={() => setOpen(false)} aria-hidden="true" />}
      <aside className={`admin-sidebar ${open ? "open" : ""}`}>
        <div className="admin-sidebar-header">
          <div className="brand admin-brand">
            <button type="button" className="admin-hamburger admin-hamburger-inverse" onClick={() => setOpen(false)} aria-label="Close admin menu">
              <i className="bi bi-list" />
            </button>
            <img className="brand-logo" src="/assets/logos/KisanDirect%20Ai%20logo.png" alt="KisanDirect AI" />
            <span><b>KisanDirect</b><small>AI</small></span>
          </div>
        </div>

        <nav className="admin-sidebar-nav" aria-label="Admin navigation">
          {navItems.map(([label, path, icon]) => (
            <NavLink
              key={path}
              end={path === "/admin/dashboard"}
              className={({ isActive }) => `admin-nav-item ${isActive ? "active" : ""}`}
              to={path}
              onClick={() => setOpen(false)}
            >
              <i className={`bi ${icon}`} />
              <span>{t(label)}</span>
            </NavLink>
          ))}
          <button type="button" className="admin-logout-button" onClick={() => { logout(); navigate("/admin/login"); }}>
            <i className="bi bi-box-arrow-right" />
            <span>Logout</span>
          </button>
        </nav>
      </aside>

      <div className="admin-shell-main">
        <header className="admin-topbar">
          <div className="admin-topbar-left">
            <button type="button" className="admin-hamburger" onClick={() => setOpen((value) => !value)} aria-label="Open admin menu">
              <i className="bi bi-list" />
            </button>
            <div className="admin-brand-mark-wrapper">
              <img className="brand-logo brand-logo-small" src="/assets/logos/KisanDirect%20Ai%20logo.png" alt="KisanDirect AI" />
              <span className="admin-brand-name">KisanDirect <em>AI</em></span>
            </div>
          </div>

          <div className="admin-topbar-actions">
            <button type="button" className="admin-icon-button" aria-label="Notifications">
              <i className="bi bi-bell" />
            </button>
            <div className="admin-avatar" aria-label="Admin profile">
              {(user?.name || user?.email || "A").slice(0, 1).toUpperCase()}
            </div>
          </div>
        </header>

        <main className="admin-page-content">
          <Outlet />
        </main>

        <nav className="admin-mobile-nav" aria-label="Admin quick navigation">
          {navItems.map(([label, path, icon]) => (
            <NavLink key={path} end={path === "/admin/dashboard"} className={({ isActive }) => `admin-mobile-item ${isActive ? "active" : ""}`} to={path}>
              <i className={`bi ${icon}`} />
              <span>{t(label)}</span>
            </NavLink>
          ))}
        </nav>
      </div>
    </div>
  );
}
