import { useCallback, useEffect, useMemo, useState } from "react";
import AdminDataTable from "../components/AdminDataTable";
import AdminFilterTabs from "../components/AdminFilterTabs";
import AdminDetailDrawer from "../components/AdminDetailDrawer";
import AdminHubLocationPicker from "../components/AdminHubLocationPicker";
import { createAdminHub, listAdminHubs, updateAdminHub } from "../../services/adminApi";

const emptyForm = {
  name: "",
  address: "",
  pincode: "",
  service_radius_km: "8",
  status: "ACTIVE",
};

export default function AdminHubsPage() {
  const [hubs, setHubs] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [location, setLocation] = useState(null);
  const [editingId, setEditingId] = useState("");
  const [showForm, setShowForm] = useState(false);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");

  const [selectedHub, setSelectedHub] = useState(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const rows = await listAdminHubs();
      setHubs(Array.isArray(rows) ? rows : []);
    } catch (err) {
      setError(err.message || "Failed to load Kisan Hub network.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const filteredHubs = useMemo(() => {
    const q = search.trim().toLowerCase();
    return hubs.filter((h) => {
      const matchesSearch =
        !q ||
        `${h.name || ""} ${h.address || ""} ${h.pincode || ""} ${h.id || ""}`
          .toLowerCase()
          .includes(q);
      const matchesStatus =
        statusFilter === "ALL" || (h.status || "").toUpperCase() === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [hubs, search, statusFilter]);

  function startEdit(hub, e) {
    if (e) e.stopPropagation();
    setEditingId(hub.id);
    setForm({
      name: hub.name,
      address: hub.address,
      pincode: hub.pincode,
      service_radius_km: String(hub.service_radius_km),
      status: hub.status,
    });
    setLocation({ latitude: hub.latitude, longitude: hub.longitude });
    setShowForm(true);
    setError("");
    setNotice("");
  }

  function resetForm() {
    setForm(emptyForm);
    setLocation(null);
    setEditingId("");
    setShowForm(false);
  }

  function requestBrowserLocation() {
    setError("");
    if (!navigator.geolocation) {
      setError("Browser geolocation is not supported on this device.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => setLocation({ latitude: coords.latitude, longitude: coords.longitude }),
      (err) => setError(err.message || "Unable to acquire current browser coordinates."),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  }

  async function handleSaveHub(e) {
    e.preventDefault();
    if (!location) {
      setError("Please designate the hub geolocation on the Leaflet map or via browser location.");
      return;
    }
    setSaving(true);
    setError("");
    setNotice("");

    const payload = {
      ...form,
      service_radius_km: Number(form.service_radius_km),
      latitude: location.latitude,
      longitude: location.longitude,
    };

    try {
      if (editingId) {
        await updateAdminHub(editingId, payload);
        setNotice(`Hub "${form.name}" successfully updated.`);
      } else {
        await createAdminHub(payload);
        setNotice(`New Kisan Hub "${form.name}" successfully established.`);
      }
      resetForm();
      await refresh();
    } catch (err) {
      setError(err.message || "Failed to save Kisan Hub.");
    } finally {
      setSaving(false);
    }
  }

  const handleView = (hub, e) => {
    if (e) e.stopPropagation();
    setSelectedHub(hub);
    setDrawerOpen(true);
  };

  const columns = [
    {
      key: "name",
      label: "Kisan Hub",
      sortable: true,
      render: (h) => (
        <div>
          <strong>{h.name}</strong>
          <div className="text-muted small text-truncate" style={{ maxWidth: "220px" }}>
            {h.address}
          </div>
        </div>
      ),
    },
    {
      key: "pincode",
      label: "Pincode",
      sortable: true,
      render: (h) => <span className="badge bg-light text-dark border">{h.pincode}</span>,
    },
    {
      key: "service_radius_km",
      label: "Coverage Radius",
      sortable: true,
      render: (h) => `${h.service_radius_km} km`,
    },
    {
      key: "status",
      label: "Operational State",
      sortable: true,
      render: (h) => (
        <span className={`admin-badge admin-badge-${String(h.status).toLowerCase()}`}>
          {h.status}
        </span>
      ),
    },
    {
      key: "actions",
      label: "Actions",
      width: "160px",
      align: "right",
      render: (h) => (
        <div className="d-flex align-items-center justify-content-end gap-1">
          <button
            type="button"
            className="admin-table-action-btn"
            onClick={(e) => handleView(h, e)}
          >
            <i className="bi bi-eye" />
          </button>
          <button
            type="button"
            className="admin-table-action-btn"
            onClick={(e) => startEdit(h, e)}
          >
            <i className="bi bi-pencil" /> Edit
          </button>
        </div>
      ),
    },
  ];

  const statusTabs = [
    { key: "ALL", label: "All Hubs", count: hubs.length },
    {
      key: "ACTIVE",
      label: "Active",
      count: hubs.filter((h) => (h.status || "").toUpperCase() === "ACTIVE").length,
    },
    {
      key: "INACTIVE",
      label: "Inactive",
      count: hubs.filter((h) => (h.status || "").toUpperCase() === "INACTIVE").length,
    },
  ];

  return (
    <div className="admin-page-container">
      <div className="admin-page-header">
        <div>
          <span className="eyebrow">Logistics Infrastructure</span>
          <h1>Kisan Hubs</h1>
          <p>Configure local dispatch centers, define delivery service zones, and inspect warehouse stock.</p>
        </div>
        <div className="admin-header-actions">
          {showForm && (
            <button
              type="button"
              className="admin-btn-secondary"
              onClick={resetForm}
            >
              <i className="bi bi-x-lg" /> Close Editor
            </button>
          )}
          <button type="button" className="admin-btn-secondary" onClick={refresh} disabled={loading}>
            <i className={`bi bi-arrow-clockwise ${loading ? "spin" : ""}`} /> Refresh
          </button>
        </div>
      </div>

      {notice && (
        <div className="alert alert-success d-flex align-items-center justify-content-between mb-3" role="status">
          <div><i className="bi bi-check-circle-fill me-2" />{notice}</div>
          <button type="button" className="btn-close" onClick={() => setNotice("")} aria-label="Close" />
        </div>
      )}

      {/* Hub Creation / Edit Form */}
      {showForm && (
        <div className="admin-form-card mb-4">
          <div className="d-flex align-items-center justify-content-between pb-3 mb-3 border-bottom">
            <h3 className="h5 mb-0 fw-bold text-forest">
              {editingId ? "Edit Kisan Hub" : "Establish New Kisan Hub"}
            </h3>
            <button type="button" className="btn-close" onClick={resetForm} aria-label="Cancel" />
          </div>

          <form onSubmit={handleSaveHub}>
            <div className="admin-form-grid mb-3">
              <div className="admin-form-group">
                <label htmlFor="hub-name-input">
                  Hub Facility Name <span className="text-danger">*</span>
                </label>
                <input
                  id="hub-name-input"
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="e.g. Yelahanka Kisan Hub"
                  required
                />
              </div>

              <div className="admin-form-group">
                <label htmlFor="hub-pincode-input">
                  Postal Pincode <span className="text-danger">*</span>
                </label>
                <input
                  id="hub-pincode-input"
                  type="text"
                  pattern="^\d{6}$"
                  maxLength={6}
                  value={form.pincode}
                  onChange={(e) => setForm({ ...form, pincode: e.target.value })}
                  placeholder="6-digit pincode"
                  required
                />
              </div>

              <div className="admin-form-group">
                <label htmlFor="hub-radius-input">
                  Service Radius (km) <span className="text-danger">*</span>
                </label>
                <input
                  id="hub-radius-input"
                  type="number"
                  min="1"
                  max="50"
                  step="0.5"
                  value={form.service_radius_km}
                  onChange={(e) => setForm({ ...form, service_radius_km: e.target.value })}
                  required
                />
              </div>

              <div className="admin-form-group">
                <label htmlFor="hub-status-select">Operational Status</label>
                <select
                  id="hub-status-select"
                  value={form.status}
                  onChange={(e) => setForm({ ...form, status: e.target.value })}
                >
                  <option value="ACTIVE">ACTIVE</option>
                  <option value="INACTIVE">INACTIVE</option>
                </select>
              </div>

              <div className="admin-form-group" style={{ gridColumn: "1 / -1" }}>
                <label htmlFor="hub-address-input">
                  Physical Hub Facility Address <span className="text-danger">*</span>
                </label>
                <input
                  id="hub-address-input"
                  type="text"
                  value={form.address}
                  onChange={(e) => setForm({ ...form, address: e.target.value })}
                  placeholder="Street address, landmark, area"
                  required
                />
              </div>
            </div>

            {/* Geolocation Section */}
            <div className="mb-3">
              <div className="d-flex align-items-center justify-content-between mb-2">
                <label className="fw-bold small mb-0">
                  <i className="bi bi-geo-alt-fill text-forest me-1" />
                  Hub Center Coordinates (Interactive Leaflet Map)
                </label>
                <button
                  type="button"
                  className="admin-btn-secondary admin-btn-sm"
                  onClick={requestBrowserLocation}
                >
                  <i className="bi bi-crosshair" /> Use Browser Location
                </button>
              </div>

              <AdminHubLocationPicker
                location={location || { latitude: 12.9716, longitude: 77.5946 }}
                onChange={setLocation}
              />
            </div>

            {error && (
              <div className="alert alert-danger py-2 mb-3" role="alert">
                <i className="bi bi-exclamation-triangle-fill me-2" />
                {error}
              </div>
            )}

            <div className="d-flex align-items-center justify-content-end gap-2 pt-2 border-top">
              <button
                type="button"
                className="admin-btn-secondary"
                onClick={resetForm}
                disabled={saving}
              >
                Cancel
              </button>
              <button type="submit" className="admin-btn-primary" disabled={saving}>
                {saving ? "Saving Hub..." : editingId ? "Update Hub" : "Create Hub"}
              </button>
            </div>
          </form>
        </div>
      )}

      <AdminFilterTabs tabs={statusTabs} activeTab={statusFilter} onChange={setStatusFilter} />

      <AdminDataTable
        columns={columns}
        data={filteredHubs}
        loading={loading}
        error={error}
        onRetry={refresh}
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search hubs by name, address, or pincode..."
        pageSize={10}
        emptyTitle="No Kisan Hubs configured"
        emptyDescription="Create a hub location to begin routing local farm supply and deliveries."
        onRowClick={handleView}
      />

      {/* Hub Detail Drawer */}
      <AdminDetailDrawer
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title={selectedHub?.name || "Hub Facility Details"}
        subtitle={`Pincode ${selectedHub?.pincode || ""}`}
        badge={
          selectedHub && (
            <span className={`admin-badge admin-badge-${String(selectedHub.status).toLowerCase()}`}>
              {selectedHub.status}
            </span>
          )
        }
      >
        {selectedHub && (
          <>
            <section className="admin-detail-section">
              <h4>Facility Information</h4>
              <dl className="admin-detail-list">
                <dt>Hub UUID</dt>
                <dd className="font-monospace">{selectedHub.id}</dd>
                <dt>Facility Name</dt>
                <dd>{selectedHub.name}</dd>
                <dt>Service Radius</dt>
                <dd>{selectedHub.service_radius_km} km radius</dd>
                <dt>Physical Address</dt>
                <dd>{selectedHub.address}</dd>
                <dt>Pincode</dt>
                <dd>{selectedHub.pincode}</dd>
                <dt>Coordinates</dt>
                <dd className="font-monospace">
                  {selectedHub.latitude?.toFixed(4)}, {selectedHub.longitude?.toFixed(4)}
                </dd>
              </dl>
            </section>

            <section className="admin-detail-section">
              <h4>Warehouse Crop Inventory</h4>
              {Array.isArray(selectedHub.stock) && selectedHub.stock.length > 0 ? (
                <div className="table-responsive">
                  <table className="admin-table small">
                    <thead>
                      <tr>
                        <th>Crop</th>
                        <th>Available Stock</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedHub.stock.map((item, idx) => (
                        <tr key={item.listing_id || idx}>
                          <td><strong>{item.crop_name}</strong></td>
                          <td>{`${item.quantity} ${item.unit}`}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-muted small mb-0">No active stock lots in warehouse.</p>
              )}
            </section>

            <section className="admin-detail-section">
              <h4>Recent Farmer Deliveries</h4>
              {Array.isArray(selectedHub.recent_deliveries) && selectedHub.recent_deliveries.length > 0 ? (
                <div className="table-responsive">
                  <table className="admin-table small">
                    <thead>
                      <tr>
                        <th>Produce</th>
                        <th>Farmer</th>
                        <th>Quantity</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedHub.recent_deliveries.map((delivery) => (
                        <tr key={delivery.id}>
                          <td><strong>{delivery.crop_name}</strong></td>
                          <td>{delivery.farmer_name}</td>
                          <td>{delivery.quantity}</td>
                          <td>
                            <span className={`admin-badge admin-badge-${String(delivery.status).toLowerCase()}`}>
                              {delivery.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-muted small mb-0">No farmer drop-offs recorded for this hub.</p>
              )}
            </section>
          </>
        )}
      </AdminDetailDrawer>
    </div>
  );
}
