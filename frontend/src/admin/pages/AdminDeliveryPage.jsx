import { useEffect, useMemo, useState } from "react";
import { listAdminOrders } from "../../services/adminApi";

export default function AdminDeliveryPage() {
  const [rows, setRows] = useState([]);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    listAdminOrders().then(setRows).catch((requestError) => setError(requestError.message || "Unable to load delivery data."));
  }, []);

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    return rows.filter((row) => !query || `${row.consumer_name || ""} ${row.delivery_status || ""} ${row.status || ""}`.toLowerCase().includes(query));
  }, [rows, search]);

  return (
    <section className="detail-view admin-page-explicit">
      <div className="consumer-screen-header admin-header-block">
        <div>
          <span className="eyebrow">Delivery</span>
          <h1>Delivery operations</h1>
        </div>
      </div>

      <div className="admin-toolbar">
        <div className="admin-search-box">
          <i className="bi bi-search" />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search delivery..." />
        </div>
      </div>

      {error ? <div className="error">{error}</div> : null}

      <div className="admin-table-wrap admin-table-large">
        <table>
          <thead>
            <tr><th>Order</th><th>Consumer</th><th>Delivery status</th><th>Order status</th><th>Items</th></tr>
          </thead>
          <tbody>
            {filteredRows.map((order) => (
              <tr key={order.id}>
                <td>{`ORD-${String(order.id).slice(0, 6).toUpperCase()}`}</td>
                <td>{order.consumer_name || "Consumer"}</td>
                <td><span className="admin-badge admin-badge-status">{order.delivery_status || "Pending"}</span></td>
                <td>{order.status}</td>
                <td>{order.item_count || 0}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
