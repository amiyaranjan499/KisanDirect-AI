import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  createFarmerStockDelivery,
  listFarmerHubOptions,
  listFarmerStockDeliveries,
  listMyFarmerListings,
} from "../services/api";
import { useI18n } from "../i18n";

export default function FarmerHubSupply() {
  const navigate = useNavigate();
  const { t } = useI18n();
  const [listings, setListings] = useState([]);
  const [hubs, setHubs] = useState([]);
  const [stockDeliveries, setStockDeliveries] = useState([]);
  const [selectedListing, setSelectedListing] = useState("");
  const [selectedHub, setSelectedHub] = useState("");
  const [deliveryQuantity, setDeliveryQuantity] = useState("");
  const [loading, setLoading] = useState(true);
  const [deliveryBusy, setDeliveryBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const load = async () => {
    try {
      setLoading(true);
      setError("");
      const [farmerListings, hubOptions, deliveries] = await Promise.all([
        listMyFarmerListings(),
        listFarmerHubOptions(),
        listFarmerStockDeliveries(),
      ]);

      const availableListings = Array.isArray(farmerListings)
        ? farmerListings.filter((listing) => listing.availability_status === "AVAILABLE")
        : [];
      const hubList = Array.isArray(hubOptions) ? hubOptions : [];
      const deliveryList = Array.isArray(deliveries) ? deliveries : [];

      setListings(availableListings);
      setHubs(hubList);
      setStockDeliveries(deliveryList);

      setSelectedListing((current) =>
        availableListings.some((listing) => listing.id === current)
          ? current
          : availableListings[0]?.id || ""
      );
      setSelectedHub((current) =>
        hubList.some((hub) => hub.id === current)
          ? current
          : hubList[0]?.id || ""
      );
    } catch (err) {
      setError(err.message || "Unable to load hub supply options.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const submitStockDelivery = async (event) => {
    event.preventDefault();
    try {
      setDeliveryBusy(true);
      setError("");
      setSuccess("");
      await createFarmerStockDelivery({
        listing_id: selectedListing,
        hub_id: selectedHub,
        quantity: deliveryQuantity,
      });
      setSuccess("Delivery submitted successfully. Awaiting hub staff receipt confirmation.");
      setDeliveryQuantity("");
      await load();
    } catch (err) {
      setError(err.message || t("hubOperations.farmer.submitError"));
    } finally {
      setDeliveryBusy(false);
    }
  };

  return (
    <section className="farmer-dashboard-view hub-supply-page" style={{ maxWidth: "860px", margin: "0 auto", padding: "16px" }}>
      {/* Header */}
      <div style={{ marginBottom: "20px" }}>
        <button
          type="button"
          onClick={() => navigate("/farmer/orders")}
          style={{
            background: "none",
            border: "none",
            color: "var(--forest, #1B6B34)",
            fontSize: "13px",
            fontWeight: 600,
            cursor: "pointer",
            padding: 0,
            marginBottom: "8px",
            display: "inline-flex",
            alignItems: "center",
            gap: "4px"
          }}
        >
          ← Back to Orders
        </button>
        <span className="eyebrow" style={{ display: "block", fontSize: "11px", fontWeight: 700, color: "var(--clay, #79705F)", textTransform: "uppercase" }}>
          {t("hubOperations.farmer.sectionEyebrow")}
        </span>
        <h1 style={{ fontFamily: "'Fraunces', Georgia, serif", color: "var(--forest, #1B6B34)", fontSize: "24px", fontWeight: 700, margin: "4px 0 6px" }}>
          {t("hubOperations.farmer.title")}
        </h1>
        <p style={{ color: "var(--clay, #79705F)", fontSize: "13.5px", margin: 0 }}>
          {t("hubOperations.farmer.description")}
        </p>
      </div>

      {error && <div className="error" style={{ marginBottom: "16px" }}>{error}</div>}
      {success && <div className="success" style={{ marginBottom: "16px" }}>{success}</div>}

      {/* 1. Delivery Submission Section */}
      <div
        className="card card-pad"
        style={{
          background: "var(--paper, #FFFFFF)",
          border: "1px solid var(--line, #E4DFD1)",
          borderRadius: "14px",
          padding: "20px",
          marginBottom: "32px",
          boxShadow: "0 1px 3px rgba(0,0,0,0.03)"
        }}
      >
        <h2 style={{ fontSize: "16px", fontWeight: 700, color: "var(--ink, #1C1C16)", marginBottom: "14px" }}>
          New Hub Delivery
        </h2>

        {loading ? (
          <div className="loading" style={{ padding: "20px", textAlign: "center" }}>
            <div className="spinner-border spinner-border-sm me-2" role="status" />
            {t("hubOperations.farmer.loadingSupply")}
          </div>
        ) : !listings.length ? (
          <div className="empty" style={{ padding: "20px", textAlign: "center" }}>
            <p style={{ margin: "0 0 12px", color: "var(--clay, #79705F)" }}>{t("hubOperations.farmer.noListings")}</p>
            <button
              type="button"
              className="btn btn-sm btn-primary"
              style={{ background: "var(--forest, #1B6B34)", border: "none" }}
              onClick={() => navigate("/farmer/crops/new")}
            >
              Add Crop Listing
            </button>
          </div>
        ) : !hubs.length ? (
          <div className="empty" style={{ padding: "28px 20px", textAlign: "center" }}>
            <p style={{ margin: "0 0 14px", color: "var(--clay, #79705F)", fontSize: "14px" }}>
              {t("hubOperations.farmer.noHubs")}
            </p>
            <button
              type="button"
              className="btn btn-sm btn-outline-success"
              style={{ borderRadius: "8px", fontWeight: 600, padding: "6px 14px" }}
              onClick={load}
              disabled={loading}
            >
              <i className="bi bi-arrow-clockwise me-1" /> Check Again / Refresh Hubs
            </button>
          </div>
        ) : (
          <form className="row g-3 align-items-end" onSubmit={submitStockDelivery}>
            <div className="col-12 col-md-5">
              <label className="form-label" htmlFor="hub-stock-listing" style={{ fontSize: "12.5px", fontWeight: 600 }}>
                {t("hubOperations.farmer.listing")}
              </label>
              <select
                id="hub-stock-listing"
                className="form-select"
                value={selectedListing}
                onChange={(e) => setSelectedListing(e.target.value)}
                required
              >
                {listings.map((listing) => (
                  <option key={listing.id} value={listing.id}>
                    {listing.crop_name} · {listing.quantity} {listing.unit}
                  </option>
                ))}
              </select>
            </div>

            <div className="col-12 col-md-4">
              <label className="form-label" htmlFor="hub-stock-hub" style={{ fontSize: "12.5px", fontWeight: 600 }}>
                {t("hubOperations.farmer.hub")}
              </label>
              <select
                id="hub-stock-hub"
                className="form-select"
                value={selectedHub}
                onChange={(e) => setSelectedHub(e.target.value)}
                required
              >
                {hubs.map((hub) => (
                  <option key={hub.id} value={hub.id}>
                    {hub.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="col-8 col-md-3">
              <label className="form-label" htmlFor="hub-stock-quantity" style={{ fontSize: "12.5px", fontWeight: 600 }}>
                {t("hubOperations.farmer.quantity")}
              </label>
              <input
                id="hub-stock-quantity"
                className="form-control"
                type="number"
                min="0.001"
                step="0.001"
                value={deliveryQuantity}
                onChange={(e) => setDeliveryQuantity(e.target.value)}
                placeholder="e.g. 50"
                required
              />
            </div>

            <div className="col-12 text-end mt-3">
              <button
                className="btn btn-primary"
                type="submit"
                disabled={deliveryBusy || !selectedListing || !selectedHub}
                style={{
                  background: "var(--forest, #1B6B34)",
                  border: "none",
                  fontWeight: 600,
                  padding: "8px 20px",
                  borderRadius: "8px"
                }}
              >
                {deliveryBusy ? t("hubOperations.farmer.submitting") : t("hubOperations.farmer.submit")}
              </button>
            </div>
          </form>
        )}
      </div>

      {/* 2. Separate Delivery History Table Section */}
      <div style={{ marginTop: "16px" }}>
        <h2 style={{ fontSize: "16px", fontWeight: 700, color: "var(--forest, #1B6B34)", marginBottom: "14px" }}>
          Submitted Hub Deliveries
        </h2>

        <div
          className="card"
          style={{
            background: "#FFFFFF",
            border: "1px solid var(--line, #E4DFD1)",
            borderRadius: "14px",
            overflow: "hidden",
            boxShadow: "0 1px 3px rgba(0,0,0,0.03)"
          }}
        >
          <div style={{ width: "100%", overflowX: "auto" }}>
            <table className="farmer-order-table" style={{ width: "100%", minWidth: "500px", margin: 0 }}>
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
                    <td><b>{delivery.crop_name}</b></td>
                    <td>{delivery.hub_name}</td>
                    <td>{delivery.quantity} {delivery.unit}</td>
                    <td>
                      <span
                        className={`farmer-status-pill ${
                          delivery.status === "RECEIVED" ? "success" : "warning"
                        }`}
                      >
                        {delivery.status === "RECEIVED"
                          ? t("hubOperations.farmer.received")
                          : t("hubOperations.farmer.pending")}
                      </span>
                    </td>
                  </tr>
                ))}
                {!stockDeliveries.length && (
                  <tr>
                    <td colSpan="4" style={{ textAlign: "center", color: "var(--clay, #79705F)", padding: "24px" }}>
                      {t("hubOperations.farmer.noDeliveries")}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  );
}

