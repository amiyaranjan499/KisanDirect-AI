import { useEffect, useState, useMemo, useCallback } from "react";
import { Link } from "react-router-dom";
import { listFarmerDashboardOrders, fulfillmentRequest } from "../services/api";
import "./farmer-operations.css";

const formatMoney = (val) =>
  `₹${Number(val || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;

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

export default function FarmerDispatchTracking() {
  const [orders, setOrders] = useState([]);
  const [fulfillments, setFulfillments] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState("ALL"); // ALL, PENDING, ACTIVE, COMPLETED
  const [searchQuery, setSearchQuery] = useState("");

  const loadData = useCallback(() => {
    setLoading(true);
    setError("");

    listFarmerDashboardOrders()
      .then(async (data) => {
        const items = Array.isArray(data) ? data : data?.items || [];
        setOrders(items);

        // Fetch fulfillment records for active orders
        const fMap = {};
        await Promise.all(
          items.map(async (order) => {
            try {
              const f = await fulfillmentRequest(`/orders/${order.id}/fulfillment`);
              fMap[order.id] = f;
            } catch {
              // Not yet fulfilled
            }
          })
        );
        setFulfillments(fMap);
      })
      .catch((err) => {
        setError(err.message || "Failed to load dispatch and tracking data.");
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const metrics = useMemo(() => {
    let pending = 0;
    let inTransit = 0;
    let completed = 0;

    orders.forEach((order) => {
      const s = (order.status || "").toUpperCase();
      if (s === "PENDING" || s === "CONFIRMED") pending++;
      else if (s === "PROCESSING" || s === "SHIPPED") inTransit++;
      else if (s === "DELIVERED" || s === "COMPLETED") completed++;
    });

    return {
      total: orders.length,
      pending,
      inTransit,
      completed,
    };
  }, [orders]);

  const filteredOrders = useMemo(() => {
    return orders.filter((order) => {
      const s = (order.status || "").toUpperCase();
      if (activeTab === "PENDING" && s !== "PENDING" && s !== "CONFIRMED") return false;
      if (activeTab === "ACTIVE" && s !== "PROCESSING" && s !== "SHIPPED") return false;
      if (activeTab === "COMPLETED" && s !== "DELIVERED" && s !== "COMPLETED") return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const ordId = String(order.id || "").toLowerCase();
        const address = String(order.delivery_address || "").toLowerCase();
        return ordId.includes(q) || address.includes(q);
      }
      return true;
    });
  }, [orders, activeTab, searchQuery]);

  return (
    <div className="farmer-dispatch-tracking-page">
      {/* 1. Header */}
      <div className="farmer-page-header">
        <div>
          <span className="eyebrow">LOGISTICS & FULFILLMENT</span>
          <h1>Dispatch & Rider Tracking</h1>
        </div>
        <div className="farmer-header-actions">
          <button
            type="button"
            className="farmer-action-pill"
            onClick={loadData}
            title="Refresh live dispatch records"
          >
            <i className="bi bi-arrow-clockwise" /> Refresh
          </button>
          <Link to="/farmer/orders" className="farmer-action-pill primary">
            <i className="bi bi-receipt" /> Manage Order Statuses
          </Link>
          <Link to="/farmer/hub-supply" className="farmer-action-pill">
            <i className="bi bi-building" /> Supply to Hub
          </Link>
        </div>
      </div>

      {/* 2. Top KPI Metric Summary Cards */}
      <div className="kisan-stat-grid" style={{ marginBottom: "20px" }}>
        <div className="kisan-card kisan-card-pad">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: "12px", color: "var(--farmer-muted, #65766e)", fontWeight: 600 }}>
              Total Shipments
            </span>
            <span style={{ color: "var(--farmer-forest, #073a26)" }}>
              <i className="bi bi-boxes" />
            </span>
          </div>
          <div
            style={{
              fontFamily: "var(--font-display, 'Fraunces', Georgia, serif)",
              fontSize: "28px",
              fontWeight: 700,
              color: "var(--farmer-forest, #073a26)",
              marginTop: "8px",
            }}
          >
            {metrics.total}
          </div>
          <div style={{ fontSize: "11.5px", color: "var(--farmer-muted, #65766e)", marginTop: "4px" }}>
            All customer dispatches
          </div>
        </div>

        <div className="kisan-card kisan-card-pad">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: "12px", color: "var(--farmer-muted, #65766e)", fontWeight: 600 }}>
              Pending Action
            </span>
            <span style={{ color: "#B27300" }}>
              <i className="bi bi-clock-history" />
            </span>
          </div>
          <div
            style={{
              fontFamily: "var(--font-display, 'Fraunces', Georgia, serif)",
              fontSize: "28px",
              fontWeight: 700,
              color: "#B27300",
              marginTop: "8px",
            }}
          >
            {metrics.pending}
          </div>
          <div style={{ fontSize: "11.5px", color: "var(--farmer-muted, #65766e)", marginTop: "4px" }}>
            Awaiting acceptance / pack
          </div>
        </div>

        <div className="kisan-card kisan-card-pad">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: "12px", color: "var(--farmer-muted, #65766e)", fontWeight: 600 }}>
              In Transit
            </span>
            <span style={{ color: "var(--farmer-forest, #073a26)" }}>
              <i className="bi bi-bicycle" />
            </span>
          </div>
          <div
            style={{
              fontFamily: "var(--font-display, 'Fraunces', Georgia, serif)",
              fontSize: "28px",
              fontWeight: 700,
              color: "var(--farmer-forest, #073a26)",
              marginTop: "8px",
            }}
          >
            {metrics.inTransit}
          </div>
          <div style={{ fontSize: "11.5px", color: "var(--farmer-muted, #65766e)", marginTop: "4px" }}>
            Packed or out with rider
          </div>
        </div>

        <div className="kisan-card kisan-card-pad">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: "12px", color: "var(--farmer-muted, #65766e)", fontWeight: 600 }}>
              Delivered
            </span>
            <span style={{ color: "#2E7D32" }}>
              <i className="bi bi-check2-circle" />
            </span>
          </div>
          <div
            style={{
              fontFamily: "var(--font-display, 'Fraunces', Georgia, serif)",
              fontSize: "28px",
              fontWeight: 700,
              color: "#2E7D32",
              marginTop: "8px",
            }}
          >
            {metrics.completed}
          </div>
          <div style={{ fontSize: "11.5px", color: "var(--farmer-muted, #65766e)", marginTop: "4px" }}>
            Successful doorsteps
          </div>
        </div>
      </div>

      {/* 3. Live Telemetry Status Banner */}
      <div
        style={{
          background: "linear-gradient(135deg, rgba(7, 58, 38, 0.04) 0%, rgba(200, 245, 175, 0.22) 100%)",
          border: "1px solid rgba(16, 185, 129, 0.22)",
          borderRadius: "12px",
          padding: "12px 18px",
          marginBottom: "20px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: "10px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <span
            style={{
              display: "inline-block",
              width: "10px",
              height: "10px",
              borderRadius: "50%",
              background: "#10b981",
              boxShadow: "0 0 0 3px rgba(16, 185, 129, 0.25)",
            }}
          />
          <span style={{ fontSize: "0.85rem", fontWeight: 700, color: "var(--farmer-forest, #073a26)" }}>
            Live Dispatch Telemetry Connected
          </span>
          <span style={{ fontSize: "0.8rem", color: "var(--farmer-muted, #65766e)" }}>
            · Direct farm pickups & regional Kisan Hub fast fulfillment (45–90 min delivery)
          </span>
        </div>
        <div style={{ fontSize: "0.8rem", color: "var(--farmer-forest, #073a26)", fontWeight: 600 }}>
          <i className="bi bi-shield-check me-1" /> GPS Verified Handover
        </div>
      </div>

      {/* 4. Active Deliveries & Shipments Card */}
      <div className="kisan-card kisan-card-pad" style={{ marginBottom: "24px" }}>
        {/* Card Header with Title, Search & Filter Controls */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: "14px",
            marginBottom: "16px",
          }}
        >
          <div>
            <h2
              style={{
                fontFamily: "var(--font-display, 'Fraunces', Georgia, serif)",
                fontSize: "1.35rem",
                fontWeight: 700,
                color: "var(--farmer-forest, #073a26)",
                margin: 0,
              }}
            >
              Active Deliveries & Shipments ({filteredOrders.length})
            </h2>
            <div style={{ fontSize: "0.8rem", color: "var(--farmer-muted, #65766e)", marginTop: "2px" }}>
              Track shipment progress from farmer handover to doorstep delivery
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
            {/* Search Input */}
            <div className="input-group input-group-sm" style={{ width: "240px" }}>
              <span className="input-group-text bg-white" style={{ borderColor: "#E4DFD1" }}>
                <i className="bi bi-search text-muted" />
              </span>
              <input
                type="text"
                className="form-control"
                placeholder="Search order or address..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{ borderColor: "#E4DFD1", fontSize: "0.8rem" }}
              />
              {searchQuery && (
                <button
                  type="button"
                  className="btn btn-outline-secondary"
                  onClick={() => setSearchQuery("")}
                  title="Clear search"
                >
                  <i className="bi bi-x" />
                </button>
              )}
            </div>

            {/* Filter Pill Tabs */}
            <div style={{ display: "flex", gap: "6px", overflowX: "auto" }}>
              {[
                { key: "ALL", label: `All (${metrics.total})` },
                { key: "PENDING", label: `Pending (${metrics.pending})` },
                { key: "ACTIVE", label: `In Transit (${metrics.inTransit})` },
                { key: "COMPLETED", label: `Completed (${metrics.completed})` },
              ].map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  className={`farmer-filter-tab ${activeTab === tab.key ? "active" : ""}`}
                  onClick={() => setActiveTab(tab.key)}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="kisan-hairline" style={{ marginBottom: "16px" }} />

        {/* Content State: Loading, Error, Empty, or Table */}
        {loading ? (
          <div style={{ padding: "50px 20px", textAlign: "center", color: "var(--farmer-muted, #65766e)" }}>
            <div className="spinner-border text-success" role="status" style={{ width: "2rem", height: "2rem" }} />
            <div style={{ marginTop: "12px", fontSize: "0.88rem", fontWeight: 500 }}>
              Syncing live dispatch records & telemetry...
            </div>
          </div>
        ) : error ? (
          <div className="alert alert-warning d-flex align-items-center justify-content-between" role="alert">
            <div>
              <i className="bi bi-exclamation-triangle-fill me-2" />
              {error}
            </div>
            <button type="button" className="btn btn-sm btn-outline-dark" onClick={loadData}>
              Retry
            </button>
          </div>
        ) : filteredOrders.length === 0 ? (
          <div style={{ padding: "48px 20px", textAlign: "center" }}>
            <div
              style={{
                width: "68px",
                height: "68px",
                borderRadius: "50%",
                background: "var(--farmer-lime-soft, #edf8df)",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                color: "var(--farmer-forest, #073a26)",
                fontSize: "1.85rem",
                marginBottom: "16px",
              }}
            >
              <i className="bi bi-truck" />
            </div>
            <h3
              style={{
                fontFamily: "var(--font-display, 'Fraunces', Georgia, serif)",
                fontSize: "1.15rem",
                fontWeight: 700,
                color: "var(--farmer-forest, #073a26)",
                margin: "0 0 6px",
              }}
            >
              {searchQuery ? "No Matching Shipments Found" : "No Shipments in this Category"}
            </h3>
            <p
              style={{
                fontSize: "0.85rem",
                color: "var(--farmer-muted, #65766e)",
                maxWidth: "460px",
                margin: "0 auto 20px",
                lineHeight: 1.5,
              }}
            >
              {searchQuery
                ? `No orders matching "${searchQuery}". Clear your search query or select another filter tab.`
                : "Orders requiring packaging, dispatch requests, or active delivery will appear here with live tracking telemetry."}
            </p>
            <div style={{ display: "inline-flex", gap: "10px" }}>
              <Link to="/farmer/orders" className="kisan-btn-accent kisan-btn-sm">
                <i className="bi bi-receipt me-1" /> View All Orders
              </Link>
              <Link to="/farmer/hub-supply" className="kisan-btn-outline kisan-btn-sm">
                <i className="bi bi-building me-1" /> Supply to Hub
              </Link>
            </div>
          </div>
        ) : (
          <div className="kisan-table-wrap">
            <table className="kisan-table">
              <thead>
                <tr>
                  <th>Order Reference</th>
                  <th>Placed On</th>
                  <th>Destination</th>
                  <th>Fulfillment Method</th>
                  <th>Status</th>
                  <th>Amount</th>
                  <th style={{ textAlign: "right" }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredOrders.map((order) => {
                  const fulfillment = fulfillments[order.id];
                  const isHubAssisted = !!order.hub_id;
                  const statusNorm = (order.status || "").toUpperCase();

                  let badgeColor = "#5C5549";
                  let badgeBg = "#FAF7EF";
                  if (statusNorm === "PENDING") {
                    badgeColor = "#B27300";
                    badgeBg = "#FFF8E6";
                  } else if (statusNorm === "CONFIRMED" || statusNorm === "PROCESSING") {
                    badgeColor = "#0284C7";
                    badgeBg = "#E0F2FE";
                  } else if (statusNorm === "SHIPPED") {
                    badgeColor = "#D97706";
                    badgeBg = "#FEF3C7";
                  } else if (statusNorm === "DELIVERED" || statusNorm === "COMPLETED") {
                    badgeColor = "#16A34A";
                    badgeBg = "#DCFCE7";
                  } else if (statusNorm === "CANCELLED") {
                    badgeColor = "#DC2626";
                    badgeBg = "#FEE2E2";
                  }

                  return (
                    <tr key={order.id}>
                      <td>
                        <strong style={{ color: "var(--farmer-forest, #073a26)" }}>
                          ORD-{String(order.id).slice(0, 8).toUpperCase()}
                        </strong>
                        <div style={{ fontSize: "0.74rem", color: "var(--farmer-muted, #65766e)" }}>
                          {order.items?.length || 1} crop item(s)
                        </div>
                      </td>
                      <td style={{ whiteSpace: "nowrap" }}>{formatDate(order.order_date)}</td>
                      <td>
                        {order.delivery_address ? (
                          <span title={order.delivery_address} style={{ fontWeight: 500 }}>
                            {order.delivery_address.slice(0, 36)}
                            {order.delivery_address.length > 36 ? "..." : ""}
                          </span>
                        ) : (
                          <span className="text-muted">Direct Farm Pickup</span>
                        )}
                      </td>
                      <td>
                        <span
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "5px",
                            padding: "3px 9px",
                            borderRadius: "99px",
                            fontSize: "0.75rem",
                            fontWeight: 600,
                            background: isHubAssisted ? "rgba(16, 185, 129, 0.12)" : "rgba(198, 138, 61, 0.12)",
                            color: isHubAssisted ? "var(--farmer-forest, #073a26)" : "#8F5E16",
                          }}
                        >
                          <i className={`bi ${isHubAssisted ? "bi-building" : "bi-geo-alt"}`} />
                          {isHubAssisted ? "Hub Assisted" : "Direct Farm"}
                        </span>
                      </td>
                      <td>
                        <span
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "5px",
                            padding: "3px 9px",
                            borderRadius: "99px",
                            fontSize: "0.74rem",
                            fontWeight: 700,
                            background: badgeBg,
                            color: badgeColor,
                          }}
                        >
                          {statusNorm}
                        </span>
                        {fulfillment?.tracking_reference && (
                          <div style={{ fontSize: "0.7rem", color: "var(--farmer-muted, #65766e)", marginTop: "2px" }}>
                            Ref: {fulfillment.tracking_reference}
                          </div>
                        )}
                      </td>
                      <td>
                        <strong style={{ color: "var(--farmer-forest, #073a26)" }}>
                          {formatMoney(order.total_amount)}
                        </strong>
                      </td>
                      <td style={{ textAlign: "right" }}>
                        <Link
                          to="/farmer/orders"
                          className="btn btn-sm btn-outline-success"
                          style={{
                            fontSize: "0.78rem",
                            padding: "4px 10px",
                            fontWeight: 600,
                            borderRadius: "6px",
                          }}
                        >
                          View Order <i className="bi bi-chevron-right" />
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
