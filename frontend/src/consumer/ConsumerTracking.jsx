import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { MapContainer, Marker, Popup, TileLayer, useMap } from "react-leaflet";
import { orderRequest } from "../services/api";
import { useI18n } from "../i18n";

const eventLabels = {
  PENDING: "placed",
  CONFIRMED: "confirmed",
  PROCESSING: "packing",
  PACKING: "packing",
  READY_FOR_PICKUP: "ready",
  SHIPPED: "ready",
  RIDER_ASSIGNED: "assigned",
  PICKED_UP: "pickedUp",
  OUT_FOR_DELIVERY: "outForDelivery",
  ARRIVED: "arrived",
  DELIVERED: "delivered",
  COMPLETED: "delivered",
  CANCELLED: "cancelled",
  FAILED_DELIVERY: "failed",
  RETURNED: "returned",
};

function MapPoint({ location, label }) {
  if (!location) return null;
  return (
    <Marker position={[location.latitude, location.longitude]}>
      <Popup>{label}</Popup>
    </Marker>
  );
}

function FitTrackingPoints({ pointsKey }) {
  const map = useMap();
  useEffect(() => {
    const points = pointsKey
      ? pointsKey.split("|").map((point) => point.split(",").map(Number))
      : [];
    if (points.length > 1) {
      map.fitBounds(points, {
        padding: [24, 24],
        maxZoom: 14,
      });
    } else if (points.length === 1) {
      map.setView(points[0], 14);
    }
  }, [map, pointsKey]);
  return null;
}

export default function ConsumerTracking({ orderId, onBack }) {
  const { t } = useI18n();
  const [tracking, setTracking] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      setError("");
      setTracking(await orderRequest(`/orders/${orderId}/tracking`));
    } catch (requestError) {
      setError(requestError.message || t("tracking.loadError"));
    } finally {
      setLoading(false);
    }
  }, [orderId, t]);

  useEffect(() => {
    setLoading(true);
    load();
    const timer = window.setInterval(load, 7000);
    return () => window.clearInterval(timer);
  }, [load]);

  async function cancelOrder() {
    if (!window.confirm(t("tracking.cancelConfirm"))) return;
    try {
      await orderRequest(`/orders/${orderId}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status: "CANCELLED" }),
      });
      await load();
    } catch (requestError) {
      setError(requestError.message || t("tracking.loadError"));
    }
  }

  if (loading && !tracking) {
    return <section className="consumer-panel"><div className="loading">{t("tracking.loading")}</div></section>;
  }

  if (error && !tracking) {
    return <section className="consumer-panel"><div className="error" role="alert">{error}</div><button className="secondary-button" onClick={load}>{t("tracking.retry")}</button></section>;
  }

  const points = [
    tracking?.pickup_location,
    tracking?.delivery_location,
    tracking?.rider_location,
  ].filter(Boolean);
  const mapCenter = points.length
    ? [points[0].latitude, points[0].longitude]
    : null;
  const pointsKey = points
    .map((point) => `${point.latitude},${point.longitude}`)
    .join("|");

  return (
    <section className="consumer-panel consumer-tracking-panel">
      <button className="back-button" type="button" onClick={onBack}>← {t("back")}</button>
      <header className="consumer-screen-header">
        <span className="eyebrow">{t("tracking.title")}</span>
        <h2>{t("tracking.order")} {tracking.order_id.slice(0, 8)}</h2>
        {tracking.shipment_status && (
          <p>
            {t(`tracking.${eventLabels[tracking.shipment_status] || "title"}`)}
          </p>
        )}
      </header>

      {error && <div className="error" role="alert">{error}</div>}

      {tracking.shipment_status ? (
        <>
          {tracking.shipment_status === "DELIVERED" && (
            <div className="info-box" role="status">
              <h3>{t("tracking.deliveredTitle")}</h3>
              <p>{t("tracking.deliveredDescription")}</p>
            </div>
          )}

          <div className="tracking-summary">
            {tracking.rider_name && <p><strong>{t("tracking.rider")}:</strong> {tracking.rider_name}</p>}
            {tracking.rider_vehicle && <p><strong>{t("tracking.vehicle")}:</strong> {tracking.rider_vehicle}</p>}
            {tracking.promised_window_start && tracking.promised_window_end && (
              <p><strong>{t("tracking.deliveryWindow")}:</strong>{" "}
                {new Date(tracking.promised_window_start).toLocaleTimeString()} –{" "}
                {new Date(tracking.promised_window_end).toLocaleTimeString()}
              </p>
            )}
            {!tracking.rider_location_available && tracking.shipment_status !== "READY_FOR_PICKUP" && (
              <p role="status">{t("tracking.locationUnavailable")}</p>
            )}
            {tracking.delivery_otp && (
              <p className="delivery-otp" role="status">
                <strong>{t("tracking.otp")}:</strong> <b>{tracking.delivery_otp}</b>
              </p>
            )}
          </div>

          {mapCenter ? (
            <MapContainer center={mapCenter} zoom={13} className="map" key={tracking.order_id}>
              <FitTrackingPoints pointsKey={pointsKey} />
              <TileLayer
                attribution="&copy; OpenStreetMap contributors"
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              <MapPoint location={tracking.pickup_location} label={tracking.pickup_address || t("tracking.ready")} />
              <MapPoint location={tracking.delivery_location} label={tracking.delivery_address || t("tracking.delivered")} />
              <MapPoint location={tracking.rider_location} label={tracking.rider_name || t("tracking.rider")} />
            </MapContainer>
          ) : (
            <div className="empty"><p>{t("tracking.locationUnavailable")}</p></div>
          )}

          {tracking.pickup_location && tracking.delivery_location && (
            <a
              className="text-link"
              href={`https://www.google.com/maps/dir/?api=1&origin=${tracking.pickup_location.latitude},${tracking.pickup_location.longitude}&destination=${tracking.delivery_location.latitude},${tracking.delivery_location.longitude}`}
              target="_blank"
              rel="noreferrer"
            >
              {t("tracking.openMap")}
            </a>
          )}

          <section className="tracking-timeline">
            <h3>{t("tracking.timeline")}</h3>
            {tracking.events.length ? (
              <ol>
                {tracking.events.map((event, index) => (
                  <li key={`${event.status}-${event.occurred_at}-${index}`}>
                    <strong>{t(`tracking.${eventLabels[event.status] || "title"}`)}</strong>
                    <time dateTime={event.occurred_at}>{new Date(event.occurred_at).toLocaleString()}</time>
                  </li>
                ))}
              </ol>
            ) : <p>{t("tracking.noShipment")}</p>}
          </section>

          {tracking.can_cancel && (
            <button className="secondary-button danger" type="button" onClick={cancelOrder}>
              {t("tracking.cancel")}
            </button>
          )}
          {tracking.review_listing_ids.length > 0 && (
            <section className="tracking-reviews">
              <h3>{t("tracking.reviews")}</h3>
              {tracking.review_listing_ids.map((listingId) => (
                <Link className="text-link" key={listingId} to={`/p/${listingId}`}>
                  {t("tracking.reviews")}
                </Link>
              ))}
            </section>
          )}
        </>
      ) : (
        <div className="empty"><p>{t("tracking.noShipment")}</p></div>
      )}
    </section>
  );
}
