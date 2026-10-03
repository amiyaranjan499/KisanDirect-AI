import { useEffect, useState } from "react";
import { getConsumerDashboardCartSummary, getConsumerDashboardNotifications, getConsumerDashboardOrders, getConsumerDashboardPurchaseHistory, getConsumerDashboardReviews, getConsumerDashboardSummary } from "../services/api";
import { useI18n } from "../i18n";

export default function ConsumerDashboard({ onBack }) {
  const { t } = useI18n();
  const [dashboard, setDashboard] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([
      getConsumerDashboardSummary(),
      getConsumerDashboardOrders(),
      getConsumerDashboardPurchaseHistory(),
      getConsumerDashboardCartSummary(),
      getConsumerDashboardReviews(),
      getConsumerDashboardNotifications(),
    ]).then(([summary, orders, history, cart, reviews, notifications]) => setDashboard({ summary, orders, history, cart, reviews, notifications })).catch((requestError) => setError(requestError.message || "Unable to load the consumer dashboard."));
  }, []);

  if (error) return <section className="detail-view"><button className="back-button" onClick={onBack}>← {t("back")}</button><div className="error">{error}</div></section>;
  if (!dashboard) return <section className="detail-view"><button className="back-button" onClick={onBack}>← {t("back")}</button><div className="loading">{t("loading")}</div></section>;

  const { summary, orders, history, cart, reviews, notifications } = dashboard;
  const recentOrders = Array.isArray(orders) ? orders.slice(0, 4) : [];
  const recentHistory = Array.isArray(history) ? history.slice(0, 4) : [];
  const reviewCount = Array.isArray(reviews) ? reviews.length : 0;
  const notificationCount = notifications?.items?.length || 0;

  return (
    <section className="detail-view consumer-dashboard">
      <button className="back-button" onClick={onBack}>← {t("back")}</button>

      <div className="consumer-screen-header consumer-hero">
        <span className="eyebrow">{t("consumerDashboard")}</span>
        <h1>{t("buyingActivity")}</h1>
        <p>Stay on top of orders, purchases, cart, feedback, and updates in one place.</p>
      </div>

      <div className="detail-stats dashboard-grid">
        <div className="dashboard-stat accent"><b>{summary.total_orders}</b><span>Total orders</span></div>
        <div className="dashboard-stat"><b>{summary.completed_orders}</b><span>Completed</span></div>
        <div className="dashboard-stat"><b>₹{Number(summary.total_purchase_value || 0).toFixed(2)}</b><span>Total spent</span></div>
        <div className="dashboard-stat"><b>{cart?.item_count ?? 0}</b><span>Cart items</span></div>
        <div className="dashboard-stat"><b>{summary.unread_notification_count}</b><span>{t("notifications")}</span></div>
      </div>

      <div className="dashboard-panels">
        <section className="panel-block">
          <div className="section-heading-row">
            <div>
              <span className="eyebrow">Recent activity</span>
              <h2>Recent orders</h2>
            </div>
          </div>
          <div className="review-list dashboard-list">
            {recentOrders.length ? recentOrders.map((order) => (
              <article className="review-card dashboard-card" key={order.id}>
                <div className="review-header">
                  <div>
                    <b>Order {order.id.slice(0, 8)}</b>
                    <span>{new Date(order.order_date).toLocaleDateString()}</span>
                  </div>
                  <div className="dashboard-pill">{order.status}</div>
                </div>
                <p>₹{Number(order.amount || 0).toFixed(2)} · {order.item_count} item(s)</p>
              </article>
            )) : <div className="empty">No orders yet.</div>}
          </div>
        </section>

        <section className="panel-block">
          <div className="section-heading-row">
            <div>
              <span className="eyebrow">Purchase history</span>
              <h2>Recently bought</h2>
            </div>
          </div>
          <div className="review-list dashboard-list">
            {recentHistory.length ? recentHistory.map((item) => (
              <article className="review-card dashboard-card" key={item.id}>
                <div className="review-header">
                  <div>
                    <b>{item.crop_name || "Purchase"}</b>
                    <span>{new Date(item.order_date).toLocaleDateString()}</span>
                  </div>
                  <div className="dashboard-pill price-pill">₹{Number(item.amount || 0).toFixed(2)}</div>
                </div>
                <p>{item.quantity} from {item.farmer_name || "Farmer"}</p>
              </article>
            )) : <div className="empty">No completed purchases yet.</div>}
          </div>
        </section>
      </div>

      <div className="inline-summary">
        <span className="dashboard-pill muted-pill">Reviews: {reviewCount}</span>
        <span className="dashboard-pill muted-pill">{t("notifications")}: {notificationCount}</span>
      </div>
    </section>
  );
}
