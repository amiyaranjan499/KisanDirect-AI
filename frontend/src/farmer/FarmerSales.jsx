import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  getFarmerDashboardAnalytics,
  listFarmerDashboardListings,
  listFarmerDashboardOrders,
  mediaUrl,
} from "../services/api";

const formatMoney = (value) =>
  `₹${Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;

const formatOrderId = (id) => {
  if (!id) return "ORD-0000";
  const clean = String(id).replace(/-/g, "");
  return `ORD-${clean.slice(0, 4).toUpperCase()}`;
};

const formatDate = (dateString) => {
  if (!dateString) return "—";
  try {
    const d = new Date(dateString);
    return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
  } catch {
    return String(dateString);
  }
};

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export default function FarmerSales({ onBack }) {
  const [data, setData] = useState(null);
  const [orders, setOrders] = useState([]);
  const [listings, setListings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let isMounted = true;
    setLoading(true);
    setError("");

    Promise.all([
      getFarmerDashboardAnalytics(),
      listFarmerDashboardOrders(),
      listFarmerDashboardListings().catch(() => []),
    ])
      .then(([analyticsData, ordersData, listingsData]) => {
        if (!isMounted) return;
        setData(analyticsData);
        setOrders(Array.isArray(ordersData) ? ordersData : []);
        setListings(Array.isArray(listingsData) ? listingsData : []);
      })
      .catch((requestError) => {
        if (!isMounted) return;
        setError(requestError.message || "Unable to load sales data.");
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const { summary, monthlyData, topCrops, salesHistory } = useMemo(() => {
    const totalSales = Number(data?.total_sales || 0);
    const totalOrders = orders.length || Object.values(data?.orders_by_status || {}).reduce((s, v) => s + Number(v || 0), 0);
    const avgOrderValue = totalOrders > 0 ? Math.round(totalSales / totalOrders) : 0;

    // Calculate this month's earnings
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    let thisMonthEarnings = 0;
    const monthBuckets = new Array(12).fill(0);

    orders.forEach((order) => {
      const orderDate = new Date(order.order_date || order.created_at);
      const amount = Number(order.total_amount || 0);
      if (orderDate.getFullYear() === currentYear) {
        const m = orderDate.getMonth();
        monthBuckets[m] += amount;
        if (m === currentMonth) {
          thisMonthEarnings += amount;
        }
      }
    });

    // If all month buckets are 0 (e.g. no order timestamps yet), show baseline proportionate to totalSales
    const maxMonth = Math.max(...monthBuckets, 1);
    const monthlyBars = monthBuckets.map((val, idx) => {
      const percent = maxMonth > 0 && val > 0 ? Math.max(15, Math.round((val / maxMonth) * 100)) : 8;
      return {
        month: MONTH_NAMES[idx],
        amount: val,
        height: percent,
        hasSales: val > 0,
      };
    });

    // Build a lookup map of cropName (lowercase) -> real image URL from listings
    const cropImageMap = new Map();
    (listings || []).forEach((item) => {
      const cName = String(item.crop_name || "").toLowerCase().trim();
      if (cName && !cropImageMap.has(cName) && item.images && item.images.length > 0) {
        const url = mediaUrl(item.images[0]);
        if (url) cropImageMap.set(cName, url);
      }
    });

    // Top selling crops
    const cropSalesEntries = Object.entries(data?.crop_wise_sales || {});
    const sortedCrops = cropSalesEntries
      .sort(([, left], [, right]) => Number(right) - Number(left))
      .slice(0, 3)
      .map(([name, amount]) => {
        const cleanName = String(name || "").toLowerCase().trim();
        const realImg = cropImageMap.get(cleanName) || "";
        return {
          name,
          amount: Number(amount || 0),
          image: realImg,
        };
      });

    // Sales history from delivered/recent orders
    const history = orders.map((order) => {
      const cropNames = order.items?.map((it) => it.crop_name).filter(Boolean).join(", ") || "Farm Produce";
      return {
        id: formatOrderId(order.id),
        crop: cropNames,
        amount: Number(order.total_amount || 0),
        date: formatDate(order.order_date || order.created_at),
        status: order.status,
      };
    });

    return {
      summary: {
        totalEarnings: totalSales,
        thisMonth: thisMonthEarnings || (totalSales > 0 ? totalSales : 0),
        totalOrders,
        avgOrderValue,
      },
      monthlyData: monthlyBars,
      topCrops: sortedCrops,
      salesHistory: history,
    };
  }, [data, orders, listings]);

  return (
    <section className="detail-view sales-page farmer-sales-page">
      <div className="section-title d-flex justify-content-between align-items-center flex-wrap gap-2">
        <h2 style={{ fontFamily: "'Fraunces', Georgia, serif", color: "#1B6B34", margin: 0 }}>Sales &amp; Earnings</h2>
        <Link to="/farmer/wallet" className="kisan-btn-accent kisan-btn-sm">
          <i className="bi bi-wallet2 me-1" /> Withdraw to Account
        </Link>
      </div>

      {error ? (
        <div className="error">{error}</div>
      ) : loading ? (
        <div className="loading">
          <span className="loading-mark" /> Loading sales and earnings...
        </div>
      ) : (
        <>
          {/* KPI Stat Grid */}
          <div className="stat-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "14px", marginTop: "16px" }}>
            <div className="card card-pad" style={{ backgroundColor: "#FFFFFF", borderRadius: "14px", border: "1px solid #E4DFD1", padding: "16px 18px", boxShadow: "0 2px 6px rgba(0,0,0,0.02)" }}>
              <div style={{ fontSize: "12px", color: "var(--clay, #79705F)", fontWeight: 600 }}>Total Earnings</div>
              <div style={{ fontFamily: "var(--font-display, 'Fraunces', serif)", fontSize: "24px", fontWeight: 700, color: "var(--forest, #1B6B34)", marginTop: "6px" }}>
                {formatMoney(summary.totalEarnings)}
              </div>
            </div>
            <div className="card card-pad" style={{ backgroundColor: "#FFFFFF", borderRadius: "14px", border: "1px solid #E4DFD1", padding: "16px 18px", boxShadow: "0 2px 6px rgba(0,0,0,0.02)" }}>
              <div style={{ fontSize: "12px", color: "var(--clay, #79705F)", fontWeight: 600 }}>This Month</div>
              <div style={{ fontFamily: "var(--font-display, 'Fraunces', serif)", fontSize: "24px", fontWeight: 700, color: "var(--forest, #1B6B34)", marginTop: "6px" }}>
                {formatMoney(summary.thisMonth)}
              </div>
            </div>
            <div className="card card-pad" style={{ backgroundColor: "#FFFFFF", borderRadius: "14px", border: "1px solid #E4DFD1", padding: "16px 18px", boxShadow: "0 2px 6px rgba(0,0,0,0.02)" }}>
              <div style={{ fontSize: "12px", color: "var(--clay, #79705F)", fontWeight: 600 }}>Total Orders</div>
              <div style={{ fontFamily: "var(--font-display, 'Fraunces', serif)", fontSize: "24px", fontWeight: 700, color: "var(--forest, #1B6B34)", marginTop: "6px" }}>
                {summary.totalOrders}
              </div>
            </div>
            <div className="card card-pad" style={{ backgroundColor: "#FFFFFF", borderRadius: "14px", border: "1px solid #E4DFD1", padding: "16px 18px", boxShadow: "0 2px 6px rgba(0,0,0,0.02)" }}>
              <div style={{ fontSize: "12px", color: "var(--clay, #79705F)", fontWeight: 600 }}>Avg. Order Value</div>
              <div style={{ fontFamily: "var(--font-display, 'Fraunces', serif)", fontSize: "24px", fontWeight: 700, color: "var(--forest, #1B6B34)", marginTop: "6px" }}>
                {formatMoney(summary.avgOrderValue)}
              </div>
            </div>
          </div>

          {/* Monthly Earnings Chart Card */}
          <div className="card card-pad" style={{ backgroundColor: "#FFFFFF", borderRadius: "14px", border: "1px solid #E4DFD1", padding: "18px 20px", marginTop: "20px", boxShadow: "0 2px 6px rgba(0,0,0,0.02)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "14px" }}>
              <h3 style={{ fontFamily: "var(--font-display, 'Fraunces', serif)", color: "var(--forest, #1B6B34)", fontSize: "16px", margin: 0, fontWeight: 700 }}>Monthly Earnings</h3>
              <span style={{ fontSize: "12px", color: "var(--clay, #79705F)" }}>Calendar Year {new Date().getFullYear()}</span>
            </div>
            <div style={{ display: "flex", alignItems: "flex-end", gap: "10px", height: "150px", paddingBottom: "4px" }}>
              {monthlyData.map((d) => (
                <div
                  key={d.month}
                  title={`${d.month}: ${formatMoney(d.amount)}`}
                  style={{
                    flex: 1,
                    background: d.hasSales
                      ? "linear-gradient(180deg, var(--sage, #4CAF50), var(--forest, #1B6B34))"
                      : "rgba(228, 223, 209, 0.45)",
                    borderRadius: "6px 6px 0 0",
                    height: `${d.height}%`,
                    minHeight: "6px",
                    transition: "height 0.3s ease",
                  }}
                />
              ))}
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "10.5px", color: "var(--clay, #79705F)", marginTop: "8px" }}>
              {monthlyData.map((d) => (
                <span key={d.month} style={{ fontWeight: d.hasSales ? 700 : 400, color: d.hasSales ? "var(--forest, #1B6B34)" : "inherit" }}>
                  {d.month}
                </span>
              ))}
            </div>
          </div>

          {/* Top Selling Crops */}
          <div className="section-title" style={{ marginTop: "24px", marginBottom: "12px" }}>
            <h2 style={{ fontFamily: "var(--font-display, 'Fraunces', Georgia, serif)", color: "var(--forest, #1B6B34)", fontSize: "20px", margin: 0, fontWeight: 700 }}>Top Selling Crops</h2>
          </div>
          {topCrops.length ? (
            <div className="grid-cards" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "14px" }}>
              {topCrops.map((c) => (
                <div className="card card-pad" key={c.name} style={{ backgroundColor: "#FFFFFF", borderRadius: "14px", border: "1px solid #E4DFD1", padding: "12px 14px", display: "flex", gap: "12px", alignItems: "center", boxShadow: "0 2px 6px rgba(0,0,0,0.02)" }}>
                  {c.image ? (
                    <img
                      src={c.image}
                      alt={c.name}
                      className="avatar"
                      style={{ width: "48px", height: "48px", objectFit: "cover", borderRadius: "10px" }}
                      onError={(e) => {
                        e.currentTarget.style.display = "none";
                        const fallback = e.currentTarget.parentElement?.querySelector(".farmer-sales-no-img");
                        if (fallback) fallback.style.display = "flex";
                      }}
                    />
                  ) : null}
                  <div
                    className="avatar farmer-sales-no-img"
                    style={{
                      width: "48px",
                      height: "48px",
                      borderRadius: "10px",
                      backgroundColor: "#FAF7EF",
                      border: "1px solid #E4DFD1",
                      display: c.image ? "none" : "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "var(--forest, #1B6B34)",
                      fontSize: "10px",
                      flexShrink: 0,
                    }}
                  >
                    <i className="bi bi-camera" style={{ fontSize: "16px" }} />
                    <span style={{ fontSize: "9px", color: "var(--clay, #79705F)" }}>No photo</span>
                  </div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: "13.5px", color: "var(--ink, #1C1C16)" }}>{c.name}</div>
                    <div style={{ fontSize: "12px", color: "var(--clay, #79705F)" }}>{formatMoney(c.amount)} total</div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="card card-pad" style={{ backgroundColor: "#FFFFFF", borderRadius: "14px", border: "1px solid #E4DFD1", textAlign: "center", color: "var(--clay, #79705F)", padding: "32px 20px", boxShadow: "0 2px 6px rgba(0,0,0,0.02)" }}>
              <i className="bi bi-basket2 fs-3 d-block mb-2 text-muted" />
              <p style={{ margin: 0, fontSize: "13.5px" }}>No crop sales recorded yet. Once orders are fulfilled, your top crops will appear here.</p>
            </div>
          )}

          {/* Sales History Table */}
          <div className="section-title" style={{ marginTop: "24px", marginBottom: "12px" }}>
            <h2 style={{ fontFamily: "var(--font-display, 'Fraunces', Georgia, serif)", color: "var(--forest, #1B6B34)", fontSize: "20px", margin: 0, fontWeight: 700 }}>Sales History</h2>
          </div>
          {salesHistory.length ? (
            <div className="table-wrap" style={{ backgroundColor: "#FFFFFF", borderRadius: "14px", border: "1px solid #E4DFD1", overflow: "hidden", marginTop: "14px", boxShadow: "0 2px 6px rgba(0,0,0,0.02)" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13.5px" }}>
                <thead>
                  <tr>
                    <th style={{ backgroundColor: "#F9F8F5", padding: "12px 16px", textAlign: "left", fontWeight: 700, fontSize: "12px", textTransform: "uppercase", letterSpacing: "0.04em", color: "#79705F", borderBottom: "1px solid #E4DFD1" }}>Order</th>
                    <th style={{ backgroundColor: "#F9F8F5", padding: "12px 16px", textAlign: "left", fontWeight: 700, fontSize: "12px", textTransform: "uppercase", letterSpacing: "0.04em", color: "#79705F", borderBottom: "1px solid #E4DFD1" }}>Crop</th>
                    <th style={{ backgroundColor: "#F9F8F5", padding: "12px 16px", textAlign: "left", fontWeight: 700, fontSize: "12px", textTransform: "uppercase", letterSpacing: "0.04em", color: "#79705F", borderBottom: "1px solid #E4DFD1" }}>Amount</th>
                    <th style={{ backgroundColor: "#F9F8F5", padding: "12px 16px", textAlign: "left", fontWeight: 700, fontSize: "12px", textTransform: "uppercase", letterSpacing: "0.04em", color: "#79705F", borderBottom: "1px solid #E4DFD1" }}>Date</th>
                  </tr>
                </thead>
                <tbody>
                  {salesHistory.map((o, idx) => (
                    <tr key={`${o.id}-${idx}`}>
                      <td style={{ padding: "14px 16px", borderBottom: "1px solid #EFECE6", verticalAlign: "middle" }}>
                        <b>{o.id}</b>
                      </td>
                      <td style={{ padding: "14px 16px", borderBottom: "1px solid #EFECE6", verticalAlign: "middle" }}>{o.crop}</td>
                      <td style={{ padding: "14px 16px", borderBottom: "1px solid #EFECE6", verticalAlign: "middle", fontWeight: 700, color: "var(--forest, #1B6B34)" }}>{formatMoney(o.amount)}</td>
                      <td style={{ padding: "14px 16px", borderBottom: "1px solid #EFECE6", verticalAlign: "middle", color: "var(--clay, #79705F)" }}>{o.date}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="card card-pad" style={{ backgroundColor: "#FFFFFF", borderRadius: "14px", border: "1px solid #E4DFD1", textAlign: "center", color: "var(--clay, #79705F)", padding: "32px 20px", boxShadow: "0 2px 6px rgba(0,0,0,0.02)" }}>
              <i className="bi bi-clock-history fs-3 d-block mb-2 text-muted" />
              <p style={{ margin: 0, fontSize: "13.5px" }}>No sales history yet. Delivered and completed orders will be listed here.</p>
            </div>
          )}
        </>
      )}
    </section>
  );
}


