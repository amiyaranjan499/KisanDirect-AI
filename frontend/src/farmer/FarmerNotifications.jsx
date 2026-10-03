import { useEffect, useMemo, useState } from "react";
import { listNotifications, markAllNotificationsRead, markNotificationRead } from "../services/api";

const typeGroups = {
  All: () => true,
  Orders: (item) => ["ORDER", "PAYMENT", "DELIVERY"].includes(item.notification_type),
  Updates: (item) => ["LISTING", "SYSTEM"].includes(item.notification_type),
  AI: (item) => ["AI", "REVIEW"].includes(item.notification_type),
};

const formatRelativeTime = (value) => {
  const difference = Date.now() - new Date(value).getTime();
  const minutes = Math.max(1, Math.round(difference / 60000));
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.round(hours / 24);
  return `${days} day ago`;
};

export default function FarmerNotifications({ onBack }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("All");

  const load = () => {
    listNotifications().then(setData).catch((requestError) => setError(requestError.message || "Unable to load notifications."));
  };

  useEffect(() => {
    load();
  }, []);

  const items = useMemo(() => {
    const allItems = data?.items || [];
    return allItems.filter((item) => typeGroups[tab](item));
  }, [data, tab]);

  return (
    <section className="detail-view notifications-page farmer-notifications-page">
      <div className="consumer-screen-header farmer-page-header">
        <div>
          <span className="eyebrow">Farmer workspace</span>
          <h1>Notifications</h1>
        </div>
      </div>

      <div className="farmer-filter-tabs notification-tabs">
        {Object.keys(typeGroups).map((key) => (
          <button key={key} type="button" className={tab === key ? "active" : ""} onClick={() => setTab(key)}>
            {key}
          </button>
        ))}
      </div>

      {error ? (
        <div className="error">{error}</div>
      ) : !data ? (
        <div className="loading">Loading notifications...</div>
      ) : items.length ? (
        <div className="farmer-notification-list">
          {items.map((item, index) => (
            <article className={`farmer-notification-item ${!item.is_read ? "unread" : ""}`} key={item.id}>
              <span className={`list-icon tone-${index % 4}`}><i className={item.notification_type === "AI" ? "bi bi-stars" : item.notification_type === "PAYMENT" ? "bi bi-wallet2" : item.notification_type === "REVIEW" ? "bi bi-chat-quote" : "bi bi-bell"} /></span>
              <div>
                <h3>{item.title}</h3>
                <p>{item.message}</p>
                <small>{item.notification_type} · {item.created_at ? formatRelativeTime(item.created_at) : "recently"}</small>
              </div>
              {!item.is_read && <button type="button" className="farmer-small-button secondary" onClick={() => markNotificationRead(item.id).then(load)}>Mark read</button>}
            </article>
          ))}
        </div>
      ) : (
        <div className="empty">
          <h2>No notifications</h2>
          <p>New updates from orders, payments, and AI analysis will appear here.</p>
        </div>
      )}
    </section>
  );
}

