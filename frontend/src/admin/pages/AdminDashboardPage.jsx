import { useEffect, useMemo, useState } from "react";
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
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([
      getAdminDashboardSummary(),
      listAdminFarmers(),
      listAdminListings(),
      listAdminOrders(),
      listAdminPayments(),
    ])
      .then(([dashboardSummary, farmerRows, listingRows, orderRows, paymentRows]) => {
        setSummary(dashboardSummary);
        setFarmers(Array.isArray(farmerRows) ? farmerRows : []);
        setListings(Array.isArray(listingRows) ? listingRows : []);
        setOrders(Array.isArray(orderRows) ? orderRows : []);
        setPayments(Array.isArray(paymentRows) ? paymentRows : []);
      })
      .catch((requestError) => setError(requestError.message || "Unable to load dashboard data."));
  }, []);

  const paymentOverview = useMemo(() => {
    const counts = { SUCCESSFUL: 0, PENDING: 0, REFUNDED: 0, FAILED: 0 };
    payments.forEach((payment) => {
      const status = payment.status || "PENDING";
      if (Object.prototype.hasOwnProperty.call(counts, status)) {
        counts[status] += 1;
      }
    });
    const total = Math.max(Object.values(counts).reduce((sum, value) => sum + value, 0), 1);
    return Object.entries(counts).map(([status, count]) => ({
      status,
      count,
      width: (count / total) * 100,
    }));
  }, [payments]);

  const deliveryOverview = useMemo(() => {
    const counts = { "Ready for pickup": 0, "Out for delivery": 0, "Delivered today": 0 };
    orders.forEach((order) => {
      const deliveryStatus = order.delivery_status || "";
      if (deliveryStatus === "READY") counts["Ready for pickup"] += 1;
      if (deliveryStatus === "OUT_FOR_DELIVERY") counts["Out for delivery"] += 1;
      if (deliveryStatus === "DELIVERED") counts["Delivered today"] += 1;
    });
    return counts;
  }, [orders]);

  if (error) return <section className="detail-view"><div className="error">{error}</div></section>;
  if (!summary) return <section className="detail-view"><div className="loading">Loading dashboard...</div></section>;

  return (
    <section className="detail-view admin-page-explicit">
      <div className="consumer-screen-header admin-header-block">
        <div>
          <span className="eyebrow">Admin workspace</span>
          <h1>Platform overview</h1>
          <p>Live operational data for the marketplace.</p>
        </div>
      </div>

      <div className="admin-stat-grid">
        <div className="admin-stat-card"><span>Total Users</span><strong>{summary.total_users}</strong></div>
        <div className="admin-stat-card"><span>Farmers</span><strong>{summary.total_farmers}</strong></div>
        <div className="admin-stat-card"><span>Listings</span><strong>{summary.total_listings}</strong></div>
        <div className="admin-stat-card"><span>Orders</span><strong>{summary.total_orders}</strong></div>
        <div className="admin-stat-card"><span>Revenue 30d</span><strong>{money(summary.total_payment_volume || 0)}</strong></div>
        <div className="admin-stat-card"><span>Active Deliveries</span><strong>{orders.filter((order) => order.delivery_status === "OUT_FOR_DELIVERY" || order.delivery_status === "READY").length}</strong></div>
        <div className="admin-stat-card"><span>Pending Payments</span><strong>{payments.filter((payment) => payment.status === "PENDING").length}</strong></div>
        <div className="admin-stat-card"><span>Avg. Rating</span><strong>{summary.total_reviews ? (Number(summary.total_reviews) / Math.max(listings.length || 1, 1)).toFixed(1) : "0.0"}</strong></div>
      </div>

      <div className="admin-section-grid">
        <section className="admin-panel">
          <div className="admin-panel-header">
            <h2>Recent Orders</h2>
            <span>{orders.length} total</span>
          </div>
          <div className="admin-table-wrap">
            <table>
              <thead>
                <tr><th>Order</th><th>Consumer</th><th>Amount</th><th>Status</th></tr>
              </thead>
              <tbody>
                {orders.slice(0, 5).map((order) => (
                  <tr key={order.id}>
                    <td>{`ORD-${String(order.id).slice(0, 6).toUpperCase()}`}</td>
                    <td>{order.consumer_name || "Consumer"}</td>
                    <td>{money(order.total_amount || 0)}</td>
                    <td><span className="admin-badge admin-badge-status">{order.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="admin-panel">
          <div className="admin-panel-header">
            <h2>Recent Farmers</h2>
            <span>{farmers.length} active</span>
          </div>
          <div className="admin-table-wrap">
            <table>
              <thead>
                <tr><th>Farmer</th><th>Listings</th><th>Orders</th><th>Sales</th></tr>
              </thead>
              <tbody>
                {farmers.slice(0, 5).map((farmer) => (
                  <tr key={farmer.id}>
                    <td>{farmer.name}</td>
                    <td>{farmer.listing_count || 0}</td>
                    <td>{farmer.order_count || 0}</td>
                    <td>{money(farmer.total_sales || 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="admin-panel wide-panel">
          <div className="admin-panel-header">
            <h2>Recent Listings</h2>
            <span>{listings.length} total</span>
          </div>
          <div className="admin-table-wrap">
            <table>
              <thead>
                <tr><th>Crop</th><th>Farmer</th><th>Price</th><th>AI Quality</th></tr>
              </thead>
              <tbody>
                {listings.slice(0, 6).map((listing) => (
                  <tr key={listing.id}>
                    <td>{listing.crop_name}</td>
                    <td>{listing.farmer_name}</td>
                    <td>{money(listing.asking_price || 0)}</td>
                    <td><span className="admin-badge quality-badge">{listing.ai_quality_label || "Pending"}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="admin-panel">
          <div className="admin-panel-header">
            <h2>Payment Overview</h2>
            <span>{payments.length} records</span>
          </div>
          <div className="admin-progress-stack">
            {paymentOverview.map((item) => (
              <div key={item.status} className="admin-progress-row">
                <div className="admin-progress-label-row">
                  <span>{item.status}</span>
                  <strong>{item.count}</strong>
                </div>
                <div className="admin-progress-track"><span style={{ width: `${item.width}%` }} className={`admin-progress-fill ${item.status.toLowerCase()}`} /></div>
              </div>
            ))}
          </div>
        </section>

        <section className="admin-panel">
          <div className="admin-panel-header">
            <h2>Delivery Overview</h2>
            <span>{orders.length} orders</span>
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
    </section>
  );
}
