import { useEffect, useMemo, useState } from "react";
import { listAdminFarmers } from "../../services/adminApi";

const money = (value) => `₹${Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
const formatDate = (value) => new Date(value).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });

export default function AdminFarmersPage() {
  const [rows, setRows] = useState([]);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    listAdminFarmers().then(setRows).catch((requestError) => setError(requestError.message || "Unable to load farmers."));
  }, []);

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    return rows.filter((row) => !query || `${row.name || ""} ${row.address || ""} ${row.email || ""}`.toLowerCase().includes(query));
  }, [rows, search]);

  return (
    <section className="detail-view admin-page-explicit">
      <div className="consumer-screen-header admin-header-block">
        <div>
          <span className="eyebrow">Farmers</span>
          <h1>Farmer network</h1>
        </div>
      </div>

      <div className="admin-toolbar">
        <div className="admin-search-box">
          <i className="bi bi-search" />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search farmers..." />
        </div>
      </div>

      {error ? <div className="error">{error}</div> : null}

      <div className="admin-table-wrap admin-table-large">
        <table>
          <thead>
            <tr><th>Farmer</th><th>Farm</th><th>Location</th><th>Listings</th><th>Orders</th><th>Rating</th><th>Status</th><th>View</th></tr>
          </thead>
          <tbody>
            {filteredRows.map((farmer) => (
              <tr key={farmer.id}>
                <td>
                  <div className="admin-entity-cell">
                    <span className="admin-avatar-mini">{(farmer.name || "F").slice(0, 1).toUpperCase()}</span>
                    <div>
                      <strong>{farmer.name}</strong>
                      <small>{farmer.email}</small>
                    </div>
                  </div>
                </td>
                <td>{farmer.address || "Farm location pending"}</td>
                <td>{farmer.address || "Not specified"}</td>
                <td>{farmer.listing_count || 0}</td>
                <td>{farmer.order_count || 0}</td>
                <td>{farmer.total_sales ? `${money(farmer.total_sales)} / ${farmer.order_count || 0}` : "No sales"}</td>
                <td><span className={`admin-badge admin-badge-${farmer.is_active ? "active" : "inactive"}`}>{farmer.is_active ? "Active" : "Inactive"}</span></td>
                <td><button type="button" className="admin-action-button">View</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
