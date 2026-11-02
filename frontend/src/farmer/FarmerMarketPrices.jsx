import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getFarmerDashboardAISummary, listFarmerDashboardListings } from "../services/api";

const formatMoney = (val) =>
  val != null && !isNaN(Number(val)) ? `₹${Number(val).toFixed(0)}` : "—";

export default function FarmerMarketPrices({ onBack }) {
  const navigate = useNavigate();
  const [listings, setListings] = useState([]);
  const [aiSummary, setAiSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let isMounted = true;
    setLoading(true);
    setError("");

    Promise.all([listFarmerDashboardListings(), getFarmerDashboardAISummary()])
      .then(([listingsData, summaryData]) => {
        if (!isMounted) return;
        setListings(Array.isArray(listingsData) ? listingsData : []);
        setAiSummary(summaryData);
      })
      .catch((err) => {
        if (!isMounted) return;
        setError(err.message || "Unable to load AI fair prices.");
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, []);

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
          <h2 style={{ fontFamily: "var(--font-display, 'Fraunces', Georgia, serif)", color: "var(--forest, #1B6B34)", margin: 0, fontWeight: 700, fontSize: "24px" }}>
            AI Fair Price — Regional Hub Reference
          </h2>
          <p style={{ margin: "4px 0 0", fontSize: "13px", color: "var(--clay, #79705F)" }}>
            Live AI benchmark pricing based on quality and regional demand
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
        <div className="error">{error}</div>
      ) : loading ? (
        <div className="loading">
          <span className="loading-mark" /> Loading AI fair prices...
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
                  <th style={{ padding: "14px 18px", fontWeight: 700, fontSize: "12px", textTransform: "uppercase", letterSpacing: "0.04em", color: "#79705F" }}>Your Listed Price</th>
                  <th style={{ padding: "14px 18px", fontWeight: 700, fontSize: "12px", textTransform: "uppercase", letterSpacing: "0.04em", color: "#79705F" }}>AI Fair Price</th>
                  <th style={{ padding: "14px 18px", fontWeight: 700, fontSize: "12px", textTransform: "uppercase", letterSpacing: "0.04em", color: "#79705F" }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {listings.length ? (
                  listings.map((item) => {
                    const isAvailable = String(item.availability_status || "AVAILABLE").toUpperCase() === "AVAILABLE";
                    return (
                      <tr key={item.id} style={{ borderBottom: "1px solid #EFECE6", transition: "background 0.15s ease" }}>
                        <td style={{ padding: "14px 18px", verticalAlign: "middle" }}>
                          <b style={{ color: "var(--ink, #1C1C16)", textTransform: "capitalize", fontSize: "14px" }}>{item.crop_name}</b>
                        </td>
                        <td style={{ padding: "14px 18px", verticalAlign: "middle", fontWeight: 600, color: "var(--ink, #1C1C16)" }}>
                          {formatMoney(item.asking_price)} / {item.unit || "kg"}
                        </td>
                        <td style={{ padding: "14px 18px", verticalAlign: "middle", fontWeight: 600, color: item.ai_price_predicted_price ? "var(--forest, #1B6B34)" : "var(--clay, #79705F)" }}>
                          {item.ai_price_predicted_price
                            ? `${formatMoney(item.ai_price_predicted_price)} / ${item.unit || "kg"}`
                            : "Manual pricing"}
                        </td>
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
                            {item.availability_status || "AVAILABLE"}
                          </span>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={4} style={{ textAlign: "center", padding: "32px 20px", color: "var(--clay, #79705F)" }}>
                      No crop listings found. Add a new crop to see market and AI fair price comparisons.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div
            className="card card-pad"
            style={{
              backgroundColor: "#FFFFFF",
              borderRadius: "14px",
              border: "1px solid #E4DFD1",
              padding: "18px 20px",
              marginTop: "18px",
              boxShadow: "0 2px 6px rgba(0,0,0,0.02)",
            }}
          >
            <h3 style={{ fontFamily: "var(--font-display, 'Fraunces', serif)", color: "var(--forest, #1B6B34)", fontSize: "15px", marginBottom: "8px", fontWeight: 700 }}>
              Price Intelligence Note
            </h3>
            <p style={{ margin: 0, fontSize: "13.5px", color: "var(--clay, #79705F)", lineHeight: 1.6 }}>
              KisanDirect AI computes fair price guidance using real crop quality assessments, regional hub demand signals, and seasonal availability to maximize farmer earnings without intermediary commissions.
            </p>
          </div>
        </>
      )}
    </section>
  );
}
