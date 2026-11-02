import { useEffect, useState } from "react";
import {
  listFarmerFacilities,
  listFarmerStaff,
  createFarmerStaff,
  removeFarmerStaff,
} from "../services/api";
import "./farmer-operations.css";

const emptyForm = {
  facility_id: "",
  display_name: "",
  email: "",
  initial_password: "",
};

function PasswordInput({ id, value, onChange, required, minLength = 8 }) {
  const [visible, setVisible] = useState(false);
  return (
    <div style={{ position: "relative" }}>
      <input
        id={id}
        type={visible ? "text" : "password"}
        value={value}
        onChange={onChange}
        required={required}
        minLength={minLength}
        autoComplete="new-password"
        className="form-control form-control-sm"
        style={{ paddingRight: "2.4rem" }}
        placeholder="Min. 8 characters"
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? "Hide password" : "Show password"}
        style={{
          position: "absolute",
          right: "10px",
          top: "50%",
          transform: "translateY(-50%)",
          background: "none",
          border: "none",
          cursor: "pointer",
          color: "var(--clay, #79705F)",
          padding: 0,
          lineHeight: 1,
        }}
      >
        <i className={`bi ${visible ? "bi-eye-slash" : "bi-eye"}`} />
      </button>
    </div>
  );
}

export default function FarmerHubStaff() {
  const [facilities, setFacilities] = useState([]);
  const [staffList, setStaffList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [revoking, setRevoking] = useState("");

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [formError, setFormError] = useState("");

  const loadAll = async () => {
    setLoading(true);
    setError("");
    try {
      const [facs, staff] = await Promise.all([
        listFarmerFacilities().catch(() => []),
        listFarmerStaff().catch(() => []),
      ]);
      const facArr = Array.isArray(facs) ? facs : [];
      const staffArr = Array.isArray(staff) ? staff : [];
      setFacilities(facArr);
      setStaffList(staffArr);
    } catch (err) {
      setError(err.message || "Failed to load staff records.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const activeFacilities = facilities.filter(
    (f) => (f.status || "").toUpperCase() !== "INACTIVE"
  );

  const handleOpenForm = () => {
    setFormError("");
    setForm({ ...emptyForm, facility_id: activeFacilities[0]?.id || "" });
    setShowForm(true);
  };

  const handleCancelForm = () => {
    setShowForm(false);
    setFormError("");
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError("");
    if (!form.facility_id) {
      setFormError("Please select a hub to assign this staff member.");
      return;
    }
    if (!form.email.trim()) {
      setFormError("Email is required.");
      return;
    }
    if (!form.initial_password || form.initial_password.length < 8) {
      setFormError("Password must be at least 8 characters.");
      return;
    }
    setSubmitting(true);
    try {
      await createFarmerStaff(form.facility_id, {
        email: form.email.trim(),
        initial_password: form.initial_password,
        display_name: form.display_name.trim() || undefined,
      });
      setSuccess("Staff account created successfully.");
      setShowForm(false);
      setForm(emptyForm);
      await loadAll();
    } catch (err) {
      setFormError(err.message || "Failed to create staff account.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleRevoke = async (facilityId, staffUserId, staffEmail) => {
    if (
      !window.confirm(
        `Revoke access for ${staffEmail}? This will remove their assignment from this hub.`
      )
    )
      return;
    setRevoking(staffUserId);
    setError("");
    setSuccess("");
    try {
      await removeFarmerStaff(facilityId, staffUserId);
      setSuccess("Staff access revoked successfully.");
      await loadAll();
    } catch (err) {
      setError(err.message || "Failed to revoke staff access.");
    } finally {
      setRevoking("");
    }
  };

  /* ── Loading skeleton ─────────────────────────────────────────── */
  if (loading) {
    return (
      <div className="farmer-dashboard-view">
        <div
          className="farmer-skeleton-shimmer"
          style={{ height: "52px", borderRadius: "12px", marginBottom: "20px", width: "100%" }}
        />
        <div
          className="farmer-skeleton-shimmer"
          style={{ height: "260px", borderRadius: "12px" }}
        />
      </div>
    );
  }

  return (
    <div className="farmer-dashboard-view">
      {/* ── Page Header ──────────────────────────────────────────── */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          marginBottom: "20px",
          flexWrap: "wrap",
          gap: "12px",
        }}
      >
        <div>
          <h1
            style={{
              fontFamily: "var(--font-display, 'Fraunces', Georgia, serif)",
              fontSize: "22px",
              fontWeight: 700,
              color: "var(--forest, #1B6B34)",
              margin: "0 0 4px",
            }}
          >
            Hub Staff
          </h1>
          <p style={{ fontSize: "13px", color: "var(--clay, #79705F)", margin: 0 }}>
            Create and manage staff accounts for your Kisan Hub facilities.
          </p>
        </div>
        {activeFacilities.length > 0 && (
          <button
            type="button"
            className="kisan-btn-green"
            onClick={handleOpenForm}
            id="btn-create-staff-account"
            style={{ display: "inline-flex", alignItems: "center", gap: "7px" }}
          >
            <i className="bi bi-person-plus-fill" aria-hidden="true" />
            Create Staff Account
          </button>
        )}
      </div>

      {/* ── Global Alerts ────────────────────────────────────────── */}
      {error && (
        <div
          className="alert alert-danger py-2 px-3 mb-3 d-flex align-items-center gap-2"
          role="alert"
          id="staff-error-alert"
        >
          <i className="bi bi-exclamation-triangle-fill" aria-hidden="true" />
          <span>{error}</span>
          <button
            type="button"
            className="btn-close ms-auto"
            aria-label="Dismiss error"
            onClick={() => setError("")}
            style={{ fontSize: "0.72rem" }}
          />
        </div>
      )}
      {success && (
        <div
          className="alert alert-success py-2 px-3 mb-3 d-flex align-items-center gap-2"
          role="status"
          id="staff-success-alert"
        >
          <i className="bi bi-check-circle-fill" aria-hidden="true" />
          <span>{success}</span>
          <button
            type="button"
            className="btn-close ms-auto"
            aria-label="Dismiss"
            onClick={() => setSuccess("")}
            style={{ fontSize: "0.72rem" }}
          />
        </div>
      )}

      {/* ── No Hubs Warning ──────────────────────────────────────── */}
      {activeFacilities.length === 0 && !showForm && (
        <div className="kisan-card kisan-card-pad" style={{ textAlign: "center", padding: "40px 24px" }}>
          <i
            className="bi bi-building-slash"
            style={{
              fontSize: "2.5rem",
              color: "var(--clay, #79705F)",
              display: "block",
              marginBottom: "12px",
            }}
            aria-hidden="true"
          />
          <h2
            style={{
              fontFamily: "var(--font-display, 'Fraunces', Georgia, serif)",
              fontSize: "17px",
              color: "var(--ink, #1C1C16)",
              marginBottom: "8px",
            }}
          >
            No Active Hub Found
          </h2>
          <p style={{ fontSize: "13.5px", color: "var(--clay, #79705F)", marginBottom: "16px" }}>
            You need to create a Kisan Hub before adding staff.{" "}
            <a
              href="/farmer/hub"
              style={{ color: "var(--forest, #1B6B34)", fontWeight: 600, textDecoration: "none" }}
            >
              Go to My Hub →
            </a>
          </p>
        </div>
      )}

      {/* ── Create Staff Form ────────────────────────────────────── */}
      {showForm && (
        <div
          className="kisan-card kisan-card-pad"
          style={{ marginBottom: "20px" }}
          id="create-staff-form-panel"
          role="region"
          aria-label="Create staff account"
        >
          <h2
            style={{
              fontFamily: "var(--font-display, 'Fraunces', Georgia, serif)",
              fontSize: "16px",
              fontWeight: 700,
              color: "var(--forest, #1B6B34)",
              marginBottom: "16px",
              display: "flex",
              alignItems: "center",
              gap: "8px",
            }}
          >
            <i className="bi bi-person-plus-fill" aria-hidden="true" />
            New Staff Account
          </h2>

          {formError && (
            <div
              className="alert alert-danger py-2 px-3 mb-3"
              role="alert"
              id="form-error-alert"
            >
              <i className="bi bi-exclamation-circle me-2" aria-hidden="true" />
              {formError}
            </div>
          )}

          <form onSubmit={handleSubmit} id="create-staff-form" noValidate>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                gap: "14px",
                marginBottom: "14px",
              }}
            >
              {/* Hub selector */}
              <div>
                <label
                  htmlFor="staff-facility"
                  style={{
                    fontSize: "12px",
                    fontWeight: 600,
                    color: "var(--clay, #79705F)",
                    display: "block",
                    marginBottom: "4px",
                  }}
                >
                  Assign to Hub{" "}
                  <span aria-hidden="true" style={{ color: "#c0392b" }}>
                    *
                  </span>
                </label>
                <select
                  id="staff-facility"
                  value={form.facility_id}
                  onChange={(e) => setForm({ ...form, facility_id: e.target.value })}
                  required
                  className="form-select form-select-sm"
                >
                  <option value="" disabled>
                    Select a hub…
                  </option>
                  {activeFacilities.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name} — {f.address}
                    </option>
                  ))}
                </select>
              </div>

              {/* Staff name */}
              <div>
                <label
                  htmlFor="staff-name"
                  style={{
                    fontSize: "12px",
                    fontWeight: 600,
                    color: "var(--clay, #79705F)",
                    display: "block",
                    marginBottom: "4px",
                  }}
                >
                  Staff Name
                </label>
                <input
                  id="staff-name"
                  type="text"
                  value={form.display_name}
                  onChange={(e) => setForm({ ...form, display_name: e.target.value })}
                  className="form-control form-control-sm"
                  maxLength={160}
                  placeholder="Full name (optional)"
                  autoComplete="name"
                />
              </div>

              {/* Email */}
              <div>
                <label
                  htmlFor="staff-email"
                  style={{
                    fontSize: "12px",
                    fontWeight: 600,
                    color: "var(--clay, #79705F)",
                    display: "block",
                    marginBottom: "4px",
                  }}
                >
                  Staff Email{" "}
                  <span aria-hidden="true" style={{ color: "#c0392b" }}>
                    *
                  </span>
                </label>
                <input
                  id="staff-email"
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  required
                  className="form-control form-control-sm"
                  placeholder="staff@example.com"
                  autoComplete="email"
                />
              </div>

              {/* Password */}
              <div>
                <label
                  htmlFor="staff-password"
                  style={{
                    fontSize: "12px",
                    fontWeight: 600,
                    color: "var(--clay, #79705F)",
                    display: "block",
                    marginBottom: "4px",
                  }}
                >
                  Initial Password{" "}
                  <span aria-hidden="true" style={{ color: "#c0392b" }}>
                    *
                  </span>
                </label>
                <PasswordInput
                  id="staff-password"
                  value={form.initial_password}
                  onChange={(e) => setForm({ ...form, initial_password: e.target.value })}
                  required
                  minLength={8}
                />
                <small style={{ fontSize: "11px", color: "var(--clay, #79705F)" }}>
                  Share securely. Staff should change this after first login.
                </small>
              </div>
            </div>

            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
              <button
                type="submit"
                className="kisan-btn-green"
                disabled={submitting}
                id="btn-staff-create-submit"
                style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}
              >
                {submitting ? (
                  <>
                    <span
                      className="spinner-border spinner-border-sm me-1"
                      role="status"
                      aria-hidden="true"
                    />
                    Creating…
                  </>
                ) : (
                  <>
                    <i className="bi bi-check-lg" aria-hidden="true" />
                    Create Account
                  </>
                )}
              </button>
              <button
                type="button"
                className="kisan-btn-outline"
                onClick={handleCancelForm}
                id="btn-staff-create-cancel"
                disabled={submitting}
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ── Staff List ───────────────────────────────────────────── */}
      {activeFacilities.length > 0 && (
        <div className="kisan-card" style={{ overflow: "hidden" }}>
          <div
            style={{
              padding: "14px 18px",
              borderBottom: "1px solid var(--cream-border, #E4DFD1)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <h2
              style={{
                fontFamily: "var(--font-display, 'Fraunces', Georgia, serif)",
                fontSize: "15px",
                fontWeight: 700,
                color: "var(--forest, #1B6B34)",
                margin: 0,
              }}
            >
              Staff Members
              {staffList.length > 0 && (
                <span
                  style={{
                    background: "var(--sage, #4CAF50)",
                    color: "#fff",
                    borderRadius: "99px",
                    fontSize: "11px",
                    padding: "1px 8px",
                    fontWeight: 700,
                    marginLeft: "8px",
                    verticalAlign: "middle",
                  }}
                >
                  {staffList.length}
                </span>
              )}
            </h2>
            <button
              type="button"
              onClick={loadAll}
              className="kisan-btn-outline kisan-btn-sm"
              aria-label="Refresh staff list"
              title="Refresh"
            >
              <i className="bi bi-arrow-clockwise" aria-hidden="true" />
            </button>
          </div>

          {staffList.length === 0 ? (
            <div
              style={{ textAlign: "center", padding: "40px 24px", color: "var(--clay, #79705F)" }}
              id="staff-empty-state"
            >
              <i
                className="bi bi-people"
                style={{ fontSize: "2.2rem", display: "block", marginBottom: "10px", opacity: 0.4 }}
                aria-hidden="true"
              />
              <p style={{ fontSize: "14px", marginBottom: "4px", fontWeight: 600 }}>
                No staff accounts yet
              </p>
              <p style={{ fontSize: "12.5px" }}>
                Click{" "}
                <button
                  type="button"
                  onClick={handleOpenForm}
                  style={{
                    background: "none",
                    border: "none",
                    color: "var(--forest, #1B6B34)",
                    fontWeight: 600,
                    cursor: "pointer",
                    padding: 0,
                    fontSize: "12.5px",
                  }}
                >
                  Create Staff Account
                </button>{" "}
                to add your first hub staff member.
              </p>
            </div>
          ) : (
            <div className="kisan-table-wrap" style={{ margin: 0 }}>
              <table className="kisan-table" id="staff-list-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Assigned Hub</th>
                    <th>Status</th>
                    <th style={{ textAlign: "right" }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {staffList.map((s) => (
                    <tr key={`${s.user_id}-${s.facility_id}`}>
                      <td>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          <div
                            style={{
                              width: "32px",
                              height: "32px",
                              borderRadius: "50%",
                              background: "#E8F5E9",
                              color: "var(--forest, #1B6B34)",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              fontWeight: 700,
                              fontSize: "13px",
                              flexShrink: 0,
                            }}
                            aria-hidden="true"
                          >
                            {(s.display_name || s.email || "S").slice(0, 1).toUpperCase()}
                          </div>
                          <span style={{ fontWeight: 600 }}>
                            {s.display_name || (
                              <em style={{ color: "var(--clay, #79705F)", fontStyle: "normal" }}>
                                —
                              </em>
                            )}
                          </span>
                        </div>
                      </td>
                      <td style={{ fontSize: "13px" }}>{s.email}</td>
                      <td>
                        <span style={{ fontSize: "13px" }}>{s.facility_name || "—"}</span>
                      </td>
                      <td>
                        {s.is_active ? (
                          <span className="kisan-badge kisan-badge-ok">Active</span>
                        ) : (
                          <span className="kisan-badge kisan-badge-danger">Inactive</span>
                        )}
                      </td>
                      <td style={{ textAlign: "right" }}>
                        <button
                          type="button"
                          className="kisan-btn-outline kisan-btn-sm"
                          onClick={() => handleRevoke(s.facility_id, s.user_id, s.email)}
                          disabled={revoking === s.user_id}
                          id={`btn-revoke-staff-${s.user_id}`}
                          aria-label={`Revoke access for ${s.email}`}
                          style={{
                            color: "#c0392b",
                            borderColor: "#f5c6cb",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "5px",
                          }}
                        >
                          {revoking === s.user_id ? (
                            <span
                              className="spinner-border spinner-border-sm"
                              role="status"
                              aria-hidden="true"
                            />
                          ) : (
                            <i className="bi bi-person-dash" aria-hidden="true" />
                          )}
                          Revoke
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
