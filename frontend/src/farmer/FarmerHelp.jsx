import { useState } from "react";
import { useNavigate } from "react-router-dom";

const FAQS = [
  {
    q: "How do I add a new crop listing?",
    a: "Navigate to Crops > Add New Crop. Enter crop details, upload produce photos for AI quality grading, review AI price guidance, and submit for hub supply.",
  },
  {
    q: "How is AI price recommendation calculated?",
    a: "Our machine learning model analyzes harvest freshness, AI visual quality scores, regional APMC market rates, and current hub demand to suggest an optimal fair price.",
  },
  {
    q: "When do I receive payments?",
    a: "Payments are processed securely to your registered account once produce receipt is verified at your assigned Kisan Hub.",
  },
  {
    q: "How do I update order status?",
    a: "Go to the Orders tab. You can view all orders by status (New, Accepted, Preparing, Ready, Out for Delivery, Delivered) and track fulfillment in real time.",
  },
];

export default function FarmerHelp({ onBack }) {
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState(null);
  const [contacted, setContacted] = useState(false);

  const toggle = (idx) => {
    setExpanded((prev) => (prev === idx ? null : idx));
  };

  return (
    <section className="detail-view farmer-help-page">
      <button
        type="button"
        className="btn-ghost"
        style={{ padding: "6px 10px", marginBottom: "14px", display: "inline-flex", alignItems: "center", gap: "6px" }}
        onClick={onBack || (() => navigate("/farmer/profile"))}
      >
        <i className="bi bi-arrow-left" /> Back to profile
      </button>

      <div className="section-title" style={{ marginTop: 0, marginBottom: "16px" }}>
        <h2>Help &amp; Support</h2>
      </div>

      <div className="card" style={{ overflow: "hidden", marginBottom: "20px" }}>
        {FAQS.map((item, i) => {
          const isExp = expanded === i;
          return (
            <div
              key={i}
              style={{
                borderBottom: i < FAQS.length - 1 ? "1px solid var(--line, #E4DFD1)" : "none",
              }}
            >
              <div
                onClick={() => toggle(i)}
                style={{
                  padding: "15px 18px",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  fontSize: "14px",
                  fontWeight: 600,
                  color: "var(--ink, #1C1C16)",
                  cursor: "pointer",
                  userSelect: "none",
                }}
              >
                <span>{item.q}</span>
                <i
                  className={`bi bi-chevron-${isExp ? "up" : "down"}`}
                  style={{ color: "var(--clay, #79705F)", fontSize: "14px", marginLeft: "12px" }}
                />
              </div>
              {isExp && (
                <div
                  style={{
                    padding: "0 18px 16px 18px",
                    fontSize: "13.5px",
                    color: "var(--clay, #79705F)",
                    lineHeight: 1.6,
                  }}
                >
                  {item.a}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {contacted ? (
        <div className="success" style={{ marginBottom: "14px" }}>
          Support inquiry logged. Our hub operations support desk will contact you via your registered phone number.
        </div>
      ) : null}

      <button
        type="button"
        className="primary-button"
        style={{ width: "100%", padding: "12px", borderRadius: "10px", fontWeight: 600 }}
        onClick={() => setContacted(true)}
      >
        <i className="bi bi-headset me-2" /> Contact Hub Support
      </button>
    </section>
  );
}
