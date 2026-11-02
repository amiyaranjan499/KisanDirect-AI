import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { addConsumerPaymentMethod, listConsumerPaymentMethods, removeConsumerPaymentMethod } from "../services/api";

const emptyForm = { type: "CARD", provider: "", value: "" };

export default function ConsumerPaymentMethods({ onBack }) {
  const navigate = useNavigate();
  const [methods, setMethods] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [showAddForm, setShowAddForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const loadMethods = async () => {
    setLoading(true);
    setError("");
    try {
      const data = await listConsumerPaymentMethods();
      setMethods(Array.isArray(data) ? data : []);
    } catch (requestError) {
      setError(requestError.message || "Unable to load saved payment methods.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMethods();
  }, []);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    setMessage("");

    try {
      const payload = {
        type: form.type,
        provider: form.provider.trim(),
        value: form.value.trim(),
      };
      await addConsumerPaymentMethod(payload);
      setMessage("Payment method saved successfully.");
      setForm(emptyForm);
      setShowAddForm(false);
      await loadMethods();
    } catch (requestError) {
      setError(requestError.message || "Unable to save this payment method.");
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async (paymentId) => {
    setError("");
    setMessage("");
    try {
      await removeConsumerPaymentMethod(paymentId);
      setMethods((previous) => previous.filter((method) => method.id !== paymentId));
      setMessage("Payment method removed.");
    } catch (requestError) {
      setError(requestError.message || "Unable to remove this payment method.");
    }
  };

  const handleBack = () => {
    if (onBack) onBack();
    else navigate(-1);
  };

  return (
    <div
      className="consumer-payment-page wrap"
      style={{
        maxWidth: "840px",
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
          <span>Back</span>
        </button>
      </div>

      {/* 2. Header */}
      <div style={{ marginBottom: "20px" }}>
        <span
          style={{
            fontSize: "12px",
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.06em",
            color: "var(--clay, #79705F)",
            display: "block",
            marginBottom: "4px",
          }}
        >
          Your Account
        </span>
        <h2
          style={{
            fontSize: "24px",
            fontWeight: 700,
            color: "var(--forest, #1B6B34)",
            margin: "0 0 6px",
            fontFamily: "Fraunces, Georgia, serif",
          }}
        >
          Payment Methods
        </h2>
        <p style={{ fontSize: "13.5px", color: "var(--clay, #79705F)", margin: 0 }}>
          Store secure saved cards or UPI handles for faster checkout.
        </p>
      </div>

      {error && (
        <div className="alert alert-warning" style={{ borderRadius: "10px", marginBottom: "16px", padding: "10px 14px", fontSize: "13px" }}>
          {error}
        </div>
      )}
      {message && (
        <div className="alert alert-success" style={{ borderRadius: "10px", marginBottom: "16px", padding: "10px 14px", fontSize: "13px" }}>
          {message}
        </div>
      )}

      {/* 3. Add Payment Form Toggle / Modal */}
      {showAddForm ? (
        <form
          onSubmit={handleSubmit}
          className="card card-pad"
          style={{
            padding: "20px",
            background: "#FFFFFF",
            borderRadius: "14px",
            border: "1.5px solid var(--forest, #1B6B34)",
            marginBottom: "20px",
            boxShadow: "0 4px 16px rgba(27, 107, 52, 0.08)",
          }}
        >
          <h3 style={{ fontSize: "15px", fontWeight: 700, margin: "0 0 14px", color: "var(--forest, #1B6B34)", fontFamily: "'Fraunces', Georgia, serif" }}>
            Add New Payment Method
          </h3>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "14px" }}>
            <div>
              <label style={{ fontSize: "12px", fontWeight: 600, color: "var(--clay, #79705F)", display: "block", marginBottom: "4px" }}>
                Method type
              </label>
              <select
                value={form.type}
                onChange={(e) => setForm((prev) => ({ ...prev, type: e.target.value }))}
                style={{ width: "100%", padding: "8px 12px", borderRadius: "8px", border: "1px solid var(--line, #E4DFD1)", fontSize: "13.5px" }}
              >
                <option value="CARD">Debit / Credit Card</option>
                <option value="UPI">UPI ID / VPA</option>
              </select>
            </div>
            <div>
              <label style={{ fontSize: "12px", fontWeight: 600, color: "var(--clay, #79705F)", display: "block", marginBottom: "4px" }}>
                Provider
              </label>
              <input
                value={form.provider}
                onChange={(e) => setForm((prev) => ({ ...prev, provider: e.target.value }))}
                placeholder={form.type === "CARD" ? "Visa / Mastercard / HDFC" : "Google Pay / PhonePe / Paytm"}
                style={{ width: "100%", padding: "8px 12px", borderRadius: "8px", border: "1px solid var(--line, #E4DFD1)", fontSize: "13.5px" }}
                required
              />
            </div>
          </div>

          <div style={{ marginBottom: "16px" }}>
            <label style={{ fontSize: "12px", fontWeight: 600, color: "var(--clay, #79705F)", display: "block", marginBottom: "4px" }}>
              {form.type === "CARD" ? "Card number" : "UPI handle"}
            </label>
            <input
              value={form.value}
              onChange={(e) => setForm((prev) => ({ ...prev, value: e.target.value }))}
              placeholder={form.type === "CARD" ? "4242 4242 4242 4242" : "username@okhdfcbank"}
              style={{ width: "100%", padding: "8px 12px", borderRadius: "8px", border: "1px solid var(--line, #E4DFD1)", fontSize: "13.5px" }}
              required
            />
          </div>

          <div style={{ display: "flex", gap: "10px" }}>
            <button
              type="submit"
              disabled={saving}
              style={{
                background: "var(--forest, #1B6B34)",
                color: "#FFFFFF",
                border: "none",
                borderRadius: "8px",
                padding: "8px 18px",
                fontSize: "13px",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              {saving ? "Saving..." : "Save Payment Method"}
            </button>
            <button
              type="button"
              onClick={() => setShowAddForm(false)}
              style={{
                background: "#FFFFFF",
                border: "1px solid var(--line, #E4DFD1)",
                color: "var(--clay, #79705F)",
                borderRadius: "8px",
                padding: "8px 16px",
                fontSize: "13px",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setShowAddForm(true)}
          style={{
            width: "100%",
            padding: "12px 18px",
            background: "#FFFFFF",
            border: "1.5px dashed var(--line, #E4DFD1)",
            borderRadius: "12px",
            color: "var(--forest, #1B6B34)",
            fontSize: "13.5px",
            fontWeight: 700,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "8px",
            marginBottom: "20px",
            transition: "all 0.15s ease",
          }}
        >
          <i className="bi bi-plus-circle-fill" style={{ fontSize: "16px" }} />
          <span>Add payment method</span>
        </button>
      )}

      {/* 4. Methods List */}
      {loading ? (
        <div style={{ textAlign: "center", padding: "40px", color: "var(--clay, #79705F)", fontSize: "13px" }}>
          Loading payment methods...
        </div>
      ) : methods.length > 0 ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          {methods.map((method) => {
            const isCard = method.type === "CARD";
            return (
              <div
                key={method.id}
                className="card card-pad"
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "16px 20px",
                  background: "#FFFFFF",
                  borderRadius: "14px",
                  border: "1px solid var(--line, #E4DFD1)",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
                  <div
                    style={{
                      width: "40px",
                      height: "40px",
                      borderRadius: "10px",
                      background: "var(--sage-light, #E3F5E4)",
                      color: "var(--forest, #1B6B34)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: "18px",
                    }}
                  >
                    <i className={isCard ? "bi bi-credit-card-2-front" : "bi bi-phone"} />
                  </div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: "14.5px", color: "var(--ink, #1C1C16)" }}>
                      {method.provider}
                    </div>
                    <div style={{ fontSize: "12.5px", color: "var(--clay, #79705F)" }}>
                      {method.masked_value || method.value} · {isCard ? "Card" : "UPI"}
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => handleRemove(method.id)}
                  style={{
                    background: "transparent",
                    border: "none",
                    color: "var(--danger, #B4432F)",
                    fontSize: "13px",
                    fontWeight: 600,
                    cursor: "pointer",
                    padding: "4px 8px",
                  }}
                >
                  Remove
                </button>
              </div>
            );
          })}
        </div>
      ) : (
        <div
          className="card card-pad"
          style={{
            textAlign: "center",
            padding: "40px 20px",
            background: "#FFFFFF",
            borderRadius: "14px",
            border: "1px solid var(--line, #E4DFD1)",
          }}
        >
          <div style={{ fontSize: "36px", color: "var(--clay, #79705F)", marginBottom: "8px" }}>
            <i className="bi bi-wallet2" />
          </div>
          <h3 style={{ fontSize: "16px", fontWeight: 700, margin: "0 0 4px", color: "var(--forest, #1B6B34)", fontFamily: "'Fraunces', Georgia, serif" }}>
            No saved payment methods
          </h3>
          <p style={{ fontSize: "13px", color: "var(--clay, #79705F)", margin: 0 }}>
            Add a card or UPI handle to make checkout faster.
          </p>
        </div>
      )}
    </div>
  );
}
