import { useEffect, useMemo, useState } from "react";
import { listFarmerDashboardOrders, updateOrderStatus } from "../services/api";

const statusMap = {
  PENDING: "New",
  CONFIRMED: "Accepted",
  PROCESSING: "Preparing",
  SHIPPED: "Ready",
  DELIVERED: "Delivered",
  CANCELLED: "Cancelled",
  COMPLETED: "Completed",
};

const nextStatusMap = {
  PENDING: "CONFIRMED",
  CONFIRMED: "PROCESSING",
  PROCESSING: "SHIPPED",
  SHIPPED: "DELIVERED",
  DELIVERED: "COMPLETED",
  CANCELLED: null,
  COMPLETED: null,
};

const formatMoney = (value) => `₹${Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

export default function FarmerOrderDetails({ onBack }) {
  const [orders, setOrders] = useState([]);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("All");
  const [busyId, setBusyId] = useState(null);

  const load = async () => {
    try {
      const data = await listFarmerDashboardOrders();
      setOrders(Array.isArray(data) ? data : data?.items || []);
    } catch (requestError) {
      setError(requestError.message || "Unable to load orders.");
    }
  };

  useEffect(() => {
    load();
  }, []);

  const filteredOrders = useMemo(() => {
    if (filter === "All") return orders;
    return orders.filter((order) => statusMap[order.status] === filter);
  }, [filter, orders]);

  const updateOrder = async (order, status) => {
    try {
      setBusyId(order.id);
      await updateOrderStatus(order.id, status);
      await load();
    } catch (requestError) {
      setError(requestError.message || "Unable to update order status.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section className="detail-view farmer-orders-page">
      <div className="consumer-screen-header farmer-page-header">
        <div>
          <span className="eyebrow">Farmer workspace</span>
          <h1>Orders</h1>
        </div>
      </div>

      <div className="farmer-filter-tabs order-tabs">
        {[
          "All",
          "New",
          "Accepted",
          "Preparing",
          "Ready",
          "Delivered",
          "Cancelled",
        ].map((tab) => (
          <button key={tab} type="button" className={filter === tab ? "active" : ""} onClick={() => setFilter(tab)}>
            {tab}
          </button>
        ))}
      </div>

      {error ? (
        <div className="error">{error}</div>
      ) : !orders.length ? (
        <div className="loading">Loading orders...</div>
      ) : (
        <div className="farmer-table-wrap">
          <table className="farmer-order-table">
            <thead>
              <tr>
                <th>Order</th>
                <th>Consumer</th>
                <th>Crop</th>
                <th>Qty</th>
                <th>Amount</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredOrders.map((order) => {
                const currentStatus = statusMap[order.status] || "New";
                const nextStatus = nextStatusMap[order.status];
                const firstItem = order.items?.[0];
                const totalQty = order.items?.reduce((sum, item) => sum + Number(item.quantity || 0), 0) || 0;
                return (
                  <tr key={order.id}>
                    <td><strong>{`ORD-${String(order.id).slice(0, 6).toUpperCase()}`}</strong></td>
                    <td>{order.consumer_name || "Consumer"}</td>
                    <td>{firstItem?.crop_name || "Farm produce"}</td>
                    <td>{`${totalQty} ${firstItem?.unit || "kg"}`}</td>
                    <td>{formatMoney(order.total_amount)}</td>
                    <td>
                      <span className={`farmer-status-pill ${currentStatus === "New" ? "new" : currentStatus === "Accepted" || currentStatus === "Ready" || currentStatus === "Delivered" ? "success" : currentStatus === "Preparing" ? "warning" : "neutral"}`}>
                        {currentStatus}
                      </span>
                    </td>
                    <td>
                      {currentStatus === "New" ? (
                        <button type="button" className="farmer-small-button solid" onClick={() => updateOrder(order, "CONFIRMED")} disabled={busyId === order.id}>
                          {busyId === order.id ? "..." : "Accept"}
                        </button>
                      ) : nextStatus ? (
                        <button type="button" className="farmer-small-button secondary" onClick={() => updateOrder(order, nextStatus)} disabled={busyId === order.id}>
                          {busyId === order.id ? "..." : "Update"}
                        </button>
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

