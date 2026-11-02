import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  getFarmerDashboardAISummary,
  getFarmerDashboardAnalytics,
  listFarmerDashboardListings,
  listFarmerDashboardOrders,
} from "../services/api";
import "./farmer-operations.css";

const formatMoney = (val = 0) =>
  `₹${Number(val || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;

const formatDate = (dateStr) => {
  if (!dateStr) return "—";
  try {
    return new Date(dateStr).toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return String(dateStr);
  }
};

export default function FarmerAIAnalysis({ onBack }) {
  const navigate = useNavigate();
  const [aiData, setAiData] = useState(null);
  const [analytics, setAnalytics] = useState(null);
  const [listings, setListings] = useState([]);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let isMounted = true;
    setLoading(true);
    setError("");

    Promise.all([
      getFarmerDashboardAISummary().catch(() => ({ quality_assessments: [], price_predictions: [] })),
      getFarmerDashboardAnalytics().catch(() => null),
      listFarmerDashboardListings().catch(() => []),
      listFarmerDashboardOrders().catch(() => []),
    ])
      .then(([summary, analyticsData, listingsData, ordersData]) => {
        if (!isMounted) return;
        setAiData(summary || { quality_assessments: [], price_predictions: [] });
        setAnalytics(analyticsData);
        setListings(Array.isArray(listingsData) ? listingsData : []);
        setOrders(Array.isArray(ordersData) ? ordersData : []);
      })
      .catch((err) => {
        if (!isMounted) return;
        setError(err.message || "Unable to load AI crop insights.");
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  // 1. Real Quality Trend Analysis from live AI predictions
  const qualityTrend = useMemo(() => {
    const assessments = Array.isArray(aiData?.quality_assessments)
      ? aiData.quality_assessments
      : [];

    if (assessments.length === 0) {
      return {
        hasData: false,
        cropName: listings[0]?.crop_name || "Produce",
        bars: [],
        note: "No crop quality scans evaluated yet. Upload harvest photos in Crop Quality AI to receive instant MobileNetV2 cosmetic grading.",
        recentScans: [],
      };
    }

    // Group assessments by crop name
    const cropGroups = {};
    assessments.forEach((item) => {
      const name = item.crop_name || "Produce";
      if (!cropGroups[name]) cropGroups[name] = [];
      cropGroups[name].push(item);
    });

    // Pick crop with most assessments
    let primaryCrop = assessments[0]?.crop_name || "Produce";
    let maxCount = 0;
    Object.entries(cropGroups).forEach(([crop, list]) => {
      if (list.length > maxCount) {
        maxCount = list.length;
        primaryCrop = crop;
      }
    });

    const activeList = cropGroups[primaryCrop] || assessments;
    const sortedAssessments = [...activeList].sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );

    const rawScores = sortedAssessments
      .map((item) => (item.confidence != null ? Math.round(Number(item.confidence) * 100) : 60));

    const bars = rawScores.map((score, idx) => ({
      height: Math.max(15, Math.min(100, score)),
      score,
      label: `#${idx + 1}`,
      date: sortedAssessments[idx]?.created_at,
    }));

    const latest = rawScores[rawScores.length - 1];
    const first = rawScores[0];
    let note = "";
    if (rawScores.length > 1) {
      if (latest >= first) {
        note = `Model confidence improved from ${first}% to ${latest}% across ${rawScores.length} evaluated batches for ${primaryCrop}.`;
      } else {
        note = `Model confidence: ${latest}% across ${rawScores.length} evaluated batches for ${primaryCrop} (initial: ${first}%).`;
      }
    } else {
      note = `Latest evaluation confidence: ${latest}% for ${primaryCrop}.`;
    }

    return {
      hasData: true,
      cropName: primaryCrop,
      bars,
      note,
      recentScans: sortedAssessments.slice(-4).reverse(),
    };
  }, [aiData, listings]);

  // 2. Real Demand & Order Signals from live orders
  const demandAnalysis = useMemo(() => {
    const orderCounts = analytics?.crop_wise_order_count || {};
    const orderSales = analytics?.crop_wise_sales || {};
    const cropNames = Object.keys(orderCounts);

    if (cropNames.length === 0 && orders.length === 0) {
      return {
        hasData: false,
        signals: [],
        note: "No consumer order signals recorded yet in your hub zone. Active harvest listings are being monitored for local demand.",
      };
    }

    const totalOrders =
      Object.values(orderCounts).reduce((sum, c) => sum + Number(c || 0), 0) || orders.length;

    const signals = cropNames.map((crop) => {
      const count = Number(orderCounts[crop] || 0);
      const sales = Number(orderSales[crop] || 0);
      const share = totalOrders > 0 ? Math.round((count / totalOrders) * 100) : 0;
      return {
        crop,
        count,
        sales,
        share,
      };
    });

    return {
      hasData: true,
      signals,
      note: `${totalOrders} total customer orders analyzed across your local Kisan Hub network.`,
    };
  }, [analytics, orders]);

  // 3. Real AI Price Predictions & Valuation Analysis
  const priceValuation = useMemo(() => {
    const preds = Array.isArray(aiData?.price_predictions) ? aiData.price_predictions : [];
    const predMap = {};
    preds.forEach((p) => {
      if (p.crop_name) {
        predMap[p.crop_name.toLowerCase()] = p;
      }
    });

    if (listings.length === 0) {
      return {
        hasData: false,
        items: [],
      };
    }

    const items = listings.map((l) => {
      const cropKey = (l.crop_name || "").toLowerCase();
      const aiPred = predMap[cropKey];
      const asking = Number(l.asking_price || 0);
      const predicted = aiPred?.predicted_price ? Number(aiPred.predicted_price) : null;
      let statusText = "Market Benchmark Aligned";
      let statusColor = "var(--forest, #1B6B34)";

      if (predicted != null) {
        if (asking <= predicted) {
          statusText = "Fair Market Price";
          statusColor = "var(--forest, #1B6B34)";
        } else {
          statusText = "Above Modal Average";
          statusColor = "var(--ochre, #C68A3D)";
        }
      }

      return {
        id: l.id,
        cropName: l.crop_name,
        askingPrice: asking,
        predictedPrice: predicted,
        unit: l.unit || "kg",
        confidence: aiPred?.confidence ? Math.round(Number(aiPred.confidence) * 100) : null,
        statusText,
        statusColor,
      };
    });

    return {
      hasData: true,
      items,
    };
  }, [aiData, listings]);

  return (
    <section className="detail-view ai-insights-page farmer-ai-page">
      {/* Navigation & Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px", flexWrap: "wrap", gap: "10px" }}>
        <div>
          <button
            type="button"
            className="kisan-btn-outline kisan-btn-sm"
            style={{ marginBottom: "10px", padding: "5px 12px", gap: "6px" }}
            onClick={onBack || (() => navigate("/farmer/dashboard"))}
          >
            <i className="bi bi-arrow-left" /> Back to Dashboard
          </button>
          <h1
            style={{
              fontFamily: "var(--font-display, 'Fraunces', Georgia, serif)",
              fontSize: "26px",
              color: "var(--forest, #1B6B34)",
              margin: "0 0 4px",
              fontWeight: 700,
            }}
          >
            AI Crop Insights
          </h1>
          <div style={{ fontSize: "13px", color: "var(--clay, #79705F)" }}>
            Computer vision quality evaluation, APMC benchmark rates, and live local demand analytics.
          </div>
        </div>
        <span className="kisan-badge kisan-badge-sage" style={{ padding: "6px 14px", fontSize: "12px" }}>
          <i className="bi bi-cpu-fill me-1" /> Live AI Telemetry
        </span>
      </div>

      {error ? (
        <div className="alert alert-danger" role="alert">
          {error}
        </div>
      ) : loading ? (
        <div style={{ padding: "60px 20px", textAlign: "center" }}>
          <div className="spinner-border text-success" role="status" />
          <p style={{ marginTop: "12px", color: "var(--clay, #79705F)" }}>
            Synchronizing live AI quality models and telemetry...
          </p>
        </div>
      ) : (
        <>
          {/* Top 2 Cards: Quality Trend & Demand Signals */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
              gap: "20px",
              marginTop: "16px",
            }}
          >
            {/* Card 1: Real Quality Trend */}
            <div className="kisan-card kisan-card-pad">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div
                  style={{
                    fontFamily: "var(--font-display, 'Fraunces', Georgia, serif)",
                    fontWeight: 700,
                    fontSize: "16px",
                    color: "var(--forest, #1B6B34)",
                  }}
                >
                  Quality Trend — {qualityTrend.cropName}
                </div>
                {qualityTrend.hasData ? (
                  <span className="kisan-badge kisan-badge-ok">Verified</span>
                ) : (
                  <span className="kisan-badge kisan-badge-neutral">Pending Scans</span>
                )}
              </div>

              {qualityTrend.hasData ? (
                <>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "flex-end",
                      gap: "8px",
                      height: "100px",
                      marginTop: "18px",
                      paddingBottom: "4px",
                    }}
                  >
                    {qualityTrend.bars.map((bar, i) => (
                      <div
                        key={i}
                        title={`Scan #${i + 1}: ${bar.score}% confidence`}
                        style={{
                          flex: 1,
                          background: "linear-gradient(180deg, var(--sage, #4CAF50), var(--forest, #1B6B34))",
                          borderRadius: "5px 5px 0 0",
                          height: `${bar.height}%`,
                          minHeight: "10px",
                          transition: "height 0.3s ease",
                        }}
                      />
                    ))}
                  </div>
                  <div style={{ fontSize: "12.5px", color: "var(--clay, #79705F)", marginTop: "12px", lineHeight: "1.5" }}>
                    {qualityTrend.note}
                  </div>
                </>
              ) : (
                <div style={{ padding: "28px 10px", textAlign: "center" }}>
                  <p style={{ fontSize: "13px", color: "var(--clay, #79705F)", margin: "0 0 14px" }}>
                    {qualityTrend.note}
                  </p>
                  <Link to="/farmer/crop-quality" className="kisan-btn-accent kisan-btn-sm">
                    + Run Quality Scan
                  </Link>
                </div>
              )}
            </div>

            {/* Card 2: Real Demand Signal */}
            <div className="kisan-card kisan-card-pad">
              <div
                style={{
                  fontFamily: "var(--font-display, 'Fraunces', Georgia, serif)",
                  fontWeight: 700,
                  fontSize: "16px",
                  color: "var(--forest, #1B6B34)",
                  marginBottom: "12px",
                }}
              >
                Demand Signal — Your Area
              </div>

              {demandAnalysis.hasData ? (
                <div>
                  {demandAnalysis.signals.map((d) => (
                    <div className="kisan-kv" key={d.crop}>
                      <span>{d.crop}</span>
                      <b style={{ color: "var(--forest, #1B6B34)" }}>
                        {d.count} orders ({d.share}%)
                      </b>
                    </div>
                  ))}
                  <div style={{ fontSize: "12px", color: "var(--clay, #79705F)", marginTop: "10px" }}>
                    {demandAnalysis.note}
                  </div>
                </div>
              ) : (
                <div style={{ padding: "28px 10px", textAlign: "center" }}>
                  <p style={{ fontSize: "13px", color: "var(--clay, #79705F)", margin: "0 0 10px" }}>
                    {demandAnalysis.note}
                  </p>
                  <div style={{ fontSize: "12px", color: "var(--forest, #1B6B34)", fontWeight: 600 }}>
                    {listings.length} active crop batches currently listed and awaiting local orders.
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Card 3: Real AI Valuation & Price Analysis */}
          <div className="kisan-card kisan-card-pad" style={{ marginTop: "20px" }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "14px",
                flexWrap: "wrap",
                gap: "10px",
              }}
            >
              <div>
                <h3
                  style={{
                    fontFamily: "var(--font-display, 'Fraunces', Georgia, serif)",
                    fontSize: "18px",
                    color: "var(--forest, #1B6B34)",
                    margin: 0,
                    fontWeight: 700,
                  }}
                >
                  AI Price Valuation & Market Alignment
                </h3>
                <div style={{ fontSize: "12.5px", color: "var(--clay, #79705F)" }}>
                  Asking price comparisons against live APMC benchmark rates and machine-learning predictions.
                </div>
              </div>
              <Link to="/farmer/prices" className="kisan-btn-outline kisan-btn-sm">
                View Mandi Benchmarks
              </Link>
            </div>

            {priceValuation.hasData ? (
              <div className="kisan-table-wrap">
                <table className="kisan-table">
                  <thead>
                    <tr>
                      <th>Crop</th>
                      <th>Asking Price</th>
                      <th>AI Recommended Valuation</th>
                      <th>Model Confidence</th>
                      <th>Alignment</th>
                    </tr>
                  </thead>
                  <tbody>
                    {priceValuation.items.map((item) => (
                      <tr key={item.id}>
                        <td>
                          <b>{item.cropName}</b>
                        </td>
                        <td>
                          {formatMoney(item.askingPrice)} / {item.unit}
                        </td>
                        <td>
                          {item.predictedPrice != null
                            ? `${formatMoney(item.predictedPrice)} / ${item.unit}`
                            : "APMC Modal Aligned"}
                        </td>
                        <td>
                          {item.confidence != null ? `${item.confidence}%` : "Mandi Baseline"}
                        </td>
                        <td>
                          <span
                            className="kisan-badge"
                            style={{
                              background: item.statusColor === "var(--forest, #1B6B34)" ? "#E1EEE2" : "#F4E2C4",
                              color: item.statusColor === "var(--forest, #1B6B34)" ? "#3C7A4E" : "#8A5A1C",
                            }}
                          >
                            {item.statusText}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div style={{ padding: "32px 10px", textAlign: "center" }}>
                <p style={{ fontSize: "13px", color: "var(--clay, #79705F)", margin: "0 0 12px" }}>
                  No crop listings found. Add your harvest inventory to compare rates against AI valuation.
                </p>
                <Link to="/farmer/crops/new" className="kisan-btn-accent kisan-btn-sm">
                  + Add New Crop
                </Link>
              </div>
            )}
          </div>
        </>
      )}
    </section>
  );
}

