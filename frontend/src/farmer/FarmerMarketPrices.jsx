import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  getFarmerDashboardAISummary,
  getLatestMarketPrice,
  listFarmerDashboardListings,
  mediaUrl,
  updateFarmerListing,
} from "../services/api";

function CropsIcon({ size = 20, className = "" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z" />
      <path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12" />
    </svg>
  );
}

const resolveCropImage = (item, allListings = []) => {
  if (item?.images?.[0]) return mediaUrl(item.images[0]);
  const match = allListings.find(
    (l) => l.crop_name?.toLowerCase() === item.crop_name?.toLowerCase() && l.images?.[0]
  );
  if (match?.images?.[0]) return mediaUrl(match.images[0]);
  return "";
};

const formatMoney = (val) =>
  val != null && !isNaN(Number(val)) ? `₹${Number(val).toFixed(0)}` : "—";

export default function FarmerMarketPrices({ onBack }) {
  const navigate = useNavigate();
  const [listings, setListings] = useState([]);
  const [aiSummary, setAiSummary] = useState(null);
  const [marketPrices, setMarketPrices] = useState({});
  const [marketLoading, setMarketLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  // Inline editing state for Farmer Updated Price
  const [editingId, setEditingId] = useState(null);
  const [editPrice, setEditPrice] = useState("");
  const [savingId, setSavingId] = useState(null);

  // Pagination state: 5 records per page
  const [currentPage, setCurrentPage] = useState(1);
  const PAGE_SIZE = 5;
  const totalPages = Math.max(1, Math.ceil(listings.length / PAGE_SIZE));
  const paginatedListings = listings.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const startRecord = listings.length === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1;
  const endRecord = Math.min(currentPage * PAGE_SIZE, listings.length);

  const loadData = async (silent = false) => {
    if (!silent) setLoading(true);
    setError("");
    try {
      try {
        sessionStorage.removeItem("kd_farmer_dashboard_cache");
      } catch {
        // storage disabled
      }
      const [listingsData, summaryData] = await Promise.all([
        listFarmerDashboardListings(),
        getFarmerDashboardAISummary(),
      ]);
      const validListings = (Array.isArray(listingsData) ? listingsData : []).filter(
        (item) => String(item.availability_status || "").toUpperCase() !== "UNAVAILABLE"
      );
      setListings(validListings);
      setAiSummary(summaryData);

      // Fetch real APMC market prices for each unique crop in listings
      const uniqueCropNames = Array.from(
        new Set(validListings.map((item) => String(item.crop_name || "").trim()).filter(Boolean))
      );

      if (uniqueCropNames.length > 0) {
        setMarketLoading(true);
        const prices = {};
        await Promise.all(
          uniqueCropNames.map(async (name) => {
            try {
              const res = await getLatestMarketPrice(name);
              if (res) {
                prices[name.toLowerCase()] = res;
              }
            } catch (pErr) {
              console.warn(`Could not fetch market price for ${name}:`, pErr);
            }
          })
        );
        setMarketPrices(prices);
        setMarketLoading(false);
      }
    } catch (err) {
      setError(err.message || "Unable to load market prices.");
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    loadData();

    const handleCropChange = () => {
      loadData(true);
    };

    window.addEventListener("farmer-crop-deleted", handleCropChange);
    window.addEventListener("farmer-crop-added", handleCropChange);
    window.addEventListener("farmer-crop-updated", handleCropChange);

    return () => {
      window.removeEventListener("farmer-crop-deleted", handleCropChange);
      window.removeEventListener("farmer-crop-added", handleCropChange);
      window.removeEventListener("farmer-crop-updated", handleCropChange);
    };
  }, []);

  const handleStartEdit = (item) => {
    setEditingId(item.id);
    setEditPrice(item.asking_price != null ? String(item.asking_price) : "");
    setError("");
    setSuccessMsg("");
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditPrice("");
  };

  const handleSavePrice = async (item) => {
    const parsed = parseFloat(editPrice);
    if (isNaN(parsed) || parsed < 0) {
      setError("Please enter a valid price (₹0 or greater).");
      return;
    }

    try {
      setSavingId(item.id);
      setError("");
      setSuccessMsg("");

      const updated = await updateFarmerListing(item.id, {
        asking_price: parsed,
      });

      // Update local state without overwriting AI Fair Price
      setListings((prev) =>
        prev.map((l) =>
          String(l.id) === String(item.id)
            ? { ...l, asking_price: parsed }
            : l
        )
      );

      setSuccessMsg(`Updated price for "${item.crop_name}" to ₹${parsed.toFixed(0)} / ${item.unit || "kg"}.`);
      setEditingId(null);
      setEditPrice("");

      try {
        sessionStorage.removeItem("kd_farmer_dashboard_cache");
      } catch {
        // storage disabled
      }
      window.dispatchEvent(new CustomEvent("farmer-crop-updated", { detail: updated }));
    } catch (err) {
      setError(err.message || "Failed to update asking price.");
    } finally {
      setSavingId(null);
    }
  };

  const formatMarketPriceRange = (cropName) => {
    if (!cropName) return "—";
    const info = marketPrices[cropName.toLowerCase()];
    if (!info) {
      return marketLoading ? "Checking..." : "—";
    }

    const minP = info.min_price != null ? Number(info.min_price) : null;
    const maxP = info.max_price != null ? Number(info.max_price) : null;
    const mktP = info.market_price != null ? Number(info.market_price) : null;
    const unit = info.unit || "kg";

    if (minP != null && maxP != null && minP !== maxP) {
      return `₹${Math.round(minP)} – ₹${Math.round(maxP)} / ${unit}`;
    }
    if (mktP != null) {
      return `₹${Math.round(mktP)} / ${unit}`;
    }
    if (minP != null) {
      return `₹${Math.round(minP)} / ${unit}`;
    }
    return "—";
  };

  return (
    <section className="detail-view farmer-prices-page">
      <button
        type="button"
        className="btn-ghost"
        style={{ padding: "6px 10px", marginBottom: "14px", display: "inline-flex", alignItems: "center", gap: "6px" }}
        onClick={onBack || (() => navigate(-1))}
      >
        <i className="bi bi-arrow-left" /> Back
      </button>

      <div className="section-title" style={{ marginTop: 0, marginBottom: "14px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px" }}>
        <div>
          <h1
            className="farmer-page-title"
            style={{
              fontFamily: "var(--font-display, 'Fraunces', Georgia, serif)",
              fontSize: "26px",
              fontWeight: 700,
              color: "var(--forest, #1B6B34)",
              margin: "2px 0 6px 0",
              letterSpacing: "-0.01em",
            }}
          >
            AI Fair Price &amp; Market
          </h1>
          <p style={{ margin: "4px 0 0", fontSize: "13px", color: "var(--clay, #79705F)" }}>
            Live market benchmarking and AI fair pricing for your crops
          </p>
        </div>
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "6px",
            backgroundColor: "rgba(27, 107, 52, 0.1)",
            color: "var(--forest, #1B6B34)",
            border: "1px solid rgba(27, 107, 52, 0.2)",
            borderRadius: "999px",
            padding: "5px 12px",
            fontSize: "12px",
            fontWeight: 700,
            letterSpacing: "0.03em",
          }}
        >
          <i className="bi bi-shield-check" /> REAL-TIME PRICING DATA
        </span>
      </div>

      {error ? (
        <div className="alert alert-danger py-2 px-3 mb-3 d-flex align-items-center gap-2" style={{ fontSize: "13px" }}>
          <i className="bi bi-exclamation-triangle-fill text-danger" />
          <span>{error}</span>
        </div>
      ) : null}

      {successMsg ? (
        <div className="alert alert-success py-2 px-3 mb-3 d-flex align-items-center gap-2" style={{ fontSize: "13px" }}>
          <i className="bi bi-check-circle-fill text-success" />
          <span>{successMsg}</span>
        </div>
      ) : null}

      {loading ? (
        <div className="loading">
          <span className="loading-mark" /> Loading market and AI fair prices...
        </div>
      ) : (
        <>
          <div
            className="table-wrap"
            style={{
              backgroundColor: "#FFFFFF",
              borderRadius: "14px",
              border: "1px solid #E4DFD1",
              overflow: "hidden",
              marginTop: "16px",
              boxShadow: "0 2px 8px rgba(0,0,0,0.03)",
            }}
          >
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13.5px", textAlign: "left" }}>
              <thead>
                <tr style={{ backgroundColor: "#F9F8F5", borderBottom: "1.5px solid #E4DFD1" }}>
                  <th style={{ padding: "14px 18px", fontWeight: 700, fontSize: "12px", textTransform: "uppercase", letterSpacing: "0.04em", color: "#79705F" }}>Crop</th>
                  <th style={{ padding: "14px 18px", fontWeight: 700, fontSize: "12px", textTransform: "uppercase", letterSpacing: "0.04em", color: "#79705F" }}>AI Fair Price</th>
                  <th style={{ padding: "14px 18px", fontWeight: 700, fontSize: "12px", textTransform: "uppercase", letterSpacing: "0.04em", color: "#79705F" }}>Market Price / Range</th>
                  <th style={{ padding: "14px 18px", fontWeight: 700, fontSize: "12px", textTransform: "uppercase", letterSpacing: "0.04em", color: "#79705F" }}>Farmer Updated Price</th>
                  <th style={{ padding: "14px 18px", fontWeight: 700, fontSize: "12px", textTransform: "uppercase", letterSpacing: "0.04em", color: "#79705F" }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {paginatedListings.length ? (
                  paginatedListings.map((item) => {
                    const isAvailable = String(item.availability_status || "AVAILABLE").toUpperCase() === "AVAILABLE";
                    const isEditing = editingId === item.id;
                    const isSaving = savingId === item.id;
                    const marketRange = formatMarketPriceRange(item.crop_name);
                    const cropImg = resolveCropImage(item, listings);

                    return (
                      <tr key={item.id} style={{ borderBottom: "1px solid #EFECE6", transition: "background 0.15s ease" }}>
                        {/* 1. Crop: Image thumbnail + Crop name + Category */}
                        <td style={{ padding: "14px 18px", verticalAlign: "middle" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                            <div
                              style={{
                                width: "46px",
                                height: "46px",
                                borderRadius: "8px",
                                overflow: "hidden",
                                border: "1px solid #E4DFD1",
                                background: "#FAF7EF",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                flexShrink: 0,
                              }}
                            >
                              {cropImg ? (
                                <img
                                  src={cropImg}
                                  alt={item.crop_name}
                                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                                  onError={(e) => {
                                    e.currentTarget.style.display = "none";
                                    if (e.currentTarget.nextSibling) {
                                      e.currentTarget.nextSibling.style.display = "flex";
                                    }
                                  }}
                                />
                              ) : null}
                              <div
                                style={{
                                  display: cropImg ? "none" : "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  width: "100%",
                                  height: "100%",
                                  color: "var(--forest, #1B6B34)",
                                }}
                              >
                                <CropsIcon size={18} />
                              </div>
                            </div>
                            <div>
                              <b style={{ color: "var(--ink, #1C1C16)", textTransform: "capitalize", fontSize: "14px", display: "block", lineHeight: 1.3 }}>
                                {item.crop_name}
                              </b>
                              <div style={{ fontSize: "12px", color: "var(--farmer-muted, #65766e)", marginTop: "2px" }}>
                                {item.crop_category || "Produce"}
                              </div>
                            </div>
                          </div>
                        </td>

                        {/* 2. AI Fair Price (Separate from Farmer Updated Price) */}
                        <td style={{ padding: "14px 18px", verticalAlign: "middle", fontWeight: 600, color: item.ai_price_predicted_price ? "var(--forest, #1B6B34)" : "var(--clay, #79705F)" }}>
                          {item.ai_price_predicted_price
                            ? `${formatMoney(item.ai_price_predicted_price)} / ${item.unit || "kg"}`
                            : "—"}
                        </td>

                        {/* 3. Market Price/Range */}
                        <td style={{ padding: "14px 18px", verticalAlign: "middle", color: "var(--ink, #1C1C16)", fontWeight: 500 }}>
                          {marketRange}
                        </td>

                        {/* 4. Farmer Updated Price (Editable without overwriting AI Fair Price) */}
                        <td style={{ padding: "14px 18px", verticalAlign: "middle" }}>
                          {isEditing ? (
                            <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
                              <div style={{ display: "inline-flex", alignItems: "center" }}>
                                <span style={{ marginRight: "4px", fontWeight: 600 }}>₹</span>
                                <input
                                  type="number"
                                  min="0"
                                  step="1"
                                  value={editPrice}
                                  onChange={(e) => setEditPrice(e.target.value)}
                                  style={{
                                    width: "80px",
                                    padding: "4px 8px",
                                    fontSize: "13px",
                                    borderRadius: "6px",
                                    border: "1px solid var(--farmer-border, #e0d8c8)",
                                  }}
                                  autoFocus
                                />
                              </div>
                              <button
                                type="button"
                                className="btn btn-sm btn-success"
                                onClick={() => handleSavePrice(item)}
                                disabled={isSaving}
                                style={{
                                  padding: "3px 10px",
                                  fontSize: "12px",
                                  borderRadius: "6px",
                                  fontWeight: 600,
                                }}
                              >
                                {isSaving ? "Saving..." : "Save"}
                              </button>
                              <button
                                type="button"
                                className="btn btn-sm btn-outline-secondary"
                                onClick={handleCancelEdit}
                                disabled={isSaving}
                                style={{
                                  padding: "3px 8px",
                                  fontSize: "12px",
                                  borderRadius: "6px",
                                }}
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                              <span style={{ fontWeight: 600, color: "var(--ink, #1C1C16)" }}>
                                {formatMoney(item.asking_price)} / {item.unit || "kg"}
                              </span>
                              <button
                                type="button"
                                onClick={() => handleStartEdit(item)}
                                title="Edit your updated price"
                                style={{
                                  background: "none",
                                  border: "none",
                                  cursor: "pointer",
                                  color: "var(--farmer-forest, #073a26)",
                                  padding: "2px 6px",
                                  fontSize: "13px",
                                  borderRadius: "4px",
                                }}
                              >
                                <i className="bi bi-pencil" />
                              </button>
                            </div>
                          )}
                        </td>

                        {/* 5. Status */}
                        <td style={{ padding: "14px 18px", verticalAlign: "middle" }}>
                          <span
                            style={{
                              display: "inline-block",
                              padding: "4px 10px",
                              borderRadius: "999px",
                              fontSize: "11.5px",
                              fontWeight: 700,
                              backgroundColor: isAvailable ? "rgba(27, 107, 52, 0.1)" : "rgba(121, 112, 95, 0.12)",
                              color: isAvailable ? "var(--forest, #1B6B34)" : "var(--clay, #79705F)",
                            }}
                          >
                            {isAvailable ? "Active" : "Sold"}
                          </span>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={5} style={{ textAlign: "center", padding: "32px 20px", color: "var(--clay, #79705F)" }}>
                      No crop listings found. Add a new crop to see market and AI fair price comparisons.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Clean Pagination Controls: Shown only when more than 5 records exist */}
          {totalPages > 1 && (
            <div
              className="admin-pagination-bar"
              style={{
                marginTop: "16px",
                backgroundColor: "#FFFFFF",
                borderRadius: "12px",
                border: "1px solid #E4DFD1",
                padding: "12px 18px",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                flexWrap: "wrap",
                gap: "10px",
              }}
            >
              <div style={{ fontSize: "12.5px", color: "var(--clay, #79705F)" }}>
                Showing <b>{startRecord}</b> to <b>{endRecord}</b> of <b>{listings.length}</b> records
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <button
                  type="button"
                  className="btn btn-sm btn-outline-secondary"
                  disabled={currentPage <= 1 || loading}
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  style={{
                    padding: "5px 12px",
                    fontSize: "12.5px",
                    borderRadius: "6px",
                    border: "1px solid #E4DFD1",
                    background: "#FFFFFF",
                    color: currentPage <= 1 ? "#A0988A" : "var(--forest, #1B6B34)",
                    cursor: currentPage <= 1 ? "not-allowed" : "pointer",
                    fontWeight: 600,
                  }}
                  aria-label="Previous page"
                >
                  <i className="bi bi-chevron-left" /> Previous
                </button>

                <span style={{ fontSize: "12.5px", color: "var(--ink, #1C1C16)", fontWeight: 600 }}>
                  Page <b>{currentPage}</b> of <b>{totalPages}</b>
                </span>

                <button
                  type="button"
                  className="btn btn-sm btn-outline-secondary"
                  disabled={currentPage >= totalPages || loading}
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  style={{
                    padding: "5px 12px",
                    fontSize: "12.5px",
                    borderRadius: "6px",
                    border: "1px solid #E4DFD1",
                    background: "#FFFFFF",
                    color: currentPage >= totalPages ? "#A0988A" : "var(--forest, #1B6B34)",
                    cursor: currentPage >= totalPages ? "not-allowed" : "pointer",
                    fontWeight: 600,
                  }}
                  aria-label="Next page"
                >
                  Next <i className="bi bi-chevron-right" />
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}
