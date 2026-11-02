import { useState } from "react";
import "./farmer-operations.css";

export default function FarmerSettings() {
  const [message, setMessage] = useState("");

  // Preference switches persisted in localStorage
  const [prefs, setPrefs] = useState(() => {
    try {
      const saved = localStorage.getItem("kisandirect_farmer_prefs");
      return saved
        ? JSON.parse(saved)
        : {
            orderNotifs: true,
            aiAlerts: true,
            priceAlerts: true,
            promoEmails: false,
          };
    } catch {
      return { orderNotifs: true, aiAlerts: true, priceAlerts: true, promoEmails: false };
    }
  });

  const togglePref = (key, title) => {
    setPrefs((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      try {
        localStorage.setItem("kisandirect_farmer_prefs", JSON.stringify(next));
      } catch {
        // ignore
      }
      return next;
    });
    setMessage(`Updated preference for ${title}.`);
    setTimeout(() => setMessage(""), 3000);
  };

  const preferenceItems = [
    {
      key: "orderNotifs",
      title: "Order & Dispatch Notifications",
      description: "Receive instant notifications when customers place new orders or riders arrive for pickup.",
      icon: "bi-receipt",
      iconBg: "#EDF8DF",
      iconColor: "#1B6B34",
    },
    {
      key: "aiAlerts",
      title: "Crop Quality AI Alerts",
      description: "Get real-time updates when automated image assessments complete fresh produce grading.",
      icon: "bi-stars",
      iconBg: "#F5EBE1",
      iconColor: "#C68A3D",
    },
    {
      key: "priceAlerts",
      title: "AI Fair Price Recommendations",
      description: "Alerts when regional market demand shifts and new benchmark prices are calculated for your crops.",
      icon: "bi-tag-fill",
      iconBg: "#E8F5E9",
      iconColor: "#0E5A3C",
    },
    {
      key: "promoEmails",
      title: "Platform & Farming Advisories",
      description: "Periodic seasonal farming tips, weather alerts, and platform feature announcements.",
      icon: "bi-megaphone-fill",
      iconBg: "#F5F1E6",
      iconColor: "#79705F",
    },
  ];

  return (
    <div style={{ maxWidth: "1000px", margin: "0 auto", padding: "16px 8px 60px" }}>
      {/* Page Header */}
      <div className="d-flex justify-content-between align-items-center flex-wrap gap-3 mb-4">
        <div>
          <h1 style={{ fontFamily: "'Fraunces', Georgia, serif", color: "#1B6B34", fontSize: "26px", fontWeight: 700, margin: 0 }}>
            Settings
          </h1>
          <p style={{ margin: "4px 0 0", color: "#79705F", fontSize: "14px" }}>
            Configure your order notifications, AI alerts, and communication preferences.
          </p>
        </div>
      </div>

      {/* Feedback Toast / Alert */}
      {message && (
        <div className="kisan-card kisan-card-pad mb-3" style={{ borderColor: "#CDEBD7", background: "#F5FBF7" }}>
          <div className="d-flex align-items-center justify-content-between">
            <span style={{ color: "#1B6B34", fontWeight: 600, fontSize: "13.5px" }}>
              <i className="bi bi-check-circle-fill me-2" />
              {message}
            </span>
            <button type="button" className="btn-close" onClick={() => setMessage("")} aria-label="Close" />
          </div>
        </div>
      )}

      {/* Notifications & Alerts in unified rectangle box */}
      <div className="kisan-card kisan-card-pad">
        <div className="mb-3">
          <h2 style={{ fontFamily: "'Fraunces', Georgia, serif", fontSize: "18px", fontWeight: 700, margin: 0, color: "#1B6B34" }}>
            Alerts & Notification Channels
          </h2>
          <p style={{ margin: "2px 0 0", color: "#79705F", fontSize: "13px" }}>
            Control when and how you receive updates across your orders and farming operations.
          </p>
        </div>

        <div>
          {preferenceItems.map((item, idx) => {
            const isChecked = !!prefs[item.key];
            const isLast = idx === preferenceItems.length - 1;
            return (
              <div
                key={item.key}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "16px 0",
                  borderBottom: isLast ? "none" : "1px solid #E4DFD1",
                  gap: "16px",
                  cursor: "pointer",
                }}
                onClick={() => togglePref(item.key, item.title)}
              >
                <div style={{ display: "flex", alignItems: "flex-start", gap: "14px", flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      width: "40px",
                      height: "40px",
                      borderRadius: "10px",
                      background: item.iconBg,
                      color: item.iconColor,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: "18px",
                      flexShrink: 0,
                      marginTop: "2px",
                    }}
                  >
                    <i className={item.icon} />
                  </div>
                  <div>
                    <h3 style={{ margin: "0 0 3px", fontSize: "14.5px", fontWeight: 600, color: "#1C1C16" }}>
                      {item.title}
                    </h3>
                    <p style={{ margin: 0, fontSize: "13px", color: "#79705F", lineHeight: 1.45 }}>
                      {item.description}
                    </p>
                  </div>
                </div>

                {/* Accessible Toggle Switch */}
                <div
                  role="switch"
                  aria-checked={isChecked}
                  tabIndex={0}
                  style={{
                    width: "46px",
                    height: "26px",
                    borderRadius: "99px",
                    background: isChecked ? "#1B6B34" : "#E4DFD1",
                    position: "relative",
                    transition: "background 0.2s ease",
                    flexShrink: 0,
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      togglePref(item.key, item.title);
                    }
                  }}
                >
                  <div
                    style={{
                      width: "20px",
                      height: "20px",
                      borderRadius: "50%",
                      background: "#FFFFFF",
                      position: "absolute",
                      top: "3px",
                      left: isChecked ? "23px" : "3px",
                      transition: "left 0.2s ease",
                      boxShadow: "0 1px 3px rgba(0,0,0,0.25)",
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
