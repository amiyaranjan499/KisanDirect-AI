import { useEffect, useMemo, useState } from "react";
import { listAdminReviews } from "../../services/adminApi";

export default function AdminReviewsPage() {
  const [rows, setRows] = useState([]);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    listAdminReviews().then(setRows).catch((requestError) => setError(requestError.message || "Unable to load reviews."));
  }, []);

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    return rows.filter((row) => !query || `${row.consumer_name || ""} ${row.crop_name || ""} ${row.farmer_name || ""} ${row.comment || ""}`.toLowerCase().includes(query));
  }, [rows, search]);

  return (
    <section className="detail-view admin-page-explicit">
      <div className="consumer-screen-header admin-header-block">
        <div>
          <span className="eyebrow">Reviews</span>
          <h1>Customer reviews</h1>
        </div>
      </div>

      <div className="admin-toolbar">
        <div className="admin-search-box">
          <i className="bi bi-search" />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search reviews..." />
        </div>
      </div>

      {error ? <div className="error">{error}</div> : null}

      <div className="admin-table-wrap admin-table-large">
        <table>
          <thead>
            <tr><th>Consumer</th><th>Crop</th><th>Farmer</th><th>Rating</th><th>Comment</th></tr>
          </thead>
          <tbody>
            {filteredRows.map((review) => (
              <tr key={review.id}>
                <td>{review.consumer_name || "Consumer"}</td>
                <td>{review.crop_name || "Crop"}</td>
                <td>{review.farmer_name || "Farmer"}</td>
                <td>{`${review.rating} / 5`}</td>
                <td>{review.comment || "No comment provided"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
