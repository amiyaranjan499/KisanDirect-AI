import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  listFarmerDashboardOrders,
  listFarmerFacilities,
  sendFarmerOrderToHub,
  assignFarmerOrderStaff,
  prepareFarmerOrderPersonally,
  markFarmerOrderReadyForPickup,
  deliverFarmerOrderDirectly,
  deleteFarmerOrderHistory,
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

  // Automatic Send to My Hub in progress
  const [sendingHubOrderId, setSendingHubOrderId] = useState(null);

  // Modal: Deliver Order (Self-Delivery)
  const [deliverModalOrder, setDeliverModalOrder] = useState(null);
  const [deliverOtp, setDeliverOtp] = useState("");
  const [deliverNotes, setDeliverNotes] = useState("");
  const [delivering, setDelivering] = useState(false);
  const [deliverError, setDeliverError] = useState("");

  // Modal: Delete Old Order from History
  const [deleteConfirmOrder, setDeleteConfirmOrder] = useState(null);
  const [deletingOrder, setDeletingOrder] = useState(false);

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

  // Workflow A: Accept Customer Order
  const handleAcceptOrder = async (order) => {
    setBusyOrderId(order.id);
    setError("");
    setSuccess("");
    try {
      await prepareFarmerOrderPersonally(order.id);
      const orderRef = `ORD-${String(order.id).slice(0, 8).toUpperCase()}`;
      setSuccess(`Order ${orderRef} accepted! You can now prepare and pack the produce.`);
      await loadAll();
    } catch (err) {
      setError(err.message || "Failed to accept order.");
    } finally {
      setBusyOrderId(null);
    }
  };

  // Workflow B: Send to My Hub automatically
  const handleSendToMyHub = async (order) => {
    if (!farmerHasHubs) {
      setError("You do not have a Kisan Hub registered yet. Please create your hub in 'My Hub' before sending orders to a hub.");
      return;
    }

    const hubWithStaff = facilities.find((f) => (f.staff_count || 0) > 0);
    const targetFacility = hubWithStaff || facilities[0];
    if (!targetFacility || (targetFacility.staff_count || 0) === 0) {
      setError(
        `Your Kisan Hub (${targetFacility?.name || "Hub"}) has no active Hub Staff assigned. Please assign staff in 'Hub Staff' first.`
      );
      return;
    }

    setSendingHubOrderId(order.id);
    setError("");
    setSuccess("");
    try {
      await sendFarmerOrderToHub(order.id);
      const hubName = targetFacility.name || "your Kisan Hub";
      const orderRef = `ORD-${String(order.id).slice(0, 8).toUpperCase()}`;
      setSuccess(`Order ${orderRef} transferred to ${hubName}! Assigned Hub Staff have been notified to review and pack.`);
      await loadAll();
    } catch (err) {
      setError(err.message || "Failed to transfer order to your hub.");
    } finally {
      setSendingHubOrderId(null);
    }
  };

  // Farmer Self-Delivery: Direct delivery without a rider
  const handleConfirmDeliverOrder = async () => {
    if (!deliverModalOrder) return;
    setDelivering(true);
    setDeliverError("");
    try {
      await deliverFarmerOrderDirectly(deliverModalOrder.id, {
        otp: deliverOtp.trim() || undefined,
        notes: deliverNotes.trim() || undefined,
      });
      const orderRef = `ORD-${String(deliverModalOrder.id).slice(0, 8).toUpperCase()}`;
      setSuccess(`Order ${orderRef} has been successfully delivered to the customer!`);
      const deliveredId = deliverModalOrder.id;
      setDeliverModalOrder(null);
      setDeliverOtp("");
      setDeliverNotes("");
      await loadAll();
      if (inspectOrder && inspectOrder.id === deliveredId) {
        setInspectOrder((prev) => (prev ? { ...prev, status: "DELIVERED" } : null));
        try {
          const updatedTracking = await getOrderTracking(deliveredId);
          setTrackingData(updatedTracking);
        } catch {
          // ignore tracking fetch error
        }
      }
    } catch (err) {
      setDeliverError(err.message || "Failed to confirm delivery.");
    } finally {
      setDelivering(false);
    }
  };

  // Delete Old Order from Farmer History (Soft deletion / Hide from history)
  const handleRequestDeleteOrder = (ord) => {
    const s = (ord.status || "").toUpperCase();
    const isDeletable = ["DELIVERED", "COMPLETED", "CANCELLED"].includes(s);
    if (!isDeletable) {
      setError("Cannot remove active, pending, or ongoing orders from history.");
      return;
    }
    setError("");
    setDeleteConfirmOrder(ord);
  };

  const handleConfirmDeleteOrder = async () => {
    if (!deleteConfirmOrder) return;
    setDeletingOrder(true);
    setError("");
    setSuccess("");
    try {
      await deleteFarmerOrderHistory(deleteConfirmOrder.id);
      const orderRef = `ORD-${String(deleteConfirmOrder.id).slice(0, 8).toUpperCase()}`;
      setDeleteConfirmOrder(null);
      setSuccess(`Order ${orderRef} removed from your history.`);
      await loadAll();
    } catch (err) {
      setError(err.message || "Failed to remove order from history.");
    } finally {
      setDeletingOrder(false);
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

  const orderStats = useMemo(() => {
    const total = orders.length;
    const pendingAction = orders.filter((o) => {
      const s = (o.status || "").toUpperCase();
      return s === "PENDING" || s === "NEW" || s === "CONFIRMED" || s === "ACCEPTED";
    }).length;
    const inPrep = orders.filter((o) => {
      const s = (o.status || "").toUpperCase();
      return s === "PROCESSING" || s === "PREPARING" || s === "SHIPPED" || s === "READY" || s === "READY_FOR_PICKUP";
    }).length;
    const completed = orders.filter((o) => {
      const s = (o.status || "").toUpperCase();
      return s === "DELIVERED" || s === "COMPLETED";
    }).length;
    return { total, pendingAction, inPrep, completed };
  }, [orders]);

  return (
    <div className="farmer-dashboard-view farmer-orders-page">
      {/* 1. Header */}
      <div className="farmer-page-header">
        <div>
          <span className="eyebrow">CUSTOMER FULFILLMENT</span>
          <h1>My Orders &amp; Fulfillment</h1>
          <p>
            Manage incoming orders, on-farm packing, hub staff delegations, and rider delivery handoffs.
          </p>
        </div>
        <div className="farmer-header-actions">
          <button
            type="button"
            className="farmer-action-pill primary"
            onClick={loadAll}
            title="Refresh live orders"
          >
            <i className="bi bi-arrow-clockwise" /> Refresh
          </button>
        </div>
      </div>

      {/* 2. Top Summary KPI Cards */}
      <div className="kisan-stat-grid" style={{ marginBottom: "20px" }}>
        <div className="kisan-card kisan-card-pad">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: "12px", color: "var(--farmer-muted, #65766e)", fontWeight: 600 }}>Total Orders</span>
            <span style={{ color: "var(--farmer-forest, #073a26)" }}><i className="bi bi-receipt" /></span>
          </div>
          <div style={{ fontFamily: "var(--font-display, 'Fraunces', Georgia, serif)", fontSize: "28px", fontWeight: 700, color: "var(--farmer-forest, #073a26)", marginTop: "8px" }}>
            {orderStats.total}
          </div>
          <div style={{ fontSize: "11.5px", color: "var(--farmer-muted, #65766e)", marginTop: "4px" }}>All customer orders</div>
        </div>

        <div className="kisan-card kisan-card-pad">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: "12px", color: "var(--farmer-muted, #65766e)", fontWeight: 600 }}>Needs Action</span>
            <span style={{ color: "#B27300" }}><i className="bi bi-exclamation-circle-fill" /></span>
          </div>
          <div style={{ fontFamily: "var(--font-display, 'Fraunces', Georgia, serif)", fontSize: "28px", fontWeight: 700, color: "#B27300", marginTop: "8px" }}>
            {orderStats.pendingAction}
          </div>
          <div style={{ fontSize: "11.5px", color: "var(--farmer-muted, #65766e)", marginTop: "4px" }}>Awaiting acceptance/prep</div>
        </div>

        <div className="kisan-card kisan-card-pad">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: "12px", color: "var(--farmer-muted, #65766e)", fontWeight: 600 }}>In Fulfillment</span>
            <span style={{ color: "var(--farmer-forest-med, #0e5a3c)" }}><i className="bi bi-box-seam" /></span>
          </div>
          <div style={{ fontFamily: "var(--font-display, 'Fraunces', Georgia, serif)", fontSize: "28px", fontWeight: 700, color: "var(--farmer-forest-med, #0e5a3c)", marginTop: "8px" }}>
            {orderStats.inPrep}
          </div>
          <div style={{ fontSize: "11.5px", color: "var(--farmer-muted, #65766e)", marginTop: "4px" }}>Preparing or out with rider</div>
        </div>

        <div className="kisan-card kisan-card-pad">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: "12px", color: "var(--farmer-muted, #65766e)", fontWeight: 600 }}>Completed</span>
            <span style={{ color: "#2E7D32" }}><i className="bi bi-check-circle-fill" /></span>
          </div>
          <div style={{ fontFamily: "var(--font-display, 'Fraunces', Georgia, serif)", fontSize: "28px", fontWeight: 700, color: "#2E7D32", marginTop: "8px" }}>
            {orderStats.completed}
          </div>
          <div style={{ fontSize: "11.5px", color: "var(--farmer-muted, #65766e)", marginTop: "4px" }}>Delivered to doorstep</div>
        </div>
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
                  const hasHub = Boolean(ord.hub_name || ord.hub_id);
                  const isNew = (s === "PENDING" || s === "NEW") && !hasHub;
                  const isAccepted = (s === "CONFIRMED" || s === "ACCEPTED") && !hasHub;
                  const isPreparing = (s === "PROCESSING" || s === "PREPARING") && !hasHub;
                  const isReady = (s === "SHIPPED" || s === "READY" || s === "READY_FOR_PICKUP") && !hasHub;
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
                            {/* Exactly Two Buttons for incoming Farmer order request */}
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
                              onClick={() => handleAcceptOrder(ord)}
                              disabled={isBusy || sendingHubOrderId === ord.id}
                              title="Accept and prepare order on-farm"
                            >
                              {isBusy ? "Accepting..." : "Accept Order"}
                            </button>
                            <button
                              type="button"
                              className="kisan-btn-outline kisan-btn-sm"
                              style={{
                                borderRadius: "8px",
                                padding: "6px 14px",
                                fontWeight: 600,
                                fontSize: "13px",
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "6px",
                                borderColor: "var(--forest, #1B6B34)",
                                color: "var(--forest, #1B6B34)",
                                background: "#FFFFFF",
                                cursor: "pointer",
                              }}
                              onClick={() => handleSendToMyHub(ord)}
                              disabled={isBusy || sendingHubOrderId === ord.id}
                              title="Automatically transfer order to your existing Kisan Hub"
                            >
                              <i className="bi bi-building" /> {sendingHubOrderId === ord.id ? "Transferring..." : "Send to My Hub"}
                            </button>
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
                              title={`Transferred to ${ord.hub_name}`}
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
                            <button
                              type="button"
                              className="btn btn-sm btn-outline-danger ms-1"
                              style={{
                                padding: "4px 8px",
                                fontSize: "12px",
                                borderRadius: "6px",
                                lineHeight: 1,
                              }}
                              title="Remove order from history"
                              onClick={() => handleRequestDeleteOrder(ord)}
                            >
                              <i className="bi bi-x-lg" />
                            </button>
                          </div>
                        ) : isAccepted || isPreparing ? (
                          <div className="d-flex align-items-center justify-content-end gap-2 flex-wrap">
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
                              title="Send order to rider for delivery"
                            >
                              {isBusy ? "..." : "Send to Rider"}
                            </button>
                            <button
                              type="button"
                              className="btn btn-sm"
                              style={{
                                background: "#C68A3D",
                                color: "#2A1B05",
                                borderRadius: "8px",
                                padding: "6px 14px",
                                fontWeight: 600,
                                fontSize: "13px",
                                border: "none",
                                cursor: "pointer",
                              }}
                              onClick={() => {
                                setDeliverModalOrder(ord);
                                setDeliverOtp("");
                                setDeliverNotes("");
                                setDeliverError("");
                              }}
                              disabled={isBusy}
                              title="Deliver personally to customer doorstep without a rider"
                            >
                              Personal Delivery
                            </button>
                            <button
                              type="button"
                              className="kisan-btn-outline kisan-btn-sm"
                              style={{ padding: "5px 12px", fontSize: "12px", borderRadius: "8px" }}
                              onClick={() => handleInspectOrder(ord)}
                            >
                              Details
                            </button>
                            <button
                              type="button"
                              className="btn btn-sm btn-outline-danger ms-1"
                              style={{
                                padding: "4px 8px",
                                fontSize: "12px",
                                borderRadius: "6px",
                                lineHeight: 1,
                              }}
                              title="Remove order from history"
                              onClick={() => handleRequestDeleteOrder(ord)}
                            >
                              <i className="bi bi-x-lg" />
                            </button>
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
                          <div className="d-flex align-items-center justify-content-end gap-1">
                            <button
                              type="button"
                              className="kisan-btn-outline kisan-btn-sm"
                              style={{ padding: "5px 14px", fontSize: "13px", borderRadius: "8px" }}
                              onClick={() => handleInspectOrder(ord)}
                            >
                              Details
                            </button>
                            <button
                              type="button"
                              className="btn btn-sm btn-outline-danger ms-1"
                              style={{
                                padding: "5px 10px",
                                fontSize: "13px",
                                borderRadius: "8px",
                                lineHeight: 1,
                              }}
                              title="Remove order from history"
                              onClick={() => handleRequestDeleteOrder(ord)}
                            >
                              <i className="bi bi-x-lg" />
                            </button>
                          </div>
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
                  {!inspectOrder.hub_name && !inspectOrder.hub_id && (inspectOrder.status === "PENDING" || inspectOrder.status === "NEW") && (
                    <>
                      <button
                        type="button"
                        className="btn btn-sm"
                        style={{ background: "#1B6B34", color: "#FFFFFF", borderRadius: "8px", padding: "8px 16px", fontWeight: 600, border: "none" }}
                        onClick={() => {
                          handleAcceptOrder(inspectOrder);
                          setInspectOrder(null);
                        }}
                      >
                        Accept Order
                      </button>
                      <button
                        type="button"
                        className="kisan-btn-outline kisan-btn-sm"
                        style={{ borderRadius: "8px", borderColor: "var(--forest, #1B6B34)", color: "var(--forest, #1B6B34)", background: "#FFFFFF", fontWeight: 600 }}
                        onClick={() => {
                          const o = inspectOrder;
                          setInspectOrder(null);
                          handleSendToMyHub(o);
                        }}
                      >
                        <i className="bi bi-building me-1" /> Send to My Hub
                      </button>
                    </>
                  )}
                  {(inspectOrder.hub_name || inspectOrder.hub_id) && (
                    <span className="badge" style={{ background: "#e8f5e9", color: "#1b6b34", border: "1px solid #a5d6a7", padding: "8px 12px", fontSize: "13px" }}>
                      <i className="bi bi-building me-1" /> Transferred to {inspectOrder.hub_name || "Kisan Hub"}
                    </span>
                  )}
                  {!inspectOrder.hub_name && !inspectOrder.hub_id && (inspectOrder.status === "CONFIRMED" || inspectOrder.status === "ACCEPTED" || inspectOrder.status === "PROCESSING") && (
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
                        Send to Rider
                      </button>
                      <button
                        type="button"
                        className="btn btn-sm"
                        style={{
                          background: "#C68A3D",
                          color: "#2A1B05",
                          borderRadius: "8px",
                          padding: "8px 16px",
                          fontWeight: 700,
                          border: "none",
                        }}
                        onClick={() => {
                          setDeliverModalOrder(inspectOrder);
                          setDeliverOtp("");
                          setDeliverNotes("");
                          setDeliverError("");
                        }}
                      >
                        Personal Delivery
                      </button>
                    </>
                  )}

                  {/* Farmer Self-Delivery: Available when order is prepared/ready for delivery */}
                  {!["DELIVERED", "COMPLETED", "CANCELLED"].includes((inspectOrder.status || "").toUpperCase()) &&
                    ["CONFIRMED", "ACCEPTED", "PROCESSING", "SHIPPED", "READY", "READY_FOR_PICKUP"].includes(
                      (inspectOrder.status || "").toUpperCase()
                    ) && (
                      <button
                        type="button"
                        className="btn btn-sm"
                        style={{
                          background: "#C68A3D",
                          color: "#2A1B05",
                          borderRadius: "8px",
                          padding: "8px 16px",
                          fontWeight: 700,
                          border: "none",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "6px",
                        }}
                        onClick={() => {
                          setDeliverModalOrder(inspectOrder);
                          setDeliverOtp("");
                          setDeliverNotes("");
                          setDeliverError("");
                        }}
                        title="Deliver this order directly to customer without a rider"
                      >
                        <i className="bi bi-truck-flatbed" /> Deliver Order
                      </button>
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
      {/* MODAL: CONFIRM FARMER SELF-DELIVERY */}
      {deliverModalOrder && (
        <div className="farmer-modal-backdrop" onClick={() => !delivering && setDeliverModalOrder(null)}>
          <div className="farmer-modal-dialog" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "480px" }}>
            <div className="farmer-modal-header" style={{ borderBottom: "1px solid #E4DFD1", padding: "16px 20px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <div
                  style={{
                    width: "36px",
                    height: "36px",
                    borderRadius: "8px",
                    background: "var(--farmer-lime-soft, #edf8df)",
                    color: "var(--farmer-forest, #073a26)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "1.1rem",
                  }}
                >
                  <i className="bi bi-truck-flatbed" />
                </div>
                <div>
                  <h3 style={{ fontFamily: "var(--font-display, 'Fraunces', Georgia, serif)", color: "var(--farmer-forest, #073a26)", margin: 0, fontSize: "17px", fontWeight: 700 }}>
                    Confirm Farmer Self-Delivery
                  </h3>
                  <div style={{ fontSize: "12px", color: "var(--clay, #79705F)" }}>
                    Order ORD-{String(deliverModalOrder.id).slice(0, 8).toUpperCase()}
                  </div>
                </div>
              </div>
              <button
                type="button"
                className="btn-close"
                onClick={() => !delivering && setDeliverModalOrder(null)}
                aria-label="Close"
                disabled={delivering}
              />
            </div>

            <div className="farmer-modal-body" style={{ padding: "18px 20px" }}>
              {deliverError && (
                <div className="alert alert-danger py-2 px-3 mb-3" style={{ fontSize: "13px" }}>
                  <i className="bi bi-exclamation-triangle-fill me-2" />
                  {deliverError}
                </div>
              )}

              <p style={{ fontSize: "13.5px", color: "var(--ink, #1C1C16)", margin: "0 0 14px", lineHeight: 1.5 }}>
                Are you delivering this order directly to the customer without a rider? Once confirmed, this order will be marked as <strong>Delivered</strong> in the platform.
              </p>

              <div style={{ background: "#FAF7EF", border: "1px solid #E4DFD1", borderRadius: "10px", padding: "12px 14px", marginBottom: "16px" }}>
                <div style={{ fontSize: "12px", color: "var(--clay, #79705F)", marginBottom: "4px" }}>
                  Destination Address:
                </div>
                <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--ink, #1C1C16)" }}>
                  {deliverModalOrder.delivery_address || (deliverModalOrder.consumer ? `${deliverModalOrder.consumer.city || 'Direct Handover'}, PIN ${deliverModalOrder.consumer.pin_code || '—'}` : "Direct Farm Handover")}
                </div>
                {deliverModalOrder.consumer?.name && (
                  <div style={{ fontSize: "12px", color: "var(--farmer-forest, #073a26)", marginTop: "4px" }}>
                    Customer: {deliverModalOrder.consumer.name} {deliverModalOrder.consumer.phone ? `(${deliverModalOrder.consumer.phone})` : ""}
                  </div>
                )}
              </div>

              {/* Optional OTP input */}
              <div className="mb-3">
                <label htmlFor="delivery-otp" style={{ fontSize: "12.5px", fontWeight: 600, color: "var(--ink, #1C1C16)", marginBottom: "4px", display: "block" }}>
                  Consumer Delivery OTP <span style={{ fontWeight: 400, color: "var(--clay, #79705F)" }}>(if provided by customer)</span>
                </label>
                <input
                  id="delivery-otp"
                  type="text"
                  maxLength={6}
                  className="form-control"
                  placeholder="e.g. 123456"
                  value={deliverOtp}
                  onChange={(e) => setDeliverOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  style={{ borderColor: "#E4DFD1", fontSize: "13.5px", letterSpacing: "2px", fontWeight: 600 }}
                  disabled={delivering}
                />
              </div>

              {/* Optional Notes */}
              <div>
                <label htmlFor="delivery-notes" style={{ fontSize: "12.5px", fontWeight: 600, color: "var(--ink, #1C1C16)", marginBottom: "4px", display: "block" }}>
                  Delivery Notes <span style={{ fontWeight: 400, color: "var(--clay, #79705F)" }}>(optional)</span>
                </label>
                <input
                  id="delivery-notes"
                  type="text"
                  className="form-control"
                  placeholder="e.g. Delivered directly to customer at doorstep"
                  value={deliverNotes}
                  onChange={(e) => setDeliverNotes(e.target.value)}
                  style={{ borderColor: "#E4DFD1", fontSize: "13px" }}
                  disabled={delivering}
                />
              </div>
            </div>

            <div className="farmer-modal-footer" style={{ borderTop: "1px solid #E4DFD1", padding: "14px 20px", display: "flex", justifyContent: "flex-end", gap: "10px" }}>
              <button
                type="button"
                className="kisan-btn-outline kisan-btn-sm"
                onClick={() => setDeliverModalOrder(null)}
                disabled={delivering}
              >
                Cancel
              </button>
              <button
                type="button"
                className="kisan-btn-accent kisan-btn-sm"
                onClick={handleConfirmDeliverOrder}
                disabled={delivering}
              >
                {delivering ? (
                  <>
                    <span className="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true" />
                    Confirming Delivery...
                  </>
                ) : (
                  <>
                    <i className="bi bi-check2-circle me-1" /> Confirm Delivery
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: CONFIRM REMOVE OLD ORDER FROM HISTORY */}
      {deleteConfirmOrder && (
        <div className="farmer-modal-backdrop" onClick={() => !deletingOrder && setDeleteConfirmOrder(null)}>
          <div className="farmer-modal-dialog" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "460px" }}>
            <div className="farmer-modal-header" style={{ borderBottom: "1px solid #E4DFD1", padding: "16px 20px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <div
                  style={{
                    width: "36px",
                    height: "36px",
                    borderRadius: "8px",
                    background: "#FEE2E2",
                    color: "#DC2626",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "1.1rem",
                  }}
                >
                  <i className="bi bi-trash3-fill" />
                </div>
                <div>
                  <h3 style={{ fontFamily: "var(--font-display, 'Fraunces', Georgia, serif)", color: "#1C1C16", margin: 0, fontSize: "17px", fontWeight: 700 }}>
                    Remove Order from History
                  </h3>
                  <div style={{ fontSize: "12px", color: "var(--clay, #79705F)" }}>
                    Order ORD-{String(deleteConfirmOrder.id).slice(0, 8).toUpperCase()}
                  </div>
                </div>
              </div>
              <button
                type="button"
                className="btn-close"
                onClick={() => setDeleteConfirmOrder(null)}
                disabled={deletingOrder}
                aria-label="Close"
              />
            </div>

            <div className="farmer-modal-body" style={{ padding: "20px" }}>
              <p style={{ fontSize: "15px", color: "#1F2937", margin: "0 0 16px 0", lineHeight: "1.5", fontWeight: 500 }}>
                Are you sure you want to remove this order from your history?
              </p>

              <div
                style={{
                  background: "#F9FAFB",
                  border: "1px solid #E5E7EB",
                  borderRadius: "10px",
                  padding: "12px 16px",
                  fontSize: "13px",
                  display: "grid",
                  gap: "6px",
                  color: "#4B5563",
                }}
              >
                <div className="d-flex justify-content-between">
                  <span>Status:</span>
                  <span className="fw-semibold text-dark">{deleteConfirmOrder.status}</span>
                </div>
                <div className="d-flex justify-content-between">
                  <span>Total Amount:</span>
                  <span className="fw-semibold text-dark">{formatMoney(deleteConfirmOrder.total_amount)}</span>
                </div>
                <div className="d-flex justify-content-between">
                  <span>Items:</span>
                  <span className="fw-semibold text-dark">
                    {deleteConfirmOrder.items_count || (deleteConfirmOrder.items && deleteConfirmOrder.items.length) || 1} item(s)
                  </span>
                </div>
              </div>

              <div style={{ fontSize: "12px", color: "var(--clay, #79705F)", marginTop: "12px" }}>
                <i className="bi bi-info-circle me-1" /> This hides the order from your farmer order history while preserving the original platform records, consumer tracking, and payments.
              </div>
            </div>

            <div className="farmer-modal-footer" style={{ borderTop: "1px solid #E4DFD1", padding: "14px 20px", display: "flex", justifyContent: "flex-end", gap: "10px" }}>
              <button
                type="button"
                className="kisan-btn-outline kisan-btn-sm"
                onClick={() => setDeleteConfirmOrder(null)}
                disabled={deletingOrder}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-sm btn-danger"
                onClick={handleConfirmDeleteOrder}
                disabled={deletingOrder}
                style={{ borderRadius: "8px", padding: "6px 18px", fontWeight: 600 }}
              >
                {deletingOrder ? (
                  <>
                    <span className="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true" />
                    Removing...
                  </>
                ) : (
                  <>
                    <i className="bi bi-trash3 me-1" /> Remove
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
