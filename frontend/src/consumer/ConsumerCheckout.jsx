import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getCheckoutOptions, placeCheckoutOrder } from "../services/api";
import TestPaymentPanel from "../payments/Payment";
import { useI18n } from "../i18n";

export default function ConsumerCheckout() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [location, setLocation] = useState(null);
  const [options, setOptions] = useState(null);
  const [hubId, setHubId] = useState("");
  const [slotId, setSlotId] = useState("");
  const [address, setAddress] = useState("");
  const [locationError, setLocationError] = useState("");
  const [optionsError, setOptionsError] = useState("");
  const [loadingOptions, setLoadingOptions] = useState(false);
  const [placingOrder, setPlacingOrder] = useState(false);
  const [order, setOrder] = useState(null);

  useEffect(() => {
    if (!location) return undefined;
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
  }, [location]);

  const selectedHub = options?.hubs?.find((hub) => hub.id === hubId);

  const requestLocation = () => {
    setLocationError("");
    if (!navigator.geolocation) {
      setLocationError(t("checkoutLocationUnavailable"));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setLocation({ latitude: coords.latitude, longitude: coords.longitude });
      },
      () => setLocationError(t("checkoutLocationUnavailable")),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    );
  };

  const checkout = async () => {
    if (!location || !selectedHub || !selectedHub.available || address.trim().length < 5) return;
    setPlacingOrder(true);
    setOptionsError("");
    try {
      const placed = await placeCheckoutOrder({
        hub_id: selectedHub.id,
        delivery_slot_id: slotId || null,
        latitude: location.latitude,
        longitude: location.longitude,
        address: address.trim(),
      });
      setOrder(placed);
    } catch (error) {
      setOptionsError(
        /reservation expired/i.test(error.message)
          ? t("checkoutReservationExpired")
          : error.message,
      );
    } finally {
      setPlacingOrder(false);
    }
  };

  return (
    <section className="detail-view checkout-page">
      <div className="consumer-screen-header">
        <button className="back-button" onClick={() => navigate("/cart")}>
          ← {t("checkoutBack")}
        </button>
        <span className="eyebrow">{t("consumerDashboard")}</span>
        <h1>{t("checkoutTitle")}</h1>
        <p>{t("checkoutLocationPrompt")}</p>
      </div>

      <div className="checkout-steps">
        <button className="done" type="button"><b>1</b><span>{t("cartOrders")}</span></button>
        <button className="active" type="button"><b>2</b><span>{t("checkout")}</span></button>
        <button type="button"><b>3</b><span>{t("delivery")}</span></button>
        <button type="button"><b>4</b><span>{t("myOrders")}</span></button>
      </div>

      {order ? (
        <div className="checkout-panel consumer-panel">
          <h2>{t("checkoutOrderCreated")} {order.id.slice(0, 8)}</h2>
          <p>{t("checkoutReservation")} {options?.reservation_ttl_minutes} {t("checkoutMinutes")}</p>
          <div className="cart-total-row total">
            <span>{t("checkoutTotal")}</span>
            <b>₹{Number(order.total_amount).toFixed(2)}</b>
          </div>
          {order.promised_window_start && order.promised_window_end && (
            <p>
              {t("checkoutEta")}: {new Date(order.promised_window_start).toLocaleString()}
              {" – "}{new Date(order.promised_window_end).toLocaleString()}
            </p>
          )}
          <button className="primary-button full-button" onClick={() => navigate("/orders")}>
            {t("myOrders")}
          </button>
          <TestPaymentPanel order={order} onComplete={() => navigate("/cart?tab=orders")} />
        </div>
      ) : (
        <div className="checkout-panel consumer-panel">
          <h2>{t("orderSummary")}</h2>
          <button className="secondary-button" type="button" onClick={requestLocation}>
            {t("checkoutUseLocation")}
          </button>
          {location && (
            <p className="muted">
              {location.latitude.toFixed(5)}, {location.longitude.toFixed(5)}
            </p>
          )}
          {locationError && <div className="error" role="alert">{locationError}</div>}

          <label htmlFor="checkout-address">{t("checkoutAddress")}</label>
          <textarea
            id="checkout-address"
            value={address}
            onChange={(event) => setAddress(event.target.value)}
            placeholder={t("checkoutAddressPlaceholder")}
            rows={3}
            maxLength={2000}
          />

          {loadingOptions && <p className="loading">{t("checkoutFindingHubs")}</p>}
          {optionsError && <div className="error" role="alert">{optionsError}</div>}
          {location && !loadingOptions && options?.hubs?.length === 0 && (
            <div className="error" role="status">{t("checkoutNoHubs")}</div>
          )}
          {options?.item_count === 0 && (
            <div className="empty" role="status">{t("checkoutEmptyCart")}</div>
          )}
          {!location && <p className="muted">{t("checkoutSelectLocation")}</p>}

          {options?.hubs?.length > 0 && (
            <>
              <label htmlFor="checkout-hub">{t("checkoutHub")}</label>
              <select
                id="checkout-hub"
                value={hubId}
                onChange={(event) => {
                  setHubId(event.target.value);
                  setSlotId("");
                }}
              >
                {options.hubs.map((hub) => (
                  <option key={hub.id} value={hub.id}>
                    {hub.name} · {hub.distance_km.toFixed(1)} km{hub.available ? "" : " · unavailable items"}
                  </option>
                ))}
              </select>
              {selectedHub && (
                <>
                  <p className="muted">{selectedHub.address} · {t("checkoutDistance")}: {selectedHub.distance_km.toFixed(1)} km</p>
                  {selectedHub.unavailable_items.length > 0 && (
                    <div className="error" role="alert">
                      <strong>{t("checkoutUnavailableItems")}</strong>
                      <ul>
                        {selectedHub.unavailable_items.map((item) => (
                          <li key={item.listing_id}>
                            {item.crop_name}: {item.available_quantity} / {item.requested_quantity} {item.unit}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  <p>
                    {t("checkoutEta")}: {selectedHub.eta_min_minutes}–{selectedHub.eta_max_minutes} {t("checkoutMinuteUnit")}
                  </p>
                  <label htmlFor="checkout-slot">{t("checkoutSlot")}</label>
                  <select
                    id="checkout-slot"
                    value={slotId}
                    onChange={(event) => setSlotId(event.target.value)}
                  >
                    <option value="">{t("checkoutAsap")}</option>
                    {selectedHub.slots.map((slot) => (
                      <option key={slot.id} value={slot.id}>
                        {new Date(slot.starts_at).toLocaleString()} – {new Date(slot.ends_at).toLocaleTimeString()}
                        {" · "}{slot.remaining_capacity} {t("available").toLowerCase()}
                      </option>
                    ))}
                  </select>
                </>
              )}
            </>
          )}

          {options?.item_count > 0 && (
            <div className="checkout-fee-breakdown">
              <div className="cart-total-row"><span>{t("checkoutSubtotal")}</span><b>₹{Number(options.subtotal).toFixed(2)}</b></div>
              <div className="cart-total-row"><span>{t("checkoutDeliveryFee")}</span><b>₹{Number(options.delivery_fee).toFixed(2)}</b></div>
              <div className="cart-total-row"><span>{t("checkoutPlatformFee")}</span><b>₹{Number(options.platform_fee).toFixed(2)}</b></div>
              <div className="cart-total-row total"><span>{t("checkoutTotal")}</span><b>₹{Number(options.total).toFixed(2)}</b></div>
            </div>
          )}

          {options?.item_count > 0 && <p className="muted">{t("checkoutReservation")} {options.reservation_ttl_minutes} {t("checkoutMinutes")}</p>}
          <button
            className="primary-button full-button"
            disabled={
              placingOrder ||
              loadingOptions ||
              !options?.item_count ||
              !selectedHub?.available ||
              address.trim().length < 5
            }
            onClick={checkout}
          >
            {placingOrder ? t("checkoutPlacingOrder") : t("checkoutPlaceOrder")}
          </button>
        </div>
      )}
    </section>
  );
}
