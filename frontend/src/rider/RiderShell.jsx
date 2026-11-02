import { useCallback, useEffect, useState } from "react";
import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import { getRiderStatus, updateRiderAvailability } from "../services/api";
import "./rider.css";

export function RiderBikeIcon({ size = 28, className = "" }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      aria-label="Delivery Bike"
    >
      {/* Wheels */}
      <circle cx="12" cy="35" r="6" stroke="#1B6B34" strokeWidth="3" fill="#E8F5E9" />
      <circle cx="36" cy="35" r="6" stroke="#1B6B34" strokeWidth="3" fill="#E8F5E9" />
      <circle cx="12" cy="35" r="2.5" fill="#1B6B34" />
      <circle cx="36" cy="35" r="2.5" fill="#1B6B34" />
      {/* Scooter Frame */}
      <path
        d="M12 35L18 23H27L36 35"
        stroke="#1B6B34"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M22 23L26 13H33"
        stroke="#1B6B34"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Handlebars & Headlight */}
      <path d="M30 13L34 10M33 13H37" stroke="#2E7D32" strokeWidth="2.5" strokeLinecap="round" />
      <circle cx="37" cy="13" r="1.5" fill="#F59E0B" />
      {/* Delivery Trunk Cargo Box */}
      <rect x="7" y="14" width="13" height="11" rx="2" fill="#2E7D32" stroke="#1B6B34" strokeWidth="1.8" />
      <path d="M10 19.5H17M13.5 16V23" stroke="#FFFFFF" strokeWidth="1.5" strokeLinecap="round" />
      {/* Motion Speed Lines */}
      <path d="M38 18L43 18M39 23L44 23" stroke="#81C784" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export default function RiderShell({ user, logout }) {
  const navigate = useNavigate();
  const [rider, setRider] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [toggling, setToggling] = useState(false);

  const refreshRider = useCallback(async () => {
    try {
      const data = await getRiderStatus();
      setRider(data);
    } catch (err) {
      setError(err.message || "Failed to load rider details.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshRider();
  }, [refreshRider]);

  const approved = rider?.approval_status === "APPROVED";
  const online = rider?.availability === "AVAILABLE" || rider?.availability === "BUSY";
  const available = rider?.availability === "AVAILABLE";

  const handleToggleDuty = async () => {
    if (!approved || toggling || rider?.availability === "BUSY") return;
    try {
      setToggling(true);
      const nextRider = await updateRiderAvailability(!available);
      setRider(nextRider);
    } catch (err) {
      setError(err.message || "Unable to change availability status.");
    } finally {
      setToggling(false);
    }
  };

  const handleLogout = () => {
    if (logout) logout();
    navigate("/login");
  };

  return (
    <div className="rider-app-wrapper">
      {/* Top Navbar */}
      <header className="rider-navbar">
        <div className="rider-navbar-inner">
          <Link to="/rider/dashboard" className="rider-brand">
            <div className="rider-logo-pill" title="KisanDirect AI">
              <img
                src="/assets/logos/KisanDirect%20Ai%20logo.png"
                alt="KisanDirect"
                className="rider-logo-img"
              />
            </div>
            <div className="rider-brand-text">
              <div className="d-flex align-items-center gap-2">
                <span className="rider-brand-title">KisanDirect</span>
                <span className="rider-brand-badge">
                  <RiderBikeIcon size={16} />
                  Express
                </span>
              </div>
              <span className="rider-brand-sub">
                {rider?.display_name || user?.email?.split("@")[0] || "Delivery Partner"}
                {approved ? (
                  <span className="rider-approval-pill approved ms-1">
                    <i className="bi bi-patch-check-fill" /> Approved
                  </span>
                ) : rider?.approval_status === "PENDING_APPROVAL" ? (
                  <span className="rider-approval-pill pending ms-1">
                    <i className="bi bi-hourglass-split" /> Pending Approval
                  </span>
                ) : (
                  <span className="rider-approval-pill suspended ms-1">
                    <i className="bi bi-slash-circle-fill" /> Suspended
                  </span>
                )}
              </span>
            </div>
          </Link>

          {/* Center / Right Links */}
          <div className="d-flex align-items-center gap-3">
            {approved && (
              <button
                type="button"
                className={`rider-duty-toggle ${available ? "go-offline" : "go-online"}`}
                onClick={handleToggleDuty}
                disabled={toggling || rider?.availability === "BUSY"}
                title={available ? "Go Offline" : "Go Online"}
              >
                <span
                  className={`rider-duty-indicator ${
                    rider?.availability === "BUSY"
                      ? "busy"
                      : available
                      ? "online"
                      : "offline"
                  }`}
                />
                <span>
                  {rider?.availability === "BUSY"
                    ? "On Delivery"
                    : available
                    ? "Online"
                    : "Go Online"}
                </span>
              </button>
            )}

            <nav className="rider-nav-links">
              <NavLink
                to="/rider/dashboard"
                className={({ isActive }) =>
                  `rider-nav-btn ${isActive ? "active" : ""}`
                }
              >
                <i className="bi bi-box-seam" /> Deliveries
              </NavLink>
              <NavLink
                to="/rider/history"
                className={({ isActive }) =>
                  `rider-nav-btn ${isActive ? "active" : ""}`
                }
              >
                <i className="bi bi-clock-history" /> History
              </NavLink>
              <NavLink
                to="/rider/profile"
                className={({ isActive }) =>
                  `rider-nav-btn ${isActive ? "active" : ""}`
                }
              >
                <i className="bi bi-person-badge" /> Profile
              </NavLink>
            </nav>

            <button
              type="button"
              className="rider-logout-btn"
              onClick={handleLogout}
              title="Logout from rider console"
            >
              <i className="bi bi-box-arrow-right" />
              <span className="d-none d-sm-inline">Logout</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="rider-content-container">
        {error ? (
          <div className="alert alert-danger py-2 px-3 mb-3 d-flex align-items-center gap-2">
            <i className="bi bi-exclamation-triangle-fill" />
            <span>{error}</span>
          </div>
        ) : null}

        <Outlet
          context={{
            rider,
            refreshRider,
            approved,
            online,
            available,
            loading,
            handleToggleDuty,
            toggling,
          }}
        />
      </main>

      {/* Mobile Bottom Navigation Bar */}
      <nav className="rider-mobile-bar" aria-label="Rider Navigation">
        <div className="rider-mobile-bar-inner">
          <NavLink
            to="/rider/dashboard"
            className={({ isActive }) =>
              `rider-mobile-item ${isActive ? "active" : ""}`
            }
          >
            <i className="bi bi-bicycle fs-5" />
            <span>Deliveries</span>
          </NavLink>
          <NavLink
            to="/rider/history"
            className={({ isActive }) =>
              `rider-mobile-item ${isActive ? "active" : ""}`
            }
          >
            <i className="bi bi-clock-history fs-5" />
            <span>History</span>
          </NavLink>
          <NavLink
            to="/rider/profile"
            className={({ isActive }) =>
              `rider-mobile-item ${isActive ? "active" : ""}`
            }
          >
            <i className="bi bi-person-badge fs-5" />
            <span>Profile</span>
          </NavLink>
        </div>
      </nav>
    </div>
  );
}

