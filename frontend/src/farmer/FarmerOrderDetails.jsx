import { useEffect, useMemo, useState } from "react";
import {
  fulfillmentRequest,
  listFarmerDashboardOrders,
  updateFulfillmentStatus,
  updateOrderStatus,
} from "../services/api";

const statusMap = {
  PENDING: "New",
  CONFIRMED: "Accepted",
  PROCESSING: "Preparing",
  SHIPPED: "Ready",
  DELIVERED: "Delivered",
  CANCELLED: "Cancelled",
  COMPLETED: "Completed",
};

const fulfillmentStatusMap = {
  CONFIRMED: "Preparing",
  READY: "Ready",
  OUT_FOR_DELIVERY: "Out for Delivery",
  DELIVERED: "Delivered",
  PICKED_UP: "Delivered",
  CANCELLED: "Cancelled",
};

function displayStatus(order, fulfillment) {
  if (order.status === "CANCELLED") return statusMap.CANCELLED;
  if (fulfillment?.status === "PENDING") {
    return statusMap[order.status] || "New";
  }
  if (fulfillment && fulfillmentStatusMap[fulfillment.status]) {
    return fulfillmentStatusMap[fulfillment.status];
  }
  return statusMap[order.status] || "New";
}

function nextAction(order, fulfillment) {
  if (order.status === "PENDING") {
    return { type: "order", status: "CONFIRMED", label: "Accept" };
  }
  if (order.status === "CONFIRMED") {
    if (fulfillment?.status === "PENDING") {
      return { type: "fulfillment", status: "CONFIRMED", label: "Confirm fulfillment" };
    }
    return { type: "order", status: "PROCESSING", label: "Start preparing" };
  }
  if (!fulfillment) return null;

  if (fulfillment.status === "PENDING") {
    return { type: "fulfillment", status: "CONFIRMED", label: "Confirm fulfillment" };
  }
  if (fulfillment.status === "CONFIRMED") {
    return fulfillment.method === "FARMER_PICKUP"
      ? { type: "fulfillment", status: "READY", label: "Ready for pickup" }
      : { type: "fulfillment", status: "OUT_FOR_DELIVERY", label: "Dispatch order" };
  }
  if (fulfillment.status === "READY") {
    return { type: "fulfillment", status: "PICKED_UP", label: "Mark picked up" };
  }
  if (fulfillment.status === "OUT_FOR_DELIVERY") {
    return { type: "fulfillment", status: "DELIVERED", label: "Mark delivered" };
  }
  return null;
}

const formatMoney = (value) => `₹${Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

export default function FarmerOrderDetails({ onBack }) {
  const [orders, setOrders] = useState([]);
  const [fulfillments, setFulfillments] = useState({});
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("All");
  const [busyId, setBusyId] = useState(null);

  const load = async () => {
    try {
      const data = await listFarmerDashboardOrders();
      const nextOrders = Array.isArray(data) ? data : data?.items || [];
      const fulfillmentEntries = await Promise.all(
        nextOrders.map(async (order) => {
          try {
            return [
              order.id,
              await fulfillmentRequest(`/orders/${order.id}/fulfillment`),
            ];
          } catch (requestError) {
            if (requestError.message === "Fulfillment not found") {
              return [order.id, null];
            }
            throw requestError;
          }
        }),
      );
      setOrders(nextOrders);
      setFulfillments(Object.fromEntries(fulfillmentEntries));
    } catch (requestError) {
      setError(requestError.message || "Unable to load orders.");
    }
  };

  useEffect(() => {
    load();
  }, []);

  const filteredOrders = useMemo(() => {
    if (filter === "All") return orders;
    return orders.filter(
      (order) => displayStatus(order, fulfillments[order.id]) === filter,
    );
  }, [filter, fulfillments, orders]);

  const updateStatus = async (order, action) => {
    try {
      setBusyId(order.id);
      setError("");
      if (action.type === "fulfillment") {
        await updateFulfillmentStatus(order.id, action.status);
      } else {
        await updateOrderStatus(order.id, action.status);
      }
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
          "Out for Delivery",
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
                const fulfillment = fulfillments[order.id];
                const currentStatus = displayStatus(order, fulfillment);
                const action = nextAction(order, fulfillment);
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
                      <span className={`farmer-status-pill ${currentStatus === "New" ? "new" : currentStatus === "Accepted" || currentStatus === "Ready" || currentStatus === "Out for Delivery" || currentStatus === "Delivered" ? "success" : currentStatus === "Preparing" ? "warning" : "neutral"}`}>
                        {currentStatus}
                      </span>
                    </td>
                    <td>
                      {action ? (
                        <button
                          type="button"
                          className={`farmer-small-button ${action.type === "order" && action.status === "CONFIRMED" ? "solid" : "secondary"}`}
                          onClick={() => updateStatus(order, action)}
                          disabled={busyId === order.id}
                        >
                          {busyId === order.id ? "..." : action.label}
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
