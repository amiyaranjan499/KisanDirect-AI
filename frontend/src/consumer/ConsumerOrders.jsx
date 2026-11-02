import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { fulfillmentRequest, orderRequest } from "../services/api";
import ConsumerTracking from "./ConsumerTracking";

export default function ConsumerOrders() {
  const navigate = useNavigate();
  const { id: trackingOrderId } = useParams();

  const [orders, setOrders] = useState([]);
  const [fulfillments, setFulfillments] = useState({});
  const [selectedFilter, setSelectedFilter] = useState("All");
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");
  const [cancellingId, setCancellingId] = useState(null);

  const filters = ["All", "New", "Accepted", "Preparing", "Ready", "Delivered", "Cancelled"];

  const handleCancelOrder = async (order) => {
    const shortCode = `ORD-${order.id.slice(0, 4).toUpperCase()}`;
    const confirmed = window.confirm(
      `Are you sure you want to cancel order ${shortCode}? Any held stock will be returned to the farmer.`
    );
    if (!confirmed) return;

    try {
      setCancellingId(order.id);
      await orderRequest(`/orders/${order.id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status: "CANCELLED", reason: "Cancelled by customer" }),
      });
      await loadOrders();
    } catch (err) {
      alert(err.message || "Failed to cancel order.");
    } finally {
      setCancellingId(null);
    }
  };

  const loadOrders = async () => {
    setLoading(true);
    try {
      const res = await orderRequest("/orders?page_size=50");
      const items = res?.items || (Array.isArray(res) ? res : []);
      setOrders(items);

      // Fetch fulfillments
      const entries = await Promise.all(
        items.map(async (order) => {
          try {
            return [order.id, await fulfillmentRequest(`/orders/${order.id}/fulfillment`)];
          } catch {
            return [order.id, null];
          }
        })
      );
      setFulfillments(Object.fromEntries(entries));
      setErrorMsg("");
    } catch (err) {
      setErrorMsg(err.message || "Failed to load orders.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadOrders();
  }, []);

  const getOrderStatus = (order) => {
    const fStatus = (fulfillments[order.id]?.status || "").toUpperCase();
    const oStatus = (order.status || "").toUpperCase();
    if (oStatus === "CANCELLED") return "Cancelled";
    if (fStatus === "DELIVERED" || oStatus === "DELIVERED" || oStatus === "COMPLETED") return "Delivered";
    if (fStatus === "OUT_FOR_DELIVERY" || oStatus === "SHIPPED" || fStatus === "READY") return "Ready";
    if (oStatus === "PROCESSING" || fStatus === "PREPARING" || fStatus === "PROCESSING") return "Preparing";
    if (oStatus === "CONFIRMED" || fStatus === "ACCEPTED") return "Accepted";
    return "New";
  };

  const getStatusBadgeStyle = (status) => {
    switch (status) {
      case "Ready":
      case "Out for Delivery":
        return { background: "var(--ochre-light, #F4E2C4)", color: "#8A5A1C" };
      case "Delivered":
        return { background: "var(--ok-light, #E1EEE2)", color: "var(--ok, #3C7A4E)" };
      case "Cancelled":
        return { background: "var(--danger-light, #F6E1DC)", color: "var(--danger, #B4432F)" };
      case "Accepted":
        return { background: "rgba(34, 136, 63, 0.12)", color: "var(--forest-2, #22883F)" };
      case "Preparing":
      case "New":
      case "Processing":
      default:
        return { background: "var(--sage-light, #E3F5E4)", color: "var(--forest-2, #22883F)" };
    }
  };

  if (trackingOrderId) {
    return (
      <div className="consumer-orders-page wrap" style={{ maxWidth: "1200px", margin: "0 auto", padding: "8px 16px 48px" }}>
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => navigate("/orders")}
          style={{ marginBottom: "16px", padding: "4px 8px", color: "var(--forest, #1B6B34)", display: "flex", alignItems: "center", gap: "6px" }}
        >
          <i className="bi bi-arrow-left" /> Back to orders
        </button>
        <ConsumerTracking orderId={trackingOrderId} onBack={() => navigate("/orders")} />
      </div>
    );
  }

  const filteredOrders = orders.filter((order) => {
    if (selectedFilter === "All") return true;
    return getOrderStatus(order) === selectedFilter;
  });

  return (
    <div className="consumer-orders-page wrap" style={{ maxWidth: "1200px", margin: "0 auto", padding: "8px 16px 48px" }}>
      {/* 1. Page Header */}
      <div className="section-title" style={{ marginBottom: "16px" }}>
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
      </div>

      {/* 2. Filter Pills Tabs */}
      <div
        className="tabs consumer-order-tabs"
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
        {filters.map((f) => {
          const isActive = selectedFilter === f;
          return (
            <button
              key={f}
              type="button"
              className={`tab ${isActive ? "active" : ""}`}
              onClick={() => setSelectedFilter(f)}
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
              {f}
            </button>
          );
        })}
      </div>

      {errorMsg && (
        <div className="alert alert-warning" style={{ borderRadius: "10px", marginBottom: "16px" }}>
          {errorMsg}
        </div>
      )}

      {/* 3. Orders List */}
      {loading ? (
        <div className="loading" style={{ padding: "40px 0", textAlign: "center" }}>
          Loading your orders...
        </div>
      ) : filteredOrders.length > 0 ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          {filteredOrders.map((order) => {
            const status = getOrderStatus(order);
            const badgeStyle = getStatusBadgeStyle(status);
            const shortCode = `ORD-${order.id.slice(0, 4).toUpperCase()}`;
            const dateStr = order.created_at
              ? new Date(order.created_at).toLocaleDateString("en-IN", {
                  day: "2-digit",
                  month: "short",
                  year: "numeric",
                })
              : "19 Sep 2026";

            const farmerNames = [...new Set((order.items || []).map((i) => i.farmer_name).filter(Boolean))].join(", ");
            const itemNames = (order.items || []).map((i) => i.crop_name).filter(Boolean).join(", ") || "Fresh Crops";
            const total = Number(order.total_amount || 0).toFixed(0);

            return (
              <div
                key={order.id}
                className="card card-pad consumer-order-card"
                onClick={() => navigate(`/orders/${order.id}`)}
                style={{
                  borderRadius: "14px",
                  border: "1px solid var(--line, #E4DFD1)",
                  background: "#FFFFFF",
                  padding: "16px 20px",
                  cursor: "pointer",
                  transition: "transform 0.18s ease, box-shadow 0.18s ease, border-color 0.18s ease",
                  boxShadow: "0 2px 8px rgba(0, 0, 0, 0.03)",
                }}
              >
                {/* Top Row: Code + Farmer on left, Status Badge on right */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <span className="order-id-badge">{shortCode}</span>
                      <span style={{ fontSize: "12px", color: "var(--clay, #79705F)" }}>{dateStr}</span>
                    </div>
                    {farmerNames && (
                      <div style={{ fontSize: "12px", color: "var(--clay, #79705F)", marginTop: "4px" }}>
                        <i className="bi bi-shop" style={{ marginRight: "4px", color: "var(--ochre, #C68A3D)" }} /> {farmerNames}
                      </div>
                    )}
                  </div>

                  <span
                    className="badge"
                    style={{
                      padding: "4px 12px",
                      borderRadius: "99px",
                      fontSize: "12px",
                      fontWeight: 700,
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "5px",
                      ...badgeStyle,
                    }}
                  >
                    <span className="badge-dot" /> {status}
                  </span>
                </div>

                {/* Hairline Divider */}
                <div style={{ borderTop: "1px solid var(--line, #E4DFD1)", margin: "12px 0" }} />

                {/* Bottom Row: Item names on left, Cancel Button & Total on right */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
                  <div
                    style={{
                      fontSize: "13px",
                      color: "var(--clay, #79705F)",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      maxWidth: "55%",
                    }}
                  >
                    {itemNames}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    {(order.status === "PENDING" || order.status === "CONFIRMED" || status === "Processing") && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleCancelOrder(order);
                        }}
                        disabled={cancellingId === order.id}
                        style={{
                          background: "#FFF1F2",
                          border: "1px solid #FECDD3",
                          color: "#E11D48",
                          fontSize: "12px",
                          fontWeight: 600,
                          padding: "4px 10px",
                          borderRadius: "6px",
                          cursor: cancellingId === order.id ? "not-allowed" : "pointer",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "4px",
                          transition: "all 0.15s ease",
                        }}
                        title="Cancel this order"
                      >
                        <i className="bi bi-x-circle" />
                        <span>{cancellingId === order.id ? "Cancelling..." : "Cancel Order"}</span>
                      </button>
                    )}
                    <div style={{ fontWeight: 700, fontSize: "16px", color: "var(--forest, #1B6B34)", fontFamily: "var(--font-display, 'Fraunces', serif)" }}>
                      ₹{total}
                    </div>
                    <i className="bi bi-chevron-right" style={{ fontSize: "13px", color: "var(--clay, #79705F)" }} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* Empty State */
        <div
          className="card card-pad"
          style={{
            textAlign: "center",
            padding: "48px 20px",
            borderRadius: "14px",
            border: "1px solid var(--line, #E4DFD1)",
            background: "#FFFFFF",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div style={{ fontSize: "36px", marginBottom: "12px", color: "var(--clay, #79705F)" }}>
            <i className="bi bi-receipt" />
          </div>
          <h3 style={{ fontSize: "17px", fontWeight: 700, color: "var(--forest, #1B6B34)", fontFamily: "'Fraunces', Georgia, serif", marginBottom: "6px" }}>
            No orders found
          </h3>
          <p style={{ fontSize: "13.5px", color: "var(--clay, #79705F)", marginBottom: "18px", maxWidth: "340px", margin: "0 auto 18px" }}>
            {selectedFilter === "All"
              ? "You haven't placed any orders yet."
              : `No orders matching "${selectedFilter}".`}
          </p>
          <button
            type="button"
            className="btn btn-sm btn-primary"
            onClick={() => navigate("/marketplace")}
            style={{
              background: "var(--forest, #1B6B34)",
              color: "#FFFFFF",
              padding: "7px 20px",
              borderRadius: "8px",
              border: "none",
              fontWeight: 600,
              fontSize: "13px",
              width: "auto",
              minWidth: "140px",
              maxWidth: "200px",
              alignSelf: "center",
              margin: "0 auto",
              cursor: "pointer",
              boxShadow: "0 2px 6px rgba(27,107,52,0.15)",
            }}
          >
            Shop Fresh Crops
          </button>
        </div>
      )}
    </div>
  );
}
