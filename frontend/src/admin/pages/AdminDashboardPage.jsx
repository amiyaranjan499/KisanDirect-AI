import { useEffect, useMemo, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import {
  getAdminDashboardSummary,
  listAdminFarmers,
  listAdminListings,
  listAdminOrders,
  listAdminPayments,
} from "../../services/adminApi";

const money = (value) => `₹${Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

export default function AdminDashboardPage() {
  const [summary, setSummary] = useState(null);
  const [farmers, setFarmers] = useState([]);
  const [listings, setListings] = useState([]);
  const [orders, setOrders] = useState([]);
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const results = await Promise.allSettled([
        getAdminDashboardSummary(),
        listAdminFarmers(),
        listAdminListings(),
        listAdminOrders(),
        listAdminPayments(),
      ]);

      const [summaryRes, farmersRes, listingsRes, ordersRes, paymentsRes] = results;

      if (summaryRes.status === "fulfilled") {
        setSummary(summaryRes.value);
      } else {
        setError(summaryRes.reason?.message || "Failed to load dashboard overview.");
      }

      if (farmersRes.status === "fulfilled" && Array.isArray(farmersRes.value)) {
        setFarmers(farmersRes.value);
      }
      if (listingsRes.status === "fulfilled" && Array.isArray(listingsRes.value)) {
        setListings(listingsRes.value);
      }
      if (ordersRes.status === "fulfilled" && Array.isArray(ordersRes.value)) {
        setOrders(ordersRes.value);
      }
      if (paymentsRes.status === "fulfilled" && Array.isArray(paymentsRes.value)) {
        setPayments(paymentsRes.value);
      }
    } catch (err) {
      setError(err.message || "An unexpected error occurred while loading dashboard.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const paymentOverview = useMemo(() => {
    const counts = { SUCCESSFUL: 0, PENDING: 0, REFUNDED: 0, FAILED: 0 };
    payments.forEach((payment) => {
      const status = payment.status ? String(payment.status).toUpperCase() : "PENDING";
      if (Object.prototype.hasOwnProperty.call(counts, status)) {
        counts[status] += 1;
      }
    });
    const total = Math.max(Object.values(counts).reduce((sum, value) => sum + value, 0), 1);
    return Object.entries(counts).map(([status, count]) => ({
      status,
      count,
      percent: Math.round((count / total) * 100),
    }));
  }, [payments]);

  const deliveryOverview = useMemo(
    () => ({
      "Active Shipments": summary?.active_shipments ?? 0,
      "Average Delivery Time":
        summary?.average_placed_to_delivered_minutes == null
          ? "No data"
          : `${Math.round(summary.average_placed_to_delivered_minutes)} mins`,
      "Failed Deliveries": summary?.failed_deliveries ?? 0,
      "Total Fulfilled Orders": summary?.completed_orders ?? 0,
    }),
    [summary],
  );

  const pendingPaymentsCount = useMemo(() => {
    return payments.filter((p) => p.status === "PENDING").length;
  }, [payments]);

  return (
    <div className="admin-page-container">
      {/* Page Header */}
      <div className="admin-page-header">
        <div>
          <span className="eyebrow">Enterprise Overview</span>
          <h1>Operations Dashboard</h1>
          <p>Real-time platform metrics, supply status, and fulfillment telemetry.</p>
        </div>
        <div className="admin-header-actions">
          <button
            type="button"
            className="admin-btn-secondary"
            onClick={loadData}
            disabled={loading}
          >
            <i className={`bi bi-arrow-clockwise ${loading ? "spin" : ""}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Error state if summary completely failed */}
      {error && (
        <div className="admin-table-error mb-4" role="alert">
          <i className="bi bi-exclamation-triangle-fill" />
          <span>{error}</span>
          <button type="button" className="admin-retry-btn" onClick={loadData}>
            Retry
          </button>
        </div>
      )}

      {/* KPI Cards Grid */}
      <div className="admin-stat-grid">
        <div className="admin-kpi-card">
          <div className="admin-kpi-header">
            <span className="admin-kpi-title">Total Users</span>
            <div className="admin-kpi-icon"><i className="bi bi-people" /></div>
          </div>
          <div className="admin-kpi-value">{loading ? "—" : summary?.total_users ?? 0}</div>
          <span className="admin-kpi-subtext">Active: {summary?.active_users ?? 0}</span>
        </div>

        <div className="admin-kpi-card">
          <div className="admin-kpi-header">
            <span className="admin-kpi-title">Farmers</span>
            <div className="admin-kpi-icon"><i className="bi bi-person-lines-fill" /></div>
          </div>
          <div className="admin-kpi-value">{loading ? "—" : summary?.total_farmers ?? 0}</div>
          <span className="admin-kpi-subtext">Verified supply partners</span>
        </div>

        <div className="admin-kpi-card">
          <div className="admin-kpi-header">
            <span className="admin-kpi-title">Consumers</span>
            <div className="admin-kpi-icon"><i className="bi bi-cart-check" /></div>
          </div>
          <div className="admin-kpi-value">{loading ? "—" : summary?.total_consumers ?? 0}</div>
          <span className="admin-kpi-subtext">Registered buyers</span>
        </div>

        <div className="admin-kpi-card">
          <div className="admin-kpi-header">
            <span className="admin-kpi-title">Crop Listings</span>
            <div className="admin-kpi-icon"><i className="bi bi-basket2" /></div>
          </div>
          <div className="admin-kpi-value">{loading ? "—" : summary?.total_listings ?? 0}</div>
          <span className="admin-kpi-subtext">Active: {summary?.active_listings ?? 0}</span>
        </div>

        <div className="admin-kpi-card">
          <div className="admin-kpi-header">
            <span className="admin-kpi-title">Total Orders</span>
            <div className="admin-kpi-icon"><i className="bi bi-receipt" /></div>
          </div>
          <div className="admin-kpi-value">{loading ? "—" : summary?.total_orders ?? 0}</div>
          <span className="admin-kpi-subtext">Pending: {summary?.pending_orders ?? 0}</span>
        </div>

        <div className="admin-kpi-card">
          <div className="admin-kpi-header">
            <span className="admin-kpi-title">Revenue (30d)</span>
            <div className="admin-kpi-icon"><i className="bi bi-currency-rupee" /></div>
          </div>
          <div className="admin-kpi-value">{loading ? "—" : money(summary?.total_payment_volume || 0)}</div>
          <span className="admin-kpi-subtext">Gross transaction volume</span>
        </div>

        <div className="admin-kpi-card">
          <div className="admin-kpi-header">
            <span className="admin-kpi-title">Active Shipments</span>
            <div className="admin-kpi-icon"><i className="bi bi-truck" /></div>
          </div>
          <div className="admin-kpi-value">{loading ? "—" : summary?.active_shipments ?? 0}</div>
          <span className="admin-kpi-subtext">Live deliveries in transit</span>
        </div>

        <div className="admin-kpi-card">
          <div className="admin-kpi-header">
            <span className="admin-kpi-title">Pending Payments</span>
            <div className="admin-kpi-icon"><i className="bi bi-clock-history" /></div>
          </div>
          <div className="admin-kpi-value">{loading ? "—" : pendingPaymentsCount}</div>
          <span className="admin-kpi-subtext">Awaiting gateway settlement</span>
        </div>
      </div>

      {/* Main Operational Tables Grid */}
      <div className="admin-section-grid">
        {/* Recent Orders Panel */}
        <section className="admin-panel">
          <div className="admin-panel-header">
            <h2>Recent Orders</h2>
            <Link to="/admin/orders" className="admin-btn-secondary admin-btn-sm">
              View All ({orders.length})
            </Link>
          </div>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Customer</th>
                  <th>Amount</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {orders.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="text-center py-4 text-muted">
                      No orders placed yet.
                    </td>
                  </tr>
                ) : (
                  orders.slice(0, 5).map((order) => (
                    <tr key={order.id}>
                      <td>
                        <strong>{`ORD-${String(order.id).slice(0, 6).toUpperCase()}`}</strong>
                      </td>
                      <td>{order.consumer_name || "Consumer"}</td>
                      <td><strong>{money(order.total_amount || 0)}</strong></td>
                      <td>
                        <span className={`admin-badge admin-badge-${order.status?.toLowerCase() || "pending"}`}>
                          {order.status}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* Recent Farmers Panel */}
        <section className="admin-panel">
          <div className="admin-panel-header">
            <h2>Farmer Network</h2>
            <Link to="/admin/farmers" className="admin-btn-secondary admin-btn-sm">
              View All ({farmers.length})
            </Link>
          </div>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Farmer</th>
                  <th>Listings</th>
                  <th>Orders</th>
                  <th>Sales</th>
                </tr>
              </thead>
              <tbody>
                {farmers.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="text-center py-4 text-muted">
                      No farmers registered yet.
                    </td>
                  </tr>
                ) : (
                  farmers.slice(0, 5).map((farmer) => (
                    <tr key={farmer.id}>
                      <td>
                        <div className="admin-entity-cell">
                          <span className="admin-avatar-mini">
                            {(farmer.name || "F").slice(0, 1).toUpperCase()}
                          </span>
                          <span>{farmer.name}</span>
                        </div>
                      </td>
                      <td>{farmer.listing_count || 0}</td>
                      <td>{farmer.order_count || 0}</td>
                      <td><strong>{money(farmer.total_sales || 0)}</strong></td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* Recent Listings (Full Width) */}
        <section className="admin-panel wide-panel">
          <div className="admin-panel-header">
            <h2>Recent Crop Listings</h2>
            <Link to="/admin/listings" className="admin-btn-secondary admin-btn-sm">
              View All ({listings.length})
            </Link>
          </div>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Crop</th>
                  <th>Farmer</th>
                  <th>Category</th>
                  <th>Quantity</th>
                  <th>Asking Price</th>
                  <th>AI Quality</th>
                </tr>
              </thead>
              <tbody>
                {listings.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center py-4 text-muted">
                      No crop listings found.
                    </td>
                  </tr>
                ) : (
                  listings.slice(0, 6).map((listing) => (
                    <tr key={listing.id}>
                      <td><strong>{listing.crop_name}</strong></td>
                      <td>{listing.farmer_name}</td>
                      <td>{listing.crop_category || "General"}</td>
                      <td>{`${listing.quantity} ${listing.unit}`}</td>
                      <td><strong>{money(listing.asking_price || 0)}</strong></td>
                      <td>
                        <span className="admin-badge quality-badge">
                          <i className="bi bi-shield-check me-1" />
                          {listing.ai_quality_label || "Pending Audit"}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* Payment Health Overview */}
        <section className="admin-panel">
          <div className="admin-panel-header">
            <h2>Payment Status Overview</h2>
            <Link to="/admin/payments" className="admin-btn-secondary admin-btn-sm">
              Records ({payments.length})
            </Link>
          </div>
          <div className="admin-progress-stack">
            {paymentOverview.map((item) => (
              <div key={item.status} className="admin-progress-row">
                <div className="admin-progress-label-row">
                  <span>{item.status}</span>
                  <strong>{item.count} ({item.percent}%)</strong>
                </div>
                <div className="admin-progress-track">
                  <span
                    style={{ width: `${item.percent}%` }}
                    className={`admin-progress-fill ${item.status.toLowerCase()}`}
                  />
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Fulfillment & Delivery Telemetry */}
        <section className="admin-panel">
          <div className="admin-panel-header">
            <h2>Fulfillment & Delivery</h2>
            <Link to="/admin/delivery" className="admin-btn-secondary admin-btn-sm">
              Shipments
            </Link>
          </div>
          <div className="admin-metric-stack">
            {Object.entries(deliveryOverview).map(([label, value]) => (
              <div key={label} className="admin-mini-stat">
                <span>{label}</span>
                <strong>{value}</strong>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
