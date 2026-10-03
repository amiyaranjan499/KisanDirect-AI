import { useEffect, useMemo, useState } from "react";
import { listAdminListings } from "../../services/adminApi";

const money = (value) => `₹${Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

export default function AdminListingsPage() {
  const [rows, setRows] = useState([]);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    listAdminListings().then(setRows).catch((requestError) => setError(requestError.message || "Unable to load crop listings."));
  }, []);

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    return rows.filter((row) => !query || `${row.crop_name || ""} ${row.farmer_name || ""} ${row.crop_category || ""}`.toLowerCase().includes(query));
  }, [rows, search]);

  return (
    <section className="detail-view admin-page-explicit">
      <div className="consumer-screen-header admin-header-block">
        <div>
          <span className="eyebrow">Crop listings</span>
          <h1>Marketplace listings</h1>
        </div>
      </div>

      <div className="admin-toolbar">
        <div className="admin-search-box">
          <i className="bi bi-search" />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search listings..." />
        </div>
      </div>

      {error ? <div className="error">{error}</div> : null}

      <div className="admin-table-wrap admin-table-large">
        <table>
          <thead>
            <tr><th>Crop</th><th>Farmer</th><th>Location</th><th>Qty</th><th>Price</th><th>AI Quality</th></tr>
          </thead>
          <tbody>
            {filteredRows.map((listing) => (
              <tr key={listing.id}>
                <td>{listing.crop_name}</td>
                <td>{listing.farmer_name}</td>
                <td>{listing.crop_category || "General"}</td>
                <td>{`${listing.quantity} ${listing.unit}`}</td>
                <td>{money(listing.asking_price || 0)}</td>
                <td><span className="admin-badge quality-badge">{listing.ai_quality_label || "Pending"}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
