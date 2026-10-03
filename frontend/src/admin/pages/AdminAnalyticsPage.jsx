import { useEffect, useMemo, useState } from "react";
import { getAdminAnalytics, listAdminCategories, listAdminNotifications } from "../../services/adminApi";

const money = (value) => `₹${Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
const RANGE_OPTIONS = [
  { value: "7d", label: "Last 7 Days" },
  { value: "30d", label: "30 Days" },
  { value: "90d", label: "3 Months" },
];

export default function AdminAnalyticsPage() {
  const [range, setRange] = useState("30d");
  const [analytics, setAnalytics] = useState(null);
  const [categories, setCategories] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([getAdminAnalytics(range), listAdminCategories(), listAdminNotifications()])
      .then(([analyticsData, categoryRows, notificationRows]) => {
        setAnalytics(analyticsData);
        setCategories(Array.isArray(categoryRows) ? categoryRows : []);
        setNotifications(Array.isArray(notificationRows) ? notificationRows : []);
        setError("");
      })
      .catch((requestError) => setError(requestError.message || "Unable to load analytics."));
  }, [range]);

  const categoryOverview = useMemo(() => categories.slice(0, 6), [categories]);

  if (error) return <section className="detail-view"><div className="error">{error}</div></section>;
  if (!analytics) return <section className="detail-view"><div className="loading">Loading analytics...</div></section>;

  return (
    <section className="detail-view admin-page-explicit">
      <div className="consumer-screen-header admin-header-block">
        <div>
          <span className="eyebrow">Analytics</span>
          <h1>Performance analytics</h1>
        </div>
        <div className="toggle-group" aria-label="Analytics date range filters">
          {RANGE_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              className={option.value === range ? "active" : ""}
              onClick={() => setRange(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div className="admin-stat-grid">
        <div className="admin-stat-card"><span>Active users</span><strong>{analytics.active_users}</strong></div>
        <div className="admin-stat-card"><span>Orders</span><strong>{analytics.total_orders}</strong></div>
        <div className="admin-stat-card"><span>Pending orders</span><strong>{analytics.pending_orders}</strong></div>
        <div className="admin-stat-card"><span>Revenue</span><strong>{money(analytics.total_sales || 0)}</strong></div>
      </div>

      <div className="admin-section-grid">
        <section className="admin-panel">
          <div className="admin-panel-header">
            <h2>Category mix</h2>
            <span>{categories.length} categories</span>
          </div>
          <div className="admin-table-wrap">
            <table>
              <thead>
                <tr><th>Category</th><th>Listings</th><th>Average price</th></tr>
              </thead>
              <tbody>
                {categoryOverview.map((row) => (
                  <tr key={row.category || "unknown"}>
                    <td>{row.category || "Uncategorized"}</td>
                    <td>{row.listing_count || 0}</td>
                    <td>{money(row.average_price || 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="admin-panel">
          <div className="admin-panel-header">
            <h2>Recent activity</h2>
            <span>{analytics.total_orders} orders</span>
          </div>
          <div className="admin-list-stack">
            {analytics.recent_activity.map((item) => (
              <div key={item.id || `${item.title}-${item.created_at}`} className="admin-list-item">
                <strong>{item.title}</strong>
                <small>{item.message}</small>
              </div>
            ))}
          </div>
        </section>
      </div>
    </section>
  );
}
