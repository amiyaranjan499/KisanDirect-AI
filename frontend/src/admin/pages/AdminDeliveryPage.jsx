import { useCallback, useEffect, useMemo, useState } from "react";
import AdminDataTable from "../components/AdminDataTable";
import AdminFilterTabs from "../components/AdminFilterTabs";
import AdminDetailDrawer from "../components/AdminDetailDrawer";
import AdminConfirmDialog from "../components/AdminConfirmDialog";
import {
  cancelAdminShipment,
  listAdminRiders,
  listAdminShipments,
  reassignAdminShipment,
  resetAdminDeliveryOtp,
  deleteAdminShipment,
} from "../../services/adminApi";

const formatDate = (value) =>
  value
    ? new Date(value).toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";

export default function AdminDeliveryPage() {
  const [shipments, setShipments] = useState([]);
  const [riders, setRiders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");

  // Detail drawer
  const [selectedShipment, setSelectedShipment] = useState(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Modals for actions
  const [activeAction, setActiveAction] = useState(null); // 'reassign' | 'cancel' | 'otp-reset'
  const [actionShipment, setActionShipment] = useState(null);
  const [selectedRiderId, setSelectedRiderId] = useState("");
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState("");

  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [shipmentToDelete, setShipmentToDelete] = useState(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [shipmentRows, riderRows] = await Promise.all([
        listAdminShipments(),
        listAdminRiders(),
      ]);
      setShipments(Array.isArray(shipmentRows) ? shipmentRows : []);
      setRiders(Array.isArray(riderRows) ? riderRows : []);
    } catch (err) {
      setError(err.message || "Failed to load shipment operations.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const availableRiders = useMemo(() => {
    return riders.filter(
      (r) => r.approval_status === "APPROVED" && r.availability === "AVAILABLE"
    );
  }, [riders]);

  const filteredShipments = useMemo(() => {
    const q = search.trim().toLowerCase();
    return shipments.filter((s) => {
      const matchesSearch =
        !q ||
        `${s.id || ""} ${s.order_id || ""} ${s.hub_name || ""} ${s.rider_name || ""} ${s.delivery_address || ""}`
          .toLowerCase()
          .includes(q);
      const matchesStatus =
        statusFilter === "ALL" || (s.status || "").toUpperCase() === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [shipments, search, statusFilter]);

  const handleOpenAction = (shipment, actionType, e) => {
    if (e) e.stopPropagation();
    setActionShipment(shipment);
    setActiveAction(actionType);
    setSelectedRiderId("");
    setActionError("");
  };

  const handleExecuteAction = async (reason) => {
    if (!actionShipment || !activeAction) return;
    setActionLoading(true);
    setActionError("");

    try {
      if (activeAction === "reassign") {
        if (!selectedRiderId) {
          throw new Error("Please select an available rider to reassign.");
        }
        await reassignAdminShipment(actionShipment.id, {
          rider_user_id: selectedRiderId,
          reason,
        });
        setNotice(`Shipment ${String(actionShipment.id).slice(0, 8)} successfully reassigned.`);
      } else if (activeAction === "cancel") {
        await cancelAdminShipment(actionShipment.id, { reason });
        setNotice(`Shipment ${String(actionShipment.id).slice(0, 8)} cancelled.`);
      } else if (activeAction === "otp-reset") {
        await resetAdminDeliveryOtp(actionShipment.id, { reason });
        setNotice(`Delivery OTP lockout reset for shipment ${String(actionShipment.id).slice(0, 8)}.`);
      }
      setActiveAction(null);
      setActionShipment(null);
      await refresh();
    } catch (err) {
      setActionError(err.message || "Failed to complete delivery action.");
    } finally {
      setActionLoading(false);
    }
  };

  const handleView = (shipment, e) => {
    if (e) e.stopPropagation();
    setSelectedShipment(shipment);
    setDrawerOpen(true);
  };

  const handleOpenDelete = (shipment, e) => {
    if (e) e.stopPropagation();
    setShipmentToDelete(shipment);
    setDeleteError("");
    setDeleteModalOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!shipmentToDelete) return;
    setDeleteLoading(true);
    setDeleteError("");
    try {
      await deleteAdminShipment(shipmentToDelete.id);
      setShipments((prev) => prev.filter((s) => s.id !== shipmentToDelete.id));
      setDeleteModalOpen(false);
      setShipmentToDelete(null);
      setNotice(`Shipment ${String(shipmentToDelete.id).slice(0, 8)} permanently deleted.`);
    } catch (err) {
      setDeleteError(err.message || "Failed to permanently delete shipment.");
    } finally {
      setDeleteLoading(false);
    }
  };

  const columns = [
    {
      key: "id",
      label: "Shipment ID",
      sortable: true,
      width: "130px",
      render: (s) => (
        <span className="font-monospace text-muted" title={s.id}>
          {String(s.id).slice(0, 8).toUpperCase()}
        </span>
      ),
    },
    {
      key: "order_id",
      label: "Order Ref",
      sortable: true,
      width: "130px",
      render: (s) => (
        <strong className="font-monospace text-forest">
          {`ORD-${String(s.order_id).slice(0, 8).toUpperCase()}`}
        </strong>
      ),
    },
    {
      key: "hub_name",
      label: "Dispatch Hub",
      sortable: true,
      render: (s) => (
        <div>
          <span>{s.hub_name}</span>
          <div className="text-muted small text-truncate" style={{ maxWidth: "200px" }} title={s.pickup_address}>
            {s.pickup_address}
          </div>
        </div>
      ),
    },
    {
      key: "rider_name",
      label: "Assigned Rider",
      sortable: true,
      render: (s) => (
        s.rider_name ? (
          <div className="d-flex align-items-center gap-2">
            <i className="bi bi-person-badge text-forest" />
            <span>{s.rider_name}</span>
          </div>
        ) : (
          <span className="badge bg-light text-warning border">Unassigned</span>
        )
      ),
    },
    {
      key: "delivery_address",
      label: "Destination",
      render: (s) => (
        <span className="text-truncate d-inline-block" style={{ maxWidth: "200px" }} title={s.delivery_address}>
          {s.delivery_address}
        </span>
      ),
    },
    {
      key: "status",
      label: "Status",
      sortable: true,
      render: (s) => (
        <span className={`admin-badge admin-badge-${String(s.status).toLowerCase()}`}>
          {s.status}
        </span>
      ),
    },
    {
      key: "otp_locked",
      label: "Security",
      render: (s) => (
        s.otp_locked ? (
          <span className="admin-badge admin-badge-inactive">
            <i className="bi bi-lock-fill me-1" /> OTP Locked
          </span>
        ) : (
          <span className="text-muted small">Normal</span>
        )
      ),
    },
    {
      key: "actions",
      label: "Actions",
      width: "250px",
      align: "right",
      render: (s) => (
        <div className="d-flex align-items-center justify-content-end gap-1 flex-wrap">
          <button
            type="button"
            className="admin-table-action-btn"
            onClick={(e) => handleView(s, e)}
          >
            <i className="bi bi-eye" />
          </button>
          <button
            type="button"
            className="admin-table-action-btn"
            onClick={(e) => handleOpenAction(s, "reassign", e)}
            title="Reassign rider"
          >
            <i className="bi bi-arrow-left-right" /> Reassign
          </button>
          {s.can_cancel && (
            <button
              type="button"
              className="admin-table-action-btn text-danger"
              onClick={(e) => handleOpenAction(s, "cancel", e)}
              title="Cancel shipment"
            >
              <i className="bi bi-x-circle" />
            </button>
          )}
          {s.otp_locked && (
            <button
              type="button"
              className="admin-table-action-btn text-warning"
              onClick={(e) => handleOpenAction(s, "otp-reset", e)}
              title="Reset OTP lockout"
            >
              <i className="bi bi-key" /> Reset
            </button>
          )}
          <button
            type="button"
            className="admin-table-action-btn text-danger"
            onClick={(e) => handleOpenDelete(s, e)}
            title="Permanently delete shipment"
          >
            <i className="bi bi-trash" />
          </button>
        </div>
      ),
    },
  ];

  const statusTabs = [
    { key: "ALL", label: "All Shipments", count: shipments.length },
    {
      key: "ASSIGNED",
      label: "Assigned",
      count: shipments.filter((s) => (s.status || "").toUpperCase() === "ASSIGNED").length,
    },
    {
      key: "IN_TRANSIT",
      label: "In Transit",
      count: shipments.filter((s) => (s.status || "").toUpperCase() === "IN_TRANSIT").length,
    },
    {
      key: "DELIVERED",
      label: "Delivered",
      count: shipments.filter((s) => (s.status || "").toUpperCase() === "DELIVERED").length,
    },
    {
      key: "CANCELLED",
      label: "Cancelled",
      count: shipments.filter((s) => (s.status || "").toUpperCase() === "CANCELLED").length,
    },
  ];

  return (
    <div className="admin-page-container">
      <div className="admin-page-header">
        <div>
          <span className="eyebrow">Logistics & Delivery</span>
          <h1>Shipment Operations</h1>
          <p>Supervise active deliveries, reassign riders, reset delivery OTP lockouts, and track route progress.</p>
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
        data={filteredShipments}
        loading={loading}
        error={error}
        onRetry={refresh}
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search shipments by order, hub, destination, or rider..."
        pageSize={12}
        emptyTitle="No shipments found"
        emptyDescription="There are no active or historical deliveries matching your criteria."
        onRowClick={handleView}
      />

      {/* Shipment Detail Drawer */}
      <AdminDetailDrawer
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title={`Shipment ${String(selectedShipment?.id || "").slice(0, 8).toUpperCase()}`}
        subtitle={`Order: ${selectedShipment?.order_id || ""}`}
        badge={
          selectedShipment && (
            <span className={`admin-badge admin-badge-${String(selectedShipment.status).toLowerCase()}`}>
              {selectedShipment.status}
            </span>
          )
        }
      >
        {selectedShipment && (
          <>
            <section className="admin-detail-section">
              <h4>Dispatch Coordinates</h4>
              <dl className="admin-detail-list">
                <dt>Shipment ID</dt>
                <dd className="font-monospace">{selectedShipment.id}</dd>
                <dt>Order Reference</dt>
                <dd className="font-monospace">{selectedShipment.order_id}</dd>
                <dt>Kisan Hub</dt>
                <dd>{selectedShipment.hub_name}</dd>
                <dt>Pickup Address</dt>
                <dd>{selectedShipment.pickup_address}</dd>
                <dt>Delivery Address</dt>
                <dd>{selectedShipment.delivery_address}</dd>
                <dt>Created Timestamp</dt>
                <dd>{formatDate(selectedShipment.created_at)}</dd>
              </dl>
            </section>

            <section className="admin-detail-section">
              <h4>Assigned Courier</h4>
              <dl className="admin-detail-list">
                <dt>Rider Name</dt>
                <dd>{selectedShipment.rider_name || "Unassigned"}</dd>
                <dt>Rider ID</dt>
                <dd className="font-monospace">{selectedShipment.rider_id || "None"}</dd>
                <dt>ETA Window</dt>
                <dd>
                  {selectedShipment.eta_start
                    ? `${formatDate(selectedShipment.eta_start)} – ${formatDate(selectedShipment.eta_end)}`
                    : "Not calculated"}
                </dd>
                <dt>OTP Security</dt>
                <dd>
                  {selectedShipment.otp_locked ? (
                    <span className="text-danger fw-bold">
                      <i className="bi bi-lock-fill" /> Locked after failed attempts
                    </span>
                  ) : (
                    <span className="text-success">
                      <i className="bi bi-shield-check" /> Active & Unlocked
                    </span>
                  )}
                </dd>
              </dl>
            </section>
          </>
        )}
      </AdminDetailDrawer>

      {/* Reassign Rider Modal */}
      {activeAction === "reassign" && (
        <div className="admin-modal-root" role="dialog" aria-modal="true">
          <div className="admin-modal-backdrop" onClick={() => !actionLoading && setActiveAction(null)} />
          <div className="admin-modal-card">
            <header className="admin-modal-header">
              <div className="admin-modal-icon primary">
                <i className="bi bi-arrow-left-right" />
              </div>
              <div className="admin-modal-title-area">
                <h3>Reassign Delivery Rider</h3>
                <p>Transfer shipment to an active, approved delivery courier.</p>
              </div>
            </header>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                const reason = e.target.elements.reason.value;
                handleExecuteAction(reason);
              }}
            >
              <div className="admin-modal-reason-group">
                <label htmlFor="rider-select-dropdown">
                  Select Available Rider <span className="text-danger">*</span>
                </label>
                <select
                  id="rider-select-dropdown"
                  className="form-select mb-2"
                  value={selectedRiderId}
                  onChange={(e) => setSelectedRiderId(e.target.value)}
                  required
                >
                  <option value="">-- Choose Rider ({availableRiders.length} Available) --</option>
                  {availableRiders.map((r) => (
                    <option key={r.id} value={r.user_id}>
                      {r.display_name} ({r.email}) - {r.active_shipment_count} active
                    </option>
                  ))}
                </select>

                <label htmlFor="reassign-reason-input">
                  Audit Reason <span className="text-danger">*</span>
                </label>
                <textarea
                  id="reassign-reason-input"
                  name="reason"
                  rows={3}
                  placeholder="State reason for courier reassignment..."
                  required
                  maxLength={1000}
                />
              </div>

              {actionError && (
                <div className="admin-modal-error" role="alert">
                  <i className="bi bi-x-circle-fill" /> {actionError}
                </div>
              )}

              <footer className="admin-modal-footer">
                <button
                  type="button"
                  className="admin-btn-secondary"
                  onClick={() => setActiveAction(null)}
                  disabled={actionLoading}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="admin-btn-primary"
                  disabled={actionLoading || !selectedRiderId}
                >
                  {actionLoading ? "Reassigning..." : "Reassign Rider"}
                </button>
              </footer>
            </form>
          </div>
        </div>
      )}

      {/* Cancel Shipment Modal */}
      <AdminConfirmDialog
        isOpen={activeAction === "cancel"}
        onClose={() => setActiveAction(null)}
        onConfirm={handleExecuteAction}
        title="Cancel Shipment"
        message={`Are you sure you want to cancel shipment ${String(actionShipment?.id || "").slice(0, 8)}?`}
        confirmLabel="Cancel Shipment"
        confirmVariant="danger"
        requireReason={true}
        reasonPlaceholder="Specify why this shipment is being cancelled..."
        loading={actionLoading}
        error={actionError}
      />

      {/* Reset Delivery OTP Lockout Modal */}
      <AdminConfirmDialog
        isOpen={activeAction === "otp-reset"}
        onClose={() => setActiveAction(null)}
        onConfirm={handleExecuteAction}
        title="Reset Delivery OTP Lockout"
        message="This will generate a fresh delivery OTP and clear the security lockout."
        confirmLabel="Reset OTP"
        confirmVariant="warning"
        requireReason={true}
        reasonPlaceholder="Specify why the OTP lockout is being reset..."
        loading={actionLoading}
        error={actionError}
      />

      {/* Delete Shipment Modal */}
      <AdminConfirmDialog
        isOpen={deleteModalOpen}
        onClose={() => {
          if (!deleteLoading) {
            setDeleteModalOpen(false);
            setShipmentToDelete(null);
          }
        }}
        onConfirm={handleConfirmDelete}
        title="Permanently Delete Shipment"
        message={`Are you sure you want to permanently delete shipment ${String(shipmentToDelete?.id || "").slice(0, 8).toUpperCase()}? This will permanently delete the shipment and rider offer records from the database. (Cannot be deleted while actively in transit).`}
        confirmLabel="Delete Shipment"
        confirmVariant="danger"
        requireReason={false}
        loading={deleteLoading}
        error={deleteError}
      />
    </div>
  );
}
