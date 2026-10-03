import { useEffect, useState } from "react";
import { addConsumerPaymentMethod, listConsumerPaymentMethods, removeConsumerPaymentMethod } from "../services/api";

const emptyForm = { type: "CARD", provider: "", value: "" };

export default function ConsumerPaymentMethods({ onBack }) {
  const [methods, setMethods] = useState([]);
  const [form, setForm] = useState(emptyForm);
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
      setMessage("Payment method saved.");
      setForm(emptyForm);
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

  return (
    <section className="detail-view consumer-payment-page">
      <button className="back-button" onClick={onBack}>← Back</button>
      <div className="consumer-screen-header">
        <span className="eyebrow">Your account</span>
        <h1>Payment Methods</h1>
        <p>Store secure saved cards or UPI handles for faster checkout.</p>
      </div>

      {error && <div className="error">{error}</div>}
      {message && <div className="success">{message}</div>}

      <form className="panel-block" onSubmit={handleSubmit}>
        <div className="form-grid compact-grid">
          <label>
            Method type
            <select value={form.type} onChange={(event) => setForm((previous) => ({ ...previous, type: event.target.value }))}>
              <option value="CARD">Card</option>
              <option value="UPI">UPI</option>
            </select>
          </label>
          <label>
            Provider
            <input
              value={form.provider}
              onChange={(event) => setForm((previous) => ({ ...previous, provider: event.target.value }))}
              placeholder={form.type === "CARD" ? "Visa / Mastercard" : "Google Pay / PhonePe"}
              required
            />
          </label>
          <label>
            {form.type === "CARD" ? "Card number" : "UPI handle"}
            <input
              value={form.value}
              onChange={(event) => setForm((previous) => ({ ...previous, value: event.target.value }))}
              placeholder={form.type === "CARD" ? "4242 4242 4242 4242" : "name@upi"}
              required
            />
          </label>
        </div>
        <div className="button-row">
          <button className="primary-button" type="submit" disabled={saving}>
            {saving ? "Saving..." : "Add payment method"}
          </button>
        </div>
      </form>

      {loading ? (
        <div className="loading">Loading payment methods...</div>
      ) : methods.length === 0 ? (
        <div className="empty">
          <h2>No saved payment methods</h2>
          <p>Add a card or UPI handle to make checkout faster.</p>
        </div>
      ) : (
        <div className="consumer-panel screen-list">
          {methods.map((method) => (
            <article className="consumer-list-row" key={method.id}>
              <span className="list-icon tone-1"><i className="bi bi-credit-card" /></span>
              <div>
                <b>{method.provider}</b>
                <p>{method.type === "CARD" ? method.masked_value : method.masked_value}</p>
                <small>{method.type === "CARD" ? "Card" : "UPI"}</small>
              </div>
              <button className="text-link danger-text" type="button" onClick={() => handleRemove(method.id)}>Remove</button>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
