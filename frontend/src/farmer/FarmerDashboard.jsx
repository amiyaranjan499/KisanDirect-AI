import { useEffect, useState, useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  getFarmerProfile,
  getFarmerDashboardSummary,
  listFarmerDashboardListings,
  listFarmerDashboardOrders,
  getFarmerDashboardAISummary,
} from "../services/farmerApi";
import { listFarmerStockDeliveries } from "../services/api";
import "./farmer-operations.css";

const formatMoney = (val = 0) =>
  `₹${Number(val || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;

const SvgIcon = {
  crops: (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.9">
      <path d="M12 21V9" strokeLinecap="round" />
      <path d="M12 9C12 9 6 9 6 3c6 0 6 6 6 6Z" />
      <path d="M12 13c0 0 6 0 6-6c-6 0-6 6-6 6Z" />
    </svg>
  ),
  sales: (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.9">
      <path d="M4 19V9M10 19V5M16 19v-7M22 19H2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  orders: (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.9">
      <rect x="5" y="4" width="14" height="17" rx="2" />
      <path d="M9 9h6M9 13h6M9 17h3" strokeLinecap="round" />
    </svg>
  ),
  wallet: (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.9">
      <rect x="3" y="6" width="18" height="13" rx="2" />
      <path d="M3 10h18M16 14.2h2.2" strokeLinecap="round" />
    </svg>
  ),
  plus: (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.2">
      <path d="M12 5v14M5 12h14" strokeLinecap="round" />
    </svg>
  ),
  chev: (
    <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="m9 5 7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  ai: (
    <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.9">
      <path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1" strokeLinecap="round" />
      <circle cx="12" cy="12" r="3.2" />
    </svg>
  ),
};


const DASHBOARD_CACHE_KEY = "kd_farmer_dashboard_cache";

const readDashboardCache = () => {
  try {
    const raw = sessionStorage.getItem(DASHBOARD_CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

const writeDashboardCache = (data) => {
  try {
    sessionStorage.setItem(DASHBOARD_CACHE_KEY, JSON.stringify(data));
  } catch {
    // quota exceeded or storage disabled
  }
};

export default function FarmerDashboard() {
  const navigate = useNavigate();
  const cached = useMemo(() => readDashboardCache(), []);

  const [profile, setProfile] = useState(() => cached?.profile || null);
  const [summary, setSummary] = useState(() => cached?.summary || null);
  const [listings, setListings] = useState(() => cached?.listings || []);
  const [orders, setOrders] = useState(() => cached?.orders || []);
  const [aiData, setAiData] = useState(() => cached?.aiData || null);
  const [, setHubDeliveries] = useState(() => cached?.hubDeliveries || []);
  const [loading, setLoading] = useState(!cached);
  const [error, setError] = useState("");

  const loadDashboardData = async () => {
    try {
      if (!cached && !profile) {
        setLoading(true);
      }
      setError("");

      const profilePromise = getFarmerProfile()
        .then((data) => {
          setProfile(data);
          return data;
        })
        .catch(() => null);

      const summaryPromise = getFarmerDashboardSummary()
        .then((data) => {
          setSummary(data);
          return data;
        })
        .catch(() => null);

      const listingsPromise = listFarmerDashboardListings()
        .then((data) => {
          const list = Array.isArray(data) ? data : [];
          setListings(list);
          return list;
        })
        .catch(() => []);

      const ordersPromise = listFarmerDashboardOrders()
        .then((data) => {
          const ords = Array.isArray(data) ? data : [];
          setOrders(ords);
          return ords;
        })
        .catch(() => []);

      const aiPromise = getFarmerDashboardAISummary()
        .then((data) => {
          setAiData(data);
          return data;
        })
        .catch(() => null);

      const deliveriesPromise = listFarmerStockDeliveries()
        .then((data) => {
          const dels = Array.isArray(data) ? data : [];
          setHubDeliveries(dels);
          return dels;
        })
        .catch(() => []);

      const [prof, sum, list, ords, ai, dels] = await Promise.all([
        profilePromise,
        summaryPromise,
        listingsPromise,
        ordersPromise,
        aiPromise,
        deliveriesPromise,
      ]);

      writeDashboardCache({
        profile: prof,
        summary: sum,
        listings: list,
        orders: ords,
        aiData: ai,
        hubDeliveries: dels,
      });
    } catch (err) {
      if (!cached && !profile) {
        setError(err.message || "Failed to load farmer dashboard operations data.");
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDashboardData();
  }, []);

  // Real-time synchronization when crops are added/updated anywhere in the app
  useEffect(() => {
    const handleCropAdded = (event) => {
      const newCrop = event.detail;
      if (!newCrop) return;
      setListings((prev) => {
        const next = [newCrop, ...prev.filter((i) => i.id !== newCrop.id)];
        const curCache = readDashboardCache();
        if (curCache) {
          writeDashboardCache({ ...curCache, listings: next });
        }
        return next;
      });
      setSummary((prev) => {
        if (!prev) return prev;
        const nextSummary = {
          ...prev,
          total_listings: (prev.total_listings || 0) + 1,
          active_listings: (prev.active_listings || 0) + 1,
        };
        const curCache = readDashboardCache();
        if (curCache) {
          writeDashboardCache({ ...curCache, summary: nextSummary });
        }
        return nextSummary;
      });
    };

    const handleCropUpdated = (event) => {
      const updated = event.detail;
      if (!updated) return;
      setListings((prev) => {
        const next = prev.map((i) => (i.id === updated.id ? { ...i, ...updated } : i));
        const curCache = readDashboardCache();
        if (curCache) {
          writeDashboardCache({ ...curCache, listings: next });
        }
        return next;
      });
    };

    window.addEventListener("farmer-crop-added", handleCropAdded);
    window.addEventListener("farmer-crop-updated", handleCropUpdated);
    return () => {
      window.removeEventListener("farmer-crop-added", handleCropAdded);
      window.removeEventListener("farmer-crop-updated", handleCropUpdated);
    };
  }, []);

  // Farmer first name and farm subtitle for personalized greeting from real profile
  const farmerFirstName = useMemo(() => {
    if (!profile?.name) return "Farmer";
    return profile.name.trim().split(" ")[0];
  }, [profile]);

  const farmSubtitle = useMemo(() => {
    const locParts = [
      profile?.village || profile?.city || profile?.district,
      profile?.state,
    ].filter(Boolean);
    const locString = locParts.length > 0 ? locParts.join(" · ") : "Nashik, Maharashtra";
    const farmName = profile?.name ? `${profile.name}'s Farm` : "Patil Organic Farm";
    return `${farmName} · ${locString}`;
  }, [profile]);

  // Compute metrics from REAL API data
  const metrics = useMemo(() => {
    const totalListings = summary?.total_listings ?? listings.length;
    const activeListings = listings.filter(
      (l) => (l.availability_status || "").toUpperCase() === "AVAILABLE"
    );
    const activeCount = summary?.active_listings ?? activeListings.length;
    const ordersReceivedCount = summary?.total_orders_received ?? orders.length;
    const pendingOrdersCount =
      summary?.pending_orders ??
      orders.filter((o) => (o.status || "").toUpperCase() === "PENDING").length;

    const calculatedSales = orders.reduce((acc, o) => {
      const s = (o.status || "").toUpperCase();
      if (s !== "CANCELLED") {
        return acc + Number(o.total_amount || 0);
      }
      return acc;
    }, 0);
    const totalSales = summary?.total_sales ? Number(summary.total_sales) : calculatedSales;

    return {
      totalListings,
      activeCount,
      ordersReceivedCount,
      totalSales,
      pendingOrdersCount,
    };
  }, [summary, listings, orders]);

  // Weekly sales chart computed from REAL orders telemetry
  const weeklySalesBars = useMemo(() => {
    const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    const dayTotals = { Mon: 0, Tue: 0, Wed: 0, Thu: 0, Fri: 0, Sat: 0, Sun: 0 };

    orders.forEach((ord) => {
      if (!ord.order_date) return;
      try {
        const d = new Date(ord.order_date);
        const dayName = d.toLocaleDateString("en-US", { weekday: "short" });
        if (dayTotals[dayName] !== undefined) {
          dayTotals[dayName] += Number(ord.total_amount || 0);
        }
      } catch {
        // ignore date parse errors
      }
    });

    const maxVal = Math.max(...Object.values(dayTotals), 0);
    return days.map((day) => {
      const amount = dayTotals[day];
      const heightPercent = maxVal > 0 ? Math.max(10, Math.round((amount / maxVal) * 95)) : 6;
      return { day, amount, heightPercent };
    });
  }, [orders]);

  // Real AI Crop Insights text
  const aiCropInsightText = useMemo(() => {
    if (aiData?.quality_assessments && aiData.quality_assessments.length > 0) {
      const scan = aiData.quality_assessments[0];
      const cropName = scan.crop_name || listings[0]?.crop_name || "produce";
      const quality = scan.quality_label || "Grade A";
      const conf = Math.round((scan.confidence || 0.9) * 100);
      return `Your ${cropName} listing quality verified as ${quality} (${conf}% AI confidence). Verified batches display quality assurance badges to consumers.`;
    }
    if (listings.length > 0) {
      return `Your ${listings[0].crop_name} listing is live. Upload harvest photos in Crop Quality AI to verify freshness and get an instant Grade A quality badge.`;
    }
    return "No crop quality scans performed yet. Upload harvest photos in Crop Quality AI to verify freshness and get an instant AI cosmetic grade.";
  }, [aiData, listings]);

  // Real Market Price Insights text
  const marketPriceInsightText = useMemo(() => {
    if (listings.length > 0) {
      const crop = listings[0];
      return `${crop.crop_name} is listed at ₹${crop.asking_price}/${crop.unit || "kg"}. Compare your asking rate with live APMC Mandi prices to remain competitive.`;
    }
    return "Add your harvest crop listings to compare asking prices against daily APMC Mandi modal benchmark rates.";
  }, [listings]);

  const [activeSlide, setActiveSlide] = useState(0);
  const [isPaused, setIsPaused] = useState(false);

  // Hero Carousel Slides with matching farm backgrounds and live data
  const heroSlides = useMemo(
    () => [
      {
        bg: "/assets/images/sunlight.png",
        gradient:
          "linear-gradient(90deg, rgba(7, 38, 23, 0.94) 0%, rgba(12, 58, 36, 0.82) 50%, rgba(15, 68, 42, 0.45) 100%)",
        pill: "🌱 Live Farm Operations",
        title: `Welcome back, ${farmerFirstName} 🌾`,
        subtitle: farmSubtitle,
        highlight: `Today's Snapshot: ${metrics.activeCount} active listings · ${metrics.pendingOrdersCount} new orders`,
        ctaText: "Add New Crop",
        ctaLink: "/farmer/crops/new",
        ctaIcon: SvgIcon.plus,
      },
      {
        bg: "/assets/images/image1.png",
        gradient:
          "linear-gradient(90deg, rgba(14, 45, 28, 0.94) 0%, rgba(20, 65, 40, 0.82) 52%, rgba(25, 80, 50, 0.45) 100%)",
        pill: "⚡ Fast Hub Deliveries",
        title: "Direct Kisan Hub Fulfillment",
        subtitle: "Supplying local Kisan Hubs for fast 45–90 min consumer doorstep delivery",
        highlight: `${metrics.ordersReceivedCount} total orders · ${formatMoney(metrics.totalSales)} gross sales`,
        ctaText: "View Orders",
        ctaLink: "/farmer/orders",
        ctaIcon: SvgIcon.orders,
      },
      {
        bg: "/assets/images/image2.png",
        gradient:
          "linear-gradient(90deg, rgba(20, 42, 30, 0.94) 0%, rgba(26, 60, 42, 0.82) 52%, rgba(32, 75, 52, 0.45) 100%)",
        pill: "🔬 AI Quality & Mandi Rates",
        title: "Quality Verification & Mandi Prices",
        subtitle: "Instant MobileNetV2 computer vision grading & daily APMC benchmark modal rates",
        highlight:
          listings.length > 0
            ? `Primary Crop: ${listings[0].crop_name} listed at ₹${listings[0].asking_price}/${listings[0].unit || "kg"}`
            : "Upload harvest photos for instant Grade A quality badges and consumer trust",
        ctaText: "Crop Quality AI",
        ctaLink: "/farmer/ai-insights",
        ctaIcon: SvgIcon.ai,
      },
    ],
    [farmerFirstName, farmSubtitle, metrics, listings]
  );

  useEffect(() => {
    if (isPaused || heroSlides.length <= 1) return;
    const timer = setInterval(() => {
      setActiveSlide((curr) => (curr + 1) % heroSlides.length);
    }, 5500);
    return () => clearInterval(timer);
  }, [isPaused, heroSlides.length]);

  const handlePrevSlide = (e) => {
    e.stopPropagation();
    setActiveSlide((curr) => (curr + heroSlides.length - 1) % heroSlides.length);
  };

  const handleNextSlide = (e) => {
    e.stopPropagation();
    setActiveSlide((curr) => (curr + 1) % heroSlides.length);
  };

  if (loading && !profile && !summary && listings.length === 0) {
    return (
      <div className="farmer-dashboard-view">
        {/* Skeleton Hero Banner */}
        <div
          className="farmer-skeleton-shimmer"
          style={{
            height: "180px",
            borderRadius: "14px",
            marginBottom: "24px",
            width: "100%",
          }}
        />

        {/* Skeleton Stat Cards */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
            gap: "16px",
            marginBottom: "24px",
          }}
        >
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="card farmer-skeleton-card"
              style={{ padding: "18px" }}
            >
              <div
                className="farmer-skeleton-shimmer"
                style={{ height: "14px", width: "45%", marginBottom: "12px" }}
              />
              <div
                className="farmer-skeleton-shimmer"
                style={{ height: "28px", width: "60%", marginBottom: "8px" }}
              />
              <div
                className="farmer-skeleton-shimmer"
                style={{ height: "12px", width: "35%" }}
              />
            </div>
          ))}
        </div>

        {/* Skeleton Content Grid */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
            gap: "20px",
          }}
        >
          <div className="card farmer-skeleton-card" style={{ padding: "20px" }}>
            <div
              className="farmer-skeleton-shimmer"
              style={{ height: "18px", width: "50%", marginBottom: "16px" }}
            />
            <div
              className="farmer-skeleton-shimmer"
              style={{ height: "120px", width: "100%", borderRadius: "8px" }}
            />
          </div>
          <div className="card farmer-skeleton-card" style={{ padding: "20px" }}>
            <div
              className="farmer-skeleton-shimmer"
              style={{ height: "18px", width: "50%", marginBottom: "16px" }}
            />
            <div
              className="farmer-skeleton-shimmer"
              style={{ height: "120px", width: "100%", borderRadius: "8px" }}
            />
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="farmer-dashboard-view">
        <div className="alert alert-danger" role="alert">
          <h4 className="alert-heading">Dashboard Sync Error</h4>
          <p>{error}</p>
          <hr />
          <button type="button" className="btn btn-outline-danger btn-sm" onClick={loadDashboardData}>
            Try Reconnecting
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="farmer-dashboard-view">
      {/* 1. Hero Carousel Banner with all text inside the image */}
      <div
        className="kisan-hero-carousel"
        onMouseEnter={() => setIsPaused(true)}
        onMouseLeave={() => setIsPaused(false)}
        role="region"
        aria-label="Farmer Overview Banners"
      >
        {heroSlides.map((slide, idx) => (
          <div
            key={slide.pill}
            className={`kisan-hero-slide ${idx === activeSlide ? "active" : ""}`}
          >
            <img src={slide.bg} alt="" className="kisan-hero-img" />
            <div
              className="kisan-hero-gradient"
              style={{ background: slide.gradient }}
            />
            <div className="kisan-hero-content">
              <div className="kisan-hero-left" style={{ flex: 1, minWidth: 0 }}>
                <div className="kisan-hero-pill">{slide.pill}</div>
                <h2 className="kisan-hero-title">{slide.title}</h2>
                <div className="kisan-hero-subtitle">{slide.subtitle}</div>
                <div className="kisan-hero-highlight">{slide.highlight}</div>
              </div>
              <div className="kisan-hero-right" style={{ flexShrink: 0 }}>
                <Link
                  to={slide.ctaLink}
                  className="kisan-hero-cta"
                  style={{ width: "auto", maxWidth: "fit-content", flexShrink: 0 }}
                >
                  {slide.ctaIcon} {slide.ctaText}
                </Link>
              </div>
            </div>
          </div>
        ))}

        <button
          type="button"
          className="kisan-hero-arrow prev"
          onClick={handlePrevSlide}
          aria-label="Previous banner"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <button
          type="button"
          className="kisan-hero-arrow next"
          onClick={handleNextSlide}
          aria-label="Next banner"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M9 18l6-6-6-6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>

        <div className="kisan-hero-indicators">
          {heroSlides.map((slide, idx) => (
            <button
              key={slide.pill}
              type="button"
              className={`kisan-hero-dot ${idx === activeSlide ? "active" : ""}`}
              onClick={(e) => {
                e.stopPropagation();
                setActiveSlide(idx);
              }}
              aria-label={`Slide ${idx + 1}`}
            />
          ))}
        </div>
      </div>

      {/* 3. Stat Grid matching kisan-design-reference.html */}
      <div className="kisan-stat-grid">
        {/* Card 1: Total Listings */}
        <div className="kisan-card kisan-card-pad">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: "12px", color: "var(--clay, #79705F)", fontWeight: 600 }}>Total Listings</span>
            <span style={{ color: "var(--sage, #4CAF50)" }}>{SvgIcon.crops}</span>
          </div>
          <div
            style={{
              fontFamily: "var(--font-display, 'Fraunces', Georgia, serif)",
              fontSize: "24px",
              fontWeight: 600,
              marginTop: "6px",
              color: "var(--ink, #1C1C16)",
            }}
          >
            {metrics.totalListings}
          </div>
          <div style={{ fontSize: "11.5px", color: "var(--clay, #79705F)" }}>crops</div>
        </div>

        {/* Card 2: Active Listings */}
        <div className="kisan-card kisan-card-pad">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: "12px", color: "var(--clay, #79705F)", fontWeight: 600 }}>Active Listings</span>
            <span style={{ color: "var(--sage, #4CAF50)" }}>{SvgIcon.sales}</span>
          </div>
          <div
            style={{
              fontFamily: "var(--font-display, 'Fraunces', Georgia, serif)",
              fontSize: "24px",
              fontWeight: 600,
              marginTop: "6px",
              color: "var(--ink, #1C1C16)",
            }}
          >
            {metrics.activeCount}
          </div>
          <div style={{ fontSize: "11.5px", color: "var(--clay, #79705F)" }}>currently live</div>
        </div>

        {/* Card 3: Orders Received */}
        <div className="kisan-card kisan-card-pad">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: "12px", color: "var(--clay, #79705F)", fontWeight: 600 }}>Orders Received</span>
            <span style={{ color: "var(--sage, #4CAF50)" }}>{SvgIcon.orders}</span>
          </div>
          <div
            style={{
              fontFamily: "var(--font-display, 'Fraunces', Georgia, serif)",
              fontSize: "24px",
              fontWeight: 600,
              marginTop: "6px",
              color: "var(--ink, #1C1C16)",
            }}
          >
            {metrics.ordersReceivedCount}
          </div>
          <div style={{ fontSize: "11.5px", color: "var(--clay, #79705F)" }}>all time</div>
        </div>

        {/* Card 4: Gross Sales */}
        <div className="kisan-card kisan-card-pad">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: "12px", color: "var(--clay, #79705F)", fontWeight: 600 }}>Gross Sales</span>
            <span style={{ color: "var(--sage, #4CAF50)" }}>{SvgIcon.wallet}</span>
          </div>
          <div
            style={{
              fontFamily: "var(--font-display, 'Fraunces', Georgia, serif)",
              fontSize: "24px",
              fontWeight: 600,
              marginTop: "6px",
              color: "var(--ink, #1C1C16)",
            }}
          >
            {formatMoney(metrics.totalSales)}
          </div>
          <div className="d-flex justify-content-between align-items-center mt-1">
            <span style={{ fontSize: "11.5px", color: "var(--clay, #79705F)" }}>all time</span>
            <Link to="/farmer/wallet" style={{ fontSize: "11.5px", color: "var(--forest, #1B6B34)", fontWeight: 600, textDecoration: "none" }}>
              My Wallet →
            </Link>
          </div>
        </div>
      </div>

      {/* 4. Recent Orders Section matching kisan-design-reference.html */}
      <div className="kisan-section-title">
        <h2>Recent Orders</h2>
        <Link to="/farmer/orders" className="kisan-link-more">
          View all {SvgIcon.chev}
        </Link>
      </div>
      <div className="kisan-table-wrap">
        <table className="kisan-table">
          <thead>
            <tr>
              <th>Order</th>
              <th>Consumer</th>
              <th>Crop</th>
              <th>Amount</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {orders.length === 0 ? (
              <tr>
                <td
                  colSpan="5"
                  style={{
                    textAlign: "center",
                    padding: "32px 14px",
                    color: "var(--clay, #79705F)",
                  }}
                >
                  No customer orders received yet. Active crop listings are ready for local consumer orders.
                </td>
              </tr>
            ) : (
              orders.slice(0, 5).map((o) => {
                const s = (o.status || "").toUpperCase();
                let badgeClass = "kisan-badge-ok";
                let displayStatus = "Delivered";

                if (s === "PENDING") {
                  badgeClass = "kisan-badge-sage";
                  displayStatus = "New";
                } else if (s === "CONFIRMED") {
                  badgeClass = "kisan-badge-sage";
                  displayStatus = "Accepted";
                } else if (s === "PROCESSING") {
                  badgeClass = "kisan-badge-warn";
                  displayStatus = "Preparing";
                } else if (s === "READY_FOR_PICKUP" || s === "READY") {
                  badgeClass = "kisan-badge-warn";
                  displayStatus = "Ready";
                } else if (s === "DELIVERED" || s === "COMPLETED") {
                  badgeClass = "kisan-badge-ok";
                  displayStatus = "Delivered";
                } else if (s === "CANCELLED") {
                  badgeClass = "kisan-badge-danger";
                  displayStatus = "Cancelled";
                }

                const orderNum = String(o.id).replace(/-/g, "").slice(0, 4).toUpperCase();
                const cropName = o.items?.[0]?.crop_name || "Farm Produce";

                return (
                  <tr
                    key={o.id}
                    style={{ cursor: "pointer" }}
                    onClick={() => navigate(`/farmer/orders?order=${o.id}`)}
                  >
                    <td>
                      <b>ORD-{orderNum}</b>
                    </td>
                    <td>{o.consumer_name || "Direct Customer"}</td>
                    <td>{cropName}</td>
                    <td>{formatMoney(o.total_amount)}</td>
                    <td>
                      <span className={`kisan-badge ${badgeClass}`}>{displayStatus}</span>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* 5. Bottom Two-Column Grid matching kisan-design-reference.html */}
      <div className="kisan-bottom-grid">
        {/* Sales Overview Card */}
        <div className="kisan-card kisan-card-pad">
          <h3
            style={{
              fontSize: "15px",
              marginBottom: "12px",
              fontFamily: "var(--font-display, 'Fraunces', Georgia, serif)",
              color: "var(--forest, #1B6B34)",
            }}
          >
            Sales Overview
          </h3>
          <div style={{ display: "flex", alignItems: "flex-end", gap: "10px", height: "140px" }}>
            {weeklySalesBars.map((bar) => (
              <div
                key={bar.day}
                style={{
                  flex: 1,
                  background: "linear-gradient(180deg, var(--sage, #4CAF50), var(--forest, #1B6B34))",
                  borderRadius: "6px 6px 0 0",
                  height: `${bar.heightPercent}%`,
                  minHeight: "8px",
                  transition: "height 0.3s ease",
                }}
                title={`${bar.day}: ${formatMoney(bar.amount)}`}
              />
            ))}
          </div>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              fontSize: "11px",
              color: "var(--clay, #79705F)",
              marginTop: "8px",
              fontFamily: "var(--font-body, 'Work Sans', 'DM Sans', sans-serif)",
            }}
          >
            {weeklySalesBars.map((bar) => (
              <span key={bar.day}>{bar.day}</span>
            ))}
          </div>
        </div>

        {/* AI Crop Insights & Market Price Insights Card */}
        <div className="kisan-card kisan-card-pad">
          {/* Top section: AI Crop Insights */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              fontWeight: 700,
              fontSize: "14px",
              color: "var(--forest, #1B6B34)",
            }}
          >
            {SvgIcon.ai} AI Crop Insights
          </div>
          <p
            style={{
              fontSize: "12.5px",
              color: "var(--clay, #79705F)",
              marginTop: "8px",
              lineHeight: 1.5,
              fontFamily: "var(--font-body, 'Work Sans', 'DM Sans', sans-serif)",
            }}
          >
            {aiCropInsightText}
          </p>
          <Link to="/farmer/ai-insights" className="kisan-btn-outline kisan-btn-sm" style={{ marginTop: "10px" }}>
            View full insights
          </Link>

          <div className="kisan-hairline" style={{ margin: "14px 0" }} />

          {/* Bottom section: Market Price Insights */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              fontWeight: 700,
              fontSize: "14px",
              color: "var(--forest, #1B6B34)",
            }}
          >
            {SvgIcon.wallet} AI Fair Price Insights
          </div>
          <p
            style={{
              fontSize: "12.5px",
              color: "var(--clay, #79705F)",
              marginTop: "8px",
              lineHeight: 1.5,
              fontFamily: "var(--font-body, 'Work Sans', 'DM Sans', sans-serif)",
            }}
          >
            {marketPriceInsightText}
          </p>
          <Link to="/farmer/prices" className="kisan-btn-outline kisan-btn-sm" style={{ marginTop: "10px" }}>
            View AI fair prices
          </Link>
        </div>
      </div>
    </div>
  );
}
