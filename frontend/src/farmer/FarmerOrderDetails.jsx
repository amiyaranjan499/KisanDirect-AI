import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  listFarmerDashboardOrders,
  listFarmerFacilities,
  assignFarmerOrderStaff,
  prepareFarmerOrderPersonally,
  markFarmerOrderReadyForPickup,
  getOrderTracking,
} from "../services/api";
import "./farmer-operations.css";

const formatMoney = (value) =>
  `₹${Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;

const formatDate = (dateStr) => {
  if (!dateStr) return "—";
  try {
    return new Date(dateStr).toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return String(dateStr);
  }
};

export default function FarmerOrderDetails() {
  const [orders, setOrders] = useState([]);
  const [facilities, setFacilities] = useState([]);
  const [filter, setFilter] = useState("All");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [busyOrderId, setBusyOrderId] = useState(null);

  // Modal: Send Order to Hub
  const [assignModalOrder, setAssignModalOrder] = useState(null);
  const [selectedFacilityId, setSelectedFacilityId] = useState("");
  const [assignNotes, setAssignNotes] = useState("");
  const [assigning, setAssigning] = useState(false);

  // Drawer / Modal: Order Details & Tracking
  const [inspectOrder, setInspectOrder] = useState(null);
  const [trackingData, setTrackingData] = useState(null);
  const [loadingTracking, setLoadingTracking] = useState(false);

  const loadAll = async () => {
    try {
      setLoading(true);
      setError("");
      const [ords, facs] = await Promise.all([
        listFarmerDashboardOrders().catch(() => []),
        listFarmerFacilities().catch(() => []),
      ]);
      const nextOrders = Array.isArray(ords) ? ords : ords?.items || [];
      const nextFacs = Array.isArray(facs) ? facs : [];
      setOrders(nextOrders);
      setFacilities(nextFacs);
      if (nextFacs[0]?.id) {
        setSelectedFacilityId(nextFacs[0].id);
      }
    } catch (err) {
      setError(err.message || "Unable to load customer orders.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
  }, []);

  const farmerHasHubs = facilities.length > 0;

  // Check if an order is eligible for "Send to Hub"
  const isOrderEligibleForHub = (ord) => {
    if (!ord || !farmerHasHubs) return false;
    if (ord.hub_id || ord.hub_name) return false; // Already assigned to a hub
    const s = (ord.status || "").toUpperCase();
    if (["DELIVERED", "CANCELLED", "COMPLETED", "SHIPPED", "READY", "READY_FOR_PICKUP"].includes(s)) {
      return false;
    }
    return s === "PENDING" || s === "NEW" || s === "CONFIRMED" || s === "ACCEPTED" || s === "PROCESSING" || s === "PREPARING";
  };

  // Filter orders based on category tabs
  const filteredOrders = useMemo(() => {
    if (filter === "All") return orders;
    return orders.filter((o) => {
      const s = (o.status || "").toUpperCase();
      if (filter === "New") return s === "PENDING" || s === "NEW";
      if (filter === "Accepted") return s === "CONFIRMED" || s === "ACCEPTED";
      if (filter === "Preparing") return s === "PROCESSING" || s === "PREPARING";
      if (filter === "Ready") return s === "SHIPPED" || s === "READY" || s === "READY_FOR_PICKUP";
      if (filter === "Delivered") return s === "DELIVERED" || s === "COMPLETED";
      if (filter === "Cancelled") return s === "CANCELLED";
      return true;
    });
  }, [filter, orders]);

  // Open "Send to Hub" dialog
  const openAssignModal = (order) => {
    setAssignModalOrder(order);
    setSelectedFacilityId(facilities[0]?.id || "");
    setAssignNotes("");
    setError("");
  };

  // Confirm sending order to selected hub
  const handleConfirmAssignStaff = async (e) => {
    e.preventDefault();
    if (!assignModalOrder || !selectedFacilityId) return;

    const selectedFac = facilities.find((f) => f.id === selectedFacilityId);
    if (!selectedFac || (selectedFac.staff_count || 0) === 0) {
      setError("The selected hub has no eligible active staff assigned to prepare orders. Please assign staff to this hub first.");
      return;
    }

    setAssigning(true);
    setError("");
    setSuccess("");
    try {
      await assignFarmerOrderStaff(assignModalOrder.id, {
        facility_id: selectedFacilityId,
        notes: assignNotes.trim() || undefined,
      });
      const hubName = selectedFac?.name || "Kisan Hub";
      setSuccess(
        `Order ORD-${String(assignModalOrder.id).slice(0, 8).toUpperCase()} sent to ${hubName}! Staff assigned to this hub have been notified.`
      );
      setAssignModalOrder(null);
      await loadAll();
    } catch (err) {
      setError(err.message || "Failed to send order to hub.");
    } finally {
      setAssigning(false);
    }
  };

  // Existing workflow: Direct Preparation on Farm
  const handlePreparePersonally = async (order) => {
    setBusyOrderId(order.id);
    setError("");
    setSuccess("");
    try {
      await prepareFarmerOrderPersonally(order.id);
      setSuccess(`Order ORD-${String(order.id).slice(0, 8).toUpperCase()} accepted for preparation on-farm.`);
      await loadAll();
    } catch (err) {
      setError(err.message || "Failed to update order status.");
    } finally {
      setBusyOrderId(null);
    }
  };

  // Existing workflow: Mark Ready for Delivery Rider Pickup
  const handleReadyForPickup = async (order) => {
    setBusyOrderId(order.id);
    setError("");
    setSuccess("");
    try {
      await markFarmerOrderReadyForPickup(order.id);
      setSuccess(`Order ORD-${String(order.id).slice(0, 8).toUpperCase()} is ready! Delivery riders have been notified.`);
      await loadAll();
    } catch (err) {
      setError(err.message || "Failed to request rider pickup.");
    } finally {
      setBusyOrderId(null);
    }
  };

  // Open Details & Tracking Drawer
  const handleInspectOrder = async (order) => {
    setInspectOrder(order);
    setTrackingData(null);
    setLoadingTracking(true);
    try {
      const data = await getOrderTracking(order.id);
      setTrackingData(data);
    } catch {
      setTrackingData(null);
    } finally {
      setLoadingTracking(false);
    }
  };

  const getStatusBadge = (statusStr) => {
    const s = (statusStr || "").toUpperCase();
    if (s === "PENDING" || s === "NEW") {
      return <span className="kisan-badge kisan-badge-neutral">New</span>;
    }
    if (s === "CONFIRMED" || s === "ACCEPTED") {
      return <span className="kisan-badge kisan-badge-sage">Accepted</span>;
    }
    if (s === "PROCESSING" || s === "PREPARING") {
      return <span className="kisan-badge kisan-badge-forest">Preparing</span>;
    }
    if (s === "SHIPPED" || s === "READY" || s === "READY_FOR_PICKUP") {
      return <span className="kisan-badge kisan-badge-amber">Ready for Pickup</span>;
    }
    if (s === "DELIVERED" || s === "COMPLETED") {
      return <span className="kisan-badge kisan-badge-forest">Delivered</span>;
    }
    if (s === "CANCELLED") {
      return <span className="kisan-badge kisan-badge-neutral">Cancelled</span>;
    }
    return <span className="kisan-badge kisan-badge-neutral">{statusStr || "Pending"}</span>;
  };

  return (
    <div className="farmer-dashboard-view">
      {/* Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "18px",
          flexWrap: "wrap",
          gap: "10px",
        }}
      >
        <h1
          style={{
            fontFamily: "var(--font-display, 'Fraunces', Georgia, serif)",
            fontSize: "26px",
            color: "var(--forest, #1B6B34)",
            margin: 0,
            fontWeight: 700,
            letterSpacing: "-0.01em",
          }}
        >
          Orders
        </h1>
        <button
          type="button"
          className="kisan-btn-outline kisan-btn-sm"
          onClick={loadAll}
          title="Refresh live orders"
          style={{ borderRadius: "8px", gap: "6px" }}
        >
          <i className="bi bi-arrow-clockwise" /> Refresh
        </button>
      </div>

      {/* Notifications */}
      {error && (
        <div className="alert alert-danger alert-dismissible fade show mb-3" role="alert">
          <i className="bi bi-exclamation-triangle-fill me-2" />
          {error}
          <button type="button" className="btn-close" onClick={() => setError("")} aria-label="Close" />
        </div>
      )}
      {success && (
        <div className="alert alert-success alert-dismissible fade show mb-3" role="alert">
          <i className="bi bi-check-circle-fill me-2" />
          {success}
          <button type="button" className="btn-close" onClick={() => setSuccess("")} aria-label="Close" />
        </div>
      )}

      {/* Filter Tabs */}
      <div
        className="tabs farmer-order-tabs"
        style={{
          display: "flex",
          flexWrap: "nowrap",
          alignItems: "center",
          gap: "10px",
          overflowX: "auto",
          paddingBottom: "12px",
          marginBottom: "20px",
          borderBottom: "1.5px solid var(--sand, #E4DFD1)",
          scrollbarWidth: "none",
          msOverflowStyle: "none",
          WebkitOverflowScrolling: "touch",
        }}
      >
        {["All", "New", "Accepted", "Preparing", "Ready", "Delivered", "Cancelled"].map((tab) => {
          const isActive = filter === tab;
          return (
            <button
              key={tab}
              type="button"
              className={`tab ${isActive ? "active" : ""}`}
              onClick={() => setFilter(tab)}
              style={{
                flex: "0 0 auto",
                flexShrink: 0,
                backgroundColor: isActive ? "var(--forest, #1B6B34)" : "#FFFFFF",
                color: isActive ? "#FFFFFF" : "var(--earth, #5C5549)",
                border: isActive ? "1.5px solid var(--forest, #1B6B34)" : "1.5px solid var(--sand, #E4DFD1)",
                borderRadius: "999px",
                padding: "7px 18px",
                fontSize: "13.5px",
                fontWeight: 700,
                cursor: "pointer",
                whiteSpace: "nowrap",
                boxShadow: isActive ? "0 2px 6px rgba(27, 107, 52, 0.2)" : "none",
                transition: "all 0.15s ease",
              }}
            >
              {tab}
            </button>
          );
        })}
      </div>

      {/* Orders Table */}
      {loading ? (
        <div style={{ padding: "60px 20px", textAlign: "center" }}>
          <div className="spinner-border text-success" role="status" />
          <p style={{ marginTop: "12px", color: "var(--clay, #79705F)" }}>Loading customer orders...</p>
        </div>
      ) : (
        <div className="kisan-table-wrap">
          <table className="kisan-table">
            <thead>
              <tr>
                <th>Order</th>
                <th>Consumer</th>
                <th>Crop</th>
                <th>Qty</th>
                <th>Amount</th>
                <th>Status</th>
                <th style={{ textAlign: "right" }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredOrders.length === 0 ? (
                <tr>
                  <td colSpan="7" style={{ textAlign: "center", padding: "48px 20px" }}>
                    <div style={{ maxWidth: "420px", margin: "0 auto" }}>
                      <div
                        style={{
                          fontFamily: "var(--font-display, 'Fraunces', Georgia, serif)",
                          fontSize: "18px",
                          color: "var(--forest, #1B6B34)",
                          fontWeight: 600,
                          marginBottom: "6px",
                        }}
                      >
                        {filter === "All" ? "No Customer Orders Yet" : `No ${filter} Orders`}
                      </div>
                      <p style={{ fontSize: "13px", color: "var(--clay, #79705F)", margin: "0 0 16px" }}>
                        {filter === "All"
                          ? "When consumers place orders for your fresh crop harvest, they will appear here in real-time."
                          : `There are currently no orders with the "${filter}" status filter.`}
                      </p>
                      <Link to="/farmer/crops/new" className="kisan-btn-accent kisan-btn-sm">
                        + Add New Crop Listing
                      </Link>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredOrders.map((ord) => {
                  const s = (ord.status || "").toUpperCase();
                  const isNew = s === "PENDING" || s === "NEW";
                  const isAccepted = s === "CONFIRMED" || s === "ACCEPTED";
                  const isPreparing = s === "PROCESSING" || s === "PREPARING";
                  const isReady = s === "SHIPPED" || s === "READY" || s === "READY_FOR_PICKUP";
                  const isBusy = busyOrderId === ord.id;
                  const eligibleForHub = isOrderEligibleForHub(ord);

                  const firstItem = ord.items?.[0];
                  const totalQty =
                    ord.items?.reduce((sum, item) => sum + Number(item.quantity || 0), 0) ||
                    (firstItem?.quantity ? Number(firstItem.quantity) : 1);
                  const orderNum = String(ord.id).replace(/-/g, "").slice(0, 4).toUpperCase();
                  const cropName = firstItem?.crop_name || "Fresh Harvest Produce";

                  return (
                    <tr key={ord.id}>
                      <td
                        style={{ cursor: "pointer", color: "var(--ink, #1C1C16)" }}
                        onClick={() => handleInspectOrder(ord)}
                        title="Click to view order details"
                      >
                        <b>ORD-{orderNum}</b>
                      </td>
                      <td style={{ color: "var(--ink, #1C1C16)" }}>
                        {ord.consumer_name || "Direct Customer"}
                      </td>
                      <td style={{ color: "var(--ink, #1C1C16)" }}>{cropName}</td>
                      <td style={{ color: "var(--ink, #1C1C16)" }}>
                        {totalQty} {firstItem?.unit || "kg"}
                      </td>
                      <td style={{ color: "var(--ink, #1C1C16)", fontWeight: 500 }}>
                        {formatMoney(ord.total_amount)}
                      </td>
                      <td>{getStatusBadge(ord.status)}</td>
                      <td style={{ textAlign: "right" }}>
                        {isNew ? (
                          <div className="d-flex align-items-center justify-content-end gap-2 flex-wrap">
                            {/* Existing workflow: Accept order directly */}
                            <button
                              type="button"
                              className="btn btn-sm"
                              style={{
                                background: "var(--forest, #1B6B34)",
                                color: "#FFFFFF",
                                borderRadius: "8px",
                                padding: "6px 14px",
                                fontWeight: 600,
                                fontSize: "13px",
                                border: "none",
                                cursor: "pointer",
                              }}
                              onClick={() => handlePreparePersonally(ord)}
                              disabled={isBusy}
                              title="Accept and prepare on-farm"
                            >
                              {isBusy ? "..." : "Accept"}
                            </button>
                            {/* Optional button: Send to Hub (only when farmer has hubs & order is eligible) */}
                            {eligibleForHub && (
                              <button
                                type="button"
                                className="kisan-btn-outline kisan-btn-sm"
                                style={{
                                  borderRadius: "8px",
                                  padding: "5px 12px",
                                  fontWeight: 500,
                                  fontSize: "12px",
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: "5px",
                                }}
                                onClick={() => openAssignModal(ord)}
                                disabled={isBusy}
                                title="Send order to your Kisan Hub for packing & delivery"
                              >
                                <i className="bi bi-building" /> Send to Hub
                              </button>
                            )}
                          </div>
                        ) : ord.hub_name ? (
                          <div className="d-flex align-items-center justify-content-end gap-2">
                            <span
                              className="badge"
                              style={{
                                background: "#e8f5e9",
                                color: "#1b6b34",
                                border: "1px solid #a5d6a7",
                                fontSize: "0.75rem",
                                padding: "4px 8px",
                                fontWeight: 600,
                              }}
                              title={`Assigned to ${ord.hub_name}`}
                            >
                              <i className="bi bi-building me-1" /> {ord.hub_name}
                            </span>
                            <button
                              type="button"
                              className="kisan-btn-outline kisan-btn-sm"
                              style={{ padding: "4px 12px", fontSize: "12px", borderRadius: "8px" }}
                              onClick={() => handleInspectOrder(ord)}
                            >
                              Details
                            </button>
                          </div>
                        ) : isAccepted || isPreparing ? (
                          <div className="d-flex align-items-center justify-content-end gap-2 flex-wrap">
                            {/* Existing workflow: Mark ready for rider pickup */}
                            <button
                              type="button"
                              className="btn btn-sm"
                              style={{
                                background: "var(--forest, #1B6B34)",
                                color: "#FFFFFF",
                                borderRadius: "8px",
                                padding: "6px 14px",
                                fontWeight: 600,
                                fontSize: "13px",
                                border: "none",
                                cursor: "pointer",
                              }}
                              onClick={() => handleReadyForPickup(ord)}
                              disabled={isBusy}
                              title="Mark ready and notify delivery riders"
                            >
                              {isBusy ? "..." : "Mark Ready"}
                            </button>
                            {/* Optional button: Send to Hub (if not yet sent to hub) */}
                            {eligibleForHub && (
                              <button
                                type="button"
                                className="kisan-btn-outline kisan-btn-sm"
                                style={{
                                  borderRadius: "8px",
                                  padding: "5px 12px",
                                  fontWeight: 500,
                                  fontSize: "12px",
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: "5px",
                                }}
                                onClick={() => openAssignModal(ord)}
                                disabled={isBusy}
                                title="Send order to your Kisan Hub for packing & delivery"
                              >
                                <i className="bi bi-building" /> Send to Hub
                              </button>
                            )}
                          </div>
                        ) : isReady ? (
                          <button
                            type="button"
                            className="kisan-btn-outline kisan-btn-sm"
                            style={{ padding: "5px 14px", fontSize: "13px", borderRadius: "8px" }}
                            onClick={() => handleInspectOrder(ord)}
                          >
                            Track
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="kisan-btn-outline kisan-btn-sm"
                            style={{ padding: "5px 14px", fontSize: "13px", borderRadius: "8px" }}
                            onClick={() => handleInspectOrder(ord)}
                          >
                            Details
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* MODAL: SEND TO HUB */}
      {assignModalOrder && (
        <div className="farmer-modal-backdrop" onClick={() => setAssignModalOrder(null)}>
          <div className="farmer-modal-dialog" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "480px" }}>
            <div className="farmer-modal-header" style={{ borderBottom: "1px solid #E4DFD1", padding: "16px 20px" }}>
              <h3
                style={{
                  fontFamily: "var(--font-display, 'Fraunces', Georgia, serif)",
                  fontSize: "19px",
                  color: "var(--forest, #1B6B34)",
                  margin: 0,
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                }}
              >
                <i className="bi bi-building" /> Send to Hub
              </h3>
              <button
                type="button"
                className="btn-close"
                onClick={() => setAssignModalOrder(null)}
                aria-label="Close"
              />
            </div>
            <form onSubmit={handleConfirmAssignStaff}>
              <div className="farmer-modal-body" style={{ padding: "20px" }}>
                {/* Order Summary */}
                <div className="kisan-card kisan-card-pad mb-3" style={{ padding: "12px 16px", background: "#FAF7EF" }}>
                  <div className="d-flex justify-content-between align-items-center mb-1">
                    <strong style={{ fontSize: "0.95rem", color: "var(--ink, #1C1C16)" }}>
                      ORD-{String(assignModalOrder.id).replace(/-/g, "").slice(0, 4).toUpperCase()}
                    </strong>
                    <span className="kisan-badge kisan-badge-sage">{assignModalOrder.status || "New"}</span>
                  </div>
                  <div style={{ fontSize: "12.5px", color: "var(--clay, #79705F)" }}>
                    Customer: {assignModalOrder.consumer_name || "Direct Customer"}
                  </div>
                  <div style={{ fontSize: "12.5px", color: "var(--ink, #1C1C16)", marginTop: "4px" }}>
                    <b>Produce:</b>{" "}
                    {assignModalOrder.items?.map((it) => `${it.quantity} ${it.unit || "kg"} ${it.crop_name}`).join(", ") ||
                      "Fresh Produce"}
                  </div>
                </div>

                {/* Hub Selection showing only hubs created by this authenticated farmer with staff count */}
                <div className="farmer-form-group">
                  <label htmlFor="assign-facility-select" style={{ color: "var(--ink, #1C1C16)", fontWeight: 600, marginBottom: "6px", display: "block" }}>
                    Select Your Kisan Hub *
                  </label>
                  <select
                    id="assign-facility-select"
                    className="farmer-form-control"
                    value={selectedFacilityId}
                    onChange={(e) => setSelectedFacilityId(e.target.value)}
                    required
                  >
                    {facilities.map((fac) => (
                      <option key={fac.id} value={fac.id}>
                        {fac.name} ({fac.staff_count ?? 0} staff assigned)
                      </option>
                    ))}
                  </select>
                </div>

                {/* Warning if selected hub has 0 staff */}
                {(() => {
                  const currentFac = facilities.find((f) => f.id === selectedFacilityId);
                  if (currentFac && (currentFac.staff_count || 0) === 0) {
                    return (
                      <div className="alert alert-warning py-2 px-3 small mt-2 d-flex align-items-center gap-2" role="alert">
                        <i className="bi bi-exclamation-triangle-fill" />
                        <span>This hub has 0 assigned staff. Please assign staff to this hub before sending orders.</span>
                      </div>
                    );
                  }
                  return null;
                })()}

                {/* Optional Packing Notes */}
                <div className="farmer-form-group mt-3">
                  <label htmlFor="assign-notes" style={{ color: "var(--ink, #1C1C16)", fontWeight: 600, marginBottom: "4px", display: "block" }}>
                    Packing Instructions (Optional)
                  </label>
                  <textarea
                    id="assign-notes"
                    rows="2"
                    placeholder="e.g. Ensure produce is packed in organic crates"
                    className="farmer-form-control"
                    value={assignNotes}
                    onChange={(e) => setAssignNotes(e.target.value)}
                  />
                </div>
              </div>
              <div className="farmer-modal-footer" style={{ borderTop: "1px solid #E4DFD1", padding: "14px 20px", display: "flex", justifyContent: "flex-end", gap: "10px" }}>
                <button
                  type="button"
                  className="kisan-btn-outline kisan-btn-sm"
                  onClick={() => setAssignModalOrder(null)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-sm"
                  style={{
                    background: "var(--forest, #1B6B34)",
                    color: "#FFFFFF",
                    borderRadius: "8px",
                    padding: "8px 18px",
                    fontWeight: 600,
                    border: "none",
                  }}
                  disabled={assigning}
                >
                  {assigning ? "Sending to Hub..." : "Confirm Send to Hub"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: ORDER DETAILS & INSPECTION DRAWER */}
      {inspectOrder && (
        <div className="farmer-modal-backdrop" onClick={() => setInspectOrder(null)}>
          <div className="farmer-modal-dialog" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "520px" }}>
            <div className="farmer-modal-header" style={{ borderBottom: "1px solid #E4DFD1", padding: "16px 20px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <h3
                  style={{
                    fontFamily: "var(--font-display, 'Fraunces', Georgia, serif)",
                    fontSize: "20px",
                    color: "var(--forest, #1B6B34)",
                    margin: 0,
                  }}
                >
                  ORD-{String(inspectOrder.id).replace(/-/g, "").slice(0, 4).toUpperCase()}
                </h3>
                {getStatusBadge(inspectOrder.status)}
              </div>
              <button
                type="button"
                className="btn-close"
                onClick={() => setInspectOrder(null)}
                aria-label="Close"
              />
            </div>
            <div className="farmer-modal-body" style={{ padding: "20px" }}>
              <div style={{ fontSize: "13px", color: "var(--clay, #79705F)", marginBottom: "16px" }}>
                Placed on {formatDate(inspectOrder.order_date || inspectOrder.created_at)}
              </div>

              {/* Summary KV */}
              <div className="kisan-card kisan-card-pad" style={{ marginBottom: "16px", padding: "14px 18px" }}>
                <div className="kisan-kv">
                  <span>Consumer</span>
                  <b>{inspectOrder.consumer_name || "Direct Customer"}</b>
                </div>
                <div className="kisan-kv">
                  <span>Crop</span>
                  <b>{inspectOrder.items?.[0]?.crop_name || "Produce"}</b>
                </div>
                <div className="kisan-kv">
                  <span>Quantity</span>
                  <b>
                    {inspectOrder.items?.reduce((sum, item) => sum + Number(item.quantity || 0), 0) || 1}{" "}
                    {inspectOrder.items?.[0]?.unit || "kg"}
                  </b>
                </div>
                <div className="kisan-kv">
                  <span>Amount</span>
                  <b style={{ color: "var(--forest, #1B6B34)" }}>{formatMoney(inspectOrder.total_amount)}</b>
                </div>
                <div className="kisan-kv">
                  <span>Delivery</span>
                  <b>Kisan Direct Express Delivery (45–90 min)</b>
                </div>
              </div>

              {/* Produce line items */}
              {inspectOrder.items && inspectOrder.items.length > 0 && (
                <div style={{ marginBottom: "16px" }}>
                  <div style={{ fontSize: "12px", textTransform: "uppercase", fontWeight: 700, color: "var(--clay, #79705F)", marginBottom: "8px" }}>
                    Ordered Produce Items
                  </div>
                  <div style={{ background: "#FAF7EF", borderRadius: "10px", padding: "10px 14px", border: "1px solid #E4DFD1" }}>
                    {inspectOrder.items.map((item, idx) => (
                      <div key={idx} style={{ display: "flex", justifyContent: "space-between", fontSize: "13px", padding: "4px 0", color: "var(--ink, #1C1C16)" }}>
                        <span>{item.crop_name}</span>
                        <b>{item.quantity} {item.unit || "kg"}</b>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Status Actions inside Drawer */}
              <div style={{ marginTop: "16px" }}>
                <div style={{ fontSize: "12px", textTransform: "uppercase", fontWeight: 700, color: "var(--clay, #79705F)", marginBottom: "8px" }}>
                  Status Actions
                </div>
                <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                  {(inspectOrder.status === "PENDING" || inspectOrder.status === "NEW") && (
                    <>
                      <button
                        type="button"
                        className="btn btn-sm"
                        style={{ background: "#1B6B34", color: "#FFFFFF", borderRadius: "8px", padding: "8px 16px", fontWeight: 600, border: "none" }}
                        onClick={() => {
                          handlePreparePersonally(inspectOrder);
                          setInspectOrder(null);
                        }}
                      >
                        Accept & Prepare On Farm
                      </button>
                      {isOrderEligibleForHub(inspectOrder) && (
                        <button
                          type="button"
                          className="kisan-btn-outline kisan-btn-sm"
                          style={{ borderRadius: "8px" }}
                          onClick={() => {
                            const o = inspectOrder;
                            setInspectOrder(null);
                            openAssignModal(o);
                          }}
                        >
                          <i className="bi bi-building me-1" /> Send to Hub
                        </button>
                      )}
                    </>
                  )}
                  {(inspectOrder.status === "CONFIRMED" || inspectOrder.status === "ACCEPTED" || inspectOrder.status === "PROCESSING") && (
                    <>
                      <button
                        type="button"
                        className="btn btn-sm"
                        style={{ background: "#1B6B34", color: "#FFFFFF", borderRadius: "8px", padding: "8px 16px", fontWeight: 600, border: "none" }}
                        onClick={() => {
                          handleReadyForPickup(inspectOrder);
                          setInspectOrder(null);
                        }}
                      >
                        Mark Ready for Rider Pickup
                      </button>
                      {isOrderEligibleForHub(inspectOrder) && (
                        <button
                          type="button"
                          className="kisan-btn-outline kisan-btn-sm"
                          style={{ borderRadius: "8px" }}
                          onClick={() => {
                            const o = inspectOrder;
                            setInspectOrder(null);
                            openAssignModal(o);
                          }}
                        >
                          <i className="bi bi-building me-1" /> Send to Hub
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>

              {/* Tracking timeline if available */}
              {loadingTracking ? (
                <div className="text-center py-2 text-muted small" style={{ marginTop: "12px" }}>Loading tracking timeline...</div>
              ) : trackingData?.events?.length > 0 ? (
                <div style={{ marginTop: "14px" }}>
                  <small style={{ color: "var(--clay, #79705F)", display: "block", fontWeight: 700, marginBottom: "8px" }}>
                    FULFILLMENT TIMELINE:
                  </small>
                  <div style={{ fontSize: "12.5px" }}>
                    {trackingData.events.map((ev, i) => (
                      <div key={i} className="d-flex justify-content-between py-1 border-bottom" style={{ borderColor: "#E4DFD1" }}>
                        <span className="kisan-badge kisan-badge-sage">{ev.status}</span>
                        <span style={{ color: "var(--clay, #79705F)" }}>{formatDate(ev.occurred_at)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
            <div className="farmer-modal-footer" style={{ borderTop: "1px solid #E4DFD1", padding: "12px 20px" }}>
              <button
                type="button"
                className="kisan-btn-outline kisan-btn-sm"
                onClick={() => setInspectOrder(null)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
