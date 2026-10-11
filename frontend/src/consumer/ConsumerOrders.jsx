import { useEffect, useState } from "react";
import { useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { cartRequest, fulfillmentRequest, getConsumerProfile, orderRequest } from "../services/api";
import TestPaymentPanel from "../payments/Payment";
import { useI18n } from "../i18n";
import ConsumerTracking from "./ConsumerTracking";

export default function CartOrders({ onBack, consumerProfile, onNavigate }) {
  const { t } = useI18n();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { id: trackingOrderId } = useParams();
  const [searchParams] = useSearchParams();
  const ordersPage = pathname.startsWith("/orders");
  const [cart, setCart] = useState(null);
  const [orders, setOrders] = useState(null);
  const [fulfillments, setFulfillments] = useState({});
  const [tab, setTab] = useState(ordersPage || searchParams.get("tab") === "orders" ? "orders" : "cart");
  const [orderFilter, setOrderFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [drafts, setDrafts] = useState({});
  const [loadedProfile, setLoadedProfile] = useState(consumerProfile || null);

  const load = async () => {
    setLoading(true);
    try {
      const [nextCart, nextOrders] = await Promise.all([cartRequest("/cart"), orderRequest("/orders")]);
      setCart(nextCart);
      setOrders(nextOrders);

      const entries = await Promise.all((nextOrders.items || []).map(async (order) => {
        try {
          return [order.id, await fulfillmentRequest(`/orders/${order.id}/fulfillment`)];
        } catch {
          return [order.id, null];
        }
      }));

      setFulfillments(Object.fromEntries(entries));
    } catch (error) {
      setMessage(error.message || "Unable to load cart and orders.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); if (!consumerProfile) getConsumerProfile().then(setLoadedProfile).catch(() => {}); }, []);

  const updateQuantity = (item, quantity) => {
    const numericQuantity = Number(quantity);
    if (!Number.isFinite(numericQuantity) || numericQuantity < Number(item.minimum_order_quantity) || numericQuantity > Number(item.available_quantity)) {
      setMessage("Quantity must stay within available stock and minimum order quantity.");
      return;
    }

    cartRequest(`/cart/items/${item.id}`, { method: "PATCH", body: JSON.stringify({ quantity }) })
      .then(setCart)
      .catch((error) => setMessage(error.message));
  };

  const removeItem = (item) => cartRequest(`/cart/items/${item.id}`, { method: "DELETE" }).then(setCart).catch((error) => setMessage(error.message));

  const changeQuantity = (item, delta) => updateQuantity(item, Number(item.quantity) + delta);

  const chooseFulfillment = async (order, method) => {
    if (!method) return;
    const address = method === "DELIVERY" ? (drafts[order.id]?.address || order.delivery_address || loadedProfile?.address || "").trim() : null;

    if (method === "DELIVERY" && address.length < 5) {
      setMessage("Add a delivery address before choosing delivery.");
      return;
    }

    try {
      const delivery = await fulfillmentRequest(`/orders/${order.id}/fulfillment`, { method: "POST", body: JSON.stringify({ method, address }) });
      setFulfillments((previous) => ({ ...previous, [order.id]: delivery }));
      setMessage("Fulfillment selected.");
    } catch (error) {
      setMessage(error.message);
    }
  };

  const displayStatus = (order) => {
    const fulfillmentStatus = fulfillments[order.id]?.status;
    if (fulfillmentStatus === "OUT_FOR_DELIVERY") return "Out for Delivery";
    if (fulfillmentStatus === "DELIVERED" || order.status === "COMPLETED") return "Delivered";
    if (order.status === "CANCELLED") return "Cancelled";
    return "Processing";
  };

  const filteredOrders = (orders?.items || []).filter((order) => !orderFilter || displayStatus(order) === orderFilter);

  if (loading) {
    return (
      <section className="orders-view">
        <div className="loading">{t("loading")}</div>
      </section>
    );
  }

  if (trackingOrderId) {
    return (
      <section className="orders-view consumer-orders-page">
        <ConsumerTracking
          orderId={trackingOrderId}
          onBack={() => navigate("/orders")}
        />
      </section>
    );
  }

  return (
    <section className="orders-view consumer-orders-page">
      {!ordersPage && <button className="back-button" onClick={onBack}>← {t("back")}</button>}

      <div className="orders-heading consumer-screen-header">
        <div>
          <span className="eyebrow">Consumer account</span>
          <h1>{tab === "cart" ? "Your Cart" : "My Orders"}</h1>
          <p>{tab === "cart" ? "Review your items before checkout." : "Track and manage your orders."}</p>
        </div>
        {!ordersPage && <div className="tabs">
          <button className={tab === "cart" ? "active" : ""} onClick={() => setTab("cart")}>Cart</button>
          <button className={tab === "orders" ? "active" : ""} onClick={() => setTab("orders")}>Orders</button>
        </div>}
      </div>

      {message && <div className="error">{message}</div>}

      {tab === "cart" && !ordersPage ? (
        <div className="cart-layout">
          <div className="cart-items-panel">
            {cart?.items?.length ? cart.items.map((item) => (
              <article className="cart-item" key={item.id}>
                <img className="cart-item-image" src="/assets/images/image7.png" alt={item.crop_name} />
                <div className="cart-item-copy">
                  <h2>{item.crop_name}</h2>
                  <p className="muted">{item.farmer_name} · ₹{Number(item.unit_price || 0).toFixed(2)}/{item.unit}</p>
                </div>
                <div className="quantity-control"><button type="button" onClick={() => changeQuantity(item, -1)} aria-label={`Decrease ${item.crop_name}`}>−</button><span>{item.quantity}</span><button type="button" onClick={() => changeQuantity(item, 1)} aria-label={`Increase ${item.crop_name}`}>+</button></div>
                <b className="cart-item-total">₹{Number(item.subtotal || 0).toFixed(2)}</b>
                <button className="remove-cart-button" onClick={() => removeItem(item)} aria-label={`Remove ${item.crop_name}`}><i className="bi bi-trash3" /></button>
              </article>
            )) : (
              <div className="empty">
                <h2>Your cart is empty</h2>
                <p>Add an active listing from the marketplace.</p>
                <button className="secondary-button" onClick={onBack}>Continue shopping</button>
              </div>
            )}
          </div>

          <aside className="cart-summary">
            <h2>Order Summary</h2>
            <div className="cart-total-row"><span>Subtotal</span><b>₹{Number(cart?.subtotal || 0).toFixed(2)}</b></div>
            <div className="cart-total-row"><span>Total quantity</span><b>{cart?.total_quantity || "0"}</b></div>
            <div className="cart-total-row total"><span>Total</span><b>₹{Number(cart?.subtotal || 0).toFixed(2)}</b></div>
            <button onClick={() => onNavigate ? onNavigate("checkout") : navigate("/checkout")}>Proceed to checkout</button>
            <button className="text-link" onClick={onBack}>Add more items</button>
          </aside>
        </div>
      ) : (
        <div className="order-list reference-orders-list">
          {ordersPage && <div className="order-status-filters">{["", "Processing", "Out for Delivery", "Delivered", "Cancelled"].map((filter) => <button key={filter || "all"} className={orderFilter === filter ? "active" : ""} onClick={() => setOrderFilter(filter)}>{filter || "All"}</button>)}</div>}
          {orders?.items?.length ? <>{filteredOrders.length ? filteredOrders.map((order) => {
            const fulfillment = fulfillments[order.id];
            const draft = drafts[order.id] || { address: order.delivery_address || loadedProfile?.address || "" };
            const statusLabel = displayStatus(order);
            const itemNames = order.items.map((item) => item.crop_name).filter(Boolean).join(", ");
            const farmerNames = [...new Set(order.items.map((item) => item.farmer_name).filter(Boolean))].join(", ");

            return (
              <article className="order-card order-card-premium reference-order-card" key={order.id}>
                <div className="order-card-main">
                  <div className="reference-order-top"><div><h2>Order {order.id.slice(0, 8)}</h2><p className="muted">{new Date(order.created_at).toLocaleDateString()} {farmerNames ? `· ${farmerNames}` : ""}</p></div><span className={`order-status-badge status-${statusLabel.toLowerCase().replaceAll(" ", "-")}`}>{statusLabel}</span></div>
                  <div className="reference-order-bottom"><p>{itemNames || "Order items unavailable"}</p><strong>₹{Number(order.total_amount || 0).toFixed(2)}</strong></div>
                  {ordersPage && (fulfillment?.method === "DELIVERY" || order.hub_id) && (
                    <button
                      className="text-link"
                      type="button"
                      onClick={() => navigate(`/orders/${order.id}`)}
                    >
                      <i className="bi bi-truck" /> {t("tracking.trackOrder")}
                    </button>
                  )}

                  {!ordersPage && fulfillment ? (
                    <p className="fulfillment-status">{fulfillment.method}: {fulfillment.status}{fulfillment.address ? ` · ${fulfillment.address}` : fulfillment.pickup_location ? ` · Pickup: ${fulfillment.pickup_location}` : ""}</p>
                  ) : !ordersPage ? (
                    <div className="fulfillment-form">
                      <select defaultValue="" onChange={(event) => chooseFulfillment(order, event.target.value)} aria-label={`Fulfillment for order ${order.id.slice(0, 8)}`}>
                        <option value="">Choose delivery or pickup</option>
                        <option value="DELIVERY">Delivery</option>
                        {!order.hub_id && <option value="FARMER_PICKUP">Pickup</option>}
                      </select>
                    </div>
                  ) : null}
                </div>

                {!ordersPage && !fulfillment && (
                  <div className="order-address-wrap">
                    <label>Delivery address</label>
                    <input
                      value={draft.address}
                      onChange={(event) => setDrafts((previous) => ({ ...previous, [order.id]: { ...draft, address: event.target.value } }))}
                      placeholder="Address for delivery"
                    />
                  </div>
                )}
                {!ordersPage && <TestPaymentPanel order={order} onComplete={load} />}
              </article>
            );
          }) : <div className="empty">No orders match this status.</div>}</> : <div className="empty">No orders yet.</div>}
        </div>
      )}

      {!ordersPage && <div className="reference-order-links">
        <button
          className="text-link"
          onClick={() => {
            const latest = orders?.items?.[0];
            if (latest) navigate(`/orders/${latest.id}`);
          }}
          disabled={!orders?.items?.length}
        >
          <i className="bi bi-truck" /> {t("tracking.trackLatestOrder")}
        </button>
      </div>}
    </section>
  );
}
