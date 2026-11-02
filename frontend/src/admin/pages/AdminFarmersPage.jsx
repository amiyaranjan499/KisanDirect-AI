import { useCallback, useEffect, useMemo, useState } from "react";
import AdminDataTable from "../components/AdminDataTable";
import AdminFilterTabs from "../components/AdminFilterTabs";
import AdminDetailDrawer from "../components/AdminDetailDrawer";
import AdminConfirmDialog from "../components/AdminConfirmDialog";
import { listAdminFarmers, updateAdminUserStatus } from "../../services/adminApi";

const money = (value) => `₹${Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
const formatDate = (value) =>
  value
    ? new Date(value).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })
    : "—";

export default function AdminFarmersPage() {
  const [farmers, setFarmers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");

  const [selectedFarmer, setSelectedFarmer] = useState(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const [confirmModalOpen, setConfirmModalOpen] = useState(false);
  const [farmerToToggle, setFarmerToToggle] = useState(null);
  const [toggleLoading, setToggleLoading] = useState(false);
  const [toggleError, setToggleError] = useState("");

  const loadFarmers = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const rows = await listAdminFarmers();
      setFarmers(Array.isArray(rows) ? rows : []);
    } catch (err) {
      setError(err.message || "Failed to load farmer network.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadFarmers();
  }, [loadFarmers]);

  const filteredFarmers = useMemo(() => {
    const q = search.trim().toLowerCase();
    return farmers.filter((f) => {
      const matchesSearch =
        !q || `${f.name || ""} ${f.email || ""} ${f.address || ""} ${f.phone || ""}`.toLowerCase().includes(q);
      const matchesStatus =
        statusFilter === "ALL" || (statusFilter === "ACTIVE" ? f.is_active : !f.is_active);
      return matchesSearch && matchesStatus;
    });
  }, [farmers, search, statusFilter]);

  const handleOpenToggle = (farmer, e) => {
    if (e) e.stopPropagation();
    setFarmerToToggle(farmer);
    setToggleError("");
    setConfirmModalOpen(true);
  };

  const handleConfirmToggle = async () => {
    if (!farmerToToggle) return;
    setToggleLoading(true);
    setToggleError("");
    try {
      await updateAdminUserStatus(farmerToToggle.user_id || farmerToToggle.id, {
        is_active: !farmerToToggle.is_active,
      });
      setConfirmModalOpen(false);
      setFarmerToToggle(null);
      await loadFarmers();
    } catch (err) {
      setToggleError(err.message || "Unable to update farmer status.");
    } finally {
      setToggleLoading(false);
    }
  };

  const handleViewFarmer = (farmer, e) => {
    if (e) e.stopPropagation();
    setSelectedFarmer(farmer);
    setDrawerOpen(true);
  };

  const columns = [
    {
      key: "name",
      label: "Farmer Profile",
      sortable: true,
      render: (f) => (
        <div className="admin-entity-cell">
          <span className="admin-avatar-mini">{(f.name || "F").slice(0, 1).toUpperCase()}</span>
          <div>
            <strong>{f.name}</strong>
            <div className="text-muted small">{f.email}</div>
          </div>
        </div>
      ),
    },
    {
      key: "phone",
      label: "Phone",
      render: (f) => f.phone || "—",
    },
    {
      key: "address",
      label: "Farm Location",
      render: (f) => (
        <span className="text-truncate d-inline-block" style={{ maxWidth: "220px" }} title={f.address}>
          {f.address || "Location pending"}
        </span>
      ),
    },
    {
      key: "listing_count",
      label: "Listings",
      sortable: true,
      align: "center",
      render: (f) => (
        <span>
          <b>{f.active_listing_count ?? 0}</b> / {f.listing_count ?? 0} active
        </span>
      ),
    },
    {
      key: "order_count",
      label: "Orders",
      sortable: true,
      align: "center",
      render: (f) => f.order_count ?? 0,
    },
    {
      key: "total_sales",
      label: "Total Sales",
      sortable: true,
      render: (f) => <strong>{money(f.total_sales || 0)}</strong>,
    },
    {
      key: "is_active",
      label: "Status",
      sortable: true,
      width: "110px",
      render: (f) => (
        <span className={`admin-badge admin-badge-${f.is_active ? "active" : "inactive"}`}>
          {f.is_active ? "Active" : "Inactive"}
        </span>
      ),
    },
    {
      key: "actions",
      label: "Actions",
      width: "170px",
      align: "right",
      render: (f) => (
        <div className="d-flex align-items-center justify-content-end gap-2">
          <button type="button" className="admin-table-action-btn" onClick={(e) => handleViewFarmer(f, e)}>
            <i className="bi bi-eye" /> View
          </button>
          <button
            type="button"
            className={`admin-table-action-btn ${f.is_active ? "text-danger" : "text-success"}`}
            onClick={(e) => handleOpenToggle(f, e)}
          >
            <i className={`bi ${f.is_active ? "bi-slash-circle" : "bi-check-circle"}`} />
            {f.is_active ? "Deactivate" : "Activate"}
          </button>
        </div>
      ),
    },
  ];

  const statusTabs = [
    { key: "ALL", label: "All Farmers", count: farmers.length },
    { key: "ACTIVE", label: "Active", count: farmers.filter((f) => f.is_active).length },
    { key: "INACTIVE", label: "Inactive", count: farmers.filter((f) => !f.is_active).length },
  ];

  return (
    <div className="admin-page-container">
      <div className="admin-page-header">
        <div>
          <span className="eyebrow">Supply Partners</span>
          <h1>Farmer Network</h1>
          <p>Supervise agricultural producers, verified farm locations, active crop stock, and sales volume.</p>
        </div>
        <div className="admin-header-actions">
          <button type="button" className="admin-btn-secondary" onClick={loadFarmers} disabled={loading}>
            <i className={`bi bi-arrow-clockwise ${loading ? "spin" : ""}`} /> Refresh
          </button>
        </div>
      </div>

      <AdminFilterTabs tabs={statusTabs} activeTab={statusFilter} onChange={setStatusFilter} />

      <AdminDataTable
        columns={columns}
        data={filteredFarmers}
        loading={loading}
        error={error}
        onRetry={loadFarmers}
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search farmers by name, email, or farm location..."
        pageSize={12}
        emptyTitle="No farmers found"
        emptyDescription="No registered supply partners match your current filter criteria."
        onRowClick={handleViewFarmer}
      />

      <AdminDetailDrawer
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title={selectedFarmer?.name || "Farmer Details"}
        subtitle={selectedFarmer?.email}
        badge={
          selectedFarmer && (
            <span className={`admin-badge admin-badge-${selectedFarmer.is_active ? "active" : "inactive"}`}>
              {selectedFarmer.is_active ? "Active" : "Inactive"}
            </span>
          )
        }
        footer={
          selectedFarmer && (
            <>
              <button type="button" className="admin-btn-secondary" onClick={() => setDrawerOpen(false)}>
                Close
              </button>
              <button
                type="button"
                className={selectedFarmer.is_active ? "admin-btn-danger" : "admin-btn-primary"}
                onClick={() => {
                  setDrawerOpen(false);
                  handleOpenToggle(selectedFarmer);
                }}
              >
                {selectedFarmer.is_active ? "Deactivate Farmer" : "Activate Farmer"}
              </button>
            </>
          )
        }
      >
        {selectedFarmer && (
          <>
            <section className="admin-detail-section">
              <h4>Farmer Identification</h4>
              <dl className="admin-detail-list">
                <dt>Farmer ID</dt>
                <dd className="font-monospace">{selectedFarmer.id}</dd>
                <dt>User Account ID</dt>
                <dd className="font-monospace">{selectedFarmer.user_id}</dd>
                <dt>Full Name</dt>
                <dd>{selectedFarmer.name}</dd>
                <dt>Email Address</dt>
                <dd>{selectedFarmer.email}</dd>
                <dt>Phone Number</dt>
                <dd>{selectedFarmer.phone || "Not specified"}</dd>
                <dt>Farm Location</dt>
                <dd>{selectedFarmer.address || "Location pending confirmation"}</dd>
                <dt>Registered Since</dt>
                <dd>{formatDate(selectedFarmer.created_at)}</dd>
              </dl>
            </section>

            <section className="admin-detail-section">
              <h4>Agricultural Performance</h4>
              <dl className="admin-detail-list">
                <dt>Total Listings</dt>
                <dd>{selectedFarmer.listing_count ?? 0}</dd>
                <dt>Active Listings</dt>
                <dd>{selectedFarmer.active_listing_count ?? 0}</dd>
                <dt>Orders Completed</dt>
                <dd>{selectedFarmer.order_count ?? 0}</dd>
                <dt>Gross Harvest Sales</dt>
                <dd><strong>{money(selectedFarmer.total_sales || 0)}</strong></dd>
              </dl>
            </section>
          </>
        )}
      </AdminDetailDrawer>

      <AdminConfirmDialog
        isOpen={confirmModalOpen}
        onClose={() => setConfirmModalOpen(false)}
        onConfirm={handleConfirmToggle}
        title={farmerToToggle?.is_active ? "Deactivate Farmer Account" : "Activate Farmer Account"}
        message={`Are you sure you want to ${
          farmerToToggle?.is_active ? "deactivate" : "activate"
        } platform access for farmer ${farmerToToggle?.name}?`}
        confirmLabel={farmerToToggle?.is_active ? "Deactivate" : "Activate"}
        confirmVariant={farmerToToggle?.is_active ? "danger" : "primary"}
        requireReason={false}
        loading={toggleLoading}
        error={toggleError}
      />
    </div>
  );
}
