import { useEffect, useState } from "react";
import {
  listFarmerFacilities,
  createFarmerFacility,
  updateFarmerFacility,
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

  return (
    <div style={{ maxWidth: "900px", margin: "0 auto", padding: "16px 12px 60px" }}>
      {/* Page Header */}
      <div className="d-flex justify-content-between align-items-center flex-wrap gap-3 mb-4">
        <div>
          <h1 style={{ fontFamily: "'Fraunces', Georgia, serif", color: "#1B6B34", fontSize: "26px", fontWeight: 700, margin: 0 }}>
            My Hubs
          </h1>
          <p style={{ margin: "4px 0 0", color: "#79705F", fontSize: "14px" }}>
            Manage your storage facilities and delivery coverage radiuses.
          </p>
        </div>
        <button
          type="button"
          className="kisan-btn-accent kisan-btn-sm"
          onClick={() => {
            setCreateForm(emptyHubForm);
            setShowCreateModal(true);
          }}
        >
          <i className="bi bi-plus-lg me-1" /> Add Hub
        </button>
      </div>

      {/* Notifications / Alerts */}
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
              width: "52px",
              height: "52px",
              borderRadius: "50%",
              background: "#EDF8DF",
              color: "#1B6B34",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "22px",
              margin: "0 auto 12px",
            }}
          >
            <i className="bi bi-building" />
          </div>
          <h2 style={{ fontFamily: "'Fraunces', Georgia, serif", fontSize: "18px", fontWeight: 700, margin: "0 0 6px", color: "#1B6B34" }}>
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
        /* Hub Cards List: Compact / Small Backgrounds */
        <div>
          {facilities.map((hub) => (
            <div
              key={hub.id}
              style={{
                position: "relative",
                borderRadius: "14px",
                overflow: "hidden",
                boxShadow: "0 4px 14px rgba(7, 45, 29, 0.08)",
                border: "1px solid rgba(228, 223, 209, 0.9)",
                background: "#0c4d33",
                marginBottom: "16px",
              }}
            >
              {/* Subtle background image */}
              <img
                src="/assets/images/sunlight.png"
                alt=""
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                  objectPosition: "center",
                  opacity: 0.22,
                }}
              />

              {/* Dark Forest Gradient Overlay */}
              <div
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  background:
                    "linear-gradient(135deg, rgba(7, 45, 29, 0.95) 0%, rgba(12, 65, 42, 0.90) 100%)",
                }}
              />

              {/* Snug, compact content inside */}
              <div style={{ position: "relative", zIndex: 2, padding: "16px 20px", color: "#FFFFFF" }}>
                {/* Top Line: Hub Name + Status + Edit Action */}
                <div className="d-flex justify-content-between align-items-center flex-wrap gap-2 mb-2">
                  <div className="d-flex align-items-center gap-2 flex-wrap">
                    <span
                      style={{
                        background: "rgba(255, 255, 255, 0.16)",
                        backdropFilter: "blur(4px)",
                        color: "#FFFFFF",
                        fontSize: "11px",
                        fontWeight: 700,
                        padding: "2px 8px",
                        borderRadius: "6px",
                        letterSpacing: "0.04em",
                        textTransform: "uppercase",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "4px",
                      }}
                    >
                      <i className="bi bi-building" /> Hub
                    </span>
                    <h2
                      style={{
                        fontFamily: "'Fraunces', Georgia, serif",
                        fontSize: "19px",
                        fontWeight: 700,
                        margin: 0,
                        color: "#FFFFFF",
                        letterSpacing: "-0.01em",
                      }}
                    >
                      {hub.name}
                    </h2>
                    <span
                      style={{
                        background: "#c9eca5",
                        color: "#073a26",
                        fontSize: "11px",
                        fontWeight: 800,
                        padding: "2px 8px",
                        borderRadius: "99px",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "3px",
                      }}
                    >
                      <i className="bi bi-check-circle-fill" /> Active
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleOpenEditModal(hub)}
                    style={{
                      background: "rgba(255, 255, 255, 0.95)",
                      color: "#073a26",
                      border: "none",
                      borderRadius: "6px",
                      padding: "4px 10px",
                      fontSize: "12px",
                      fontWeight: 700,
                      cursor: "pointer",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "5px",
                      boxShadow: "0 1px 4px rgba(0,0,0,0.12)",
                    }}
                  >
                    <i className="bi bi-pencil-fill" /> Edit Hub
                  </button>
                </div>

                {/* Details Line: Location & KM Delivery Radius */}
                <div className="d-flex justify-content-between align-items-center flex-wrap gap-2 pt-1">
                  {/* Location Address & PIN */}
                  <div
                    className="d-flex align-items-center gap-2 flex-wrap"
                    style={{ fontSize: "13.5px", color: "rgba(255, 255, 255, 0.92)" }}
                  >
                    <i className="bi bi-geo-alt-fill" style={{ color: "#c9eca5", fontSize: "16px" }} />
                    <span>
                      <strong>{hub.address}</strong>
                      {hub.village_or_locality && <span> · {hub.village_or_locality}</span>}
                      {hub.district && <span>, {hub.district}</span>}
                      {hub.state && <span>, {hub.state}</span>}
                      <span style={{ color: "rgba(255, 255, 255, 0.75)", marginLeft: "8px" }}>
                        (PIN: {hub.pincode})
                      </span>
                    </span>
                  </div>

                  {/* KM Delivery Radius Pill */}
                  <div
                    style={{
                      background: "rgba(201, 236, 165, 0.2)",
                      border: "1px solid rgba(201, 236, 165, 0.4)",
                      padding: "4px 12px",
                      borderRadius: "8px",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "6px",
                    }}
                  >
                    <i className="bi bi-scooter" style={{ color: "#c9eca5", fontSize: "14px" }} />
                    <span style={{ fontSize: "12px", color: "rgba(255, 255, 255, 0.85)" }}>
                      Radius:
                    </span>
                    <strong style={{ fontSize: "13px", color: "#c9eca5" }}>
                      {Number(hub.service_radius_km || 8).toFixed(1)} km
                    </strong>
                  </div>
                </div>
              </div>
            </div>
          ))}

          {/* Add Another Hub Button */}
          <button
            type="button"
            onClick={() => {
              setCreateForm(emptyHubForm);
              setShowCreateModal(true);
            }}
            className="w-100 py-2 d-flex align-items-center justify-content-center gap-2"
            style={{
              background: "#FAF8F3",
              border: "1px dashed #C0B7A5",
              borderRadius: "10px",
              color: "#1B6B34",
              fontWeight: 600,
              fontSize: "13.5px",
              cursor: "pointer",
              marginTop: "8px",
            }}
          >
            <i className="bi bi-plus-circle" /> Add Another Storage Hub
          </button>
        </div>
      )}

      {/* ==========================================================================
         ADD HUB MODAL
         ========================================================================== */}
      {showCreateModal && (
        <div className="farmer-modal-backdrop" onClick={() => setShowCreateModal(false)}>
          <div className="farmer-modal-dialog" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "520px" }}>
            <div className="farmer-modal-header" style={{ padding: "16px 20px" }}>
              <h3 style={{ fontFamily: "'Fraunces', Georgia, serif", color: "#1B6B34", margin: 0, fontSize: "18px" }}>
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
              <h3 style={{ fontFamily: "'Fraunces', Georgia, serif", color: "#1B6B34", margin: 0, fontSize: "18px" }}>
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
    </div>
  );
}
