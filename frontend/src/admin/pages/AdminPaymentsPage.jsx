import { useEffect, useMemo, useState } from "react";
import { listAdminPayments } from "../../services/adminApi";

const money = (value) => `₹${Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

export default function AdminPaymentsPage() {
  const [rows, setRows] = useState([]);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    listAdminPayments().then(setRows).catch((requestError) => setError(requestError.message || "Unable to load payments."));
  }, []);

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    return rows.filter((row) => !query || `${row.consumer_name || ""} ${row.status || ""} ${row.payment_method || ""} ${row.provider_reference || ""}`.toLowerCase().includes(query));
  }, [rows, search]);

  return (
    <section className="detail-view admin-page-explicit">
      <div className="consumer-screen-header admin-header-block">
        <div>
          <span className="eyebrow">Payments</span>
          <h1>Payments</h1>
        </div>
      </div>

      <div className="admin-toolbar">
        <div className="admin-search-box">
          <i className="bi bi-search" />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search payments..." />
        </div>
      </div>

      {error ? <div className="error">{error}</div> : null}

      <div className="admin-table-wrap admin-table-large">
        <table>
          <thead>
            <tr><th>Order</th><th>Consumer</th><th>Method</th><th>Amount</th><th>Status</th></tr>
          </thead>
          <tbody>
            {filteredRows.map((payment) => (
              <tr key={payment.id}>
                <td>{`ORD-${String(payment.order_id).slice(0, 6).toUpperCase()}`}</td>
                <td>{payment.consumer_name || "Consumer"}</td>
                <td>{payment.payment_method || "Wallet"}</td>
                <td>{money(payment.amount || 0)}</td>
                <td><span className={`admin-badge admin-badge-${payment.status?.toLowerCase() || "pending"}`}>{payment.status || "Pending"}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
