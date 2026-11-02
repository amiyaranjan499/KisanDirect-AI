import { useState } from "react";
import { useOutletContext, useNavigate } from "react-router-dom";
import { updateRiderProfile } from "../services/api";
import { RiderBikeIcon } from "./RiderShell";

export default function RiderProfilePage({ onLogout }) {
  const navigate = useNavigate();
  const context = useOutletContext() || {};
  const { rider, refreshRider, approved } = context;

  const [displayName, setDisplayName] = useState(() => rider?.display_name || "");
  const [vehicleType, setVehicleType] = useState(
    () => rider?.vehicle_type || "Motorcycle / Delivery Bike"
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const handleSaveProfile = async (e) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    try {
      setSaving(true);
      await updateRiderProfile({
        display_name: displayName.trim() || null,
        vehicle_type: vehicleType.trim() || null,
      });
      if (refreshRider) await refreshRider();
      setSuccess("Delivery partner profile updated successfully.");
    } catch (err) {
      setError(err.message || "Failed to update profile details.");
    } finally {
      setSaving(false);
    }
  };

  const handleLogoutClick = () => {
    if (onLogout) {
      onLogout();
    }
    navigate("/login");
  };

  return (
    <div style={{ maxWidth: "680px", margin: "0 auto" }}>
      {/* Top Profile Summary Card */}
      <div className="card bg-white p-4 border shadow-sm rounded-4 mb-4">
        <div className="d-flex align-items-center gap-3">
          <div className="rider-bike-badge" style={{ width: "56px", height: "56px" }}>
            <RiderBikeIcon size={34} />
          </div>
          <div>
            <h2 className="h5 fw-bold mb-1">
              {rider?.display_name || "Delivery Partner"}
            </h2>
            <div className="text-muted small mb-2">{rider?.email}</div>
            <div>
              {approved ? (
                <span className="rider-approval-pill approved">
                  <i className="bi bi-patch-check-fill" /> Approved Rider Partner
                </span>
              ) : rider?.approval_status === "PENDING_APPROVAL" ? (
                <span className="rider-approval-pill pending">
                  <i className="bi bi-hourglass-split" /> Awaiting One-Time Approval
                </span>
              ) : (
                <span className="rider-approval-pill suspended">
                  <i className="bi bi-slash-circle-fill" /> Suspended
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Notifications */}
      {error && (
        <div className="alert alert-danger py-2 px-3 mb-3 d-flex align-items-center gap-2">
          <i className="bi bi-exclamation-triangle-fill" />
          <span>{error}</span>
        </div>
      )}
      {success && (
        <div className="alert alert-success py-2 px-3 mb-3 d-flex align-items-center gap-2">
          <i className="bi bi-check-circle-fill" />
          <span>{success}</span>
        </div>
      )}

      {/* Edit Profile Form */}
      <div className="card bg-white p-4 border shadow-sm rounded-4 mb-4">
        <h3 className="h6 fw-bold mb-3 d-flex align-items-center gap-2 text-success">
          <i className="bi bi-gear-fill" /> Partner Details & Vehicle
        </h3>

        <form onSubmit={handleSaveProfile}>
          <div className="mb-3">
            <label className="form-label small fw-semibold text-muted">
              Display Name (shown to Hubs & Consumers)
            </label>
            <input
              type="text"
              className="form-control"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="e.g. Ramesh Kumar"
              required
            />
          </div>

          <div className="mb-3">
            <label className="form-label small fw-semibold text-muted">
              Delivery Vehicle Type
            </label>
            <select
              className="form-select"
              value={vehicleType}
              onChange={(e) => setVehicleType(e.target.value)}
            >
              <option value="Motorcycle / Delivery Bike">Motorcycle / Delivery Bike</option>
              <option value="Electric Scooter (EV Bike)">Electric Scooter (EV Bike)</option>
              <option value="Bicycle / Cycle">Bicycle / Cycle</option>
              <option value="Auto / Three Wheeler">Auto / Three Wheeler</option>
            </select>
            <div className="form-text small">
              Choose your primary vehicle used for local quick-commerce deliveries.
            </div>
          </div>

          <div className="mb-3">
            <label className="form-label small fw-semibold text-muted">
              Account Email
            </label>
            <input
              type="email"
              className="form-control bg-light"
              value={rider?.email || ""}
              disabled
              readOnly
            />
          </div>

          <button
            type="submit"
            className="btn btn-success fw-semibold px-4"
            disabled={saving}
          >
            {saving ? "Saving Changes..." : "Save Details"}
          </button>
        </form>
      </div>

      {/* One-Time Approval Explainer */}
      <div className="card bg-light p-4 border rounded-4 mb-4">
        <h4 className="h6 fw-bold mb-2 text-dark d-flex align-items-center gap-2">
          <i className="bi bi-shield-check text-success" />
          About KisanDirect One-Time Verification
        </h4>
        <p className="text-muted small mb-0 lh-base">
          All delivery partners registered on KisanDirect undergo a one-time verification by the platform
          administrator. Once approved, you gain permanent access to accept delivery trips, receive
          real-time Kisan Hub order offers, and track your trip history anytime.
        </p>
      </div>

      {/* Logout Action */}
      <div className="card bg-white p-3 border shadow-sm rounded-4 text-center">
        <button
          type="button"
          className="btn btn-outline-danger fw-semibold px-4 mx-auto d-inline-flex align-items-center gap-2"
          onClick={handleLogoutClick}
        >
          <i className="bi bi-box-arrow-right" /> Log Out of Rider Account
        </button>
      </div>
    </div>
  );
}

