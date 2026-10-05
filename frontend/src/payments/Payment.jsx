import { useState } from "react";
import { paymentRequest } from "../services/api";
import { useI18n } from "../i18n";

export default function TestPaymentPanel({ order, onComplete }) {
  const { t } = useI18n();
  const [outcome, setOutcome] = useState("success");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  if (!order) return null;
  const pay = () => { setLoading(true); setMessage(""); paymentRequest(`/payments/test/${order.id}`, { method: "POST", body: JSON.stringify({ outcome }) }).then((payment) => { setMessage(`Sandbox payment ${payment.status}.`); onComplete(); }).catch((error) => setMessage(/reservation expired/i.test(error.message) ? t("checkoutReservationExpired") : error.message)).finally(() => setLoading(false)); };
  if (order.payment?.status === "successful") return <span className="payment-success">TEST payment successful</span>;
  if (!["PENDING", "CONFIRMED"].includes(order.status)) return null;
  return <div className="test-payment"><span className="eyebrow">TEST / SANDBOX PAYMENT</span><p>No real money, cards, bank details, or gateway are used.</p><select value={outcome} onChange={(event) => setOutcome(event.target.value)}><option value="success">Simulate successful payment</option><option value="failed">Simulate failed payment</option><option value="cancelled">Simulate cancelled payment</option></select><button disabled={loading} onClick={pay}>{loading ? "Processing..." : `Pay ₹${order.total_amount} in sandbox`}</button>{message && <small>{message}</small>}</div>;
}
