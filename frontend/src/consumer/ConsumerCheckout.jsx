import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getCheckoutOptions, placeCheckoutOrder, cartRequest } from "../services/api";
import { getStoredLocation, reverseGeocode } from "../services/locationService";
import { resolveCropHeroImage } from "./ConsumerProductCard";
import TestPaymentPanel from "../payments/Payment";
import { useI18n } from "../i18n";
import "./consumer-checkout.css";

export default function ConsumerCheckout() {
  const { t } = useI18n();
  const navigate = useNavigate();

  // Location & Address state
  const [location, setLocation] = useState(() => {
    const stored = getStoredLocation();
    if (stored?.latitude && stored?.longitude) {
      return { latitude: stored.latitude, longitude: stored.longitude };
    }
    return null;
  });

  const [address, setAddress] = useState(() => {
    const stored = getStoredLocation();
    return stored?.address_line || stored?.formatted || stored?.address || "";
  });

  const [isEditingAddress, setIsEditingAddress] = useState(false);
  const [locationError, setLocationError] = useState("");
  const [detectingLocation, setDetectingLocation] = useState(false);

  // Cart & Options state
  const [cart, setCart] = useState(null);
  const [loadingCart, setLoadingCart] = useState(true);
  const [options, setOptions] = useState(null);
  const [hubId, setHubId] = useState("");
  const [slotId, setSlotId] = useState("");
  const [optionsError, setOptionsError] = useState("");
  const [loadingOptions, setLoadingOptions] = useState(false);
  const [placingOrder, setPlacingOrder] = useState(false);
  const [order, setOrder] = useState(null);

  // Load Cart items on mount
  useEffect(() => {
    let active = true;
    setLoadingCart(true);
    cartRequest("/cart")
      .then((data) => {
        if (!active) return;
        setCart(data);
      })
      .catch((err) => {
        console.warn("Failed to load cart for checkout:", err);
      })
      .finally(() => {
        if (active) setLoadingCart(false);
      });
    return () => {
      active = false;
    };
  }, []);

  // If no initial location, attempt detection
  useEffect(() => {
    if (!location) {
      requestLocation();
    }
  }, []);

  // Fetch Checkout Options whenever location changes
  useEffect(() => {
    if (!location?.latitude || !location?.longitude) return undefined;
    let active = true;
    setLoadingOptions(true);
    setOptionsError("");
    getCheckoutOptions(location.latitude, location.longitude)
      .then((result) => {
        if (!active) return;
        setOptions(result);
        setHubId((previous) => {
          if (result.hubs.some((hub) => hub.id === previous)) return previous;
          return result.hubs.find((hub) => hub.available)?.id || result.hubs[0]?.id || "";
        });
      })
      .catch((error) => {
        if (active) setOptionsError(error.message);
      })
      .finally(() => {
        if (active) setLoadingOptions(false);
      });
    return () => {
      active = false;
    };
  }, [location?.latitude, location?.longitude]);

  const selectedHub = options?.hubs?.find((hub) => hub.id === hubId);

  const requestLocation = () => {
    setLocationError("");
    setDetectingLocation(true);
    if (!navigator.geolocation) {
      setLocationError(t("checkoutLocationUnavailable") || "Geolocation is not supported by your browser.");
      setDetectingLocation(false);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      async ({ coords }) => {
        const loc = { latitude: coords.latitude, longitude: coords.longitude };
        setLocation(loc);
        try {
          const geo = await reverseGeocode(coords.latitude, coords.longitude);
          if (geo?.address_line) {
            setAddress(geo.address_line);
          }
        } catch {
          // ignore geocode failure, address can be edited manually
        }
        setDetectingLocation(false);
      },
      () => {
        setLocationError(t("checkoutLocationUnavailable") || "Location access denied. Please enter your address below.");
        setDetectingLocation(false);
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 },
    );
  };

  const checkout = async () => {
    if (!location || address.trim().length < 5) return;
    setPlacingOrder(true);
    setOptionsError("");
    try {
      const placed = await placeCheckoutOrder({
        hub_id: null,
        delivery_slot_id: slotId || null,
        latitude: location.latitude,
        longitude: location.longitude,
        address: address.trim(),
      });
      setOrder(placed);
    } catch (error) {
      setOptionsError(
        /reservation expired/i.test(error.message)
          ? (t("checkoutReservationExpired") || "Stock reservation expired. Please try again.")
          : error.message,
      );
    } finally {
      setPlacingOrder(false);
    }
  };

  // -------------------------------------------------------------
  // Order Placed Success View
  // -------------------------------------------------------------
  if (order) {
    return (
      <div className="zepto-checkout-page">
        <div className="zepto-checkout-success-card">
          <div className="zepto-checkout-success-icon">
            <i className="bi bi-check2-circle" />
          </div>
          <h2 className="zepto-checkout-success-title" style={{ fontFamily: "var(--font-display, 'Fraunces', Georgia, serif)", color: "var(--forest, #1B6B34)" }}>
            Order Placed Successfully! 🎉
          </h2>
          <p className="zepto-checkout-success-sub">
            Your fresh farm produce has been reserved and is on its way from the farm to your door.
          </p>

          <div className="zepto-checkout-success-order-box">
            <div className="zepto-checkout-success-row">
              <span className="label">Order ID:</span>
              <strong className="val">#KD-{order.id.slice(0, 8).toUpperCase()}</strong>
            </div>
            <div className="zepto-checkout-success-row">
              <span className="label">Promised Delivery:</span>
              <strong className="val text-success">
                <i className="bi bi-lightning-charge-fill" /> Express 45–90 Minutes
              </strong>
            </div>
            <div className="zepto-checkout-success-row">
              <span className="label">Delivery Address:</span>
              <span className="val">{order.delivery_address || address}</span>
            </div>
            {order.hub_id && selectedHub && (
              <div className="zepto-checkout-success-row">
                <span className="label">Servicing Hub:</span>
                <span className="val">{selectedHub.name} ({selectedHub.distance_km.toFixed(1)} km away)</span>
              </div>
            )}
            <div className="zepto-checkout-success-row total-row">
              <span className="label">Total Amount:</span>
              <strong className="val">₹{Number(order.total_amount).toFixed(2)}</strong>
            </div>
          </div>

          {/* Items in this Order with Farm Attribution */}
          {order.items && order.items.length > 0 && (
            <div className="zepto-checkout-success-items">
              <div className="zepto-checkout-success-items-title">Items in this Order</div>
              {order.items.map((item) => (
                <div key={item.id} className="zepto-checkout-success-item-row">
                  <div className="zepto-checkout-success-item-info">
                    <span className="item-name">{item.crop_name}</span>
                    <span className="item-farm">
                      <i className="bi bi-flower1" /> Farm: <strong>{item.farmer_name ? `${item.farmer_name}'s Farm` : "Local Certified Farm"}</strong>
                    </span>
                  </div>
                  <div className="zepto-checkout-success-item-qty">
                    {item.quantity} {item.unit} · ₹{Number(item.subtotal).toFixed(2)}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Sandbox Payment Panel */}
          <div style={{ marginTop: "20px", width: "100%" }}>
            <TestPaymentPanel order={order} onComplete={() => navigate("/orders")} />
          </div>

          {/* Action Navigation */}
          <div className="zepto-checkout-success-actions">
            <button
              type="button"
              className="zepto-checkout-btn"
              onClick={() => navigate("/orders")}
            >
              <span>Track Order in My Orders</span>
              <i className="bi bi-arrow-right" />
            </button>
            <button
              type="button"
              className="zepto-cart-add-more-link"
              onClick={() => navigate("/marketplace")}
            >
              ← Back to Marketplace
            </button>
          </div>
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------
  // Main Zepto Checkout Screen
  // -------------------------------------------------------------
  const items = cart?.items || [];
  const itemCount = items.length;
  const subtotal = Number(options?.subtotal ?? cart?.subtotal ?? 0);
  const deliveryFee = Number(options?.delivery_fee ?? cart?.delivery_fee ?? 0);
  const platformFee = Number(options?.platform_fee ?? cart?.platform_fee ?? 0);
  const grandTotal = Number(options?.total ?? cart?.total ?? (subtotal + deliveryFee + platformFee));

  return (
    <div className="zepto-checkout-page">
      {/* Top Header */}
      <div className="zepto-checkout-top">
        <button
          type="button"
          className="zepto-checkout-back-btn"
          onClick={() => navigate("/cart")}
        >
          <i className="bi bi-arrow-left" />
          <span>Back to Cart</span>
        </button>
        <h2 className="zepto-checkout-title" style={{ fontFamily: "var(--font-display, 'Fraunces', Georgia, serif)", color: "var(--forest, #1B6B34)", fontSize: "24px", fontWeight: 700, margin: 0 }}>
          Review & Checkout
        </h2>
        <div className="zepto-checkout-step-badge">
          Step 2 of 2
        </div>
      </div>

      {optionsError && (
        <div className="alert alert-danger d-flex align-items-center gap-2 mb-3" role="alert">
          <i className="bi bi-exclamation-triangle-fill" />
          <div>{optionsError}</div>
        </div>
      )}

      {loadingCart ? (
        <div className="zepto-checkout-loading-card">
          <div className="spinner-border text-success" role="status" />
          <p>Loading your order details...</p>
        </div>
      ) : itemCount === 0 ? (
        <div className="zepto-checkout-empty-card">
          <i className="bi bi-basket2" />
          <h3 style={{ fontFamily: "var(--font-display, 'Fraunces', Georgia, serif)", color: "var(--forest, #1B6B34)", fontSize: "18px", fontWeight: 700, marginBottom: "6px" }}>
            Your cart is empty
          </h3>
          <p>Please add fresh crops to your cart before proceeding to checkout.</p>
          <button
            type="button"
            className="zepto-checkout-btn-small"
            onClick={() => navigate("/marketplace")}
          >
            Explore Marketplace
          </button>
        </div>
      ) : (
        <div className="zepto-checkout-grid">
          {/* ========================================================= */}
          {/* LEFT COLUMN: Delivery Details, Servicing Hub, Farm Items  */}
          {/* ========================================================= */}
          <div className="zepto-checkout-left-col">
            {/* Card 1: Delivery Address */}
            <div className="zepto-checkout-card">
              <div className="zepto-checkout-card-header">
                <div className="zepto-checkout-card-title">
                  <i className="bi bi-geo-alt-fill text-success" />
                  <span>Delivery Address</span>
                </div>
                <button
                  type="button"
                  className="zepto-checkout-card-action"
                  onClick={() => setIsEditingAddress(!isEditingAddress)}
                >
                  {isEditingAddress ? "Done" : "Change"}
                </button>
              </div>

              <div className="zepto-checkout-card-body">
                {isEditingAddress ? (
                  <div className="zepto-checkout-address-edit">
                    <textarea
                      className="form-control"
                      rows={3}
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                      placeholder="Enter flat / house no., building name, street, locality, pincode"
                      maxLength={2000}
                    />
                    <div className="zepto-checkout-address-actions">
                      <button
                        type="button"
                        className="zepto-checkout-detect-btn"
                        onClick={requestLocation}
                        disabled={detectingLocation}
                      >
                        <i className={`bi ${detectingLocation ? "bi-arrow-repeat spin" : "bi-crosshair"}`} />
                        <span>{detectingLocation ? "Detecting GPS..." : "Use Current GPS Location"}</span>
                      </button>
                      <button
                        type="button"
                        className="btn btn-sm btn-outline-success"
                        onClick={() => setIsEditingAddress(false)}
                      >
                        Save Address
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="zepto-checkout-address-preview">
                    <div className="zepto-checkout-address-text">
                      {address.trim() ? (
                        address
                      ) : (
                        <span className="text-muted">No address specified. Click 'Change' to enter delivery address.</span>
                      )}
                    </div>
                    {location && (
                      <div className="zepto-checkout-gps-tag">
                        <i className="bi bi-pin-map-fill" />
                        <span>GPS Coordinates: {location.latitude.toFixed(4)}, {location.longitude.toFixed(4)}</span>
                      </div>
                    )}
                  </div>
                )}

                {address.trim().length > 0 && address.trim().length < 5 && (
                  <div className="text-danger small mt-2">
                    <i className="bi bi-info-circle me-1" />
                    Please enter a detailed delivery address (at least 5 characters).
                  </div>
                )}
                {locationError && (
                  <div className="text-danger small mt-2">
                    <i className="bi bi-exclamation-circle me-1" />
                    {locationError}
                  </div>
                )}
              </div>
            </div>

            {/* Card 2: Delivery Speed & Slot */}
            <div className="zepto-checkout-card">
              <div className="zepto-checkout-card-header">
                <div className="zepto-checkout-card-title">
                  <i className="bi bi-lightning-charge-fill text-warning" />
                  <span>Delivery Speed</span>
                </div>
                <span className="zepto-checkout-delivery-tag">
                  <i className="bi bi-check-circle-fill" /> Express
                </span>
              </div>
              <div className="zepto-checkout-card-body">
                <div className="zepto-checkout-speed-box active">
                  <div className="zepto-checkout-speed-left">
                    <div className="zepto-checkout-speed-badge">⚡ 45–90 MINS</div>
                    <div className="zepto-checkout-speed-text">
                      <strong>Standard Quick Delivery</strong>
                      <span>Packed fresh directly from certified farms and dispatched to your door.</span>
                    </div>
                  </div>
                  <i className="bi bi-check2-circle text-success fs-5" />
                </div>

                {selectedHub?.slots && selectedHub.slots.length > 0 && (
                  <div className="mt-3">
                    <label htmlFor="checkout-slot-select" className="form-label small fw-bold text-muted">
                      Or Choose a Scheduled Slot (Optional)
                    </label>
                    <select
                      id="checkout-slot-select"
                      className="form-select form-select-sm"
                      value={slotId}
                      onChange={(e) => setSlotId(e.target.value)}
                    >
                      <option value="">Express (Soonest Available in 45–90 mins)</option>
                      {selectedHub.slots.map((slot) => (
                        <option key={slot.id} value={slot.id}>
                          {new Date(slot.starts_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} –{" "}
                          {new Date(slot.ends_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} (
                          {slot.remaining_capacity} slots left)
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            </div>

            {/* Card 4: Items in Order with Farmer Farm Origin */}
            <div className="zepto-checkout-card">
              <div className="zepto-checkout-card-header">
                <div className="zepto-checkout-card-title">
                  <i className="bi bi-basket2 text-success" />
                  <span>Items in this Order ({itemCount})</span>
                </div>
                <button
                  type="button"
                  className="zepto-checkout-card-action"
                  onClick={() => navigate("/cart")}
                >
                  Edit Cart
                </button>
              </div>

              <div className="zepto-checkout-card-body p-0">
                <div className="zepto-checkout-items-list">
                  {items.map((item) => {
                    const image = resolveCropHeroImage(item);
                    const price = Number(item.unit_price || 0).toFixed(2);
                    const itemTotal = Number(item.subtotal || item.quantity * item.unit_price || 0).toFixed(2);
                    const farmName = item.farmer_name ? `${item.farmer_name}'s Farm` : "Local Certified Farm";

                    return (
                      <div key={item.id} className="zepto-checkout-item-row">
                        <div className="zepto-checkout-item-img">
                          <img src={image} alt={item.crop_name} />
                        </div>

                        <div className="zepto-checkout-item-meta">
                          <div className="crop-title">{item.crop_name}</div>
                          {/* Clear Farm Attribution required by user */}
                          <div className="farm-tag">
                            <i className="bi bi-flower1" />
                            <span>Farm: <strong>{farmName}</strong></span>
                          </div>
                          <div className="qty-price">
                            {item.quantity} {item.unit || "kg"} × ₹{price}/{item.unit || "kg"}
                          </div>
                        </div>

                        <div className="zepto-checkout-item-price">
                          ₹{itemTotal}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* ========================================================= */}
          {/* RIGHT COLUMN: Bill Details, Savings, Place Order CTA      */}
          {/* ========================================================= */}
          <div className="zepto-checkout-right-col">
            <div className="zepto-checkout-bill-card">
              <h3 className="bill-title" style={{ fontFamily: "var(--font-display, 'Fraunces', Georgia, serif)", color: "var(--forest, #1B6B34)", fontSize: "16px", fontWeight: 700 }}>
                Bill Details
              </h3>

              <div className="zepto-checkout-bill-row">
                <span>Items Subtotal</span>
                <b>₹{subtotal.toFixed(2)}</b>
              </div>

              <div className="zepto-checkout-bill-row">
                <span>Delivery Partner Fee</span>
                {deliveryFee === 0 ? (
                  <b className="text-success fw-bold">FREE</b>
                ) : (
                  <b>₹{deliveryFee.toFixed(2)}</b>
                )}
              </div>

              <div className="zepto-checkout-bill-row">
                <span>Platform & Handling Fee</span>
                <b>₹{platformFee.toFixed(2)}</b>
              </div>

              {deliveryFee === 0 && subtotal > 0 && (
                <div className="zepto-cart-savings-pill">
                  <i className="bi bi-tag-fill" />
                  <span>Free delivery applied on this order</span>
                </div>
              )}

              <div className="zepto-checkout-total-row">
                <span>To Pay</span>
                <span className="total-amount">₹{grandTotal.toFixed(2)}</span>
              </div>

              {/* Stock Reservation Assurance */}
              <div className="zepto-checkout-reservation-notice">
                <i className="bi bi-clock-history" />
                <span>
                  Items will be reserved for {options?.reservation_ttl_minutes || 15} minutes while payment completes.
                </span>
              </div>

              {/* Zepto Style Green CTA Button */}
              <button
                type="button"
                className="zepto-checkout-btn"
                disabled={
                  placingOrder ||
                  loadingOptions ||
                  itemCount === 0 ||
                  address.trim().length < 5
                }
                onClick={checkout}
              >
                {placingOrder ? (
                  <span>Placing Order...</span>
                ) : (
                  <>
                    <span>Place Order · ₹{grandTotal.toFixed(2)}</span>
                    <i className="bi bi-arrow-right" />
                  </>
                )}
              </button>

              {address.trim().length < 5 && (
                <div className="text-muted small text-center mt-2">
                  Please enter delivery address to enable Place Order
                </div>
              )}

              {/* Trust Badges */}
              <div className="zepto-checkout-trust-box">
                <div className="trust-item">
                  <i className="bi bi-shield-check text-success" />
                  <span>100% Farm Fresh Guarantee</span>
                </div>
                <div className="trust-item">
                  <i className="bi bi-box-seam text-success" />
                  <span>Contactless & Hygienic Packaging</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
