import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  listFarmerFacilities,
  createFarmerFacility,
  updateFarmerFacility,
  listFarmerStaff,
  createFarmerStaff,
  removeFarmerStaff,
  listFarmerHubOptions,
  listFarmerStockDeliveries,
} from "../services/api";
import "./farmer-operations.css";

const emptyFacilityForm = {
  name: "",
  address: "",
  pincode: "",
  latitude: "",
  longitude: "",
  service_radius_km: 8,
};

const emptyStaffForm = {
  facility_id: "",
  email: "",
  initial_password: "",
  display_name: "",
};

export default function FarmerStorageStaff() {
  const [facilities, setFacilities] = useState([]);
  const [staffList, setStaffList] = useState([]);
  const [regionalHubs, setRegionalHubs] = useState([]);
  const [deliveries, setDeliveries] = useState([]);

  const [loading, setLoading] = useState(true);
  const [savingFacility, setSavingFacility] = useState(false);
  const [savingStaff, setSavingStaff] = useState(false);
  const [locating, setLocating] = useState(false);

  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [showFacilityModal, setShowFacilityModal] = useState(false);
  const [facilityForm, setFacilityForm] = useState(emptyFacilityForm);

  const [showStaffModal, setShowStaffModal] = useState(false);
  const [staffForm, setStaffForm] = useState(emptyStaffForm);

  const [storageEnabled, setStorageEnabled] = useState(() => {
    return localStorage.getItem("farmer_storage_enabled") === "true";
  });

  const loadAll = async () => {
    setLoading(true);
    setError("");
    try {
      const [facs, staff, hubs, delivs] = await Promise.all([
        listFarmerFacilities().catch(() => []),
        listFarmerStaff().catch(() => []),
        listFarmerHubOptions().catch(() => []),
        listFarmerStockDeliveries().catch(() => []),
      ]);
      setFacilities(Array.isArray(facs) ? facs : []);
      setStaffList(Array.isArray(staff) ? staff : []);
      setRegionalHubs(Array.isArray(hubs) ? hubs : []);
      setDeliveries(Array.isArray(delivs) ? delivs : []);
    } catch (err) {
      setError(err.message || "Failed to load facility and workforce records.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
  }, []);

  const handleToggleStorage = (e) => {
    const val = e.target.checked;
    setStorageEnabled(val);
    localStorage.setItem("farmer_storage_enabled", val ? "true" : "false");
  };

  const handleDetectLocation = () => {
    if (!navigator.geolocation) {
      setError("Geolocation is not supported by your browser.");
      return;
    }
    setLocating(true);
    setError("");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setFacilityForm((curr) => ({
          ...curr,
          latitude: Number(pos.coords.latitude.toFixed(6)),
          longitude: Number(pos.coords.longitude.toFixed(6)),
        }));
        setLocating(false);
      },
      (err) => {
        setError(err.message || "Unable to acquire current location.");
        setLocating(false);
      },
      { timeout: 10000, enableHighAccuracy: true }
    );
  };

  const handleCreateFacility = async (e) => {
    e.preventDefault();
    if (!facilityForm.latitude || !facilityForm.longitude) {
      setError("Latitude and longitude coordinates are required for facility logistics.");
      return;
    }
    setSavingFacility(true);
    setError("");
    setNotice("");
    try {
      await createFarmerFacility({
        name: facilityForm.name.trim(),
        address: facilityForm.address.trim(),
        pincode: facilityForm.pincode.trim(),
        latitude: Number(facilityForm.latitude),
        longitude: Number(facilityForm.longitude),
        service_radius_km: Number(facilityForm.service_radius_km) || 8,
      });
      setNotice(`Storage facility "${facilityForm.name}" created successfully.`);
      setFacilityForm(emptyFacilityForm);
      setShowFacilityModal(false);
      await loadAll();
    } catch (err) {
      setError(err.message || "Failed to create storage facility.");
    } finally {
      setSavingFacility(false);
    }
  };

  const handleToggleFacilityStatus = async (facility) => {
    const nextStatus = facility.status === "ACTIVE" ? "INACTIVE" : "ACTIVE";
    setError("");
    setNotice("");
    try {
      await updateFarmerFacility(facility.id, { status: nextStatus });
      setNotice(`Facility "${facility.name}" is now ${nextStatus}.`);
      await loadAll();
    } catch (err) {
      setError(err.message || "Failed to update facility status.");
    }
  };

  const openAddStaffModal = (facilityId = "") => {
    const targetFacId = facilityId || (facilities[0]?.id || "");
    setStaffForm({
      ...emptyStaffForm,
      facility_id: targetFacId,
    });
    setError("");
    setShowStaffModal(true);
  };

  const handleCreateStaff = async (e) => {
    e.preventDefault();
    if (!staffForm.facility_id) {
      setError("Please select a facility for this staff member.");
      return;
    }
    setSavingStaff(true);
    setError("");
    setNotice("");
    try {
      await createFarmerStaff(staffForm.facility_id, {
        email: staffForm.email.trim(),
        initial_password: staffForm.initial_password,
        display_name: staffForm.display_name?.trim() || null,
      });
      setNotice(`Staff account created for ${staffForm.email}.`);
      setStaffForm(emptyStaffForm);
      setShowStaffModal(false);
      await loadAll();
    } catch (err) {
      setError(err.message || "Failed to create staff account.");
    } finally {
      setSavingStaff(false);
    }
  };

  const handleRemoveStaff = async (facilityId, staffUserId, staffEmail) => {
    if (!window.confirm(`Are you sure you want to remove staff member ${staffEmail} from this facility?`)) {
      return;
    }
    setError("");
    setNotice("");
    try {
      await removeFarmerStaff(facilityId, staffUserId);
      setNotice(`Staff member ${staffEmail} unassigned successfully.`);
      await loadAll();
    } catch (err) {
      setError(err.message || "Failed to remove staff member.");
    }
  };

  return (
    <div className="farmer-storage-staff-page">
      {/* Header */}
      <div className="farmer-page-header">
        <div>
          <span className="eyebrow">STORAGE & WORKFORCE</span>
          <h1>My Storage Facilities & Staff</h1>
          <p>
            Create and manage your private farm storage facilities, provision facility staff accounts, and inspect regional hub infrastructure.
          </p>
        </div>
        <div className="farmer-header-actions">
          <button
            type="button"
            className="farmer-action-pill primary"
            onClick={() => {
              setFacilityForm(emptyFacilityForm);
              setError("");
              setShowFacilityModal(true);
            }}
          >
            <i className="bi bi-plus-circle" /> Create Storage Facility
          </button>
          <button
            type="button"
            className="farmer-action-pill"
            disabled={facilities.length === 0}
            onClick={() => openAddStaffModal()}
          >
            <i className="bi bi-person-plus" /> Add Facility Staff
          </button>
          <Link to="/farmer/tracking" className="farmer-action-pill">
            <i className="bi bi-truck" /> Dispatch Tracking
          </Link>
        </div>
      </div>

      {notice && (
        <div className="alert alert-success d-flex align-items-center justify-content-between mb-4" role="status">
          <div><i className="bi bi-check-circle-fill me-2" />{notice}</div>
          <button type="button" className="btn-close" onClick={() => setNotice("")} aria-label="Close" />
        </div>
      )}

      {error && (
        <div className="alert alert-danger d-flex align-items-center justify-content-between mb-4" role="alert">
          <div><i className="bi bi-exclamation-triangle-fill me-2" />{error}</div>
          <button type="button" className="btn-close" onClick={() => setError("")} aria-label="Close" />
        </div>
      )}

      {/* Storage Mode Toggle Card */}
      <div className="farmer-card mb-4">
        <div className="farmer-card-header">
          <div>
            <h2>Logistics Delivery Mode</h2>
            <p style={{ margin: "4px 0 0", color: "var(--farmer-muted)", fontSize: "0.85rem" }}>
              Choose between storage-assisted hub fulfillment or direct on-farm pickup by delivery riders.
            </p>
          </div>
          <div className="form-check form-switch" style={{ fontSize: "1.1rem" }}>
            <input
              className="form-check-input"
              type="checkbox"
              role="switch"
              id="storageSwitch"
              checked={storageEnabled}
              onChange={handleToggleStorage}
              style={{ cursor: "pointer" }}
            />
            <label className="form-check-label ms-2" htmlFor="storageSwitch" style={{ fontSize: "0.85rem", fontWeight: 600 }}>
              {storageEnabled ? "Facility Storage Enabled" : "Direct On-Farm Pickup Only"}
            </label>
          </div>
        </div>

        <div className="row g-3 mt-1">
          <div className="col-md-6">
            <div className="workflow-box" style={{ height: "100%", background: storageEnabled ? "var(--farmer-lime-soft)" : "var(--farmer-surface-muted)" }}>
              <h3>
                <i className="bi bi-building-check" /> Option A: Storage & Staff-Assisted Dispatch
              </h3>
              <p>
                Store produce in your verified facility or regional hub. Facility staff handle order packing, grading, and rider handoff for scheduled or rapid 45-90 min delivery slots.
              </p>
              <div className="workflow-steps">
                <span className="workflow-step-pill">1. Produce Deposited</span>
                <span>→</span>
                <span className="workflow-step-pill">2. Staff Packing</span>
                <span>→</span>
                <span className="workflow-step-pill">3. Rider Dispatch</span>
                <span>→</span>
                <span className="workflow-step-pill">4. OTP Delivery</span>
              </div>
            </div>
          </div>
          <div className="col-md-6">
            <div className="workflow-box" style={{ height: "100%", background: !storageEnabled ? "var(--farmer-lime-soft)" : "var(--farmer-surface-muted)" }}>
              <h3>
                <i className="bi bi-geo-alt-fill" /> Option B: Direct Farmer-to-Rider Pickup
              </h3>
              <p>
                Sell directly from your farm without maintaining facility staff. When an order arrives, prepare and pack it on-site; the system dispatches a nearby rider directly to your farm.
              </p>
              <div className="workflow-steps">
                <span className="workflow-step-pill">1. Order Confirmed</span>
                <span>→</span>
                <span className="workflow-step-pill">2. Farm Packing</span>
                <span>→</span>
                <span className="workflow-step-pill">3. Rider Pickup</span>
                <span>→</span>
                <span className="workflow-step-pill">4. OTP Delivery</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Farmer's Own Facilities Section */}
      <div className="farmer-card mb-4">
        <div className="farmer-card-header">
          <div>
            <h2>My Storage Facilities ({facilities.length})</h2>
            <p style={{ margin: "4px 0 0", color: "var(--farmer-muted)", fontSize: "0.85rem" }}>
              Private facilities owned and managed by your farm for storage and fulfillment operations.
            </p>
          </div>
          <button
            type="button"
            className="farmer-action-pill primary"
            onClick={() => {
              setFacilityForm(emptyFacilityForm);
              setError("");
              setShowFacilityModal(true);
            }}
          >
            <i className="bi bi-plus-lg" /> Create Storage Facility
          </button>
        </div>

        {facilities.length === 0 ? (
          <div className="farmer-empty-state">
            <i className="bi bi-building-add" />
            <h3>No Private Facilities Registered</h3>
            <p>
              You haven&apos;t created any private storage facilities yet. Create your first facility to assign staff and manage dedicated storage.
            </p>
            <button
              type="button"
              className="farmer-action-pill primary"
              onClick={() => {
                setFacilityForm(emptyFacilityForm);
                setError("");
                setShowFacilityModal(true);
              }}
            >
              <i className="bi bi-plus-circle" /> Create Your First Facility
            </button>
          </div>
        ) : (
          <div className="row g-3">
            {facilities.map((fac) => (
              <div key={fac.id} className="col-md-6 col-lg-4">
                <div className="farmer-crop-card h-100 d-flex flex-direction-column justify-content-between p-3">
                  <div>
                    <div className="d-flex align-items-center justify-content-between mb-2">
                      <h4 className="farmer-crop-title mb-0">{fac.name}</h4>
                      <span className={`farmer-badge ${fac.status === "ACTIVE" ? "success" : "neutral"}`}>
                        {fac.status}
                      </span>
                    </div>
                    <div className="text-muted small mb-2">
                      <i className="bi bi-geo-alt me-1" />
                      {fac.address} (PIN: {fac.pincode})
                    </div>
                    <div className="d-flex justify-content-between text-muted small py-2 border-top border-bottom mb-3">
                      <span>Service Radius: <strong>{fac.service_radius_km} km</strong></span>
                      <span>Assigned Staff: <strong>{fac.staff_count}</strong></span>
                    </div>
                  </div>
                  <div className="d-flex align-items-center gap-2 pt-1">
                    <button
                      type="button"
                      className="farmer-action-pill primary"
                      style={{ fontSize: "0.78rem", padding: "4px 10px" }}
                      onClick={() => openAddStaffModal(fac.id)}
                    >
                      <i className="bi bi-person-plus" /> Add Staff
                    </button>
                    <button
                      type="button"
                      className="farmer-action-pill"
                      style={{ fontSize: "0.78rem", padding: "4px 10px" }}
                      onClick={() => handleToggleFacilityStatus(fac)}
                    >
                      {fac.status === "ACTIVE" ? "Deactivate" : "Activate"}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Facility Staff Management Section */}
      <div className="farmer-card mb-4">
        <div className="farmer-card-header">
          <div>
            <h2>Facility Staff & Workforce ({staffList.length})</h2>
            <p style={{ margin: "4px 0 0", color: "var(--farmer-muted)", fontSize: "0.85rem" }}>
              Staff members provisioned by you to manage packing, inventory receiving, and dispatch at your facilities.
            </p>
          </div>
          <button
            type="button"
            className="farmer-action-pill primary"
            disabled={facilities.length === 0}
            onClick={() => openAddStaffModal()}
          >
            <i className="bi bi-person-plus" /> Create / Invite Staff
          </button>
        </div>

        {facilities.length === 0 ? (
          <div className="farmer-empty-state">
            <i className="bi bi-people" />
            <h3>Create a Facility First</h3>
            <p>You need at least one active facility before you can invite or provision warehouse staff.</p>
          </div>
        ) : staffList.length === 0 ? (
          <div className="farmer-empty-state">
            <i className="bi bi-person-badge" />
            <h3>No Facility Staff Assigned</h3>
            <p>Provision operator credentials for your facility personnel to manage stock and order fulfillment.</p>
            <button
              type="button"
              className="farmer-action-pill primary"
              onClick={() => openAddStaffModal()}
            >
              <i className="bi bi-person-plus" /> Provision Staff Account
            </button>
          </div>
        ) : (
          <div className="farmer-table-responsive">
            <table className="farmer-table">
              <thead>
                <tr>
                  <th>Staff Member</th>
                  <th>Assigned Facility</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {staffList.map((st) => (
                  <tr key={`${st.facility_id}-${st.user_id}`}>
                    <td>
                      <div className="d-flex align-items-center gap-2">
                        <div className="farmer-avatar-tile" style={{ width: "32px", height: "32px", fontSize: "0.85rem" }}>
                          {(st.display_name || st.email || "S").slice(0, 1).toUpperCase()}
                        </div>
                        <div>
                          <strong style={{ fontSize: "0.88rem" }}>{st.display_name || st.email}</strong>
                          <div className="text-muted small">{st.email}</div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <span className="fw-semibold text-forest">{st.facility_name}</span>
                    </td>
                    <td>
                      <span className="farmer-badge info">Facility Operator</span>
                    </td>
                    <td>
                      <span className={`farmer-badge ${st.is_active ? "success" : "neutral"}`}>
                        {st.is_active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td>
                      <button
                        type="button"
                        className="farmer-action-pill danger"
                        style={{ fontSize: "0.75rem", padding: "3px 8px" }}
                        onClick={() => handleRemoveStaff(st.facility_id, st.user_id, st.email)}
                      >
                        <i className="bi bi-trash" /> Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Regional Shared Hubs Network (Mode A) */}
      <div className="farmer-card mb-4">
        <div className="farmer-card-header">
          <div>
            <h2>Regional Platform Hubs ({regionalHubs.length})</h2>
            <p style={{ margin: "4px 0 0", color: "var(--farmer-muted)", fontSize: "0.85rem" }}>
              Public Kisan Hub facilities operated by the platform for regional multi-farmer supply aggregation.
            </p>
          </div>
          <Link to="/farmer/hub-supply" className="farmer-action-pill">
            <i className="bi bi-box-arrow-in-down" /> Supply Produce to Hub
          </Link>
        </div>

        {regionalHubs.length === 0 ? (
          <div className="farmer-empty-state">
            <i className="bi bi-geo-alt" />
            <p>No regional hubs found in your network area.</p>
          </div>
        ) : (
          <div className="farmer-table-responsive">
            <table className="farmer-table">
              <thead>
                <tr>
                  <th>Hub Name</th>
                  <th>Location & Address</th>
                  <th>Network Type</th>
                  <th>Direct Actions</th>
                </tr>
              </thead>
              <tbody>
                {regionalHubs.map((hub) => (
                  <tr key={hub.id}>
                    <td>
                      <strong>{hub.name}</strong>
                    </td>
                    <td className="text-muted small">{hub.address}</td>
                    <td>
                      <span className={`farmer-badge ${hub.is_owned ? "success" : "info"}`}>
                        {hub.is_owned ? "Farmer Owned" : "Regional Platform"}
                      </span>
                    </td>
                    <td>
                      <Link
                        to="/farmer/hub-supply"
                        className="farmer-action-pill primary"
                        style={{ fontSize: "0.78rem", padding: "3px 8px" }}
                      >
                        Deliver Stock
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* CREATE STORAGE FACILITY MODAL */}
      {showFacilityModal && (
        <div className="farmer-modal-backdrop" onClick={() => setShowFacilityModal(false)}>
          <div className="farmer-modal-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="farmer-modal-header">
              <h3>Create Storage Facility</h3>
              <button
                type="button"
                className="btn-close"
                onClick={() => setShowFacilityModal(false)}
                aria-label="Close"
              />
            </div>
            <form onSubmit={handleCreateFacility}>
              <div className="farmer-modal-body">
                <div className="farmer-form-group">
                  <label htmlFor="facility-name-input">
                    Facility Name <span className="text-danger">*</span>
                  </label>
                  <input
                    id="facility-name-input"
                    type="text"
                    className="farmer-form-control"
                    placeholder="e.g. Green Valley Cold Storage"
                    required
                    value={facilityForm.name}
                    onChange={(e) => setFacilityForm({ ...facilityForm, name: e.target.value })}
                  />
                </div>

                <div className="farmer-form-group">
                  <label htmlFor="facility-address-input">
                    Full Address <span className="text-danger">*</span>
                  </label>
                  <input
                    id="facility-address-input"
                    type="text"
                    className="farmer-form-control"
                    placeholder="e.g. Plot 12, Kisan Mandi Road"
                    required
                    value={facilityForm.address}
                    onChange={(e) => setFacilityForm({ ...facilityForm, address: e.target.value })}
                  />
                </div>

                <div className="row g-2 mb-3">
                  <div className="col-6">
                    <div className="farmer-form-group mb-0">
                      <label htmlFor="facility-pincode-input">
                        Postal Pincode <span className="text-danger">*</span>
                      </label>
                      <input
                        id="facility-pincode-input"
                        type="text"
                        pattern="\d{6}"
                        maxLength={6}
                        className="farmer-form-control"
                        placeholder="6 digits"
                        required
                        value={facilityForm.pincode}
                        onChange={(e) => setFacilityForm({ ...facilityForm, pincode: e.target.value })}
                      />
                    </div>
                  </div>
                  <div className="col-6">
                    <div className="farmer-form-group mb-0">
                      <label htmlFor="facility-radius-input">
                        Service Radius (km)
                      </label>
                      <input
                        id="facility-radius-input"
                        type="number"
                        min="1"
                        max="50"
                        className="farmer-form-control"
                        value={facilityForm.service_radius_km}
                        onChange={(e) =>
                          setFacilityForm({
                            ...facilityForm,
                            service_radius_km: Number(e.target.value),
                          })
                        }
                      />
                    </div>
                  </div>
                </div>

                <div className="farmer-form-group">
                  <div className="d-flex align-items-center justify-content-between mb-1">
                    <label className="mb-0">
                      GPS Coordinates <span className="text-danger">*</span>
                    </label>
                    <button
                      type="button"
                      className="btn btn-sm btn-outline-success"
                      style={{ fontSize: "0.75rem", padding: "2px 8px" }}
                      disabled={locating}
                      onClick={handleDetectLocation}
                    >
                      <i className={`bi ${locating ? "bi-arrow-clockwise spin" : "bi-crosshair"}`} />
                      {locating ? " Detecting..." : " Detect My GPS"}
                    </button>
                  </div>
                  <div className="row g-2">
                    <div className="col-6">
                      <input
                        type="number"
                        step="any"
                        className="farmer-form-control"
                        placeholder="Latitude (e.g. 20.29)"
                        required
                        value={facilityForm.latitude}
                        onChange={(e) =>
                          setFacilityForm({ ...facilityForm, latitude: e.target.value })
                        }
                      />
                    </div>
                    <div className="col-6">
                      <input
                        type="number"
                        step="any"
                        className="farmer-form-control"
                        placeholder="Longitude (e.g. 85.82)"
                        required
                        value={facilityForm.longitude}
                        onChange={(e) =>
                          setFacilityForm({ ...facilityForm, longitude: e.target.value })
                        }
                      />
                    </div>
                  </div>
                </div>
              </div>
              <div className="farmer-modal-footer">
                <button
                  type="button"
                  className="farmer-action-pill"
                  onClick={() => setShowFacilityModal(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="farmer-action-pill primary"
                  disabled={savingFacility}
                >
                  {savingFacility ? "Creating..." : "Save Facility"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CREATE / INVITE STAFF MODAL */}
      {showStaffModal && (
        <div className="farmer-modal-backdrop" onClick={() => setShowStaffModal(false)}>
          <div className="farmer-modal-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="farmer-modal-header">
              <h3>Create Facility Staff Account</h3>
              <button
                type="button"
                className="btn-close"
                onClick={() => setShowStaffModal(false)}
                aria-label="Close"
              />
            </div>
            <form onSubmit={handleCreateStaff}>
              <div className="farmer-modal-body">
                <div className="farmer-form-group">
                  <label htmlFor="staff-facility-select">
                    Assigned Facility <span className="text-danger">*</span>
                  </label>
                  <select
                    id="staff-facility-select"
                    className="farmer-form-control"
                    required
                    value={staffForm.facility_id}
                    onChange={(e) => setStaffForm({ ...staffForm, facility_id: e.target.value })}
                  >
                    <option value="">-- Choose Facility --</option>
                    {facilities.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.name} ({f.pincode})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="farmer-form-group">
                  <label htmlFor="staff-email-field">
                    Staff Email Address <span className="text-danger">*</span>
                  </label>
                  <input
                    id="staff-email-field"
                    type="email"
                    className="farmer-form-control"
                    placeholder="operator@farmmail.in"
                    required
                    value={staffForm.email}
                    onChange={(e) => setStaffForm({ ...staffForm, email: e.target.value })}
                  />
                </div>

                <div className="farmer-form-group">
                  <label htmlFor="staff-name-field">Full Name / Display Name</label>
                  <input
                    id="staff-name-field"
                    type="text"
                    className="farmer-form-control"
                    placeholder="e.g. Ramesh Kumar"
                    value={staffForm.display_name}
                    onChange={(e) => setStaffForm({ ...staffForm, display_name: e.target.value })}
                  />
                </div>

                <div className="farmer-form-group">
                  <label htmlFor="staff-password-field">
                    Initial Temporary Password <span className="text-danger">*</span>
                  </label>
                  <input
                    id="staff-password-field"
                    type="password"
                    minLength={8}
                    maxLength={128}
                    className="farmer-form-control"
                    placeholder="Minimum 8 characters"
                    required
                    value={staffForm.initial_password}
                    onChange={(e) => setStaffForm({ ...staffForm, initial_password: e.target.value })}
                  />
                  <div className="form-text" style={{ fontSize: "0.75rem", color: "var(--farmer-muted)" }}>
                    Provide this secure initial password to your operator for warehouse and packing login.
                  </div>
                </div>
              </div>
              <div className="farmer-modal-footer">
                <button
                  type="button"
                  className="farmer-action-pill"
                  onClick={() => setShowStaffModal(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="farmer-action-pill primary"
                  disabled={savingStaff}
                >
                  {savingStaff ? "Provisioning..." : "Create Staff Account"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
