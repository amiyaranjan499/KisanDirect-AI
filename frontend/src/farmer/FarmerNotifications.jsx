import { useEffect, useMemo, useState } from "react";
import {
  deleteNotification,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "../services/api";

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

export default function FarmerNotifications() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("All");
  const [deletingId, setDeletingId] = useState(null);

  const load = () => {
    listNotifications({ pageSize: 50 })
      .then(setData)
      .catch((requestError) => setError(requestError.message || "Unable to load notifications."));
  };

  const handleDelete = async (id) => {
    if (!id || deletingId) return;
    try {
      setDeletingId(id);
      await deleteNotification(id);
      setData((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          items: (prev.items || []).filter((item) => String(item.id) !== String(id)),
          total: Math.max(0, (prev.total || 1) - 1),
        };
      });
    } catch (requestError) {
      setError(requestError.message || "Failed to delete notification.");
    } finally {
      setDeletingId(null);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const items = useMemo(() => {
    const allItems = data?.items || [];
    return allItems.filter((item) => typeGroups[tab](item));
  }, [data, tab]);

  const unreadCount = (data?.items || []).filter((item) => !item.is_read).length;

  return (
    <div style={{ maxWidth: "1000px", margin: "0 auto", padding: "16px 8px 60px" }}>
      {/* Page Header */}
      <div className="d-flex justify-content-between align-items-center flex-wrap gap-3 mb-4">
        <div>
          <h1 style={{ fontFamily: "'Fraunces', Georgia, serif", color: "#1B6B34", fontSize: "26px", fontWeight: 700, margin: 0 }}>
            Notifications
          </h1>
          <p style={{ margin: "4px 0 0", color: "#79705F", fontSize: "14px" }}>
            Real-time updates from orders, payments, quality AI, and farm operations.
          </p>
        </div>
        {unreadCount > 0 && (
          <button
            type="button"
            className="kisan-btn-outline kisan-btn-sm"
            onClick={() => markAllNotificationsRead().then(load)}
          >
            <i className="bi bi-check2-all me-1" /> Mark all as read
          </button>
        )}
      </div>

      {/* Filter Tabs */}
      <div className="tabs mb-4">
        {Object.keys(typeGroups).map((key) => (
          <button
            key={key}
            type="button"
            className={`tab ${tab === key ? "active" : ""}`}
            onClick={() => setTab(key)}
          >
            {key}
          </button>
        ))}
      </div>

      {error ? (
        <div className="kisan-card kisan-card-pad text-center py-4" style={{ borderColor: "#F28B82", background: "#FDF2F0" }}>
          <p style={{ color: "#C53929", margin: 0, fontWeight: 600 }}>{error}</p>
        </div>
      ) : !data ? (
        <div className="kisan-card kisan-card-pad text-center py-5">
          <div className="spinner-border text-success" role="status" style={{ width: "2rem", height: "2rem" }} />
          <p style={{ marginTop: "12px", color: "#79705F", fontSize: "14px" }}>Loading notifications...</p>
        </div>
      ) : items.length ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          {items.map((item) => (
            <article
              key={item.id}
              className="kisan-card kisan-card-pad"
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: "16px",
                borderLeft: !item.is_read ? "4px solid #1B6B34" : "1px solid #E4DFD1",
                background: !item.is_read ? "#FAFDFB" : "#FFFFFF",
              }}
            >
              <div
                style={{
                  width: "40px",
                  height: "40px",
                  borderRadius: "10px",
                  background: item.notification_type === "AI" ? "#F5EBE1" : item.notification_type === "PAYMENT" ? "#E8F5E9" : "#EDF8DF",
                  color: item.notification_type === "AI" ? "#C68A3D" : item.notification_type === "PAYMENT" ? "#1B6B34" : "#0E5A3C",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "18px",
                  flexShrink: 0,
                }}
              >
                <i className={item.notification_type === "AI" ? "bi bi-stars" : item.notification_type === "PAYMENT" ? "bi bi-wallet2" : item.notification_type === "REVIEW" ? "bi bi-chat-quote" : "bi bi-bell"} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="d-flex align-items-center justify-content-between gap-2 flex-wrap mb-1">
                  <h3 style={{ margin: 0, fontSize: "15px", fontWeight: 700, color: "#1C1C16" }}>
                    {item.title}
                  </h3>
                  <div className="d-flex align-items-center gap-2">
                    <span style={{ fontSize: "12px", color: "#79705F" }}>
                      {item.created_at ? formatRelativeTime(item.created_at) : "recently"}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleDelete(item.id)}
                      disabled={deletingId === item.id}
                      title="Delete notification"
                      style={{
                        background: "none",
                        border: "none",
                        padding: "2px 5px",
                        cursor: deletingId === item.id ? "not-allowed" : "pointer",
                        color: deletingId === item.id ? "#C53929" : "#9A9080",
                        fontSize: "14px",
                        lineHeight: 1,
                        borderRadius: "4px",
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        opacity: deletingId === item.id ? 0.6 : 1,
                        transition: "color 0.15s ease, opacity 0.15s ease",
                      }}
                      onMouseEnter={(e) => {
                        if (deletingId !== item.id) e.currentTarget.style.color = "#C53929";
                      }}
                      onMouseLeave={(e) => {
                        if (deletingId !== item.id) e.currentTarget.style.color = "#9A9080";
                      }}
                      aria-label="Delete notification"
                    >
                      {deletingId === item.id ? (
                        <span className="spinner-border spinner-border-sm" style={{ width: "12px", height: "12px", borderWidth: "1.5px" }} />
                      ) : (
                        <i className="bi bi-trash" />
                      )}
                    </button>
                  </div>
                </div>
                <p style={{ margin: "0 0 8px", fontSize: "13.5px", color: "#4A453A", lineHeight: 1.5 }}>
                  {item.message}
                </p>
                <div className="d-flex align-items-center justify-content-between gap-2">
                  <span
                    style={{
                      display: "inline-block",
                      padding: "2px 8px",
                      borderRadius: "6px",
                      background: "#F5F1E6",
                      fontSize: "11px",
                      fontWeight: 600,
                      color: "#79705F",
                      textTransform: "uppercase",
                    }}
                  >
                    {item.notification_type}
                  </span>
                  {!item.is_read && (
                    <button
                      type="button"
                      className="kisan-btn-outline kisan-btn-sm"
                      style={{ fontSize: "12px", padding: "4px 10px" }}
                      onClick={() => markNotificationRead(item.id).then(load)}
                    >
                      Mark read
                    </button>
                  )}
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="kisan-card kisan-card-pad text-center py-5" style={{ background: "#FFFFFF" }}>
          <div
            style={{
              width: "56px",
              height: "56px",
              borderRadius: "50%",
              background: "#EDF8DF",
              color: "#1B6B34",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "24px",
              margin: "0 auto 14px",
            }}
          >
            <i className="bi bi-bell" />
          </div>
          <h2 style={{ fontFamily: "'Fraunces', Georgia, serif", fontSize: "18px", fontWeight: 700, margin: "0 0 6px", color: "#1B6B34" }}>
            No notifications
          </h2>
          <p style={{ color: "#79705F", fontSize: "13.5px", margin: 0, maxWidth: "420px", marginLeft: "auto", marginRight: "auto" }}>
            New updates from orders, payments, crop listings, and AI quality assessments will appear here.
          </p>
        </div>
      )}
    </div>
  );
}

