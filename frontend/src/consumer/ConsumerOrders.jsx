import { useEffect, useState } from "react";
import { cartRequest, fulfillmentRequest, orderRequest } from "../services/api";
import TestPaymentPanel from "../payments/Payment";
import { useI18n } from "../i18n";

export default function CartOrders({ onBack, consumerProfile, onNavigate }) {
  const { t } = useI18n();
  const [cart, setCart] = useState(null);
  const [orders, setOrders] = useState(null);
  const [fulfillments, setFulfillments] = useState({});
  const [tab, setTab] = useState("cart");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [drafts, setDrafts] = useState({});

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

  useEffect(() => { load(); }, []);

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

  const checkout = () => orderRequest("/orders", { method: "POST" })
    .then(() => {
      setMessage("Order created successfully.");
      load();
    })
    .catch((error) => setMessage(error.message));

  const chooseFulfillment = async (order, method) => {
    if (!method) return;
    const address = method === "DELIVERY" ? (drafts[order.id]?.address || consumerProfile?.address || "").trim() : null;

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

  if (loading) {
    return (
      <section className="orders-view">
        <div className="loading">{t("loading")}</div>
      </section>
    );
  }

  return (
    <section className="orders-view">
      <button className="back-button" onClick={onBack}>← {t("back")}</button>

      <div className="orders-heading">
        <div>
          <span className="eyebrow">Consumer account</span>
          <h1>{t("cartOrders")}</h1>
          <p>Prices are verified in real time and confirmed during checkout.</p>
        </div>
        <div className="tabs">
          <button className={tab === "cart" ? "active" : ""} onClick={() => setTab("cart")}>Cart</button>
          <button className={tab === "orders" ? "active" : ""} onClick={() => setTab("orders")}>Order history</button>
        </div>
      </div>

      {message && <div className="error">{message}</div>}

      {tab === "cart" ? (
        <div className="cart-layout">
          <div className="cart-items-panel">
            {cart?.items?.length ? cart.items.map((item) => (
              <article className="cart-item" key={item.id}>
                <div>
                  <h2>{item.crop_name}</h2>
                  <p className="muted">{item.farmer_name} · ₹{Number(item.unit_price || 0).toFixed(2)} / {item.unit} · {item.available_quantity} available</p>
                </div>
                <input type="number" min={item.minimum_order_quantity} max={item.available_quantity} step=".001" value={item.quantity} onChange={(event) => updateQuantity(item, event.target.value)} aria-label={`Quantity for ${item.crop_name}`} />
                <b>₹{Number(item.subtotal || 0).toFixed(2)}</b>
                <button onClick={() => removeItem(item)}>Remove</button>
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
            <span className="eyebrow">Order summary</span>
            <h2>₹{Number(cart?.subtotal || 0).toFixed(2)}</h2>
            <p>{cart?.total_quantity || "0"} total quantity</p>
            <button onClick={() => onNavigate ? onNavigate("checkout") : checkout()}>Proceed to checkout</button>
          </aside>
        </div>
      ) : (
        <div className="order-list">
          {orders?.items?.length ? orders.items.map((order) => {
            const fulfillment = fulfillments[order.id];
            const draft = drafts[order.id] || { address: consumerProfile?.address || "" };

            return (
              <article className="order-card order-card-premium" key={order.id}>
                <div className="order-card-main">
                  <span className="eyebrow">{order.status}</span>
                  <h2>Order {order.id.slice(0, 8)}</h2>
                  <p className="muted">{new Date(order.created_at).toLocaleString()} · {order.items.length} item(s)</p>

                  {fulfillment ? (
                    <p className="fulfillment-status">{fulfillment.method}: {fulfillment.status}{fulfillment.address ? ` · ${fulfillment.address}` : fulfillment.pickup_location ? ` · Pickup: ${fulfillment.pickup_location}` : ""}</p>
                  ) : (
                    <div className="fulfillment-form">
                      <select defaultValue="" onChange={(event) => chooseFulfillment(order, event.target.value)} aria-label={`Fulfillment for order ${order.id.slice(0, 8)}`}>
                        <option value="">Choose delivery or pickup</option>
                        <option value="DELIVERY">Delivery</option>
                        <option value="PICKUP">Pickup</option>
                      </select>
                    </div>
                  )}
                </div>

                {!fulfillment && (
                  <div className="order-address-wrap">
                    <label>Delivery address</label>
                    <input
                      value={draft.address}
                      onChange={(event) => setDrafts((previous) => ({ ...previous, [order.id]: { ...draft, address: event.target.value } }))}
                      placeholder="Address for delivery"
                    />
                  </div>
                )}
              </article>
            );
          }) : <div className="empty">No orders yet.</div>}
        </div>
      )}

      <div className="reference-order-links">
        <button className="text-link" onClick={() => onNavigate?.("tracking")}><i className="bi bi-truck" /> Track latest order</button>
      </div>
      <TestPaymentPanel />
    </section>
  );
}
