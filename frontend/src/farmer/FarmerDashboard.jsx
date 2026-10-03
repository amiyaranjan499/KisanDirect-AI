import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getFarmerProfile } from "../services/api";
import {
  getFarmerDashboardAISummary,
  getFarmerDashboardSummary,
  listFarmerDashboardListings,
  listFarmerDashboardOrders,
} from "../services/farmerApi";

const formatMoney = (value = 0) => `₹${Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

const normalizeStatus = (value) => {
  if (!value) return "New";
  const map = {
    PENDING: "New",
    CONFIRMED: "Accepted",
    PROCESSING: "Preparing",
    SHIPPED: "Ready",
    DELIVERED: "Delivered",
    CANCELLED: "Cancelled",
    COMPLETED: "Completed",
  };
  return map[value] || value;
};

export default function FarmerDashboard() {
  const [profile, setProfile] = useState(null);
  const [data, setData] = useState(null);
  const [aiData, setAiData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([
      getFarmerProfile(),
      getFarmerDashboardSummary(),
      listFarmerDashboardListings(),
      listFarmerDashboardOrders(),
      getFarmerDashboardAISummary(),
    ])
      .then(([profileResponse, summary, listings, orders, aiSummary]) => {
        setProfile(profileResponse);
        setData({ summary, listings, orders });
        setAiData(aiSummary);
      })
      .catch((requestError) => setError(requestError.message || "Unable to load dashboard."));
  }, []);

  if (error) return <section className="detail-view"><div className="error">{error}</div></section>;
  if (!data || !profile) return <section className="detail-view"><div className="loading">Loading dashboard...</div></section>;

  const firstName = profile.name?.split(" ")[0] || "Farmer";
  const location = [profile.city, profile.state].filter(Boolean).join(", ") || "Farm location not set";
  const recentOrders = Array.isArray(data.orders) ? data.orders.slice(0, 4) : [];
  const safeListings = Array.isArray(data.listings) ? data.listings : [];
  const activeListings = safeListings.filter((listing) => (listing.availability_status || "").toUpperCase() === "AVAILABLE").length;
  const aiQuality = aiData?.quality_assessments?.[0];
  const pricePrediction = aiData?.price_predictions?.[0];

  return (
    <section className="detail-view farmer-dashboard">
      <div className="consumer-screen-header consumer-hero farmer-hero">
        <span className="eyebrow">Farmer dashboard</span>
        <h1>Welcome back, {firstName}</h1>
        <p>{profile.name} · {location}</p>
      </div>

      <div className="farmer-header-actions">
        <Link className="farmer-add-crop-button" to="/farmer/crops/new">+ Add New Crop</Link>
      </div>

      <div className="dashboard-banner">
        <span className="eyebrow">Today's snapshot</span>
        <h2>
          {activeListings} active listings • {recentOrders.filter((item) => normalizeStatus(item.status) === "New").length} new orders
        </h2>
      </div>

      <div className="detail-stats dashboard-grid">
        <div className="dashboard-stat">
          <div className="stat-icon"><i className="bi bi-flower1" /></div>
          <div>
            <b>{data.summary.total_listings}</b>
            <span>Total Listings</span>
          </div>
        </div>
        <div className="dashboard-stat">
          <div className="stat-icon"><i className="bi bi-graph-up" /></div>
          <div>
            <b>{activeListings}</b>
            <span>Active Listings</span>
          </div>
        </div>
        <div className="dashboard-stat">
          <div className="stat-icon"><i className="bi bi-receipt" /></div>
          <div>
            <b>{data.summary.total_orders_received}</b>
            <span>Orders Received</span>
          </div>
        </div>
        <div className="dashboard-stat">
          <div className="stat-icon"><i className="bi bi-wallet2" /></div>
          <div>
            <b>{formatMoney(data.summary.total_sales)}</b>
            <span>Gross Sales</span>
          </div>
        </div>
      </div>

      <div className="dashboard-panels">
        <section className="panel-block">
          <div className="section-heading-row">
            <div>
              <span className="eyebrow">Recent activity</span>
              <h2>Recent Orders</h2>
            </div>
          </div>

          <div className="review-list dashboard-list">
            {recentOrders.length ? recentOrders.map((order) => (
              <article className="review-card dashboard-card" key={order.id}>
                <div className="review-header">
                  <div>
                    <b>{order.consumer_name || "Consumer"}</b>
                    <span>{order.order_date ? new Date(order.order_date).toLocaleDateString() : "Today"}</span>
                  </div>
                  <div className="dashboard-pill">{normalizeStatus(order.status)}</div>
                </div>
                <p>{order.items?.length ? `${order.items.length} item(s)` : "Farm order"} · {formatMoney(order.total_amount)}</p>
              </article>
            )) : <div className="empty">No orders yet.</div>}
          </div>
        </section>

        <section className="panel-block">
          <div className="section-heading-row">
            <div>
              <span className="eyebrow">AI insights</span>
              <h2>AI Crop Insights</h2>
            </div>
          </div>
          <div className="insight-card">
            {aiQuality ? (
              <>
                <strong>{aiQuality.crop_name || "Latest crop"}</strong>
                <p>Quality grade: <span>{aiQuality.quality_label}</span></p>
                <p>Confidence: <span>{Math.round((aiQuality.confidence || 0) * 100)}%</span></p>
                <small>{aiQuality.prediction_status}</small>
              </>
            ) : (
              <p className="muted">No AI quality assessment has been generated yet.</p>
            )}
          </div>
        </section>

        <section className="panel-block wide-panel">
          <div className="section-heading-row">
            <div>
              <span className="eyebrow">Market signals</span>
              <h2>Market Price Insights</h2>
            </div>
          </div>
          <div className="insight-card">
            {pricePrediction ? (
              <>
                <strong>{pricePrediction.crop_name || "Latest listing"}</strong>
                <p>Suggested price: <span>{formatMoney(pricePrediction.predicted_price)}</span></p>
                <p>Confidence: <span>{Math.round((pricePrediction.confidence || 0) * 100)}%</span></p>
                <small>{pricePrediction.prediction_status}</small>
              </>
            ) : (
              <p className="muted">No market AI recommendation has been generated yet.</p>
            )}
          </div>
        </section>
      </div>
    </section>
  );
}
