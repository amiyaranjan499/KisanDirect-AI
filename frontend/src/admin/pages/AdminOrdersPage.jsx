import { useEffect, useMemo, useState } from "react";
import { listAdminOrders } from "../../services/adminApi";

const money = (value) => `₹${Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

export default function AdminOrdersPage() {
  const [rows, setRows] = useState([]);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    listAdminOrders().then(setRows).catch((requestError) => setError(requestError.message || "Unable to load orders."));
  }, []);

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    return rows.filter((row) => !query || `${row.consumer_name || ""} ${row.status || ""} ${row.payment_status || ""} ${row.delivery_status || ""}`.toLowerCase().includes(query));
  }, [rows, search]);

  return (
    <section className="detail-view admin-page-explicit">
      <div className="consumer-screen-header admin-header-block">
        <div>
          <span className="eyebrow">Orders</span>
          <h1>Orders</h1>
        </div>
      </div>

      <div className="admin-toolbar">
        <div className="admin-search-box">
          <i className="bi bi-search" />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search orders..." />
        </div>
      </div>

      {error ? <div className="error">{error}</div> : null}

      <div className="admin-table-wrap admin-table-large">
        <table>
          <thead>
            <tr><th>Order</th><th>Consumer</th><th>Amount</th><th>Status</th><th>Payment</th><th>Delivery</th></tr>
          </thead>
          <tbody>
            {filteredRows.map((order) => (
              <tr key={order.id}>
                <td><strong>{`ORD-${String(order.id).slice(0, 6).toUpperCase()}`}</strong></td>
                <td>{order.consumer_name || "Consumer"}</td>
                <td>{money(order.total_amount || 0)}</td>
                <td><span className="admin-badge admin-badge-status">{order.status}</span></td>
                <td>{order.payment_status || "Pending"}</td>
                <td>{order.delivery_status || "Pending"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
