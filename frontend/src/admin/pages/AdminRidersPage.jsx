import { useCallback, useEffect, useMemo, useState } from "react";
import AdminDataTable from "../components/AdminDataTable";
import AdminFilterTabs from "../components/AdminFilterTabs";
import AdminDetailDrawer from "../components/AdminDetailDrawer";
import AdminConfirmDialog from "../components/AdminConfirmDialog";
import { listAdminRiders, updateAdminRiderApproval } from "../../services/adminApi";

export default function AdminRidersPage() {
  const [riders, setRiders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");

  const [selectedRider, setSelectedRider] = useState(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Transition modal state
  const [confirmModalOpen, setConfirmModalOpen] = useState(false);
  const [riderToUpdate, setRiderToUpdate] = useState(null);
  const [targetStatus, setTargetStatus] = useState("");
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const rows = await listAdminRiders();
      setRiders(Array.isArray(rows) ? rows : []);
    } catch (err) {
      setError(err.message || "Failed to load delivery rider network.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const filteredRiders = useMemo(() => {
    const q = search.trim().toLowerCase();
    return riders.filter((r) => {
      const matchesSearch =
        !q ||
        `${r.display_name || ""} ${r.email || ""} ${r.id || ""}`.toLowerCase().includes(q);
      const matchesStatus =
        statusFilter === "ALL" || (r.approval_status || "").toUpperCase() === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [riders, search, statusFilter]);

  const handleOpenAction = (rider, nextStatus, e) => {
    if (e) e.stopPropagation();
    setRiderToUpdate(rider);
    setTargetStatus(nextStatus);
    setActionError("");
    setConfirmModalOpen(true);
  };

  const handleConfirmAction = async (reason) => {
    if (!riderToUpdate || !targetStatus) return;
    setActionLoading(true);
    setActionError("");
    try {
      await updateAdminRiderApproval(riderToUpdate.id, {
        approval_status: targetStatus,
        reason,
      });
      setNotice(
        `Rider ${riderToUpdate.display_name} updated to ${targetStatus.toLowerCase().replace("_", " ")}.`
      );
      setConfirmModalOpen(false);
      setRiderToUpdate(null);
      await refresh();
    } catch (err) {
      setActionError(err.message || "Failed to update rider approval status.");
    } finally {
      setActionLoading(false);
    }
  };

  const handleView = (rider, e) => {
    if (e) e.stopPropagation();
    setSelectedRider(rider);
    setDrawerOpen(true);
  };

  const columns = [
    {
      key: "display_name",
      label: "Rider Courier",
      sortable: true,
      render: (r) => (
        <div className="admin-entity-cell">
          <span className="admin-avatar-mini">
            {(r.display_name || r.email || "R").slice(0, 1).toUpperCase()}
          </span>
          <div>
            <strong>{r.display_name}</strong>
            <div className="text-muted small">{r.email}</div>
          </div>
        </div>
      ),
    },
    {
      key: "approval_status",
      label: "Approval Status",
      sortable: true,
      render: (r) => (
        <span
          className={`admin-badge admin-badge-${String(r.approval_status).toLowerCase()}`}
        >
          {String(r.approval_status).replace("_", " ")}
        </span>
      ),
    },
    {
      key: "availability",
      label: "Availability",
      sortable: true,
      render: (r) => (
        <span className="badge bg-light text-dark border">
          <i
            className={`bi bi-circle-fill me-1 ${
              r.availability === "AVAILABLE" ? "text-success" : "text-muted"
            }`}
            style={{ fontSize: "0.6rem" }}
          />
          {r.availability}
        </span>
      ),
    },
    {
      key: "active_shipment_count",
      label: "Active Deliveries",
      sortable: true,
      align: "center",
      render: (r) => <b>{r.active_shipment_count}</b>,
    },
    {
      key: "completed_delivery_count",
      label: "Completed",
      sortable: true,
      align: "center",
      render: (r) => r.completed_delivery_count,
    },
    {
      key: "actions",
      label: "Actions",
      width: "180px",
      align: "right",
      render: (r) => (
        <div className="d-flex align-items-center justify-content-end gap-1">
          <button
            type="button"
            className="admin-table-action-btn"
            onClick={(e) => handleView(r, e)}
          >
            <i className="bi bi-eye" />
          </button>
          {r.approval_status === "PENDING_APPROVAL" && (
            <button
              type="button"
              className="admin-table-action-btn text-success"
              onClick={(e) => handleOpenAction(r, "APPROVED", e)}
            >
              <i className="bi bi-check-lg" /> Approve
            </button>
          )}
          {r.approval_status === "APPROVED" && (
            <button
              type="button"
              className="admin-table-action-btn text-danger"
              onClick={(e) => handleOpenAction(r, "SUSPENDED", e)}
            >
              <i className="bi bi-pause-circle" /> Suspend
            </button>
          )}
          {r.approval_status === "SUSPENDED" && (
            <button
              type="button"
              className="admin-table-action-btn text-primary"
              onClick={(e) => handleOpenAction(r, "APPROVED", e)}
            >
              <i className="bi bi-play-circle" /> Reinstate
            </button>
          )}
        </div>
      ),
    },
  ];

  const statusTabs = [
    { key: "ALL", label: "All Riders", count: riders.length },
    {
      key: "PENDING_APPROVAL",
      label: "Pending",
      count: riders.filter((r) => r.approval_status === "PENDING_APPROVAL").length,
    },
    {
      key: "APPROVED",
      label: "Approved",
      count: riders.filter((r) => r.approval_status === "APPROVED").length,
    },
    {
      key: "SUSPENDED",
      label: "Suspended",
      count: riders.filter((r) => r.approval_status === "SUSPENDED").length,
    },
  ];

  return (
    <div className="admin-page-container">
      <div className="admin-page-header">
        <div>
          <span className="eyebrow">Fleet Oversight</span>
          <h1>Rider Network</h1>
          <p>Review rider registrations, verify driver approval credentials, and govern courier availability.</p>
        </div>
        <div className="admin-header-actions">
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

      <AdminFilterTabs tabs={statusTabs} activeTab={statusFilter} onChange={setStatusFilter} />

      <AdminDataTable
        columns={columns}
        data={filteredRiders}
        loading={loading}
        error={error}
        onRetry={refresh}
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search riders by name, email, or status..."
        pageSize={12}
        emptyTitle="No riders found"
        emptyDescription="There are no registered fleet couriers matching your active criteria."
        onRowClick={handleView}
      />

      {/* Rider Detail Drawer */}
      <AdminDetailDrawer
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title={selectedRider?.display_name || "Rider Details"}
        subtitle={selectedRider?.email}
        badge={
          selectedRider && (
            <span
              className={`admin-badge admin-badge-${String(
                selectedRider.approval_status
              ).toLowerCase()}`}
            >
              {String(selectedRider.approval_status).replace("_", " ")}
            </span>
          )
        }
      >
        {selectedRider && (
          <>
            <section className="admin-detail-section">
              <h4>Courier Identification</h4>
              <dl className="admin-detail-list">
                <dt>Rider ID</dt>
                <dd className="font-monospace">{selectedRider.id}</dd>
                <dt>User Account ID</dt>
                <dd className="font-monospace">{selectedRider.user_id}</dd>
                <dt>Display Name</dt>
                <dd>{selectedRider.display_name}</dd>
                <dt>Email Address</dt>
                <dd>{selectedRider.email}</dd>
                <dt>Approval Status</dt>
                <dd>
                  <span
                    className={`admin-badge admin-badge-${String(
                      selectedRider.approval_status
                    ).toLowerCase()}`}
                  >
                    {String(selectedRider.approval_status).replace("_", " ")}
                  </span>
                </dd>
                <dt>Duty Status</dt>
                <dd>{selectedRider.availability}</dd>
              </dl>
            </section>

            <section className="admin-detail-section">
              <h4>Fulfillment Performance</h4>
              <dl className="admin-detail-list">
                <dt>Active Shipments</dt>
                <dd><b>{selectedRider.active_shipment_count}</b></dd>
                <dt>Completed Trips</dt>
                <dd><b>{selectedRider.completed_delivery_count}</b></dd>
              </dl>
            </section>
          </>
        )}
      </AdminDetailDrawer>

      {/* Rider Status Action Confirm Modal */}
      <AdminConfirmDialog
        isOpen={confirmModalOpen}
        onClose={() => setConfirmModalOpen(false)}
        onConfirm={handleConfirmAction}
        title={`${targetStatus === "APPROVED" ? "Approve / Reinstate" : "Suspend"} Rider`}
        message={`Are you sure you want to transition ${riderToUpdate?.display_name} to ${targetStatus}?`}
        confirmLabel={targetStatus === "APPROVED" ? "Approve Rider" : "Suspend Rider"}
        confirmVariant={targetStatus === "SUSPENDED" ? "danger" : "primary"}
        requireReason={targetStatus === "SUSPENDED"}
        reasonPlaceholder="Specify the administrative audit reason for this action..."
        loading={actionLoading}
        error={actionError}
      />
    </div>
  );
}
