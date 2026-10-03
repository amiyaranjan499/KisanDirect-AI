import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { listMyFarmerListings, mediaUrl } from "../services/api";

const formatMoney = (value) => `₹${Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

export default function FarmerCropDetails({ onBack }) {
  const navigate = useNavigate();
  const [listings, setListings] = useState(null);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");

  useEffect(() => {
    listMyFarmerListings()
      .then(setListings)
      .catch((requestError) => setError(requestError.message || "Unable to load listings."));
  }, []);

  const items = useMemo(() => {
    const base = Array.isArray(listings) ? listings : listings?.items || [];
    const query = search.trim().toLowerCase();
    return base.filter((item) => {
      const status = String(item.availability_status || "AVAILABLE").toLowerCase();
      const matchesFilter = filter === "all" ? true : filter === "active" ? status === "available" : status === "sold" || status === "unavailable";
      const haystack = `${item.crop_name || ""} ${item.crop_category || ""}`.toLowerCase();
      return matchesFilter && (!query || haystack.includes(query));
    });
  }, [filter, listings, search]);

  const handleEdit = (listingId) => navigate(`/farmer/crops/new?listingId=${listingId}`);

  return (
    <section className="detail-view crops-page farmer-crops-page">
      <div className="consumer-screen-header farmer-page-header">
        <div>
          <span className="eyebrow">Farmer workspace</span>
          <h1>Crop Listings</h1>
        </div>
        <button type="button" className="farmer-add-crop-button" onClick={() => navigate("/farmer/crops/new")}>+ Add New Crop</button>
      </div>

      <div className="farmer-toolbar">
        <div className="farmer-search-box">
          <i className="bi bi-search" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search your crops..."
            aria-label="Search crops"
          />
        </div>
      </div>

      <div className="farmer-filter-tabs">
        {[
          { key: "all", label: "All" },
          { key: "active", label: "Active" },
          { key: "sold", label: "Sold" },
        ].map((tab) => (
          <button
            key={tab.key}
            type="button"
            className={filter === tab.key ? "active" : ""}
            onClick={() => setFilter(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {error ? (
        <div className="error">{error}</div>
      ) : !listings ? (
        <div className="loading">Loading listings...</div>
      ) : items.length ? (
        <div className="farmer-card-grid">
          {items.map((item) => {
            const statusLabel = String(item.availability_status || "AVAILABLE").toLowerCase() === "available" ? "Active" : "Sold";
            const image = item.images?.[0] ? mediaUrl(item.images[0]) : "";
            return (
              <article className="farmer-list-card" key={item.id}>
                <div className="farmer-card-image">
                  {image ? <img src={image} alt={item.crop_name || "Crop"} /> : <span className="empty-image-state"><i className="bi bi-flower1" /></span>}
                </div>

                <div className="farmer-list-body">
                  <div className="farmer-card-row">
                    <div>
                      <h3>{item.crop_name || "Untitled crop"}</h3>
                      <small>{item.crop_category || "General"}</small>
                    </div>
                    <span className={`farmer-status-pill ${statusLabel === "Active" ? "success" : "neutral"}`}>{statusLabel}</span>
                  </div>

                  <div className="farmer-card-metrics">
                    <span>{item.quantity} {item.unit}</span>
                    <strong>{formatMoney(item.asking_price)}</strong>
                  </div>

                  <div className="farmer-card-actions">
                    <button type="button" className="farmer-small-button" onClick={() => handleEdit(item.id)}>
                      <i className="bi bi-pencil-square" /> Edit
                    </button>
                    <button type="button" className="farmer-small-button secondary" onClick={() => navigate(`/p/${item.id}`)}>
                      View
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="empty">
          <h2>No listings yet</h2>
          <p>Add your first crop when you are ready to sell.</p>
        </div>
      )}
    </section>
  );
}

