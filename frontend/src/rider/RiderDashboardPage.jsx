import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useI18n } from "../i18n";
import {
  acceptRiderOffer,
  declineRiderOffer,
  getRiderActiveShipment,
  getRiderStatus,
  pollRiderOffers,
  postRiderLocation,
  recordRiderCodCashCollected,
  updateRiderAvailability,
  updateRiderShipmentStatus,
  verifyRiderDeliveryOtp,
} from "../services/api";

const nextShipmentAction = {
  RIDER_ASSIGNED: ["PICKED_UP", "rider.pickedUp"],
  PICKED_UP: ["OUT_FOR_DELIVERY", "rider.startDelivery"],
  OUT_FOR_DELIVERY: ["ARRIVED", "rider.arrived"],
};

export default function RiderDashboardPage() {
  const { t } = useI18n();
  const [rider, setRider] = useState(null);
  const [offers, setOffers] = useState([]);
  const [shipment, setShipment] = useState(null);
  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(true);
  const [offersLoading, setOffersLoading] = useState(false);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [locationError, setLocationError] = useState("");
  const [locationRetry, setLocationRetry] = useState(0);
  const lastLocationPost = useRef(0);
  const locationPostInFlight = useRef(false);

  const refreshOffers = useCallback(async () => {
    try {
      setOffersLoading(true);
      setOffers(await pollRiderOffers());
    } catch (requestError) {
      setError(requestError.message || t("rider.actionError"));
    } finally {
      setOffersLoading(false);
    }
  }, [t]);

  const refreshShipment = useCallback(async () => {
    try {
      setShipment(await getRiderActiveShipment());
    } catch (requestError) {
      setError(requestError.message || t("rider.actionError"));
    }
  }, [t]);

  const refreshRider = useCallback(async () => {
    try {
      setError("");
      setRider(await getRiderStatus());
    } catch (requestError) {
      setError(requestError.message || t("rider.loadError"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    refreshRider();
  }, [refreshRider]);

  const approved = rider?.approval_status === "APPROVED";
  const online = rider?.availability === "AVAILABLE" || rider?.availability === "BUSY";
  const available = rider?.availability === "AVAILABLE";

  useEffect(() => {
    if (!approved || !online || !navigator.geolocation) return undefined;
    setLocationError("");
    const watchId = navigator.geolocation.watchPosition(
      async (position) => {
        const now = Date.now();
        if (now - lastLocationPost.current < 7000 || locationPostInFlight.current) return;
        locationPostInFlight.current = true;
        try {
          await postRiderLocation({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: Math.round(position.coords.accuracy * 100) / 100,
          });
          lastLocationPost.current = now;
        } catch (requestError) {
          setLocationError(requestError.message || t("rider.locationFailed"));
        } finally {
          locationPostInFlight.current = false;
        }
      },
      (geoError) => {
        setLocationError(
          geoError.code === 1
            ? t("rider.locationDenied")
            : t("rider.locationFailed"),
        );
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 },
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, [approved, online, locationRetry, t]);

  useEffect(() => {
    if (!available) {
      setOffers([]);
      return undefined;
    }
    refreshOffers();
    const timer = window.setInterval(refreshOffers, 6000);
    return () => window.clearInterval(timer);
  }, [available, refreshOffers]);

  useEffect(() => {
    if (approved) refreshShipment();
  }, [approved, refreshShipment]);

  async function toggleAvailability() {
    try {
      setError("");
      const nextRider = await updateRiderAvailability(!available);
      setRider(nextRider);
      setLocationError("");
    } catch (requestError) {
      setError(requestError.message || t("rider.actionError"));
    }
  }

  async function performOfferAction(offer, accept) {
    setBusyId(offer.id);
    setError("");
    try {
      if (accept) {
        setShipment(await acceptRiderOffer(offer.id));
        const nextRider = await getRiderStatus();
        setRider(nextRider);
      } else {
        await declineRiderOffer(offer.id);
        await refreshOffers();
      }
    } catch (requestError) {
      setError(requestError.message || t("rider.actionError"));
    } finally {
      setBusyId("");
    }
  }

  async function updateShipment(target) {
    if (!shipment) return;
    setBusyId(shipment.id);
    setError("");
    try {
      setShipment(await updateRiderShipmentStatus(shipment.id, target));
    } catch (requestError) {
      setError(requestError.message || t("rider.actionError"));
    } finally {
      setBusyId("");
    }
  }

  async function recordCash() {
    if (!shipment) return;
    setBusyId(shipment.id);
    setError("");
    try {
      await recordRiderCodCashCollected(shipment.id);
      await refreshShipment();
    } catch (requestError) {
      setError(requestError.message || t("rider.actionError"));
    } finally {
      setBusyId("");
    }
  }

  async function submitOtp(event) {
    event.preventDefault();
    if (!shipment) return;
    setBusyId(shipment.id);
    setError("");
    setSuccess("");
    try {
      await verifyRiderDeliveryOtp(shipment.id, otp);
      setShipment(null);
      setRider(await getRiderStatus());
      setOtp("");
      setSuccess(t("rider.otpVerified"));
      await refreshOffers();
    } catch (requestError) {
      setError(requestError.message || t("rider.otpRejected"));
    } finally {
      setBusyId("");
    }
  }

  if (loading) {
    return <section className="detail-view"><div className="loading">{t("rider.loading")}</div></section>;
  }

  return (
    <section className="detail-view">
      <header className="consumer-screen-header">
        <span className="eyebrow">{t("rider.eyebrow")}</span>
        <h1>{t("rider.title")}</h1>
        <p>{t("rider.description")}</p>
      </header>

      {error && <div className="error" role="alert">{error}</div>}
      {success && <div className="info-box" role="status">{success}</div>}

      {rider?.approval_status === "PENDING_APPROVAL" ? (
        <section className="consumer-panel mb-4" role="status">
          <h2>{t("rider.pendingTitle")}</h2>
          <p>{t("rider.pendingDescription")}</p>
        </section>
      ) : rider?.approval_status === "SUSPENDED" ? (
        <section className="consumer-panel mb-4" role="alert">
          <h2>{t("rider.suspendedTitle")}</h2>
          <p>{t("rider.suspendedDescription")}</p>
        </section>
      ) : approved ? (
        <>
          <section className="consumer-panel mb-4">
            <h2>{t("rider.availability")}</h2>
            <p>
              {rider.availability === "BUSY"
                ? t("rider.busy")
                : available
                  ? t("rider.available")
                  : t("rider.offlineStatus")}
            </p>
            <button className="farmer-small-button solid" type="button" disabled={rider.availability === "BUSY"} onClick={toggleAvailability}>
              {available ? t("rider.offline") : t("rider.online")}
            </button>
            {online && <p className="mt-3 mb-0">{t("rider.locationSharing")}</p>}
            {locationError && (
              <div className="error mt-3" role="alert">
                <p>{locationError}</p>
                <button className="farmer-small-button secondary" type="button" onClick={() => setLocationRetry((retry) => retry + 1)}>
                  {t("rider.retryLocation")}
                </button>
              </div>
            )}
            {online && !navigator.geolocation && (
              <div className="error mt-3" role="alert">{t("rider.locationError")}</div>
            )}
          </section>

          {shipment ? (
            <section className="consumer-panel mb-4">
              <span className="eyebrow">{t("rider.activeTitle")}</span>
              <h2>{shipment.hub_name}</h2>
              <p>{t("rider.orderReference")} #{shipment.order_id.slice(0, 8).toUpperCase()}</p>
              <h3>{t("rider.pickup")}</h3>
              <p>{shipment.pickup_address}</p>
              <a href={shipment.pickup_maps_url} target="_blank" rel="noreferrer">{t("rider.openMap")}</a>
              <h3 className="mt-3">{t("rider.destination")}</h3>
              <p>{shipment.dropoff_address}</p>
              {nextShipmentAction[shipment.status] && (
                <button
                  className="farmer-small-button solid"
                  type="button"
                  disabled={busyId === shipment.id}
                  onClick={() => updateShipment(nextShipmentAction[shipment.status][0])}
                >
                  {t(nextShipmentAction[shipment.status][1])}
                </button>
              )}
              {shipment.status === "ARRIVED" && (
                <>
                  {shipment.payment_method === "COD" && shipment.payment_status !== "PAID" && (
                    <button className="farmer-small-button solid mt-3" type="button" disabled={busyId === shipment.id} onClick={recordCash}>
                      {t("rider.recordCash")}
                    </button>
                  )}
                  {shipment.payment_method === "COD" && shipment.payment_status === "PAID" && (
                    <p className="dashboard-pill mt-3">{t("rider.cashCollected")}</p>
                  )}
                  {(shipment.payment_method !== "COD" || shipment.payment_status === "PAID") && (
                    <form className="review-form" onSubmit={submitOtp}>
                      <h3>{t("rider.otpTitle")}</h3>
                      <p>{t("rider.otpDescription")}</p>
                      <label htmlFor="rider-delivery-otp">{t("rider.otpCode")}</label>
                      <input id="rider-delivery-otp" value={otp} onChange={(event) => setOtp(event.target.value.replace(/\D/g, ""))} inputMode="numeric" autoComplete="one-time-code" minLength={6} maxLength={6} required />
                      <button className="farmer-small-button secondary" type="submit" disabled={busyId === shipment.id}>
                        {t("rider.verifyOtp")}
                      </button>
                    </form>
                  )}
                </>
              )}
            </section>
          ) : (
            <section className="empty mb-4"><p>{t("rider.noActive")}</p></section>
          )}

          {!shipment && (
            <section>
              <header className="consumer-screen-header">
                <span className="eyebrow">{t("rider.offersTitle")}</span>
                <h2>{t("rider.offersTitle")}</h2>
              </header>
              {offersLoading && !offers.length ? (
                <div className="loading">{t("rider.loadingOffers")}</div>
              ) : offers.length ? (
                <div className="listing-grid">
                  {offers.map((offer) => (
                    <article className="consumer-panel" key={offer.id}>
                      <h3>{offer.hub_name}</h3>
                      <p>{t("rider.pickup")}: {offer.pickup_address}</p>
                      <p>{t("rider.destination")}: {offer.dropoff_address}</p>
                      <p>{t("rider.expires")}: {new Date(offer.expires_at).toLocaleTimeString()}</p>
                      <div className="d-flex gap-2">
                        <button className="farmer-small-button solid" type="button" disabled={busyId === offer.id} onClick={() => performOfferAction(offer, true)}>
                          {t("rider.accept")}
                        </button>
                        <button className="farmer-small-button secondary" type="button" disabled={busyId === offer.id} onClick={() => performOfferAction(offer, false)}>
                          {t("rider.decline")}
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="empty"><p>{t("rider.noOffers")}</p></div>
              )}
            </section>
          )}
        </>
      ) : null}
      <footer className="mt-4"><Link to="/rider/history">{t("rider.navHistory")}</Link></footer>
    </section>
  );
}
