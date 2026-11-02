import { useEffect, useState } from "react";
import { listNotifications, markNotificationRead } from "../services/api";

function formatTimeAgo(dateStr) {
  if (!dateStr) return "Just now";
  const date = new Date(dateStr);
  const diffSec = Math.floor((new Date() - date) / 1000);
  if (diffSec < 60) return "Just now";
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)} min ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)} hr ago`;
  const days = Math.floor(diffSec / 86400);
  return days === 1 ? "1 day ago" : `${days} days ago`;
}

export default function ConsumerNotifications() {
  const [notifications, setNotifications] = useState([]);
  const [selectedFilter, setSelectedFilter] = useState("All");
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");

  const filters = ["All", "Orders", "Updates"];

  const loadNotifications = () => {
    setLoading(true);
    listNotifications()
      .then((res) => {
        const items = res?.items || (Array.isArray(res) ? res : []);
        setNotifications(items);
        setErrorMsg("");
      })
      .catch((err) => {
        setErrorMsg(err.message || "Failed to load notifications.");
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadNotifications();
  }, []);

  const handleMarkRead = async (id, currentRead) => {
    if (currentRead) return;
    try {
      await markNotificationRead(id);
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, is_read: true } : n))
      );
    } catch {
      // Ignore background read error
    }
  };

  const getCategory = (item) => {
    const text = `${item.title || ""} ${item.message || ""}`.toLowerCase();
    if (text.includes("order") || text.includes("payment") || text.includes("delivered") || text.includes("delivery")) {
      return "Orders";
    }
    return "Updates";
  };

  const filtered = notifications.filter((item) => {
    if (selectedFilter === "All") return true;
    return getCategory(item) === selectedFilter;
  });

  return (
    <div className="consumer-notifications-page wrap" style={{ maxWidth: "1200px", margin: "0 auto", padding: "8px 16px 48px" }}>
      {/* 1. Page Header */}
      <div className="section-title" style={{ marginBottom: "16px" }}>
        <h2 style={{ fontSize: "24px", fontWeight: 700, color: "var(--forest, #1B6B34)", margin: 0, fontFamily: "Fraunces, Georgia, serif" }}>
          Notifications
        </h2>
      </div>

      {/* 2. Filter Pills Tabs */}
      <div
        className="tabs scrollx"
        style={{
          display: "flex",
          flexWrap: "nowrap",
          gap: "8px",
          overflowX: "auto",
          paddingBottom: "12px",
          marginBottom: "20px",
          scrollbarWidth: "none",
          WebkitOverflowScrolling: "touch",
        }}
      >
        {filters.map((f) => {
          const isActive = selectedFilter === f;
          return (
            <button
              key={f}
              type="button"
              className={`tab ${isActive ? "active" : ""}`}
              onClick={() => setSelectedFilter(f)}
              style={{
                flex: "0 0 auto",
                flexShrink: 0,
                minWidth: "max-content",
                width: "auto",
                padding: "8px 18px",
                fontSize: "13px",
                fontWeight: 600,
                borderRadius: "99px",
                border: isActive ? "1px solid var(--forest, #1B6B34)" : "1px solid var(--line, #E4DFD1)",
                background: isActive ? "var(--forest, #1B6B34)" : "#FFFFFF",
                color: isActive ? "#FFFFFF" : "var(--clay, #79705F)",
                cursor: "pointer",
                whiteSpace: "nowrap",
                transition: "all 0.15s ease",
              }}
            >
              {f}
            </button>
          );
        })}
      </div>

      {errorMsg && (
        <div className="alert alert-warning" style={{ borderRadius: "10px", marginBottom: "16px" }}>
          {errorMsg}
        </div>
      )}

      {/* 3. Notifications List */}
      {loading ? (
        <div className="loading" style={{ padding: "40px 0", textAlign: "center" }}>
          Loading notifications...
        </div>
      ) : filtered.length > 0 ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          {filtered.map((item) => {
            const isUnread = !item.is_read;
            const category = getCategory(item);
            const timeAgo = formatTimeAgo(item.created_at);

            return (
              <div
                key={item.id}
                onClick={() => handleMarkRead(item.id, item.is_read)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "14px",
                  padding: "14px 18px",
                  borderRadius: "14px",
                  background: isUnread ? "var(--sage-light, #E3F5E4)" : "#FFFFFF",
                  border: isUnread ? "1px solid #A4D9A7" : "1px solid var(--line, #E4DFD1)",
                  cursor: "pointer",
                  transition: "background 0.15s ease, border-color 0.15s ease",
                }}
              >
                {/* Left Circular Bell Icon */}
                <div
                  style={{
                    width: "38px",
                    height: "38px",
                    borderRadius: "50%",
                    background: "#FFFFFF",
                    border: "1px solid var(--line, #E4DFD1)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "var(--forest, #1B6B34)",
                    flexShrink: 0,
                  }}
                >
                  <i className="bi bi-bell" style={{ fontSize: "16px" }} />
                </div>

                {/* Right: Title & Category/Time */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: "14px",
                      fontWeight: isUnread ? 700 : 600,
                      color: "var(--ink, #1C1C16)",
                      marginBottom: "3px",
                    }}
                  >
                    {item.title}
                  </div>
                  <div style={{ fontSize: "12px", color: "var(--clay, #79705F)" }}>
                    {category} · {timeAgo}
                  </div>
                </div>

                {/* Unread dot indicator */}
                {isUnread && (
                  <span
                    style={{
                      width: "8px",
                      height: "8px",
                      borderRadius: "50%",
                      background: "var(--forest, #1B6B34)",
                      flexShrink: 0,
                    }}
                  />
                )}
              </div>
            );
          })}
        </div>
      ) : (
        /* Empty State */
        <div
          className="card card-pad"
          style={{
            textAlign: "center",
            padding: "48px 20px",
            borderRadius: "14px",
            border: "1px solid var(--line, #E4DFD1)",
            background: "#FFFFFF",
          }}
        >
          <div style={{ fontSize: "36px", marginBottom: "12px", color: "var(--clay, #79705F)" }}>
            <i className="bi bi-bell-slash" />
          </div>
          <h3 style={{ fontSize: "17px", fontWeight: 700, color: "var(--forest, #1B6B34)", fontFamily: "'Fraunces', Georgia, serif", marginBottom: "6px" }}>
            No notifications
          </h3>
          <p style={{ fontSize: "13.5px", color: "var(--clay, #79705F)" }}>
            {selectedFilter === "All"
              ? "You're all caught up! New updates will appear here."
              : `No notifications in "${selectedFilter}".`}
          </p>
        </div>
      )}
    </div>
  );
}
