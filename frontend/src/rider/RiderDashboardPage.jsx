import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useOutletContext } from "react-router-dom";
import {
  acceptRiderOffer,
  declineRiderOffer,
  getRiderActiveShipment,
  pollRiderOffers,
  postRiderLocation,
  recordRiderCodCashCollected,
  updateRiderShipmentStatus,
} from "../services/api";
import { RiderBikeIcon } from "./RiderShell";

const nextShipmentAction = {
  RIDER_ASSIGNED: ["PICKED_UP", "Confirm Picked Up from Hub", "bi-box-arrow-in-down"],
  PICKED_UP: ["OUT_FOR_DELIVERY", "Start Delivery to Customer", "bi-bicycle"],
  OUT_FOR_DELIVERY: ["ARRIVED", "I Have Arrived at Destination", "bi-geo-alt-fill"],
};

export default function RiderDashboardPage() {
  const context = useOutletContext() || {};
  const { rider, refreshRider, approved, online, available, handleToggleDuty, toggling } = context;

  const [offers, setOffers] = useState([]);
  const [shipment, setShipment] = useState(null);
  const [showDeliverConfirmModal, setShowDeliverConfirmModal] = useState(false);
  const [offersLoading, setOffersLoading] = useState(false);
  const [shipmentLoading, setShipmentLoading] = useState(false);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [locationError, setLocationError] = useState("");
  const [locationRetry, setLocationRetry] = useState(0);
  const [checkingApproval, setCheckingApproval] = useState(false);

  const lastLocationPost = useRef(0);
  const locationPostInFlight = useRef(false);

  // Poll offers when available and online
  const refreshOffers = useCallback(async () => {
    if (!approved || !available) return;
    try {
      setOffersLoading(true);
      const data = await pollRiderOffers();
      setOffers(Array.isArray(data) ? data : []);
    } catch (requestError) {
      console.warn("Offers poll notice:", requestError);
    } finally {
      setOffersLoading(false);
    }
  }, [approved, available]);

  // Load active delivery shipment
  const refreshShipment = useCallback(async () => {
    if (!approved) return;
    try {
      setShipmentLoading(true);
      const data = await getRiderActiveShipment();
      setShipment(data);
    } catch (requestError) {
      console.warn("Active shipment notice:", requestError);
    } finally {
      setShipmentLoading(false);
    }
  }, [approved]);

  useEffect(() => {
    if (approved) {
      refreshShipment();
    }
  }, [approved, refreshShipment]);

  useEffect(() => {
    if (!available || !approved) {
      setOffers([]);
      return undefined;
    }
    refreshOffers();
    const timer = window.setInterval(refreshOffers, 6000);
    return () => window.clearInterval(timer);
  }, [available, approved, refreshOffers]);

  // Auto-poll approval status if pending
  useEffect(() => {
    if (rider && rider.approval_status === "PENDING_APPROVAL") {
      const timer = window.setInterval(() => {
        if (refreshRider) refreshRider();
      }, 7000);
      return () => window.clearInterval(timer);
    }
  }, [rider, refreshRider]);

  // Real GPS Telemetry Watcher
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
          setLocationError(requestError.message || "Failed to update GPS telemetry.");
        } finally {
          locationPostInFlight.current = false;
        }
      },
      (geoError) => {
        setLocationError(
          geoError.code === 1
            ? "Location permission denied. Please allow GPS access to receive delivery offers."
            : "Location lookup failed. Check your device GPS connection."
        );
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 }
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, [approved, online, locationRetry]);

  const handleManualCheckApproval = async () => {
    try {
      setCheckingApproval(true);
      if (refreshRider) await refreshRider();
    } finally {
      setCheckingApproval(false);
    }
  };

  const handlePerformOfferAction = async (offer, accept) => {
    setBusyId(offer.id);
    setError("");
    setSuccess("");
    try {
      if (accept) {
        const acceptedShipment = await acceptRiderOffer(offer.id);
        setShipment(acceptedShipment);
        if (refreshRider) await refreshRider();
        setSuccess("Delivery accepted! Please proceed to the Kisan Hub for pickup.");
      } else {
        await declineRiderOffer(offer.id);
        await refreshOffers();
      }
    } catch (requestError) {
      setError(requestError.message || "Action failed.");
    } finally {
      setBusyId("");
    }
  };

  const handleUpdateShipmentStatus = async (target) => {
    if (!shipment) return;
    setBusyId(shipment.id);
    setError("");
    setSuccess("");
    try {
      const updated = await updateRiderShipmentStatus(shipment.id, target);
      setShipment(updated);
      setSuccess(`Shipment updated to ${target.toLowerCase().replace(/_/g, " ")}.`);
    } catch (requestError) {
      setError(requestError.message || "Could not update shipment status.");
    } finally {
      setBusyId("");
    }
  };

  const handleRecordCash = async () => {
    if (!shipment) return;
    setBusyId(shipment.id);
    setError("");
    setSuccess("");
    try {
      await recordRiderCodCashCollected(shipment.id);
      await refreshShipment();
      setSuccess("Cash on delivery payment recorded successfully.");
    } catch (requestError) {
      setError(requestError.message || "Could not record cash collection.");
    } finally {
      setBusyId("");
    }
  };

  const handleMarkAsDeliveredClick = () => {
    if (!shipment) return;
    if (shipment.payment_method === "COD" && shipment.payment_status !== "PAID") {
      setError("Please collect cash and confirm cash collection before completing delivery.");
      return;
    }
    setError("");
    setShowDeliverConfirmModal(true);
  };

  const handleConfirmDelivery = async () => {
    if (!shipment) return;
    setBusyId(shipment.id);
    setError("");
    setSuccess("");
    try {
      await updateRiderShipmentStatus(shipment.id, "DELIVERED");
      setShowDeliverConfirmModal(false);
      setShipment(null);
      if (refreshRider) await refreshRider();
      setSuccess("Order marked as Delivered successfully! Great job.");
      await refreshOffers();
    } catch (requestError) {
      setError(requestError.message || "Could not mark order as delivered.");
    } finally {
      setBusyId("");
    }
  };

  const riderFirstName = (rider?.display_name || "Partner").trim().split(" ")[0];
  const vehicle = rider?.vehicle_type || "Motorcycle / Delivery Bike";

  const renderHeroBanner = () => (
    <div className="rider-hero-carousel" role="region" aria-label="Rider Fleet Overview">
      <div className="rider-hero-slide active">
        <img src="/assets/images/sunlight.png" alt="" className="rider-hero-img" />
        <div
          className="rider-hero-gradient"
          style={{
            background:
              "linear-gradient(90deg, rgba(7, 38, 23, 0.94) 0%, rgba(12, 58, 36, 0.82) 50%, rgba(15, 68, 42, 0.45) 100%)",
          }}
        />
        <div className="rider-hero-content">
          <div className="rider-hero-left" style={{ flex: 1, minWidth: 0 }}>
            <div className="rider-hero-pill">
              <RiderBikeIcon size={14} />
              <span>{approved ? "Live Rider Operations" : "Express Fleet Partner"}</span>
            </div>
            <h2 className="rider-hero-title">
              Welcome back, {riderFirstName} 🛵
            </h2>
            <div className="rider-hero-subtitle">
              {vehicle} · Kisan Hub Delivery Network
            </div>
            <div className="rider-hero-highlight">
              {!approved
                ? "Status: Awaiting one-time administrator verification"
                : shipment
                ? `Today's Snapshot: 1 active trip in progress · Order #${shipment.order_id?.slice(0, 8).toUpperCase()}`
                : `Today's Snapshot: ${offers.length} nearby offer${offers.length === 1 ? "" : "s"} · ${
                    available ? "Online & ready" : "Offline"
                  }`}
            </div>
          </div>
          <div className="rider-hero-right" style={{ flexShrink: 0 }}>
            {!approved ? (
              <button
                type="button"
                className="rider-hero-cta"
                onClick={handleManualCheckApproval}
                disabled={checkingApproval}
                title="Check approval status"
              >
                {checkingApproval ? (
                  <>
                    <span className="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true" />
                    Checking...
                  </>
                ) : (
                  <>
                    <i className="bi bi-arrow-clockwise me-1" /> Check Status
                  </>
                )}
              </button>
            ) : shipment ? (
              <button
                type="button"
                className="rider-hero-cta"
                onClick={() => {
                  document.getElementById("active-shipment")?.scrollIntoView({ behavior: "smooth" });
                }}
                title="Jump to active delivery"
              >
                <i className="bi bi-box-seam me-1" /> Active Trip
              </button>
            ) : (
              <button
                type="button"
                className="rider-hero-cta"
                onClick={handleToggleDuty}
                disabled={toggling}
                title={available ? "Go Offline" : "Go Online"}
              >
                {available ? (
                  <>
                    <i className="bi bi-check-circle-fill me-1" /> On Duty
                  </>
                ) : (
                  <>
                    <i className="bi bi-plus-lg me-1" /> Go Online
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  // --- VIEW 1: ONE-TIME ADMIN APPROVAL PENDING ---
  if (rider?.approval_status === "PENDING_APPROVAL") {
    return (
      <div>
        {renderHeroBanner()}

        <div className="rider-verify-card mt-3">
          <div className="rider-verify-icon-wrap">
            <RiderBikeIcon size={44} />
          </div>
          <h2>One-Time Approval Pending</h2>
          <p>
            Welcome to KisanDirect Express! Your delivery partner account was registered
            successfully and is awaiting <strong>one-time administrator approval</strong>. Once verified,
            you can immediately start receiving delivery trips from your local Kisan Hubs.
          </p>

          <div className="rider-details-summary">
            <div className="rider-details-row">
              <span className="rider-details-label">Partner Name</span>
              <span className="rider-details-val">{rider.display_name || "Delivery Partner"}</span>
            </div>
            <div className="rider-details-row">
              <span className="rider-details-label">Vehicle Type</span>
              <span className="rider-details-val">{rider.vehicle_type || "Motorcycle / Delivery Bike"}</span>
            </div>
            <div className="rider-details-row">
              <span className="rider-details-label">Status</span>
              <span className="badge bg-warning text-dark">
                <i className="bi bi-clock-history me-1" /> Awaiting Admin Approval
              </span>
            </div>
            <div className="rider-details-row">
              <span className="rider-details-label">Verification Type</span>
              <span className="rider-details-val">One-time registration review</span>
            </div>
          </div>

          <button
            type="button"
            className="rider-refresh-btn"
            onClick={handleManualCheckApproval}
            disabled={checkingApproval}
          >
            {checkingApproval ? (
              <>
                <span className="spinner-border spinner-border-sm" role="status" aria-hidden="true" />
                <span>Checking Status...</span>
              </>
            ) : (
              <>
                <i className="bi bi-arrow-clockwise" /> Check Approval Status
              </>
            )}
          </button>

          <p className="mt-3 text-muted small">
            <i className="bi bi-shield-check me-1 text-success" />
            Auto-checking status every few seconds. No re-login needed once approved.
          </p>
        </div>
      </div>
    );
  }

  // --- VIEW 2: SUSPENDED ACCOUNT ---
  if (rider?.approval_status === "SUSPENDED") {
    return (
      <div>
        {renderHeroBanner()}

        <div className="alert alert-danger p-4 text-center rounded-3 mt-3">
          <i className="bi bi-slash-circle-fill text-danger fs-1 d-block mb-3" />
          <h3 className="fw-bold">Rider Account Suspended</h3>
          <p className="mb-3">
            Your delivery partner account has been temporarily suspended by the platform administrator.
          </p>
          <p className="text-muted small">Please contact KisanDirect fleet operations support for assistance.</p>
        </div>
      </div>
    );
  }

  // --- VIEW 3: APPROVED DELIVERY CONSOLE ---
  return (
    <div>
      {/* Background Hero Header Banner matching Image 2 */}
      {renderHeroBanner()}

      {/* Notifications */}
      {error && (
        <div className="alert alert-danger py-2 px-3 mb-3 d-flex align-items-center gap-2">
          <i className="bi bi-exclamation-triangle-fill" />
          <span>{error}</span>
        </div>
      )}
      {success && (
        <div className="alert alert-success py-2 px-3 mb-3 d-flex align-items-center gap-2">
          <i className="bi bi-check-circle-fill" />
          <span>{success}</span>
        </div>
      )}
      {locationError && (
        <div className="alert alert-warning py-2 px-3 mb-3 d-flex align-items-center justify-content-between">
          <div className="d-flex align-items-center gap-2">
            <i className="bi bi-geo-alt-fill text-warning" />
            <span>{locationError}</span>
          </div>
          <button
            type="button"
            className="btn btn-sm btn-outline-dark"
            onClick={() => setLocationRetry((r) => r + 1)}
          >
            Retry GPS
          </button>
        </div>
      )}

      {/* KPI Stats Row */}
      <div className="rider-metrics-grid">
        <div className="rider-metric-card">
          <div className={`rider-metric-icon ${available ? "green" : "amber"}`}>
            <RiderBikeIcon size={24} />
          </div>
          <div className="rider-metric-info">
            <span>Availability</span>
            <strong>
              {rider?.availability === "BUSY"
                ? "On Delivery"
                : available
                ? "Online"
                : "Offline"}
            </strong>
          </div>
        </div>

        <div className="rider-metric-card">
          <div className="rider-metric-icon blue">
            <i className="bi bi-broadcast" />
          </div>
          <div className="rider-metric-info">
            <span>GPS Tracking</span>
            <strong style={{ fontSize: "0.95rem" }}>
              {online ? "Sharing Live" : "Inactive"}
            </strong>
          </div>
        </div>

        <div className="rider-metric-card">
          <div className="rider-metric-icon green">
            <i className="bi bi-box-seam" />
          </div>
          <div className="rider-metric-info">
            <span>Active Trips</span>
            <strong>{shipment ? 1 : 0}</strong>
          </div>
        </div>

        <div className="rider-metric-card">
          <div className="rider-metric-icon amber">
            <i className="bi bi-lightning-charge-fill" />
          </div>
          <div className="rider-metric-info">
            <span>Order Offers</span>
            <strong>{offers.length}</strong>
          </div>
        </div>
      </div>

      {/* Duty Status Banner */}
      <div className="rider-duty-card">
        <div className="rider-duty-status">
          <div
            className={`rider-duty-indicator ${
              rider?.availability === "BUSY"
                ? "busy"
                : available
                ? "online"
                : "offline"
            }`}
          />
          <div>
            <div className="fw-bold">
              {rider?.availability === "BUSY"
                ? "Currently on Active Delivery"
                : available
                ? "You are Online & Ready for Orders"
                : "You are Currently Offline"}
            </div>
            <div className="text-muted small">
              {available
                ? "Broadcasting GPS telemetry to nearest Kisan Hubs"
                : "Go online to receive nearby delivery assignments"}
            </div>
          </div>
        </div>

        <button
          type="button"
          className={`rider-duty-toggle ${available ? "go-offline" : "go-online"}`}
          onClick={handleToggleDuty}
          disabled={toggling || rider?.availability === "BUSY"}
        >
          {available ? (
            <>
              <i className="bi bi-power" /> Go Offline
            </>
          ) : (
            <>
              <i className="bi bi-bicycle" /> Go Online & Start Work
            </>
          )}
        </button>
      </div>

      {/* ACTIVE SHIPMENT IN PROGRESS */}
      {shipment ? (
        <div className="rider-shipment-card" id="active-shipment">
          <div className="rider-shipment-header">
            <div>
              <span className="badge bg-light text-success fw-bold me-2">ACTIVE TRIP</span>
              <span className="fw-semibold">Order #{shipment.order_id?.slice(0, 8).toUpperCase()}</span>
            </div>
            <span className="badge bg-dark">
              Status: {shipment.status.replace(/_/g, " ")}
            </span>
          </div>

          <div className="rider-shipment-body">
            {/* Pickup Stop */}
            <div className="rider-stop-box">
              <div className="rider-stop-title">
                <i className="bi bi-building" /> Step 1: Pickup from Kisan Hub
              </div>
              <div className="rider-stop-addr">{shipment.hub_name}</div>
              <div className="text-muted small mb-2">{shipment.pickup_address}</div>
              {shipment.pickup_maps_url && (
                <a
                  href={shipment.pickup_maps_url}
                  target="_blank"
                  rel="noreferrer"
                  className="rider-map-link"
                >
                  <i className="bi bi-geo-alt" /> Open Hub in Google Maps
                </a>
              )}
            </div>

            {/* Destination Stop */}
            <div className="rider-stop-box">
              <div className="rider-stop-title">
                <i className="bi bi-house-door" /> Step 2: Deliver to Consumer
              </div>
              <div className="rider-stop-addr">{shipment.dropoff_address}</div>
              <a
                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                  shipment.dropoff_address
                )}`}
                target="_blank"
                rel="noreferrer"
                className="rider-map-link"
              >
                <i className="bi bi-map" /> Open Dropoff in Google Maps
              </a>
            </div>

            {/* Step Action Button */}
            {nextShipmentAction[shipment.status] && (
              <button
                type="button"
                className="rider-action-btn-large"
                disabled={busyId === shipment.id}
                onClick={() =>
                  handleUpdateShipmentStatus(nextShipmentAction[shipment.status][0])
                }
              >
                <i className={`bi ${nextShipmentAction[shipment.status][2]}`} />
                {nextShipmentAction[shipment.status][1]}
              </button>
            )}

            {/* Arrived at Customer - Collect COD & Verify Delivery OTP */}
            {shipment.status === "ARRIVED" && (
              <div className="mt-3">
                {shipment.payment_method === "COD" && shipment.payment_status !== "PAID" && (
                  <div className="alert alert-warning p-3 mb-3">
                    <div className="fw-bold mb-1">
                      <i className="bi bi-cash-stack me-1" /> Cash on Delivery (COD)
                    </div>
                    <p className="small mb-2">Please collect cash amount from customer before handing over package.</p>
                    <button
                      type="button"
                      className="btn btn-warning fw-bold w-100"
                      disabled={busyId === shipment.id}
                      onClick={handleRecordCash}
                    >
                      <i className="bi bi-check-circle-fill me-1" /> Confirm Cash Collected
                    </button>
                  </div>
                )}

                {shipment.payment_method === "COD" && shipment.payment_status === "PAID" && (
                  <div className="alert alert-success py-2 mb-3 small d-flex align-items-center gap-2">
                    <i className="bi bi-check-circle-fill text-success" />
                    <span>Cash collected & confirmed for this order.</span>
                  </div>
                )}

                {/* Handover & Delivery Confirmation */}
                <div className="card border-success p-3 text-center bg-light-subtle rounded-3 shadow-sm">
                  <div className="d-flex align-items-center justify-content-center gap-2 mb-2 text-success">
                    <i className="bi bi-box2-heart-fill fs-4" />
                    <h5 className="fw-bold mb-0">Product Handover</h5>
                  </div>
                  <p className="text-muted small mb-3">
                    Hand over the fresh package directly to the customer at doorstep. Once delivered, confirm delivery below.
                  </p>
                  <button
                    type="button"
                    className="btn btn-success fw-bold px-4 py-2 w-100 fs-6 shadow-sm"
                    disabled={busyId === shipment.id || (shipment.payment_method === "COD" && shipment.payment_status !== "PAID")}
                    onClick={handleMarkAsDeliveredClick}
                  >
                    <i className="bi bi-check2-circle me-1" /> Mark as Delivered
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : null}

      {/* AVAILABLE DELIVERY OFFERS (when no active shipment) */}
      {!shipment && (
        <section className="mt-2">
          <div className="d-flex align-items-center justify-content-between mb-3">
            <h3 className="h5 fw-bold mb-0 d-flex align-items-center gap-2">
              <RiderBikeIcon size={22} />
              Nearby Delivery Offers
            </h3>
            {available && (
              <span className="badge bg-light text-dark border">
                {offersLoading ? "Checking..." : `Live (${offers.length})`}
              </span>
            )}
          </div>

          {!available ? (
            <div className="card text-center p-4 border-dashed bg-white">
              <div className="text-muted mb-2">
                <i className="bi bi-moon-stars fs-2" />
              </div>
              <h4 className="h6 fw-bold">You are Currently Offline</h4>
              <p className="text-muted small mb-3">
                Switch your status to Online to start receiving delivery offers from nearby Kisan Hubs.
              </p>
              <button
                type="button"
                className="btn btn-success fw-bold mx-auto px-4"
                onClick={handleToggleDuty}
                disabled={toggling}
              >
                Go Online Now
              </button>
            </div>
          ) : offers.length > 0 ? (
            <div className="rider-offers-grid">
              {offers.map((offer) => (
                <div className="rider-offer-card" key={offer.id}>
                  <div>
                    <div className="rider-offer-hub">
                      <i className="bi bi-geo-alt-fill me-1" />
                      {offer.hub_name}
                    </div>
                    <div className="rider-offer-details">
                      <div>
                        <strong>Pickup:</strong> {offer.pickup_address}
                      </div>
                      <div className="mt-1">
                        <strong>Dropoff:</strong> {offer.dropoff_address}
                      </div>
                    </div>
                  </div>

                  <div>
                    <div className="rider-offer-timer">
                      <i className="bi bi-stopwatch" /> Expires at:{" "}
                      {new Date(offer.expires_at).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                        second: "2-digit",
                      })}
                    </div>
                    <div className="rider-offer-actions">
                      <button
                        type="button"
                        className="rider-offer-btn accept"
                        disabled={busyId === offer.id}
                        onClick={() => handlePerformOfferAction(offer, true)}
                      >
                        <i className="bi bi-check2-circle" /> Accept Trip
                      </button>
                      <button
                        type="button"
                        className="rider-offer-btn decline"
                        disabled={busyId === offer.id}
                        onClick={() => handlePerformOfferAction(offer, false)}
                      >
                        Decline
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="card text-center p-4 bg-white border">
              <div className="text-success mb-2">
                <span className="spinner-grow spinner-grow-sm me-2" role="status" aria-hidden="true" />
                <span className="fw-semibold small">Online & Scanning for New Orders</span>
              </div>
              <p className="text-muted small mb-0">
                You will hear an alert as soon as a Kisan Hub assigns a delivery offer near you.
              </p>
            </div>
          )}
        </section>
      )}

      {/* CONFIRM DELIVERY MODAL */}
      {showDeliverConfirmModal && shipment && (
        <div
          className="modal fade show d-block"
          style={{ background: "rgba(0, 0, 0, 0.55)", zIndex: 1060 }}
          role="dialog"
          aria-modal="true"
        >
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content border-0 shadow-lg rounded-3">
              <div className="modal-header border-0 pb-0">
                <h5 className="modal-title fw-bold text-success d-flex align-items-center gap-2">
                  <i className="bi bi-check2-circle fs-4" /> Confirm Order Delivery
                </h5>
                <button
                  type="button"
                  className="btn-close"
                  aria-label="Close"
                  disabled={busyId === shipment.id}
                  onClick={() => setShowDeliverConfirmModal(false)}
                />
              </div>
              <div className="modal-body py-3">
                <p className="mb-2">
                  Are you sure you want to mark this order as <strong>Delivered</strong>?
                </p>
                <div className="alert alert-light border small text-muted mb-0">
                  <div><strong>Order:</strong> #{shipment.order_id?.slice(0, 8).toUpperCase()}</div>
                  <div><strong>Customer Destination:</strong> {shipment.dropoff_address}</div>
                  <div className="text-success mt-1">
                    <i className="bi bi-info-circle me-1" />
                    Please ensure the customer has received the package.
                  </div>
                </div>
              </div>
              <div className="modal-footer border-0 pt-0 d-flex justify-content-end gap-2">
                <button
                  type="button"
                  className="btn btn-outline-secondary px-3"
                  disabled={busyId === shipment.id}
                  onClick={() => setShowDeliverConfirmModal(false)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn-success fw-bold px-4"
                  disabled={busyId === shipment.id}
                  onClick={handleConfirmDelivery}
                >
                  {busyId === shipment.id ? (
                    <>
                      <span className="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true" />
                      Marking as Delivered...
                    </>
                  ) : (
                    <>
                      <i className="bi bi-check2-circle me-1" /> Yes, Mark as Delivered
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* History quick link */}
      <div className="mt-4 text-center">
        <Link to="/rider/history" className="text-decoration-none fw-semibold text-success small">
          <i className="bi bi-clock-history me-1" /> View Completed Delivery History →
        </Link>
      </div>
    </div>
  );
}
