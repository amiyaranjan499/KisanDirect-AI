import { useEffect, useState } from "react";
import {
  listFarmerFacilities,
  createFarmerFacility,
  updateFarmerFacility,
  deleteFarmerFacility,
} from "../services/api";
import { detectRealLocation } from "../services/locationService";
import "./farmer-operations.css";

const emptyHubForm = {
  name: "",
  address: "",
  village_or_locality: "",
  district: "",
  state: "",
  pincode: "",
  service_radius_km: 8,
};

export default function FarmerMyHub() {
  const [facilities, setFacilities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Modals & forms
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingHubId, setEditingHubId] = useState(null);
  const [createForm, setCreateForm] = useState(emptyHubForm);
  const [editForm, setEditForm] = useState(emptyHubForm);
  const [savingHub, setSavingHub] = useState(false);
  const [locating, setLocating] = useState(false);
  const [deleteConfirmHub, setDeleteConfirmHub] = useState(null);
  const [deletingHub, setDeletingHub] = useState(false);

  const loadData = async () => {
    setLoading(true);
    setError("");
    try {
      const facs = await listFarmerFacilities();
      const validFacs = Array.isArray(facs) ? facs : [];
      setFacilities(validFacs);
    } catch (err) {
      setError(err.message || "Failed to load hubs.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleDetectLocation = async (formSetter) => {
    setLocating(true);
    setError("");
    try {
      const loc = await detectRealLocation(false);
      formSetter((curr) => ({
        ...curr,
        address: loc.address || loc.address_line || curr.address,
        village_or_locality: loc.district || loc.city || curr.village_or_locality,
        district: loc.district || loc.city || curr.district,
        state: loc.state || curr.state,
        pincode: loc.pin_code && /^[1-9][0-9]{5}$/.test(loc.pin_code) ? loc.pin_code : curr.pincode,
      }));
    } catch (geoErr) {
      setError(`Unable to detect address: ${geoErr.message || "Please enter your address manually."}`);
    } finally {
      setLocating(false);
    }
  };

  const handleOpenEditModal = (hub) => {
    setEditingHubId(hub.id);
    setEditForm({
      name: hub.name || "",
      address: hub.address || "",
      village_or_locality: hub.village_or_locality || "",
      district: hub.district || "",
      state: hub.state || "",
      pincode: hub.pincode || "",
      service_radius_km: hub.service_radius_km || 8,
    });
    setShowEditModal(true);
  };

  const handleCreateHub = async (e) => {
    e.preventDefault();
    if (!createForm.name.trim() || !createForm.address.trim() || !createForm.pincode.trim()) {
      setError("Hub name, address, and 6-digit PIN code are required.");
      return;
    }
    if (!/^[1-9][0-9]{5}$/.test(createForm.pincode.trim())) {
      setError("PIN code must be a valid 6-digit postal code (e.g. 751001).");
      return;
    }
    setSavingHub(true);
    setError("");
    setSuccess("");
    try {
      const payload = {
        name: createForm.name.trim(),
        address: createForm.address.trim(),
        village_or_locality: createForm.village_or_locality?.trim() || undefined,
        district: createForm.district?.trim() || undefined,
        state: createForm.state?.trim() || undefined,
        pincode: createForm.pincode.trim(),
        service_radius_km: Number(createForm.service_radius_km) || 8,
      };
      await createFarmerFacility(payload);
      setShowCreateModal(false);
      setCreateForm(emptyHubForm);
      setSuccess("New hub created successfully!");
      await loadData();
    } catch (err) {
      setError(err.message || "Failed to create hub.");
    } finally {
      setSavingHub(false);
    }
  };

  const handleUpdateHub = async (e) => {
    e.preventDefault();
    if (!editingHubId) return;
    if (!editForm.name.trim() || !editForm.address.trim() || !editForm.pincode.trim()) {
      setError("Hub name, address, and 6-digit PIN code are required.");
      return;
    }
    if (!/^[1-9][0-9]{5}$/.test(editForm.pincode.trim())) {
      setError("PIN code must be a valid 6-digit postal code (e.g. 751001).");
      return;
    }
    setSavingHub(true);
    setError("");
    setSuccess("");
    try {
      const payload = {
        name: editForm.name.trim(),
        address: editForm.address.trim(),
        village_or_locality: editForm.village_or_locality?.trim() || undefined,
        district: editForm.district?.trim() || undefined,
        state: editForm.state?.trim() || undefined,
        pincode: editForm.pincode.trim(),
        service_radius_km: Number(editForm.service_radius_km) || 8,
      };
      await updateFarmerFacility(editingHubId, payload);
      setShowEditModal(false);
      setEditingHubId(null);
      setSuccess("Hub details updated successfully!");
      await loadData();
    } catch (err) {
      setError(err.message || "Failed to update hub.");
    } finally {
      setSavingHub(false);
    }
  };

  const handleDeleteHub = async () => {
    if (!deleteConfirmHub) return;
    setDeletingHub(true);
    setError("");
    setSuccess("");
    try {
      await deleteFarmerFacility(deleteConfirmHub.id);
      const hubName = deleteConfirmHub.name;
      setDeleteConfirmHub(null);
      setFacilities((prev) => prev.filter((f) => f.id !== deleteConfirmHub.id));
      setSuccess(`Hub "${hubName}" deleted successfully.`);
      await loadData();
    } catch (err) {
      setError(err.message || "Failed to delete hub. Please check for active dependencies.");
      setDeleteConfirmHub(null);
    } finally {
      setDeletingHub(false);
    }
  };

  return (
    <div className="farmer-my-hub-page">
      {/* 1. Header */}
      <div className="farmer-page-header">
        <div>
          <span className="eyebrow">
            <i className="bi bi-building me-1" /> HUB INFRASTRUCTURE & DISPATCH
          </span>
          <h1 className="farmer-page-title">My Kisan Hubs</h1>
          <p className="farmer-page-sub">
            Manage your local storage facilities, packaging centers, and quick-commerce delivery coverage radiuses.
          </p>
        </div>
        <div className="farmer-header-actions">
          <button
            type="button"
            className="kisan-btn-accent"
            onClick={() => {
              setCreateForm(emptyHubForm);
              setShowCreateModal(true);
            }}
          >
            <i className="bi bi-plus-lg me-1" /> Add Hub
          </button>
        </div>
      </div>

      {/* 2. KPI Summary Cards Grid */}
      <div className="farmer-kpis-grid mb-4">
        <div className="farmer-kpi-card">
          <div className="farmer-kpi-info">
            <span className="farmer-kpi-label">Total Facilities</span>
            <span className="farmer-kpi-value">{facilities.length}</span>
            <span className="farmer-kpi-hint">Storage & dispatch locations</span>
          </div>
          <div className="farmer-kpi-icon" style={{ background: "#edf8df", color: "#073a26" }}>
            <i className="bi bi-building-fill" />
          </div>
        </div>

        <div className="farmer-kpi-card">
          <div className="farmer-kpi-info">
            <span className="farmer-kpi-label">Active Hubs</span>
            <span className="farmer-kpi-value" style={{ color: "#0e5a3c" }}>
              {facilities.filter((f) => (f.status || "").toUpperCase() !== "INACTIVE").length}
            </span>
            <span className="farmer-kpi-hint">Serving consumer orders</span>
          </div>
          <div className="farmer-kpi-icon" style={{ background: "#dcfce7", color: "#166534" }}>
            <i className="bi bi-check-circle-fill" />
          </div>
        </div>

        <div className="farmer-kpi-card">
          <div className="farmer-kpi-info">
            <span className="farmer-kpi-label">Max Delivery Radius</span>
            <span className="farmer-kpi-value" style={{ color: "#073a26" }}>
              {facilities.length > 0
                ? `${Math.max(...facilities.map((f) => Number(f.service_radius_km || 0)))} km`
                : "0 km"}
            </span>
            <span className="farmer-kpi-hint">Customer reach distance</span>
          </div>
          <div className="farmer-kpi-icon" style={{ background: "#fef3c7", color: "#92400e" }}>
            <i className="bi bi-scooter" />
          </div>
        </div>
      </div>

      {/* 3. Alerts */}
      {error && (
        <div className="kisan-card kisan-card-pad mb-3" style={{ borderColor: "#F28B82", background: "#FDF2F0" }}>
          <div className="d-flex align-items-center justify-content-between">
            <span style={{ color: "#C53929", fontWeight: 600, fontSize: "13.5px" }}>
              <i className="bi bi-exclamation-triangle-fill me-2" />
              {error}
            </span>
            <button type="button" className="btn-close" onClick={() => setError("")} aria-label="Close" />
          </div>
        </div>
      )}
      {success && (
        <div className="kisan-card kisan-card-pad mb-3" style={{ borderColor: "#CDEBD7", background: "#F5FBF7" }}>
          <div className="d-flex align-items-center justify-content-between">
            <span style={{ color: "#1B6B34", fontWeight: 600, fontSize: "13.5px" }}>
              <i className="bi bi-check-circle-fill me-2" />
              {success}
            </span>
            <button type="button" className="btn-close" onClick={() => setSuccess("")} aria-label="Close" />
          </div>
        </div>
      )}

      {/* 4. Facilities Content */}
      {loading ? (
        <div className="kisan-card kisan-card-pad text-center py-5">
          <div className="spinner-border text-success" role="status" style={{ width: "2rem", height: "2rem" }} />
          <p style={{ marginTop: "12px", color: "#79705F", fontSize: "14px" }}>Loading your hubs...</p>
        </div>
      ) : facilities.length === 0 ? (
        /* Empty State */
        <div className="kisan-card kisan-card-pad text-center py-5" style={{ background: "#FFFFFF" }}>
          <div
            style={{
              width: "60px",
              height: "60px",
              borderRadius: "50%",
              background: "#EDF8DF",
              color: "#1B6B34",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "24px",
              margin: "0 auto 14px",
            }}
          >
            <i className="bi bi-building" />
          </div>
          <h2
            style={{
              fontFamily: "var(--font-display, 'Fraunces', Georgia, serif)",
              fontSize: "19px",
              fontWeight: 700,
              margin: "0 0 6px",
              color: "var(--farmer-forest, #073a26)",
            }}
          >
            No Storage Hub Added Yet
          </h2>
          <p style={{ color: "#79705F", fontSize: "13.5px", margin: "0 auto 18px", maxWidth: "420px" }}>
            Add your first local storage or packaging facility to set up delivery radius and manage customer orders.
          </p>
          <button
            type="button"
            className="kisan-btn-accent kisan-btn-sm"
            onClick={() => {
              setCreateForm(emptyHubForm);
              setShowCreateModal(true);
            }}
          >
            <i className="bi bi-plus-lg me-1" /> Add Your First Hub
          </button>
        </div>
      ) : (
        /* Hub Cards List */
        <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          {facilities.map((hub) => (
            <div
              key={hub.id}
              className="kisan-card"
              style={{
                borderRadius: "16px",
                overflow: "hidden",
                border: "1px solid #E4DFD1",
                boxShadow: "0 2px 10px rgba(7, 45, 29, 0.05)",
                background: "#FFFFFF",
              }}
            >
              {/* Hub Card Top Header */}
              <div
                style={{
                  background: "linear-gradient(135deg, rgba(7, 58, 38, 0.04) 0%, rgba(200, 245, 175, 0.16) 100%)",
                  borderBottom: "1px solid #E4DFD1",
                  padding: "16px 22px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  flexWrap: "wrap",
                  gap: "12px",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
                  <div
                    style={{
                      width: "42px",
                      height: "42px",
                      borderRadius: "10px",
                      background: "var(--farmer-forest, #073a26)",
                      color: "#FFFFFF",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: "1.25rem",
                    }}
                  >
                    <i className="bi bi-building-check" />
                  </div>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <h2
                        style={{
                          fontFamily: "var(--font-display, 'Fraunces', Georgia, serif)",
                          fontSize: "1.25rem",
                          fontWeight: 700,
                          color: "var(--farmer-forest, #073a26)",
                          margin: 0,
                        }}
                      >
                        {hub.name}
                      </h2>
                      <span
                        style={{
                          background: "#dcfce7",
                          color: "#166534",
                          fontSize: "11px",
                          fontWeight: 700,
                          padding: "3px 9px",
                          borderRadius: "99px",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "4px",
                        }}
                      >
                        <i className="bi bi-check-circle-fill" /> Active
                      </span>
                    </div>
                    <div style={{ fontSize: "0.8rem", color: "var(--farmer-muted, #65766e)", marginTop: "2px" }}>
                      Storage Facility & Quick-Commerce Dispatch Hub
                    </div>
                  </div>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <button
                    type="button"
                    onClick={() => handleOpenEditModal(hub)}
                    className="btn btn-sm btn-outline-secondary"
                    style={{ fontSize: "12.5px", fontWeight: 600, padding: "5px 12px", borderRadius: "8px" }}
                  >
                    <i className="bi bi-pencil me-1" /> Edit Hub
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeleteConfirmHub(hub)}
                    className="btn btn-sm btn-outline-danger"
                    title="Delete Hub"
                    aria-label={`Delete ${hub.name}`}
                    style={{ fontSize: "12.5px", fontWeight: 600, padding: "5px 10px", borderRadius: "8px" }}
                  >
                    <i className="bi bi-trash3" />
                  </button>
                </div>
              </div>

              {/* Hub Card Details Grid */}
              <div style={{ padding: "20px 22px" }}>
                <div className="row g-3">
                  {/* Address & PIN */}
                  <div className="col-md-5">
                    <div
                      style={{
                        fontSize: "0.74rem",
                        fontWeight: 700,
                        textTransform: "uppercase",
                        letterSpacing: "0.05em",
                        color: "var(--farmer-muted, #65766e)",
                        marginBottom: "6px",
                      }}
                    >
                      <i className="bi bi-geo-alt-fill text-success me-1" /> Physical Address
                    </div>
                    <div style={{ fontSize: "0.92rem", fontWeight: 600, color: "var(--farmer-ink, #183229)" }}>
                      {hub.address}
                    </div>
                    <div style={{ fontSize: "0.84rem", color: "var(--farmer-muted, #65766e)", marginTop: "2px" }}>
                      {[hub.village_or_locality, hub.district, hub.state].filter(Boolean).join(", ")}
                    </div>
                    <div style={{ fontSize: "0.8rem", fontWeight: 600, color: "var(--farmer-forest, #073a26)", marginTop: "4px" }}>
                      Postal PIN: {hub.pincode}
                    </div>
                  </div>

                  {/* Delivery Radius & SLA */}
                  <div className="col-md-4">
                    <div
                      style={{
                        fontSize: "0.74rem",
                        fontWeight: 700,
                        textTransform: "uppercase",
                        letterSpacing: "0.05em",
                        color: "var(--farmer-muted, #65766e)",
                        marginBottom: "6px",
                      }}
                    >
                      <i className="bi bi-scooter text-primary me-1" /> Delivery Radius & SLA
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <span
                        style={{
                          background: "#fef3c7",
                          color: "#92400e",
                          fontSize: "1rem",
                          fontWeight: 700,
                          padding: "3px 10px",
                          borderRadius: "8px",
                          fontFamily: "var(--font-display, 'Fraunces', Georgia, serif)",
                        }}
                      >
                        {Number(hub.service_radius_km || 8).toFixed(1)} km
                      </span>
                      <span style={{ fontSize: "0.82rem", color: "var(--farmer-muted, #65766e)" }}>
                        Service Radius
                      </span>
                    </div>
                    <div style={{ fontSize: "0.8rem", color: "var(--farmer-muted, #65766e)", marginTop: "6px" }}>
                      ⚡ 45–90 min quick-commerce doorstep dispatch
                    </div>
                  </div>

                  {/* Operational Status */}
                  <div className="col-md-3">
                    <div
                      style={{
                        fontSize: "0.74rem",
                        fontWeight: 700,
                        textTransform: "uppercase",
                        letterSpacing: "0.05em",
                        color: "var(--farmer-muted, #65766e)",
                        marginBottom: "6px",
                      }}
                    >
                      <i className="bi bi-shield-check text-success me-1" /> Operational Status
                    </div>
                    <div style={{ fontSize: "0.88rem", fontWeight: 600, color: "#166534" }}>
                      🟢 Online & Serving
                    </div>
                    <div style={{ fontSize: "0.8rem", color: "var(--farmer-muted, #65766e)", marginTop: "4px" }}>
                      GPS verified rider handover
                    </div>
                  </div>
                </div>
              </div>

              {/* Hub Card Information Footer */}
              <div
                style={{
                  background: "#FAF7EF",
                  borderTop: "1px solid #E4DFD1",
                  padding: "12px 22px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  flexWrap: "wrap",
                  gap: "10px",
                }}
              >
                <div style={{ fontSize: "0.82rem", color: "var(--farmer-muted, #65766e)" }}>
                  <i className="bi bi-info-circle me-1" /> Consumers browse and order stock supplied directly to this hub.
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ==========================================================================
         ADD HUB MODAL
         ========================================================================== */}
      {showCreateModal && (
        <div className="farmer-modal-backdrop" onClick={() => setShowCreateModal(false)}>
          <div className="farmer-modal-dialog" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "520px" }}>
            <div className="farmer-modal-header" style={{ padding: "16px 20px" }}>
              <h3 style={{ fontFamily: "var(--font-display, 'Fraunces', Georgia, serif)", color: "#1B6B34", margin: 0, fontSize: "18px" }}>
                Add Storage Hub
              </h3>
              <button
                type="button"
                className="btn-close"
                onClick={() => setShowCreateModal(false)}
                aria-label="Close"
              />
            </div>
            <form onSubmit={handleCreateHub}>
              <div className="farmer-modal-body" style={{ padding: "18px 20px" }}>
                <div className="d-flex justify-content-between align-items-center mb-2">
                  <label htmlFor="create-hub-name" style={{ fontWeight: 600, fontSize: "13px", color: "#1C1C16", margin: 0 }}>
                    Hub / Facility Name *
                  </label>
                  <button
                    type="button"
                    className="btn btn-sm btn-outline-success d-inline-flex align-items-center gap-1"
                    style={{ fontSize: "12px", padding: "3px 10px", borderRadius: "6px" }}
                    onClick={() => handleDetectLocation(setCreateForm)}
                    disabled={locating}
                  >
                    <i className="bi bi-geo-alt" />
                    {locating ? "Detecting Address..." : "Detect My Location"}
                  </button>
                </div>
                <div className="farmer-form-group mb-3">
                  <input
                    id="create-hub-name"
                    type="text"
                    placeholder="e.g. Ramesh Farm Storage Hub"
                    className="farmer-form-control"
                    value={createForm.name}
                    onChange={(e) => setCreateForm((c) => ({ ...c, name: e.target.value }))}
                    required
                  />
                </div>
                <div className="farmer-form-group mb-3">
                  <label htmlFor="create-hub-addr" style={{ fontWeight: 600, fontSize: "13px", color: "#1C1C16" }}>
                    Physical Address *
                  </label>
                  <textarea
                    id="create-hub-addr"
                    rows="2"
                    placeholder="Village, landmark, nearby road"
                    className="farmer-form-control"
                    value={createForm.address}
                    onChange={(e) => setCreateForm((c) => ({ ...c, address: e.target.value }))}
                    required
                  />
                </div>
                <div className="row g-2 mb-3">
                  <div className="col-sm-4 farmer-form-group">
                    <label htmlFor="create-hub-locality" style={{ fontWeight: 600, fontSize: "12.5px", color: "#1C1C16" }}>
                      Village / Locality
                    </label>
                    <input
                      id="create-hub-locality"
                      type="text"
                      placeholder="e.g. Chandaka"
                      className="farmer-form-control"
                      value={createForm.village_or_locality}
                      onChange={(e) => setCreateForm((c) => ({ ...c, village_or_locality: e.target.value }))}
                    />
                  </div>
                  <div className="col-sm-4 farmer-form-group">
                    <label htmlFor="create-hub-district" style={{ fontWeight: 600, fontSize: "12.5px", color: "#1C1C16" }}>
                      District
                    </label>
                    <input
                      id="create-hub-district"
                      type="text"
                      placeholder="e.g. Khordha"
                      className="farmer-form-control"
                      value={createForm.district}
                      onChange={(e) => setCreateForm((c) => ({ ...c, district: e.target.value }))}
                    />
                  </div>
                  <div className="col-sm-4 farmer-form-group">
                    <label htmlFor="create-hub-state" style={{ fontWeight: 600, fontSize: "12.5px", color: "#1C1C16" }}>
                      State
                    </label>
                    <input
                      id="create-hub-state"
                      type="text"
                      placeholder="e.g. Odisha"
                      className="farmer-form-control"
                      value={createForm.state}
                      onChange={(e) => setCreateForm((c) => ({ ...c, state: e.target.value }))}
                    />
                  </div>
                </div>
                <div className="row g-2">
                  <div className="col-sm-6 farmer-form-group">
                    <label htmlFor="create-hub-pin" style={{ fontWeight: 600, fontSize: "12.5px", color: "#1C1C16" }}>
                      PIN Code (6 digits) *
                    </label>
                    <input
                      id="create-hub-pin"
                      type="text"
                      maxLength="6"
                      placeholder="6-digit pincode"
                      className="farmer-form-control"
                      value={createForm.pincode}
                      onChange={(e) => setCreateForm((c) => ({ ...c, pincode: e.target.value.replace(/\D/g, "").slice(0, 6) }))}
                      required
                    />
                  </div>
                  <div className="col-sm-6 farmer-form-group">
                    <label htmlFor="create-hub-rad" style={{ fontWeight: 600, fontSize: "12.5px", color: "#1C1C16" }}>
                      Delivery Radius (km) *
                    </label>
                    <input
                      id="create-hub-rad"
                      type="number"
                      min="1"
                      max="50"
                      step="0.5"
                      className="farmer-form-control"
                      value={createForm.service_radius_km}
                      onChange={(e) => setCreateForm((c) => ({ ...c, service_radius_km: e.target.value }))}
                      required
                    />
                  </div>
                </div>
              </div>
              <div className="farmer-modal-footer" style={{ padding: "14px 20px" }}>
                <button
                  type="button"
                  className="kisan-btn-outline kisan-btn-sm"
                  onClick={() => setShowCreateModal(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="kisan-btn-accent kisan-btn-sm" disabled={savingHub}>
                  {savingHub ? "Adding..." : "Add Hub"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ==========================================================================
         EDIT HUB MODAL
         ========================================================================== */}
      {showEditModal && editingHubId && (
        <div className="farmer-modal-backdrop" onClick={() => setShowEditModal(false)}>
          <div className="farmer-modal-dialog" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "520px" }}>
            <div className="farmer-modal-header" style={{ padding: "16px 20px" }}>
              <h3 style={{ fontFamily: "var(--font-display, 'Fraunces', Georgia, serif)", color: "#1B6B34", margin: 0, fontSize: "18px" }}>
                Edit Hub Details
              </h3>
              <button
                type="button"
                className="btn-close"
                onClick={() => setShowEditModal(false)}
                aria-label="Close"
              />
            </div>
            <form onSubmit={handleUpdateHub}>
              <div className="farmer-modal-body" style={{ padding: "18px 20px" }}>
                <div className="d-flex justify-content-between align-items-center mb-2">
                  <label htmlFor="edit-hub-name" style={{ fontWeight: 600, fontSize: "13px", color: "#1C1C16", margin: 0 }}>
                    Hub / Facility Name *
                  </label>
                  <button
                    type="button"
                    className="btn btn-sm btn-outline-success d-inline-flex align-items-center gap-1"
                    style={{ fontSize: "12px", padding: "3px 10px", borderRadius: "6px" }}
                    onClick={() => handleDetectLocation(setEditForm)}
                    disabled={locating}
                  >
                    <i className="bi bi-geo-alt" />
                    {locating ? "Detecting Address..." : "Detect My Location"}
                  </button>
                </div>
                <div className="farmer-form-group mb-3">
                  <input
                    id="edit-hub-name"
                    type="text"
                    className="farmer-form-control"
                    value={editForm.name}
                    onChange={(e) => setEditForm((c) => ({ ...c, name: e.target.value }))}
                    required
                  />
                </div>
                <div className="farmer-form-group mb-3">
                  <label htmlFor="edit-hub-addr" style={{ fontWeight: 600, fontSize: "13px", color: "#1C1C16" }}>
                    Physical Address *
                  </label>
                  <textarea
                    id="edit-hub-addr"
                    rows="2"
                    placeholder="Street, landmark, or farm address"
                    className="farmer-form-control"
                    value={editForm.address}
                    onChange={(e) => setEditForm((c) => ({ ...c, address: e.target.value }))}
                    required
                  />
                </div>
                <div className="row g-2 mb-3">
                  <div className="col-sm-4 farmer-form-group">
                    <label htmlFor="edit-hub-locality" style={{ fontWeight: 600, fontSize: "12.5px", color: "#1C1C16" }}>
                      Village / Locality
                    </label>
                    <input
                      id="edit-hub-locality"
                      type="text"
                      placeholder="e.g. Chandaka"
                      className="farmer-form-control"
                      value={editForm.village_or_locality}
                      onChange={(e) => setEditForm((c) => ({ ...c, village_or_locality: e.target.value }))}
                    />
                  </div>
                  <div className="col-sm-4 farmer-form-group">
                    <label htmlFor="edit-hub-district" style={{ fontWeight: 600, fontSize: "12.5px", color: "#1C1C16" }}>
                      District
                    </label>
                    <input
                      id="edit-hub-district"
                      type="text"
                      placeholder="e.g. Khordha"
                      className="farmer-form-control"
                      value={editForm.district}
                      onChange={(e) => setEditForm((c) => ({ ...c, district: e.target.value }))}
                    />
                  </div>
                  <div className="col-sm-4 farmer-form-group">
                    <label htmlFor="edit-hub-state" style={{ fontWeight: 600, fontSize: "12.5px", color: "#1C1C16" }}>
                      State
                    </label>
                    <input
                      id="edit-hub-state"
                      type="text"
                      placeholder="e.g. Odisha"
                      className="farmer-form-control"
                      value={editForm.state}
                      onChange={(e) => setEditForm((c) => ({ ...c, state: e.target.value }))}
                    />
                  </div>
                </div>
                <div className="row g-2">
                  <div className="col-sm-6 farmer-form-group">
                    <label htmlFor="edit-hub-pin" style={{ fontWeight: 600, fontSize: "12.5px", color: "#1C1C16" }}>
                      PIN Code (6 digits) *
                    </label>
                    <input
                      id="edit-hub-pin"
                      type="text"
                      maxLength="6"
                      placeholder="e.g. 751001"
                      className="farmer-form-control"
                      value={editForm.pincode}
                      onChange={(e) => setEditForm((c) => ({ ...c, pincode: e.target.value.replace(/\D/g, "").slice(0, 6) }))}
                      required
                    />
                  </div>
                  <div className="col-sm-6 farmer-form-group">
                    <label htmlFor="edit-hub-rad" style={{ fontWeight: 600, fontSize: "12.5px", color: "#1C1C16" }}>
                      Delivery Radius (km) *
                    </label>
                    <input
                      id="edit-hub-rad"
                      type="number"
                      min="1"
                      max="50"
                      step="0.5"
                      className="farmer-form-control"
                      value={editForm.service_radius_km}
                      onChange={(e) => setEditForm((c) => ({ ...c, service_radius_km: e.target.value }))}
                      required
                    />
                  </div>
                </div>
              </div>
              <div className="farmer-modal-footer" style={{ padding: "14px 20px" }}>
                <button
                  type="button"
                  className="kisan-btn-outline kisan-btn-sm"
                  onClick={() => setShowEditModal(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="kisan-btn-accent kisan-btn-sm" disabled={savingHub}>
                  {savingHub ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* ==========================================================================
         DELETE HUB CONFIRMATION MODAL
         ========================================================================== */}
      {deleteConfirmHub && (
        <div className="farmer-modal-backdrop" onClick={() => !deletingHub && setDeleteConfirmHub(null)}>
          <div className="farmer-modal-dialog" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "460px" }}>
            <div className="farmer-modal-header" style={{ padding: "16px 20px" }}>
              <h3 style={{ fontFamily: "var(--font-display, 'Fraunces', Georgia, serif)", color: "var(--farmer-danger, #c53929)", margin: 0, fontSize: "18px" }}>
                <i className="bi bi-exclamation-triangle-fill me-2 text-danger" />
                Delete Hub Facility
              </h3>
              <button
                type="button"
                className="btn-close"
                disabled={deletingHub}
                onClick={() => setDeleteConfirmHub(null)}
                aria-label="Close"
              />
            </div>
            <div className="farmer-modal-body" style={{ padding: "18px 20px" }}>
              <p style={{ fontSize: "14px", color: "var(--farmer-ink, #183229)", marginBottom: "12px" }}>
                Are you sure you want to permanently delete <strong>{deleteConfirmHub.name}</strong>?
              </p>
              <div
                style={{
                  background: "#FDF2F0",
                  border: "1px solid #F28B82",
                  borderRadius: "8px",
                  padding: "10px 14px",
                  fontSize: "12.5px",
                  color: "#C53929",
                }}
              >
                <i className="bi bi-info-circle me-1" />
                This action cannot be undone. Hubs with assigned staff, active inventory, or pending orders cannot be deleted until dependencies are cleared.
              </div>
            </div>
            <div className="farmer-modal-footer" style={{ padding: "14px 20px", display: "flex", justifyContent: "flex-end", gap: "10px" }}>
              <button
                type="button"
                className="btn btn-sm btn-outline-secondary"
                disabled={deletingHub}
                onClick={() => setDeleteConfirmHub(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-sm btn-danger d-inline-flex align-items-center gap-1"
                disabled={deletingHub}
                onClick={handleDeleteHub}
              >
                {deletingHub ? (
                  <>
                    <span className="spinner-border spinner-border-sm" role="status" /> Deleting...
                  </>
                ) : (
                  <>
                    <i className="bi bi-trash3 me-1" /> Delete Hub
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
