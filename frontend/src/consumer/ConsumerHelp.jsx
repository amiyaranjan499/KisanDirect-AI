import { useState } from "react";
import { useNavigate } from "react-router-dom";

const FAQS = [
  {
    q: "How do I track my order?",
    a: "Navigate to 'My Orders' in the sidebar and tap on any active order to view real-time delivery status, rider location, and estimated arrival time.",
  },
  {
    q: "How do I cancel an order?",
    a: "You can cancel an order directly from the 'My Orders' page by clicking the 'Cancel Order' button while the order is in Processing status. Any reserved produce will be returned to stock immediately.",
  },
  {
    q: "What payment methods are accepted?",
    a: "We accept UPI (Google Pay, PhonePe, Paytm, BHIM), Debit/Credit Cards (Visa, Mastercard, RuPay), and Cash on Delivery.",
  },
  {
    q: "How does AI quality grading work?",
    a: "Every crop listing undergoes computer vision analysis using our trained MobileNet AI model to inspect visual freshness, defect ratio, and grade the produce as Grade A or Grade B.",
  },
  {
    q: "When will my produce be delivered?",
    a: "All orders are fulfilled from your nearest local Kisan Storage Hub and delivered to your doorstep within 45 to 90 minutes.",
  },
  {
    q: "How can I contact the farmer directly?",
    a: "On any crop page or from your order summary, click 'View Farm' to visit the farmer's verified profile, location, and full list of available harvest crops.",
  },
];

export default function ConsumerHelp({ onBack }) {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedIndex, setExpandedIndex] = useState(null);

  const handleBack = () => {
    if (onBack) onBack();
    else navigate(-1);
  };

  const filteredFaqs = FAQS.filter(
    (item) =>
      item.q.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.a.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div
      className="consumer-help-page wrap"
      style={{
        maxWidth: "760px",
        margin: "0 auto",
        padding: "16px 20px 48px",
      }}
    >
      {/* 1. Back button */}
      <div style={{ marginBottom: "12px" }}>
        <button
          type="button"
          onClick={handleBack}
          style={{
            background: "#FFFFFF",
            border: "1px solid var(--line, #E4DFD1)",
            color: "var(--forest, #1B6B34)",
            padding: "6px 14px",
            borderRadius: "8px",
            fontSize: "13px",
            fontWeight: 600,
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            gap: "6px",
            transition: "all 0.15s ease",
          }}
        >
          <i className="bi bi-chevron-left" style={{ fontSize: "11px" }} />
          <span>Back to profile</span>
        </button>
      </div>

      {/* 2. Header */}
      <div style={{ marginBottom: "20px" }}>
        <h2
          style={{
            fontSize: "24px",
            fontWeight: 700,
            color: "var(--forest, #1B6B34)",
            margin: "0 0 4px",
            fontFamily: "Fraunces, Georgia, serif",
          }}
        >
          Help & Support
        </h2>
        <p style={{ fontSize: "13.5px", color: "var(--clay, #79705F)", margin: 0 }}>
          Find answers to common questions or connect with our customer support team.
        </p>
      </div>

      {/* 3. Search Box */}
      <div
        className="card card-pad"
        style={{
          padding: "14px 18px",
          background: "#FFFFFF",
          borderRadius: "14px",
          border: "1px solid var(--line, #E4DFD1)",
          marginBottom: "16px",
          boxShadow: "0 1px 4px rgba(0, 0, 0, 0.02)",
        }}
      >
        <div style={{ position: "relative" }}>
          <i
            className="bi bi-search"
            style={{
              position: "absolute",
              left: "12px",
              top: "50%",
              transform: "translateY(-50%)",
              color: "var(--clay, #79705F)",
              fontSize: "14px",
            }}
          />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search help topics (e.g. delivery, cancellation, quality)..."
            style={{
              width: "100%",
              padding: "10px 14px 10px 36px",
              borderRadius: "10px",
              border: "1px solid var(--line, #E4DFD1)",
              background: "#FAF9F5",
              fontSize: "13.5px",
              color: "var(--ink, #1C1C16)",
            }}
          />
        </div>
      </div>

      {/* 4. FAQs Card List */}
      <div
        className="card"
        style={{
          borderRadius: "14px",
          border: "1px solid var(--line, #E4DFD1)",
          background: "#FFFFFF",
          overflow: "hidden",
          marginBottom: "20px",
          boxShadow: "0 1px 4px rgba(0, 0, 0, 0.02)",
        }}
      >
        <div
          style={{
            padding: "14px 20px",
            background: "#F8FAF8",
            borderBottom: "1px solid var(--line, #E4DFD1)",
            fontSize: "13px",
            fontWeight: 700,
            color: "var(--forest, #1B6B34)",
            display: "flex",
            alignItems: "center",
            gap: "6px",
          }}
        >
          <i className="bi bi-question-circle-fill" /> Frequently Asked Questions
        </div>

        {filteredFaqs.length > 0 ? (
          filteredFaqs.map((faq, idx) => {
            const isExpanded = expandedIndex === idx;
            return (
              <div
                key={faq.q}
                style={{
                  borderBottom: idx < filteredFaqs.length - 1 ? "1px solid var(--line, #E4DFD1)" : "none",
                }}
              >
                <div
                  onClick={() => setExpandedIndex(isExpanded ? null : idx)}
                  style={{
                    padding: "14px 20px",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    cursor: "pointer",
                    background: isExpanded ? "#FAF9F5" : "#FFFFFF",
                    transition: "background 0.15s ease",
                  }}
                >
                  <span style={{ fontSize: "14px", fontWeight: 600, color: "var(--ink, #1C1C16)" }}>
                    {faq.q}
                  </span>
                  <i
                    className={`bi ${isExpanded ? "bi-chevron-up" : "bi-chevron-down"}`}
                    style={{ fontSize: "12px", color: "var(--clay, #79705F)", flexShrink: 0, marginLeft: "10px" }}
                  />
                </div>
                {isExpanded && (
                  <div
                    style={{
                      padding: "0 20px 14px",
                      background: "#FAF9F5",
                      fontSize: "13.5px",
                      color: "var(--clay, #79705F)",
                      lineHeight: 1.6,
                    }}
                  >
                    {faq.a}
                  </div>
                )}
              </div>
            );
          })
        ) : (
          <div style={{ padding: "24px", textAlign: "center", color: "var(--clay, #79705F)", fontSize: "13.5px" }}>
            No topics matched "{searchQuery}". Try a different keyword.
          </div>
        )}
      </div>
    </div>
  );
}

