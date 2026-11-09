import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  analyzeCropQuality,
  createQualityPrediction,
  getFarmerDashboardAISummary,
  getFarmerDashboardAnalytics,
  listFarmerDashboardOrders,
  listMyFarmerListings,
  mediaUrl,
  updateFarmerListing,
} from "../services/api";
import "./farmer-operations.css";

function CropsIcon({ size = 20, className = "" }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={{ display: "inline-block", verticalAlign: "-0.15em", flexShrink: 0 }}
      aria-hidden="true"
    >
      <path d="M12 21V9" />
      <path d="M12 9C12 9 6 9 6 3c6 0 6 6 6 6Z" />
      <path d="M12 13c0 0 6 0 6-6c-6 0-6 6-6 6Z" />
    </svg>
  );
}

const formatDate = (dateStr) => {
  if (!dateStr) return "—";
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return "—";
    return d.toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return String(dateStr);
  }
};

const resolveCropImage = (item) => {
  if (item?.images?.[0]) return mediaUrl(item.images[0]);
  return "";
};

function getCropQualityInfo(crop, assessment) {
  const rawLabel =
    assessment?.quality_label ||
    crop?.ai_quality_label ||
    crop?.quality_label ||
    crop?.quality_information ||
    crop?.quality_grade ||
    crop?.quality ||
    null;
  let quality = "Unassessed";
  if (rawLabel) {
    const l = String(rawLabel).toLowerCase().trim();
    if (l === "good" || l.includes("grade a")) quality = "Good";
    else if (l === "average" || l.includes("grade b")) quality = "Average";
    else if (l === "poor" || l.includes("grade c")) quality = "Poor";
    else if (["good", "average", "poor"].includes(l)) {
      quality = l.charAt(0).toUpperCase() + l.slice(1);
    }
  }

  const isEvaluated = quality === "Good" || quality === "Average" || quality === "Poor";

  const badgeBg =
    quality === "Good"
      ? "#E8F5E9"
      : quality === "Average"
      ? "#FFF8E1"
      : quality === "Poor"
      ? "#FFEBEE"
      : "#F5F1E6";

  const badgeColor =
    quality === "Good"
      ? "#1B6B34"
      : quality === "Average"
      ? "#B27300"
      : quality === "Poor"
      ? "#C53929"
      : "#65766E";

  return {
    isEvaluated,
    quality: isEvaluated ? quality : "Unassessed",
    badgeBg,
    badgeColor,
  };
}

const PAGE_SIZE = 5;

export default function FarmerAIAnalysis({ onBack }) {
  const [page, setPage] = useState(1);
  const [totalCrops, setTotalCrops] = useState(0);
  const [listings, setListings] = useState([]);
  const [aiData, setAiData] = useState(null);
  const [analytics, setAnalytics] = useState(null);
  const [orders, setOrders] = useState([]);
  const [loadingInitial, setLoadingInitial] = useState(true);
  const [loadingCrops, setLoadingCrops] = useState(false);
  const [evaluatingId, setEvaluatingId] = useState(null);
  const [qualityMessage, setQualityMessage] = useState(null);
  const [error, setError] = useState("");

  const handleCropClick = async (crop) => {
    const assessment = assessmentByListingId.get(String(crop.id));
    const qInfo = getCropQualityInfo(crop, assessment);

    if (qInfo.isEvaluated) {
      setQualityMessage({
        title: crop.crop_name,
        text: `Stored Quality: ${qInfo.quality}`,
        badgeBg: qInfo.badgeBg,
        badgeColor: qInfo.badgeColor,
        quality: qInfo.quality,
      });
      return;
    }

    const imgUrl = resolveCropImage(crop);
    if (!imgUrl) {
      setQualityMessage({
        title: crop.crop_name,
        text: "No crop image found. Please upload a photo to evaluate visual quality.",
        quality: "Unassessed",
        badgeBg: "#F5F1E6",
        badgeColor: "#65766E",
      });
      return;
    }

    try {
      setEvaluatingId(crop.id);
      const res = await fetch(imgUrl);
      const blob = await res.blob();
      const file = new File([blob], `${crop.crop_name}.jpg`, { type: blob.type || "image/jpeg" });
      const pred = await createQualityPrediction(crop.id, file);
      if (pred && pred.quality_label) {
        const rawL = String(pred.quality_label).toLowerCase();
        let mappedQ = "Average";
        if (rawL === "good" || rawL.includes("grade a")) mappedQ = "Good";
        else if (rawL === "average" || rawL.includes("grade b")) mappedQ = "Average";
        else if (rawL === "poor" || rawL.includes("grade c")) mappedQ = "Poor";

        setAiData((prev) => ({
          ...prev,
          quality_assessments: [
            ...(prev?.quality_assessments || []).filter((a) => String(a.listing_id) !== String(crop.id)),
            pred,
          ],
        }));
        setListings((prev) =>
          prev.map((item) =>
            String(item.id) === String(crop.id)
              ? { ...item, ai_quality_label: mappedQ }
              : item
          )
        );
        setQualityMessage({
          title: crop.crop_name,
          text: `Evaluated Quality: ${mappedQ}`,
          quality: mappedQ,
          badgeBg: mappedQ === "Good" ? "#E8F5E9" : mappedQ === "Average" ? "#FFF8E1" : "#FFEBEE",
          badgeColor: mappedQ === "Good" ? "#1B6B34" : mappedQ === "Average" ? "#B27300" : "#C53929",
        });
      }
    } catch (evalErr) {
      console.warn("Quality evaluation attempt:", evalErr);
      try {
        const res = await fetch(imgUrl);
        const blob = await res.blob();
        const file = new File([blob], `${crop.crop_name}.jpg`, { type: blob.type || "image/jpeg" });
        const directPred = await analyzeCropQuality(file);
        if (directPred && directPred.quality_label) {
          const rawL = String(directPred.quality_label).toLowerCase();
          let mappedQ = "Average";
          if (rawL === "good" || rawL.includes("grade a")) mappedQ = "Good";
          else if (rawL === "average" || rawL.includes("grade b")) mappedQ = "Average";
          else if (rawL === "poor" || rawL.includes("grade c")) mappedQ = "Poor";

          await updateFarmerListing(crop.id, { quality_information: mappedQ });
          setListings((prev) =>
            prev.map((item) =>
              String(item.id) === String(crop.id)
                ? { ...item, ai_quality_label: mappedQ }
                : item
            )
          );
          setQualityMessage({
            title: crop.crop_name,
            text: `Evaluated Quality: ${mappedQ}`,
            quality: mappedQ,
            badgeBg: mappedQ === "Good" ? "#E8F5E9" : mappedQ === "Average" ? "#FFF8E1" : "#FFEBEE",
            badgeColor: mappedQ === "Good" ? "#1B6B34" : mappedQ === "Average" ? "#B27300" : "#C53929",
          });
        }
      } catch (fErr) {
        setQualityMessage({
          title: crop.crop_name,
          text: `Evaluation error: ${fErr.message || evalErr.message}`,
          quality: "Unassessed",
          badgeBg: "#F5F1E6",
          badgeColor: "#65766E",
        });
      }
    } finally {
      setEvaluatingId(null);
    }
  };

  // Load summary and telemetry data
  const loadSummaryData = async () => {
    try {
      const [summary, analyticsData, ordersData] = await Promise.all([
        getFarmerDashboardAISummary().catch(() => ({ quality_assessments: [], price_predictions: [] })),
        getFarmerDashboardAnalytics().catch(() => null),
        listFarmerDashboardOrders().catch(() => []),
      ]);
      setAiData(summary || { quality_assessments: [], price_predictions: [] });
      setAnalytics(analyticsData);
      setOrders(Array.isArray(ordersData) ? ordersData : []);
    } catch (err) {
      console.warn("Could not load summary telemetry:", err);
    }
  };

  // Load paginated crop listings (exactly 5 records per request via server-side limit and offset)
  const loadCropsPage = async (pageToLoad) => {
    try {
      setLoadingCrops(true);
      setError("");
      const res = await listMyFarmerListings({
        limit: PAGE_SIZE,
        offset: (pageToLoad - 1) * PAGE_SIZE,
        exclude_unavailable: true,
      });

      if (res && Array.isArray(res.items)) {
        setListings(res.items);
        const serverTotal = res.total != null ? res.total : res.items.length;
        setTotalCrops(serverTotal);

        // Adjust page if out of bounds after deletions
        if (serverTotal > 0 && (pageToLoad - 1) * PAGE_SIZE >= serverTotal) {
          const maxP = Math.max(1, Math.ceil(serverTotal / PAGE_SIZE));
          setPage(maxP);
        }
      } else if (Array.isArray(res)) {
        // Fallback for non-paginated mock responses
        const filtered = res.filter(
          (i) => String(i.availability_status || "AVAILABLE").toUpperCase() !== "UNAVAILABLE"
        );
        setTotalCrops(filtered.length);
        setListings(filtered.slice((pageToLoad - 1) * PAGE_SIZE, pageToLoad * PAGE_SIZE));
      }
    } catch (err) {
      setError(err.message || "Unable to load crops.");
    } finally {
      setLoadingCrops(false);
      setLoadingInitial(false);
    }
  };

  // Initial load
  useEffect(() => {
    loadSummaryData();
    loadCropsPage(1);
  }, []);

  // Page change handler triggers real server-side fetch with offset
  useEffect(() => {
    if (!loadingInitial) {
      loadCropsPage(page);
    }
  }, [page]);

  // Real-time synchronization when crops are added, edited, evaluated, marked sold, or deleted
  useEffect(() => {
    const handleCropDeleted = () => {
      loadSummaryData();
      setPage((curPage) => {
        loadCropsPage(curPage);
        return curPage;
      });
    };

    const handleCropAdded = () => {
      loadSummaryData();
      loadCropsPage(page);
    };

    const handleCropUpdated = () => {
      loadSummaryData();
      loadCropsPage(page);
    };

    window.addEventListener("farmer-crop-deleted", handleCropDeleted);
    window.addEventListener("farmer-crop-added", handleCropAdded);
    window.addEventListener("farmer-crop-updated", handleCropUpdated);

    return () => {
      window.removeEventListener("farmer-crop-deleted", handleCropDeleted);
      window.removeEventListener("farmer-crop-added", handleCropAdded);
      window.removeEventListener("farmer-crop-updated", handleCropUpdated);
    };
  }, [page]);

  // Lookup map of listing_id -> quality assessment
  const assessmentByListingId = useMemo(() => {
    const map = new Map();
    if (Array.isArray(aiData?.quality_assessments)) {
      aiData.quality_assessments.forEach((item) => {
        if (item.listing_id) {
          map.set(String(item.listing_id), item);
        }
      });
    }
    return map;
  }, [aiData]);

  // 1. Quality Trend: Real Deep Learning crop quality analysis (Good, Average, Poor counts).
  const qualityTrendStats = useMemo(() => {
    let good = 0;
    let average = 0;
    let poor = 0;

    const assessments = Array.isArray(aiData?.quality_assessments) ? aiData.quality_assessments : [];

    assessments.forEach((item) => {
      const l = String(item.quality_label || "").trim().toLowerCase();
      if (item.prediction_status === "COMPLETED" || l) {
        if (l === "good" || l.includes("grade a")) good++;
        else if (l === "average" || l.includes("grade b")) average++;
        else if (l === "poor" || l.includes("grade c")) poor++;
      }
    });

    const total = good + average + poor;
    const maxVal = Math.max(good, average, poor, 1);

    return {
      good,
      average,
      poor,
      total,
      hasData: total > 0,
      goodHeight: total > 0 && good > 0 ? Math.max(16, Math.round((good / maxVal) * 100)) : 0,
      averageHeight: total > 0 && average > 0 ? Math.max(16, Math.round((average / maxVal) * 100)) : 0,
      poorHeight: total > 0 && poor > 0 ? Math.max(16, Math.round((poor / maxVal) * 100)) : 0,
    };
  }, [aiData]);

  // 2. Demand Signal: actual consumer order demand and current active listings count
  const demandAnalysis = useMemo(() => {
    const orderCounts = analytics?.crop_wise_order_count || {};
    const cropNames = Object.keys(orderCounts);

    if (cropNames.length === 0 && orders.length === 0) {
      return {
        hasData: false,
        signals: [],
        totalOrders: 0,
        note: "No consumer order signals recorded yet in your hub zone. Active harvest listings are being monitored for local demand.",
      };
    }

    const totalOrders =
      Object.values(orderCounts).reduce((sum, c) => sum + Number(c || 0), 0) || orders.length;

    const signals = cropNames.map((crop) => {
      const count = Number(orderCounts[crop] || 0);
      const share = totalOrders > 0 ? Math.round((count / totalOrders) * 100) : 0;
      return {
        crop,
        count,
        share,
      };
    });

    return {
      hasData: true,
      signals,
      totalOrders,
      note: `${totalOrders} total customer orders analyzed across your local Kisan Hub network.`,
    };
  }, [analytics, orders]);

  // Pagination bounds
  const totalPages = Math.max(1, Math.ceil(totalCrops / PAGE_SIZE));
  const startRecord = totalCrops === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const endRecord = Math.min(totalCrops, page * PAGE_SIZE);

  return (
    <div className="farmer-dashboard-view farmer-ai-page" style={{ paddingBottom: "40px" }}>
      {/* Page Header */}
      <div className="farmer-page-header">
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
            Crop Quality AI
          </h1>
          <p style={{ color: "var(--farmer-muted, #65766e)", fontSize: "14px", margin: 0 }}>
            Visual crop quality and regional demand for your listed crops.
          </p>
        </div>
      </div>

      {error ? (
        <div className="alert alert-danger" role="alert">
          {error}
        </div>
      ) : loadingInitial ? (
        <div style={{ padding: "60px 20px", textAlign: "center" }}>
          <div className="spinner-border text-success" role="status" />
          <p style={{ marginTop: "12px", color: "var(--clay, #79705F)" }}>
            Synchronizing live crop quality telemetry...
          </p>
        </div>
      ) : (
        <>
          {/* Top Grid: 1. Quality Trend and 2. Demand Signal */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
              gap: "20px",
              marginTop: "16px",
              marginBottom: "24px",
            }}
          >
            {/* Section 1: Quality Trend - Actual Real Deep Learning Analysis */}
            <section className="kisan-card kisan-card-pad">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div
                  style={{
                    fontFamily: "var(--font-display, 'Fraunces', Georgia, serif)",
                    fontWeight: 700,
                    fontSize: "16px",
                    color: "var(--forest, #1B6B34)",
                  }}
                >
                  Quality Trend
                </div>
                {qualityTrendStats.hasData && (
                  <span className="kisan-badge kisan-badge-ok">
                    {qualityTrendStats.total} Analyzed
                  </span>
                )}
              </div>

              {qualityTrendStats.hasData ? (
                <>
                  {/* Real quality distribution graph: Good, Average, Poor counts */}
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(3, 1fr)",
                      gap: "16px",
                      marginTop: "20px",
                      alignItems: "end",
                      height: "125px",
                      paddingBottom: "8px",
                      borderBottom: "1px solid #F0ECE1",
                    }}
                  >
                    {/* 1. Good Bar */}
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        height: "100%",
                        justifyContent: "flex-end",
                      }}
                    >
                      <span
                        style={{
                          fontSize: "12px",
                          fontWeight: 700,
                          color: "var(--forest, #1B6B34)",
                          marginBottom: "4px",
                        }}
                      >
                        {qualityTrendStats.good}
                      </span>
                      <div
                        style={{
                          width: "60%",
                          maxWidth: "46px",
                          background: "linear-gradient(180deg, #4CAF50, #1B6B34)",
                          borderRadius: "6px 6px 0 0",
                          height: `${qualityTrendStats.goodHeight}%`,
                          minHeight: qualityTrendStats.good > 0 ? "14px" : "0px",
                          transition: "height 0.3s ease",
                        }}
                      />
                      <span style={{ fontSize: "12px", fontWeight: 600, color: "var(--ink, #1C1C16)", marginTop: "6px" }}>
                        Good
                      </span>
                    </div>

                    {/* 2. Average Bar */}
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        height: "100%",
                        justifyContent: "flex-end",
                      }}
                    >
                      <span
                        style={{
                          fontSize: "12px",
                          fontWeight: 700,
                          color: "#C68A3D",
                          marginBottom: "4px",
                        }}
                      >
                        {qualityTrendStats.average}
                      </span>
                      <div
                        style={{
                          width: "60%",
                          maxWidth: "46px",
                          background: "linear-gradient(180deg, #FBBF24, #C68A3D)",
                          borderRadius: "6px 6px 0 0",
                          height: `${qualityTrendStats.averageHeight}%`,
                          minHeight: qualityTrendStats.average > 0 ? "14px" : "0px",
                          transition: "height 0.3s ease",
                        }}
                      />
                      <span style={{ fontSize: "12px", fontWeight: 600, color: "var(--ink, #1C1C16)", marginTop: "6px" }}>
                        Average
                      </span>
                    </div>

                    {/* 3. Poor Bar */}
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        height: "100%",
                        justifyContent: "flex-end",
                      }}
                    >
                      <span
                        style={{
                          fontSize: "12px",
                          fontWeight: 700,
                          color: "#DC2626",
                          marginBottom: "4px",
                        }}
                      >
                        {qualityTrendStats.poor}
                      </span>
                      <div
                        style={{
                          width: "60%",
                          maxWidth: "46px",
                          background: "linear-gradient(180deg, #F87171, #DC2626)",
                          borderRadius: "6px 6px 0 0",
                          height: `${qualityTrendStats.poorHeight}%`,
                          minHeight: qualityTrendStats.poor > 0 ? "14px" : "0px",
                          transition: "height 0.3s ease",
                        }}
                      />
                      <span style={{ fontSize: "12px", fontWeight: 600, color: "var(--ink, #1C1C16)", marginTop: "6px" }}>
                        Poor
                      </span>
                    </div>
                  </div>

                  <div
                    style={{
                      fontSize: "12.5px",
                      color: "var(--clay, #79705F)",
                      marginTop: "12px",
                      lineHeight: "1.5",
                    }}
                  >
                    Quality distribution: {qualityTrendStats.good} Good, {qualityTrendStats.average} Average, and {qualityTrendStats.poor} Poor batches verified.
                  </div>
                </>
              ) : (
                <div style={{ padding: "28px 16px", textAlign: "center", color: "var(--clay, #79705F)", fontSize: "13px" }}>
                  <i className="bi bi-bar-chart" style={{ fontSize: "28px", display: "block", marginBottom: "8px", opacity: 0.5 }} />
                  <div><b>No quality assessment data yet</b></div>
                  <div style={{ marginTop: "4px", fontSize: "12px" }}>
                    No visual quality assessments recorded yet. Upload harvest photos in Add Crop to generate verified quality results.
                  </div>
                </div>
              )}
            </section>

            {/* Section 2: Demand Signal */}
            <section className="kisan-card kisan-card-pad">
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
                  <div
                    style={{
                      fontSize: "12.5px",
                      color: "var(--forest, #1B6B34)",
                      fontWeight: 600,
                      marginTop: "12px",
                    }}
                  >
                    🌿 {totalCrops} harvest crops currently listed in your local Kisan Hub network.
                  </div>
                  <div style={{ fontSize: "12px", color: "var(--clay, #79705F)", marginTop: "4px" }}>
                    {demandAnalysis.note}
                  </div>
                </div>
              ) : (
                <div style={{ padding: "28px 10px", textAlign: "center" }}>
                  <p style={{ fontSize: "13px", color: "var(--clay, #79705F)", margin: "0 0 10px" }}>
                    {demandAnalysis.note}
                  </p>
                  <div style={{ fontSize: "12.5px", color: "var(--forest, #1B6B34)", fontWeight: 600 }}>
                    🌿 {totalCrops} harvest crops currently listed and awaiting local orders.
                  </div>
                </div>
              )}
            </section>
          </div>

          {/* Section 3: My Crops & Quality Details with Server-Side Pagination */}
          <section className="kisan-card" style={{ overflow: "hidden" }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "20px 20px 14px",
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
                  Quality Details
                </h3>
                <div style={{ fontSize: "12.5px", color: "var(--clay, #79705F)", marginTop: "2px" }}>
                  Page {page} of {totalPages} ({totalCrops} total crops).
                </div>
              </div>
              <span
                className="kisan-badge"
                style={{ background: "#E1EEE2", color: "#1B6B34", fontWeight: 700 }}
              >
                {totalCrops} Total Crops
              </span>
            </div>

            {qualityMessage && (
              <div
                style={{
                  margin: "0 20px 14px",
                  padding: "10px 16px",
                  background: qualityMessage.badgeBg || "#F5F1E6",
                  border: "1px solid #E4DFD1",
                  borderRadius: "10px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  fontSize: "13px",
                  color: qualityMessage.badgeColor || "var(--ink, #1C1C16)",
                  fontWeight: 600,
                }}
              >
                <div>
                  <span style={{ fontWeight: 700 }}>{qualityMessage.title}: </span>
                  <span>{qualityMessage.text}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setQualityMessage(null)}
                  style={{ background: "none", border: "none", color: "inherit", cursor: "pointer", fontSize: "16px", padding: "0 4px" }}
                >
                  &times;
                </button>
              </div>
            )}

            {loadingCrops ? (
              <div style={{ padding: "40px 20px", textAlign: "center" }}>
                <div className="spinner-border spinner-border-sm text-success" role="status" />
                <span style={{ marginLeft: "10px", fontSize: "13px", color: "var(--clay, #79705F)" }}>
                  Loading page {page}...
                </span>
              </div>
            ) : listings.length > 0 ? (
              <>
                <div className="kisan-table-wrap" style={{ border: "none", borderRadius: 0 }}>
                  <table className="kisan-table">
                    <thead>
                      <tr>
                        <th style={{ minWidth: "220px" }}>Crop</th>
                        <th style={{ minWidth: "150px" }}>Harvest Date</th>
                        <th style={{ width: "140px" }}>Quality</th>
                      </tr>
                    </thead>
                    <tbody>
                      {listings.map((crop) => {
                        const assessment = assessmentByListingId.get(String(crop.id));
                        const q = getCropQualityInfo(crop, assessment);
                        const imgUrl = resolveCropImage(crop);
                        const isEvaluatingThis = evaluatingId === crop.id;

                        return (
                          <tr key={crop.id}>
                            <td>
                              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                                <div
                                  onClick={() => handleCropClick(crop)}
                                  title="Click image to evaluate or view quality"
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
                                    cursor: "pointer",
                                    position: "relative",
                                    flexShrink: 0,
                                  }}
                                >
                                  {imgUrl ? (
                                    <img
                                      src={imgUrl}
                                      alt={crop.crop_name}
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
                                      display: imgUrl ? "none" : "flex",
                                      alignItems: "center",
                                      justifyContent: "center",
                                      width: "100%",
                                      height: "100%",
                                      color: "var(--forest, #1B6B34)",
                                    }}
                                  >
                                    <CropsIcon size={18} />
                                  </div>
                                  {isEvaluatingThis && (
                                    <div
                                      style={{
                                        position: "absolute",
                                        inset: 0,
                                        background: "rgba(255,255,255,0.8)",
                                        display: "flex",
                                        alignItems: "center",
                                        justifyContent: "center",
                                      }}
                                    >
                                      <div className="spinner-border spinner-border-sm text-success" role="status" style={{ width: "16px", height: "16px" }} />
                                    </div>
                                  )}
                                </div>
                                <div>
                                  <div
                                    onClick={() => handleCropClick(crop)}
                                    style={{ fontWeight: 600, color: "var(--ink, #1C1C16)", fontSize: "14px", cursor: "pointer", lineHeight: 1.3 }}
                                    title="Click to evaluate or view quality"
                                  >
                                    {crop.crop_name}
                                  </div>
                                  <div style={{ fontSize: "12px", color: "var(--clay, #79705F)", marginTop: "2px" }}>
                                    {crop.crop_category || "Produce"}
                                  </div>
                                </div>
                              </div>
                            </td>
                            <td>
                              <span style={{ color: "var(--ink, #1C1C16)", fontSize: "13.5px", fontWeight: 500 }}>
                                {crop.harvest_date
                                  ? formatDate(crop.harvest_date)
                                  : crop.created_at
                                  ? formatDate(crop.created_at)
                                  : "—"}
                              </span>
                            </td>
                            <td>
                              <span
                                className="kisan-badge"
                                onClick={() => handleCropClick(crop)}
                                style={{
                                  background: q.badgeBg,
                                  color: q.badgeColor,
                                  fontWeight: 700,
                                  fontSize: "12px",
                                  padding: "4px 10px",
                                  borderRadius: "6px",
                                  cursor: "pointer",
                                }}
                                title="Click to evaluate or view quality"
                              >
                                {isEvaluatingThis ? "Evaluating..." : q.quality}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Pagination Footer matching Admin Listings design */}
                <div className="admin-pagination-bar">
                  <div className="admin-pagination-info">
                    Showing <b>{startRecord}</b> to <b>{endRecord}</b> of <b>{totalCrops}</b> records
                  </div>

                  <div className="admin-pagination-controls">
                    <button
                      type="button"
                      className="admin-page-btn"
                      disabled={page <= 1 || loadingCrops}
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      aria-label="Previous page"
                    >
                      <i className="bi bi-chevron-left" /> Previous
                    </button>

                    <span className="admin-page-indicator">
                      Page <b>{page}</b> of <b>{totalPages}</b>
                    </span>

                    <button
                      type="button"
                      className="admin-page-btn"
                      disabled={page >= totalPages || loadingCrops}
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                      aria-label="Next page"
                    >
                      Next <i className="bi bi-chevron-right" />
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <div style={{ padding: "36px 12px", textAlign: "center" }}>
                <p style={{ fontSize: "13.5px", color: "var(--clay, #79705F)", margin: "0 0 12px" }}>
                  No crops found in your inventory. Add your crops in My Crops to view quality assessments.
                </p>
                <Link to="/farmer/crops" className="kisan-btn-accent kisan-btn-sm">
                  Go to My Crops
                </Link>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
