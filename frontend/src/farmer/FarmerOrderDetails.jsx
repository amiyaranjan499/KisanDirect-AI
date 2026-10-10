import { useEffect, useMemo, useState } from "react";
import {
  createFarmerStockDelivery,
  fulfillmentRequest,
  listFarmerHubOptions,
  listFarmerDashboardOrders,
  listFarmerStockDeliveries,
  listMyFarmerListings,
  updateFulfillmentStatus,
  updateOrderStatus,
} from "../services/api";
import { useI18n } from "../i18n";

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
  const { t } = useI18n();
  const [orders, setOrders] = useState([]);
  const [fulfillments, setFulfillments] = useState({});
  const [listings, setListings] = useState([]);
  const [hubs, setHubs] = useState([]);
  const [stockDeliveries, setStockDeliveries] = useState([]);
  const [selectedListing, setSelectedListing] = useState("");
  const [selectedHub, setSelectedHub] = useState("");
  const [deliveryQuantity, setDeliveryQuantity] = useState("");
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("All");
  const [busyId, setBusyId] = useState(null);
  const [deliveryBusy, setDeliveryBusy] = useState(false);
  const [ordersLoaded, setOrdersLoaded] = useState(false);

  const load = async () => {
    try {
      const [data, farmerListings, hubOptions, deliveries] = await Promise.all([
        listFarmerDashboardOrders(),
        listMyFarmerListings(),
        listFarmerHubOptions(),
        listFarmerStockDeliveries(),
      ]);
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
      const availableListings = Array.isArray(farmerListings)
        ? farmerListings.filter((listing) => listing.availability_status === "AVAILABLE")
        : [];
      setListings(availableListings);
      setHubs(Array.isArray(hubOptions) ? hubOptions : []);
      setStockDeliveries(Array.isArray(deliveries) ? deliveries : []);
      setSelectedListing((current) => (
        availableListings.some((listing) => listing.id === current)
          ? current
          : availableListings[0]?.id || ""
      ));
      setSelectedHub((current) => (
        hubOptions?.some((hub) => hub.id === current)
          ? current
          : hubOptions?.[0]?.id || ""
      ));
    } catch (requestError) {
      setError(requestError.message || "Unable to load orders.");
    } finally {
      setOrdersLoaded(true);
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

  const submitStockDelivery = async (event) => {
    event.preventDefault();
    try {
      setDeliveryBusy(true);
      setError("");
      await createFarmerStockDelivery({
        listing_id: selectedListing,
        hub_id: selectedHub,
        quantity: deliveryQuantity,
      });
      setDeliveryQuantity("");
      await load();
    } catch (requestError) {
      setError(requestError.message || t("hubOperations.farmer.submitError"));
    } finally {
      setDeliveryBusy(false);
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

      <section className="farmer-stock-delivery">
        <div className="consumer-screen-header">
          <span className="eyebrow">{t("hubOperations.farmer.sectionEyebrow")}</span>
          <h2>{t("hubOperations.farmer.title")}</h2>
          <p>{t("hubOperations.farmer.description")}</p>
        </div>
        {!ordersLoaded ? (
          <div className="loading">{t("hubOperations.farmer.loadingSupply")}</div>
        ) : !listings.length || !hubs.length ? (
          <div className="empty">
            <p>{!listings.length ? t("hubOperations.farmer.noListings") : t("hubOperations.farmer.noHubs")}</p>
          </div>
        ) : (
          <form className="row g-2 align-items-end mb-3" onSubmit={submitStockDelivery}>
            <div className="col-12 col-md-4">
              <label className="form-label" htmlFor="hub-stock-listing">{t("hubOperations.farmer.listing")}</label>
              <select id="hub-stock-listing" className="form-select" value={selectedListing} onChange={(event) => setSelectedListing(event.target.value)} required>
                {listings.map((listing) => (
                  <option key={listing.id} value={listing.id}>{listing.crop_name} · {listing.quantity} {listing.unit}</option>
                ))}
              </select>
            </div>
            <div className="col-12 col-md-4">
              <label className="form-label" htmlFor="hub-stock-hub">{t("hubOperations.farmer.hub")}</label>
              <select id="hub-stock-hub" className="form-select" value={selectedHub} onChange={(event) => setSelectedHub(event.target.value)} required>
                {hubs.map((hub) => <option key={hub.id} value={hub.id}>{hub.name}</option>)}
              </select>
            </div>
            <div className="col-8 col-md-2">
              <label className="form-label" htmlFor="hub-stock-quantity">{t("hubOperations.farmer.quantity")}</label>
              <input id="hub-stock-quantity" className="form-control" type="number" min="0.001" step="0.001" value={deliveryQuantity} onChange={(event) => setDeliveryQuantity(event.target.value)} required />
            </div>
            <div className="col-4 col-md-2">
              <button className="farmer-small-button solid w-100" type="submit" disabled={deliveryBusy || !selectedListing || !selectedHub}>
                {deliveryBusy ? t("hubOperations.farmer.submitting") : t("hubOperations.farmer.submit")}
              </button>
            </div>
          </form>
        )}
        <div className="farmer-table-wrap">
          <table className="farmer-order-table">
            <thead>
              <tr>
                <th>{t("hubOperations.farmer.crop")}</th>
                <th>{t("hubOperations.farmer.hub")}</th>
                <th>{t("hubOperations.farmer.quantity")}</th>
                <th>{t("hubOperations.farmer.receiptStatus")}</th>
              </tr>
            </thead>
            <tbody>
              {stockDeliveries.map((delivery) => (
                <tr key={delivery.id}>
                  <td>{delivery.crop_name}</td>
                  <td>{delivery.hub_name}</td>
                  <td>{delivery.quantity} {delivery.unit}</td>
                  <td>{delivery.status === "RECEIVED" ? t("hubOperations.farmer.received") : t("hubOperations.farmer.pending")}</td>
                </tr>
              ))}
              {!stockDeliveries.length && (
                <tr><td colSpan="4">{t("hubOperations.farmer.noDeliveries")}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

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
      ) : !ordersLoaded ? (
        <div className="loading">{t("hubOperations.farmer.loadingOrders")}</div>
      ) : !orders.length ? (
        <div className="empty"><p>{t("hubOperations.farmer.noOrders")}</p></div>
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
                    <td>
                      <strong>{`ORD-${String(order.id).slice(0, 6).toUpperCase()}`}</strong>
                      {order.hub_name && <div className="muted">{t("hubOperations.farmer.fulfilledFrom")} {order.hub_name}</div>}
                    </td>
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
