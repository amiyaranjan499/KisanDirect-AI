import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";

export default function ConsumerSettings({ onBack }) {
  const navigate = useNavigate();

  const [settings, setSettings] = useState(() => {
    try {
      const stored = localStorage.getItem("kisandirect_consumer_settings");
      return stored
        ? JSON.parse(stored)
        : {
            pushNotifs: true,
            smsUpdates: true,
            promoEmails: false,
            darkMode: false,
            language: "English",
          };
    } catch {
      return {
        pushNotifs: true,
        smsUpdates: true,
        promoEmails: false,
        darkMode: false,
        language: "English",
      };
    }
  });

  const [savedMsg, setSavedMsg] = useState("");

  const toggleSetting = (key) => {
    setSettings((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      localStorage.setItem("kisandirect_consumer_settings", JSON.stringify(next));
      return next;
    });
    setSavedMsg("Setting updated");
    setTimeout(() => setSavedMsg(""), 2000);
  };

  const changeLanguage = (e) => {
    const lang = e.target.value;
    setSettings((prev) => {
      const next = { ...prev, language: lang };
      localStorage.setItem("kisandirect_consumer_settings", JSON.stringify(next));
      return next;
    });
    setSavedMsg("Language preference saved");
    setTimeout(() => setSavedMsg(""), 2000);
  };

  const handleBack = () => {
    if (onBack) onBack();
    else navigate(-1);
  };

  const toggleItems = [
    { key: "pushNotifs", label: "Push notifications" },
    { key: "smsUpdates", label: "Order updates by SMS" },
    { key: "promoEmails", label: "Promotional emails" },
    { key: "darkMode", label: "Dark mode (follows device)" },
  ];

  return (
    <div
      className="consumer-settings-page wrap"
      style={{
        maxWidth: "1200px",
        margin: "0 auto",
        padding: "16px 20px 48px",
      }}
    >
      {/* 1. Back button matching reference design */}
      <div style={{ marginBottom: "14px" }}>
        <button
          type="button"
          onClick={handleBack}
          style={{
            background: "transparent",
            border: "1px solid var(--forest, #1B6B34)",
            color: "var(--forest, #1B6B34)",
            padding: "4px 10px",
            borderRadius: "4px",
            fontSize: "13px",
            fontWeight: 500,
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            gap: "4px",
            transition: "all 0.15s ease",
          }}
        >
          <span>&lt; Back to profile</span>
        </button>
      </div>

      {/* 2. Heading */}
      <div className="section-title" style={{ marginBottom: "16px" }}>
        <h2
          style={{
            fontSize: "24px",
            fontWeight: 700,
            color: "var(--forest, #1B6B34)",
            margin: 0,
            fontFamily: "'Fraunces', Georgia, serif",
          }}
        >
          Settings
        </h2>
        {savedMsg && (
          <span
            style={{
              fontSize: "12px",
              color: "var(--forest, #1B6B34)",
              fontWeight: 600,
              display: "inline-flex",
              alignItems: "center",
              gap: "4px",
            }}
          >
            <i className="bi bi-check2" /> {savedMsg}
          </span>
        )}
      </div>

      {/* 3. Toggles List matching reference screenshot */}
      <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginBottom: "10px" }}>
        {toggleItems.map((item) => {
          const isOn = Boolean(settings[item.key]);
          return (
            <div
              key={item.key}
              style={{
                display: "flex",
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "16px 24px",
                background: "#FFFFFF",
                borderRadius: "14px",
                border: "1px solid var(--line, #E4DFD1)",
                boxShadow: "0 1px 3px rgba(0, 0, 0, 0.02)",
                boxSizing: "border-box",
                width: "100%",
                minHeight: "56px",
                height: "auto",
              }}
            >
              <span
                style={{
                  fontSize: "14px",
                  fontWeight: 500,
                  color: "var(--ink, #1C1C16)",
                  textAlign: "left",
                  margin: 0,
                  padding: 0,
                }}
              >
                {item.label}
              </span>

              {/* Solid Capsule Toggle matching reference screenshot */}
              <div
                role="switch"
                aria-checked={isOn}
                tabIndex={0}
                onClick={() => toggleSetting(item.key)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    toggleSetting(item.key);
                  }
                }}
                style={{
                  width: "44px",
                  height: "24px",
                  borderRadius: "99px",
                  background: isOn ? "var(--forest, #1B6B34)" : "var(--line, #E4DFD1)",
                  position: "relative",
                  cursor: "pointer",
                  transition: "background 0.2s ease",
                  flexShrink: 0,
                }}
                title={isOn ? "Enabled (click to toggle)" : "Disabled (click to toggle)"}
              />
            </div>
          );
        })}
      </div>

      {/* 4. Language Selector Card matching reference screenshot */}
      <div
        style={{
          padding: "16px 24px",
          background: "#FFFFFF",
          borderRadius: "14px",
          border: "1px solid var(--line, #E4DFD1)",
          boxShadow: "0 1px 3px rgba(0, 0, 0, 0.02)",
          boxSizing: "border-box",
          width: "100%",
        }}
      >
        <div style={{ marginBottom: 0 }}>
          <label
            htmlFor="settings-language-select"
            style={{
              display: "block",
              fontSize: "12px",
              fontWeight: 600,
              color: "var(--clay, #79705F)",
              marginBottom: "6px",
            }}
          >
            Language
          </label>
          <select
            id="settings-language-select"
            value={settings.language || "English"}
            onChange={changeLanguage}
            style={{
              width: "100%",
              padding: "11px 14px",
              borderRadius: "9px",
              border: "1px solid var(--line, #E4DFD1)",
              background: "#FFFFFF",
              color: "var(--ink, #1C1C16)",
              fontSize: "14px",
              cursor: "pointer",
              fontWeight: 500,
              outline: "none",
              fontFamily: "inherit",
            }}
          >
            <option value="English">English</option>
            <option value="हिन्दी">हिन्दी</option>
            <option value="मराठी">मराठी</option>
            <option value="ଓଡ଼ିଆ">ଓଡ଼ିଆ</option>
          </select>
        </div>
      </div>
    </div>
  );
}
