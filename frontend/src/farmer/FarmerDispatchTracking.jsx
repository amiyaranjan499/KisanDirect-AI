import { useEffect, useState, useMemo } from "react";
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

  useEffect(() => {
    let isMounted = true;
    setLoading(true);
    setError("");

    listFarmerDashboardOrders()
      .then(async (data) => {
        if (!isMounted) return;
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
        if (isMounted) {
          setFulfillments(fMap);
        }
      })
      .catch((err) => {
        if (!isMounted) return;
        setError(err.message || "Failed to load dispatch and tracking data.");
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const filteredOrders = useMemo(() => {
    return orders.filter((order) => {
      const s = (order.status || "").toUpperCase();
      if (activeTab === "PENDING") return s === "PENDING" || s === "CONFIRMED";
      if (activeTab === "ACTIVE") return s === "PROCESSING" || s === "SHIPPED";
      if (activeTab === "COMPLETED") return s === "DELIVERED" || s === "COMPLETED";
      return true;
    });
  }, [orders, activeTab]);

  return (
    <div className="farmer-dispatch-tracking-page">
      {/* Header */}
      <div className="farmer-page-header">
        <div>
          <span className="eyebrow">LOGISTICS & FULFILLMENT</span>
          <h1>Dispatch & Rider Tracking</h1>
          <p>
            Monitor order preparation, dispatch requests, rider pickups, and real-time delivery tracking.
          </p>
        </div>
        <div className="farmer-header-actions">
          <Link to="/farmer/orders" className="farmer-action-pill primary">
            <i className="bi bi-receipt" /> Manage Order Statuses
          </Link>
          <Link to="/farmer/hub-supply" className="farmer-action-pill">
            <i className="bi bi-building" /> Supply to Hub
          </Link>
        </div>
      </div>

      {/* Two Delivery Workflows Guide */}
      <div className="farmer-card">
        <div className="farmer-card-header">
          <h2>Two Direct Delivery Pathways</h2>
          <span style={{ fontSize: "0.8rem", color: "var(--farmer-muted)" }}>
            Choose the best workflow for your farm scale
          </span>
        </div>
        <div className="row g-3">
          <div className="col-lg-6">
            <div className="workflow-box" style={{ background: "var(--farmer-surface-muted)", height: "100%" }}>
              <h3>
                <span className="badge bg-success me-2" style={{ fontSize: "0.72rem" }}>Option A</span>
                Storage-Assisted Hub Delivery
              </h3>
              <p>
                Deposit your produce in advance at a nearby regional Kisan Hub. When consumers place orders, assigned hub staff immediately inspect, pack, and hand over to local riders for 45-90 min delivery.
              </p>
              <div className="workflow-steps">
                <span className="workflow-step-pill">1. Farmer Supplies Hub</span>
                <i className="bi bi-arrow-right" />
                <span className="workflow-step-pill">2. Staff Packs</span>
                <i className="bi bi-arrow-right" />
                <span className="workflow-step-pill">3. Rider Dispatched</span>
              </div>
            </div>
          </div>
          <div className="col-lg-6">
            <div className="workflow-box" style={{ background: "var(--farmer-lime-soft)", height: "100%" }}>
              <h3>
                <span className="badge bg-primary me-2" style={{ fontSize: "0.72rem" }}>Option B</span>
                Direct On-Farm Pickup
              </h3>
              <p>
                Keep produce on your own farm. When an order arrives, accept and pack it on-site. The platform dispatches a verified rider directly to your farm GPS location for consumer handover.
              </p>
              <div className="workflow-steps">
                <span className="workflow-step-pill">1. Accept on Farm</span>
                <i className="bi bi-arrow-right" />
                <span className="workflow-step-pill">2. Pack Order</span>
                <i className="bi bi-arrow-right" />
                <span className="workflow-step-pill">3. Rider Arrives</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Real-time Order Tracking Table */}
      <div className="farmer-card">
        <div className="farmer-card-header">
          <h2>Active Deliveries & Shipments ({filteredOrders.length})</h2>
          <div className="btn-group" role="group" aria-label="Filter orders">
            {[
              { key: "ALL", label: "All Orders" },
              { key: "PENDING", label: "Pending Acceptance" },
              { key: "ACTIVE", label: "In Preparation & Transit" },
              { key: "COMPLETED", label: "Completed" },
            ].map((tab) => (
              <button
                key={tab.key}
                type="button"
                className={`btn btn-sm ${activeTab === tab.key ? "btn-success" : "btn-outline-secondary"}`}
                onClick={() => setActiveTab(tab.key)}
                style={{ fontSize: "0.78rem" }}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div style={{ padding: "40px", textAlign: "center", color: "var(--farmer-muted)" }}>
            Loading live dispatch telemetry...
          </div>
        ) : error ? (
          <div className="alert alert-warning" role="alert">{error}</div>
        ) : filteredOrders.length === 0 ? (
          <div className="farmer-empty-state">
            <i className="bi bi-truck-flatbed" />
            <h3>No Shipments in this Category</h3>
            <p>
              Orders requiring preparation or active delivery will appear here with live tracking status.
            </p>
          </div>
        ) : (
          <div className="farmer-table-responsive">
            <table className="farmer-table">
              <thead>
                <tr>
                  <th>Order Reference</th>
                  <th>Placed On</th>
                  <th>Destination</th>
                  <th>Fulfillment Method</th>
                  <th>Status</th>
                  <th>Amount</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredOrders.map((order) => {
                  const fulfillment = fulfillments[order.id];
                  const isHubAssisted = !!order.hub_id;
                  const statusNorm = (order.status || "").toUpperCase();

                  let badgeClass = "neutral";
                  if (statusNorm === "PENDING") badgeClass = "warning";
                  else if (statusNorm === "CONFIRMED" || statusNorm === "PROCESSING") badgeClass = "info";
                  else if (statusNorm === "SHIPPED") badgeClass = "warning";
                  else if (statusNorm === "DELIVERED" || statusNorm === "COMPLETED") badgeClass = "success";
                  else if (statusNorm === "CANCELLED") badgeClass = "danger";

                  return (
                    <tr key={order.id}>
                      <td>
                        <strong>ORD-{String(order.id).slice(0, 8).toUpperCase()}</strong>
                        <div style={{ fontSize: "0.75rem", color: "var(--farmer-muted)" }}>
                          {order.items?.length || 1} crop item(s)
                        </div>
                      </td>
                      <td style={{ whiteSpace: "nowrap" }}>{formatDate(order.order_date)}</td>
                      <td>
                        {order.delivery_address ? (
                          <span title={order.delivery_address}>
                            {order.delivery_address.slice(0, 32)}...
                          </span>
                        ) : (
                          <span className="text-muted">Direct Farm Pickup</span>
                        )}
                      </td>
                      <td>
                        <span className="farmer-badge neutral">
                          <i className={`bi ${isHubAssisted ? "bi-building" : "bi-geo-alt"}`} />{" "}
                          {isHubAssisted ? "Hub Assisted" : "Direct Farm"}
                        </span>
                      </td>
                      <td>
                        <span className={`farmer-badge ${badgeClass}`}>
                          {statusNorm}
                        </span>
                        {fulfillment?.tracking_reference && (
                          <div style={{ fontSize: "0.7rem", color: "var(--farmer-muted)", marginTop: "2px" }}>
                            Ref: {fulfillment.tracking_reference}
                          </div>
                        )}
                      </td>
                      <td>
                        <strong>{formatMoney(order.total_amount)}</strong>
                      </td>
                      <td>
                        <Link
                          to="/farmer/orders"
                          className="btn btn-sm btn-outline-success"
                          style={{ fontSize: "0.78rem", padding: "4px 8px" }}
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

