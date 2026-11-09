import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { cartRequest } from "../services/api";
import { resolveCropHeroImage } from "./ConsumerProductCard";
import "./consumer-cart.css";

export default function ConsumerCart() {
  const navigate = useNavigate();
  const [cart, setCart] = useState(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");
  const [toastMsg, setToastMsg] = useState("");

  const loadCart = () => {
    setLoading(true);
    cartRequest("/cart")
      .then((data) => {
        setCart(data);
        setErrorMsg("");
      })
      .catch((err) => {
        setErrorMsg(err.message || "Failed to load cart.");
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadCart();
  }, []);

  const showToast = (msg) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(""), 2500);
  };

  const handleUpdateQty = (item, newQty) => {
    if (newQty < 1) {
      handleRemoveItem(item);
      return;
    }
    const maxQty = Number(item.available_quantity) || 999;
    if (newQty > maxQty) {
      showToast(`Only ${maxQty} ${item.unit || "kg"} available.`);
      return;
    }

    cartRequest(`/cart/items/${item.id}`, {
      method: "PATCH",
      body: JSON.stringify({ quantity: newQty }),
    })
      .then((updated) => {
        setCart(updated);
        showToast("Cart updated");
      })
      .catch((err) => showToast(err.message || "Failed to update quantity."));
  };

  const handleRemoveItem = (item) => {
    cartRequest(`/cart/items/${item.id}`, { method: "DELETE" })
      .then((updated) => {
        setCart(updated);
        showToast(`${item.crop_name} removed`);
      })
      .catch((err) => showToast(err.message || "Failed to remove item."));
  };

  const subtotal = Number(cart?.subtotal || 0);
  const deliveryFee = Number(cart?.delivery_fee ?? 0);
  const platformFee = Number(cart?.platform_fee ?? 0);
  const grandTotal = Number(cart?.total ?? (subtotal + deliveryFee + platformFee));
  const itemCount = cart?.items?.length || 0;

  return (
    <div className="zepto-cart-page">
      {/* Toast Notification */}
      {toastMsg && (
        <div
          style={{
            position: "fixed",
            bottom: "74px",
            right: "20px",
            zIndex: 9999,
            background: "var(--forest, #1B6B34)",
            color: "#FFFFFF",
            padding: "9px 16px",
            borderRadius: "8px",
            fontSize: "13px",
            boxShadow: "0 4px 14px rgba(0,0,0,0.18)",
            display: "flex",
            alignItems: "center",
            gap: "8px",
          }}
        >
          <i className="bi bi-check2-circle text-white" />
          <span>{toastMsg}</span>
        </div>
      )}

      {/* Header */}
      <div className="zepto-cart-top">
        <h2 className="zepto-cart-title" style={{ fontFamily: "'Fraunces', Georgia, serif", color: "var(--forest, #1B6B34)", fontSize: "24px", fontWeight: 700, margin: 0 }}>
          Your Cart ({itemCount})
        </h2>
        <button
          className="back-button"
          onClick={() => navigate("/marketplace")}
          style={{ padding: "6px 12px", fontSize: "13px", borderRadius: "8px" }}
        >
          <i className="bi bi-plus-lg" /> Add more crops
        </button>
      </div>

      {errorMsg && (
        <div className="alert alert-warning" style={{ borderRadius: "10px", marginBottom: "16px" }}>
          {errorMsg}
        </div>
      )}

      {loading ? (
        <div className="loading" style={{ padding: "40px 0", textAlign: "center" }}>
          Loading your cart...
        </div>
      ) : !cart?.items || cart.items.length === 0 ? (
        /* Empty State */
        <div
          style={{
            textAlign: "center",
            padding: "48px 20px",
            borderRadius: "16px",
            border: "1px solid var(--line, #E4DFD1)",
            background: "#FFFFFF",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: "0 4px 18px rgba(27, 107, 52, 0.04)",
          }}
        >
          <div style={{ fontSize: "40px", marginBottom: "12px", color: "var(--forest, #1B6B34)" }}>
            <i className="bi bi-basket2" />
          </div>
          <h3 style={{ fontSize: "18px", fontWeight: 700, color: "var(--forest, #1B6B34)", fontFamily: "'Fraunces', Georgia, serif", marginBottom: "6px" }}>
            Your cart is empty
          </h3>
          <p style={{ fontSize: "13.5px", color: "var(--clay, #79705F)", marginBottom: "20px", maxWidth: "340px" }}>
            Explore fresh crops harvested directly by local farmers.
          </p>
          <button
            type="button"
            onClick={() => navigate("/marketplace")}
            style={{
              background: "var(--forest, #1B6B34)",
              color: "#FFFFFF",
              padding: "9px 22px",
              borderRadius: "8px",
              border: "none",
              fontWeight: 700,
              fontSize: "13.5px",
              cursor: "pointer",
              boxShadow: "0 2px 8px rgba(27, 107, 52, 0.2)",
            }}
          >
            Explore Marketplace
          </button>
        </div>
      ) : (
        /* 2-column Zepto Layout */
        <div className="zepto-cart-grid">
          {/* Left: Consolidated Items Card */}
          <div className="zepto-cart-items-card">
            <div className="zepto-cart-items-header">
              <h3 style={{ fontFamily: "'Fraunces', Georgia, serif", color: "var(--forest, #1B6B34)", fontSize: "16px", fontWeight: 700, margin: 0 }}>
                Items in Cart
              </h3>
              <span className="zepto-cart-delivery-tag">
                <i className="bi bi-lightning-charge-fill" /> 45–90 min delivery
              </span>
            </div>

            <div style={{ display: "flex", flexDirection: "column" }}>
              {cart.items.map((item) => {
                const image = resolveCropHeroImage(item);
                const price = Number(item.unit_price || 0).toFixed(2);
                const itemTotal = Number(item.subtotal || item.quantity * item.unit_price || 0).toFixed(2);
                const qtyVal = Number(item.quantity);

                return (
                  <div key={item.id} className="zepto-cart-item-row">
                    {/* Left: Image & Details */}
                    <div className="zepto-cart-item-left">
                      <div className="zepto-cart-item-img">
                        <img src={image} alt={item.crop_name} />
                      </div>
                      <div className="zepto-cart-item-details">
                        <div className="zepto-cart-item-name">{item.crop_name}</div>
                        <div className="zepto-cart-item-meta">
                          ₹{price}/{item.unit || "kg"} {item.farmer_name ? `· ${item.farmer_name}` : ""}
                        </div>
                      </div>
                    </div>

                    {/* Right: Stepper, Price, Remove */}
                    <div className="zepto-cart-item-right">
                      {/* Zepto Stepper */}
                      <div className="zepto-cart-stepper">
                        <button
                          type="button"
                          className="zepto-cart-stepper-btn"
                          onClick={() => handleUpdateQty(item, qtyVal - 1)}
                          aria-label="Decrease quantity"
                        >
                          −
                        </button>
                        <span className="zepto-cart-stepper-qty">{qtyVal}</span>
                        <button
                          type="button"
                          className="zepto-cart-stepper-btn"
                          onClick={() => handleUpdateQty(item, qtyVal + 1)}
                          aria-label="Increase quantity"
                        >
                          +
                        </button>
                      </div>

                      {/* Line Item Total */}
                      <div className="zepto-cart-item-price">
                        ₹{itemTotal}
                      </div>

                      {/* Remove Button */}
                      <button
                        type="button"
                        className="zepto-cart-item-del"
                        onClick={() => handleRemoveItem(item)}
                        title={`Remove ${item.crop_name}`}
                      >
                        <i className="bi bi-trash" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right: Order Summary Card */}
          <div className="zepto-cart-bill-card">
            <h3 style={{ fontFamily: "'Fraunces', Georgia, serif", color: "var(--forest, #1B6B34)", fontSize: "16px", fontWeight: 700, margin: "0 0 14px 0" }}>
              Bill Details
            </h3>

            <div className="zepto-cart-bill-row">
              <span>Item Subtotal</span>
              <b>₹{subtotal.toFixed(2)}</b>
            </div>

            <div className="zepto-cart-bill-row">
              <span>Delivery Partner Fee</span>
              {deliveryFee === 0 ? (
                <b className="free">FREE</b>
              ) : (
                <b>₹{deliveryFee.toFixed(2)}</b>
              )}
            </div>

            <div className="zepto-cart-bill-row">
              <span>Platform & Handling Fee</span>
              <b>₹{platformFee.toFixed(2)}</b>
            </div>

            {deliveryFee === 0 && subtotal > 0 && (
              <div className="zepto-cart-savings-pill">
                <i className="bi bi-tag-fill" />
                <span>Free delivery applied on this order</span>
              </div>
            )}

            {deliveryFee > 0 && subtotal > 0 && subtotal < 500 && (
              <div style={{ background: "#FEF3C7", color: "#92400E", padding: "6px 10px", borderRadius: "8px", fontSize: "11.5px", margin: "6px 0", fontWeight: 600 }}>
                Add ₹{(500 - subtotal).toFixed(2)} more for FREE Delivery
              </div>
            )}

            <div className="zepto-cart-total-row">
              <span>To Pay</span>
              <span className="zepto-cart-total-price">₹{grandTotal.toFixed(2)}</span>
            </div>

            <button
              type="button"
              className="zepto-checkout-btn"
              onClick={() => navigate("/checkout")}
            >
              <span>Proceed to Checkout</span>
              <i className="bi bi-arrow-right" />
            </button>

            <button
              type="button"
              className="zepto-cart-add-more-link"
              onClick={() => navigate("/marketplace")}
            >
              ← Add more crops
            </button>

            <div className="zepto-cart-guarantee">
              <i className="bi bi-shield-check" />
              <span>100% Farm Fresh Guarantee · Dispatched from local Kisan Hub</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
