import { useCallback, useEffect, useMemo, useState } from "react";
import AdminFilterTabs from "../components/AdminFilterTabs";
import {
  getAdminAnalytics,
  listAdminCategories,
  listAdminNotifications,
} from "../../services/adminApi";

const money = (value) => `₹${Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
const formatDateTime = (value) => {
  if (!value) return "—";
  const d = new Date(value);
  return d.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
};

const RANGE_TABS = [
  { key: "7d", label: "Past 7 Days" },
  { key: "30d", label: "Past 30 Days" },
  { key: "90d", label: "Past 90 Days" },
];

export default function AdminAnalyticsPage() {
  const [range, setRange] = useState("30d");
  const [analytics, setAnalytics] = useState(null);
  const [categories, setCategories] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadAnalytics = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [analyticsData, categoryRows, notificationRows] = await Promise.all([
        getAdminAnalytics(range),
        listAdminCategories(),
        listAdminNotifications(),
      ]);
      setAnalytics(analyticsData);
      setCategories(Array.isArray(categoryRows) ? categoryRows : []);
      setNotifications(Array.isArray(notificationRows) ? notificationRows : []);
    } catch (err) {
      setError(err.message || "Failed to load platform analytics.");
    } finally {
      setLoading(false);
    }
  }, [range]);

  useEffect(() => {
    loadAnalytics();
  }, [loadAnalytics]);

  const maxRevenue = useMemo(() => {
    if (!analytics?.revenue_by_day?.length) return 1;
    return Math.max(...analytics.revenue_by_day.map((p) => Number(p.total_sales || 0)), 1);
  }, [analytics]);

  return (
    <div className="admin-page-container">
      <div className="admin-page-header">
        <div>
          <span className="eyebrow">Executive Intelligence</span>
          <h1>Platform Analytics</h1>
          <p>Examine revenue trajectories, fulfillment velocity, category supply distribution, and real-time events.</p>
        </div>
        <div className="admin-header-actions">
          <AdminFilterTabs tabs={RANGE_TABS} activeTab={range} onChange={setRange} />
          <button
            type="button"
            className="admin-btn-secondary"
            onClick={loadAnalytics}
            disabled={loading}
          >
            <i className={`bi bi-arrow-clockwise ${loading ? "spin" : ""}`} /> Refresh
          </button>
        </div>
      </div>

      {error && (
        <div className="admin-table-error mb-4" role="alert">
          <i className="bi bi-exclamation-triangle-fill" />
          <span>{error}</span>
          <button type="button" className="admin-retry-btn" onClick={loadAnalytics}>
            Retry
          </button>
        </div>
      )}

      {/* KPI Cards */}
      <div className="admin-stat-grid">
        <div className="admin-kpi-card">
          <div className="admin-kpi-header">
            <span className="admin-kpi-title">Gross Sales Volume</span>
            <div className="admin-kpi-icon"><i className="bi bi-cash-stack" /></div>
          </div>
          <div className="admin-kpi-value">{loading ? "—" : money(analytics?.total_sales || 0)}</div>
          <span className="admin-kpi-subtext">Across {analytics?.total_orders ?? 0} total orders</span>
        </div>

        <div className="admin-kpi-card">
          <div className="admin-kpi-header">
            <span className="admin-kpi-title">Active Platform Users</span>
            <div className="admin-kpi-icon"><i className="bi bi-people" /></div>
          </div>
          <div className="admin-kpi-value">{loading ? "—" : analytics?.active_users ?? 0}</div>
          <span className="admin-kpi-subtext">Out of {analytics?.total_users ?? 0} registered</span>
        </div>

        <div className="admin-kpi-card">
          <div className="admin-kpi-header">
            <span className="admin-kpi-title">Completed Orders</span>
            <div className="admin-kpi-icon"><i className="bi bi-bag-check" /></div>
          </div>
          <div className="admin-kpi-value">{loading ? "—" : analytics?.completed_orders ?? 0}</div>
          <span className="admin-kpi-subtext">Pending: {analytics?.pending_orders ?? 0}</span>
        </div>

        <div className="admin-kpi-card">
          <div className="admin-kpi-header">
            <span className="admin-kpi-title">Fulfillment Velocity</span>
            <div className="admin-kpi-icon"><i className="bi bi-speedometer2" /></div>
          </div>
          <div className="admin-kpi-value">
            {loading
              ? "—"
              : analytics?.average_placed_to_delivered_minutes != null
              ? `${Math.round(analytics.average_placed_to_delivered_minutes)}m`
              : "N/A"}
          </div>
          <span className="admin-kpi-subtext">Avg placed to delivered</span>
        </div>

        <div className="admin-kpi-card">
          <div className="admin-kpi-header">
            <span className="admin-kpi-title">Active Shipments</span>
            <div className="admin-kpi-icon"><i className="bi bi-truck" /></div>
          </div>
          <div className="admin-kpi-value">{loading ? "—" : analytics?.active_shipments ?? 0}</div>
          <span className="admin-kpi-subtext">Failed in range: {analytics?.failed_deliveries ?? 0}</span>
        </div>
      </div>

      {/* Revenue Trend Visualization */}
      <section className="admin-panel mb-4">
        <div className="admin-panel-header">
          <h2>Revenue Daily Breakdown ({range.toUpperCase()})</h2>
          <span>{analytics?.revenue_by_day?.length ?? 0} day points recorded</span>
        </div>

        {analytics?.revenue_by_day?.length ? (
          <div className="d-flex align-items-end gap-2 pt-3 pb-2 overflow-auto" style={{ minHeight: "180px" }}>
            {analytics.revenue_by_day.map((point) => {
              const heightPercent = Math.max(10, Math.round((Number(point.total_sales || 0) / maxRevenue) * 100));
              return (
                <div
                  key={point.label}
                  className="d-flex flex-column align-items-center flex-fill"
                  style={{ minWidth: "48px" }}
                  title={`${point.label}: ${money(point.total_sales || 0)} (${point.total_orders || 0} orders)`}
                >
                  <span className="text-muted small mb-1" style={{ fontSize: "0.7rem" }}>
                    {money(point.total_sales || 0)}
                  </span>
                  <div
                    style={{
                      height: `${heightPercent}px`,
                      width: "100%",
                      maxWidth: "36px",
                      background: "linear-gradient(180deg, #167a52 0%, #073a26 100%)",
                      borderRadius: "4px 4px 0 0",
                    }}
                  />
                  <span className="text-muted mt-2 small" style={{ fontSize: "0.68rem" }}>
                    {point.label.slice(5)}
                  </span>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-4 text-muted">
            <i className="bi bi-graph-up me-2" />
            No transaction trend points recorded for this interval.
          </div>
        )}
      </section>

      {/* Grid: Category Mix & Operational Activity */}
      <div className="admin-section-grid">
        {/* Category Breakdown Panel */}
        <section className="admin-panel">
          <div className="admin-panel-header">
            <h2>Crop Category Mix</h2>
            <span>{categories.length} Categories</span>
          </div>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Category</th>
                  <th>Listings</th>
                  <th>Average Price</th>
                </tr>
              </thead>
              <tbody>
                {categories.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="text-center py-4 text-muted">
                      No categories registered.
                    </td>
                  </tr>
                ) : (
                  categories.map((c) => (
                    <tr key={c.category || "uncategorized"}>
                      <td><strong>{c.category || "Uncategorized"}</strong></td>
                      <td>
                        <b>{c.active_listing_count}</b> / {c.listing_count} active
                      </td>
                      <td><strong>{money(c.average_price || 0)}</strong></td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* Recent Audit & System Activity Panel */}
        <section className="admin-panel">
          <div className="admin-panel-header">
            <h2>Live Operational Feed</h2>
            <span>Recent Events</span>
          </div>

          <div className="admin-feed-list">
            {analytics?.recent_activity?.length ? (
              analytics.recent_activity.map((item, idx) => (
                <div key={item.id || idx} className="admin-feed-item">
                  <div className="admin-feed-icon">
                    <i className={item.type === "order" ? "bi bi-box-seam" : "bi bi-bell-fill"} />
                  </div>
                  <div className="admin-feed-body">
                    <div className="admin-feed-header">
                      <strong className="admin-feed-title">{item.title}</strong>
                      <span className="admin-feed-time">
                        {formatDateTime(item.created_at)}
                      </span>
                    </div>
                    <p className="admin-feed-message">{item.message}</p>
                  </div>
                </div>
              ))
            ) : notifications.length ? (
              notifications.slice(0, 5).map((n) => (
                <div key={n.id} className="admin-feed-item">
                  <div className="admin-feed-icon">
                    <i className="bi bi-app-indicator" />
                  </div>
                  <div className="admin-feed-body">
                    <div className="admin-feed-header">
                      <strong className="admin-feed-title">{n.title}</strong>
                      <span className="admin-feed-time">
                        {formatDateTime(n.created_at)}
                      </span>
                    </div>
                    <p className="admin-feed-message">{n.message}</p>
                  </div>
                </div>
              ))
            ) : (
              <div className="admin-feed-empty">
                <i className="bi bi-activity" />
                <p className="mb-0">No recent system activity events recorded in this time range.</p>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
