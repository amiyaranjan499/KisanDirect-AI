import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { addCartItem, listListings } from "../services/api";
import ConsumerProductCard from "./ConsumerProductCard";
import "./consumer-shell.css";

export default function ConsumerMarketplace({ user }) {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [search, setSearch] = useState(searchParams.get("search") || "");
  const [selectedCategory, setSelectedCategory] = useState(searchParams.get("category") || "All");
  const [showFilterDrawer, setShowFilterDrawer] = useState(false);
  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [sortOption, setSortOption] = useState("default");
  const [qualityGrade, setQualityGrade] = useState("");

  const [listings, setListings] = useState([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [statusMsg, setStatusMsg] = useState("");

  const PAGE_SIZE = 8;

  const categories = [
    "All",
    "Vegetables",
    "Fruits",
    "Grains",
    "Pulses",
    "Spices",
    "Millets",
  ];

  // Fetch listings from backend
  const fetchListings = () => {
    setLoading(true);
    const params = {
      page,
      page_size: PAGE_SIZE,
    };
    if (search.trim()) params.search = search.trim();
    if (selectedCategory && selectedCategory !== "All") params.category = selectedCategory;
    if (minPrice) params.min_price = minPrice;
    if (maxPrice) params.max_price = maxPrice;
    if (qualityGrade) params.quality = qualityGrade;
    if (sortOption !== "default") params.sort = sortOption;

    listListings(params)
      .then((res) => {
        const items = Array.isArray(res) ? res : res?.items || [];
        setListings(items);
        const totalCount = res?.total != null ? res.total : items.length;
        setTotalPages(res?.pages != null ? res.pages : Math.max(1, Math.ceil(totalCount / PAGE_SIZE)));
      })
      .catch((err) => setStatusMsg(err.message || "Failed to load listings."))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchListings();
  }, [selectedCategory, page, sortOption, qualityGrade]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    setPage(1);
    fetchListings();
  };

  const handleCategorySelect = (cat) => {
    setSelectedCategory(cat);
    setPage(1);
    const newParams = new URLSearchParams(searchParams);
    if (cat === "All") {
      newParams.delete("category");
    } else {
      newParams.set("category", cat);
    }
    setSearchParams(newParams);
  };

  const handleAddToCart = async (item) => {
    try {
      await addCartItem({ listing_id: item.id, quantity: 1 });
      window.dispatchEvent(new CustomEvent("kisandirect_cart_updated"));
      setStatusMsg(`Added ${item.crop_name} to cart.`);
      setTimeout(() => setStatusMsg(""), 2500);
    } catch (err) {
      setStatusMsg(err.message || "Failed to add to cart.");
      setTimeout(() => setStatusMsg(""), 3000);
    }
  };

  return (
    <div className="consumer-marketplace-page" style={{ maxWidth: "1200px", margin: "0 auto", padding: "0 16px 96px" }}>
      {/* Toast Notification */}
      {statusMsg ? (
        <div
          style={{
            position: "fixed",
            bottom: "76px",
            right: "20px",
            zIndex: 9999,
            background: "linear-gradient(135deg, #1B6B34 0%, #14532D 100%)",
            color: "#FFFFFF",
            padding: "10px 18px",
            borderRadius: "10px",
            fontSize: "13.5px",
            fontWeight: 600,
            boxShadow: "0 8px 24px rgba(27, 107, 52, 0.28)",
            display: "flex",
            alignItems: "center",
            gap: "8px",
            border: "1px solid rgba(255, 255, 255, 0.2)",
          }}
        >
          <i className="bi bi-check-circle-fill text-white" />
          <span>{statusMsg}</span>
        </div>
      ) : null}

      {/* 1. Page Title & Meta Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", margin: "12px 0 18px", flexWrap: "wrap", gap: "10px" }}>
        <div>
          <h1 style={{ fontSize: "26px", fontWeight: 700, color: "var(--forest, #1B6B34)", margin: "0 0 4px 0", letterSpacing: "-0.02em", fontFamily: "var(--font-display, 'Fraunces', serif)" }}>
            Farm Fresh Marketplace
          </h1>
          <div style={{ fontSize: "13px", color: "var(--clay, #79705F)" }}>
            ⚡ Direct supply from local farmer hubs · Fast 45–90 min delivery
          </div>
        </div>
        <div style={{ display: "inline-flex", alignItems: "center", gap: "6px", background: "rgba(27, 107, 52, 0.08)", color: "var(--forest, #1B6B34)", padding: "4px 12px", borderRadius: "99px", fontSize: "12px", fontWeight: 700 }}>
          <i className="bi bi-patch-check-fill" /> {listings.length} Produce Available
        </div>
      </div>

      {/* 2. Search & Filter Bar */}
      <div style={{ display: "flex", gap: "10px", marginBottom: "16px", alignItems: "center" }}>
        <form onSubmit={handleSearchSubmit} style={{ flex: 1, position: "relative" }}>
          <i
            className="bi bi-search"
            style={{
              position: "absolute",
              left: "14px",
              top: "50%",
              transform: "translateY(-50%)",
              color: "var(--clay, #79705F)",
              fontSize: "15px",
            }}
          />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search fresh vegetables, fruits, grains, pulses..."
            style={{
              width: "100%",
              padding: "11px 14px 11px 40px",
              fontSize: "14px",
              borderRadius: "12px",
              border: "1px solid var(--line, #E4DFD1)",
              background: "#FFFFFF",
              color: "var(--ink, #1C1C16)",
              boxShadow: "0 2px 6px rgba(0, 0, 0, 0.03)",
            }}
          />
        </form>

        <button
          type="button"
          onClick={() => setShowFilterDrawer((prev) => !prev)}
          className={`btn ${showFilterDrawer ? "btn-primary" : "btn-outline"}`}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "7px",
            padding: "10px 18px",
            fontSize: "13.5px",
            fontWeight: 600,
            borderRadius: "12px",
          }}
        >
          <i className="bi bi-sliders" />
          <span>Filters</span>
          {(minPrice || maxPrice || qualityGrade || sortOption !== "default") && (
            <span style={{ width: "7px", height: "7px", borderRadius: "50%", background: "var(--ochre, #C68A3D)", display: "inline-block" }} />
          )}
        </button>
      </div>

      {/* Optional Filter Controls Drawer */}
      {showFilterDrawer ? (
        <div
          style={{
            background: "#FFFFFF",
            border: "1px solid var(--line, #E4DFD1)",
            borderRadius: "12px",
            padding: "16px",
            marginBottom: "16px",
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
            gap: "14px",
          }}
        >
          <div>
            <label style={{ fontSize: "12px", fontWeight: 600, color: "var(--clay, #79705F)", display: "block", marginBottom: "4px" }}>
              Min Price (₹)
            </label>
            <input
              type="number"
              value={minPrice}
              onChange={(e) => setMinPrice(e.target.value)}
              placeholder="0"
              style={{ width: "100%", padding: "6px 10px", fontSize: "13px", borderRadius: "6px", border: "1px solid var(--line, #E4DFD1)" }}
            />
          </div>

          <div>
            <label style={{ fontSize: "12px", fontWeight: 600, color: "var(--clay, #79705F)", display: "block", marginBottom: "4px" }}>
              Max Price (₹)
            </label>
            <input
              type="number"
              value={maxPrice}
              onChange={(e) => setMaxPrice(e.target.value)}
              placeholder="500"
              style={{ width: "100%", padding: "6px 10px", fontSize: "13px", borderRadius: "6px", border: "1px solid var(--line, #E4DFD1)" }}
            />
          </div>

          <div>
            <label style={{ fontSize: "12px", fontWeight: 600, color: "var(--clay, #79705F)", display: "block", marginBottom: "4px" }}>
              Sort by
            </label>
            <select
              value={sortOption}
              onChange={(e) => setSortOption(e.target.value)}
              style={{ width: "100%", padding: "6px 10px", fontSize: "13px", borderRadius: "6px", border: "1px solid var(--line, #E4DFD1)" }}
            >
              <option value="default">Featured / Default</option>
              <option value="price_asc">Price: Low to High</option>
              <option value="price_desc">Price: High to Low</option>
            </select>
          </div>

          <div>
            <label style={{ fontSize: "12px", fontWeight: 600, color: "var(--clay, #79705F)", display: "block", marginBottom: "4px" }}>
              AI Quality Grade
            </label>
            <select
              value={qualityGrade}
              onChange={(e) => setQualityGrade(e.target.value)}
              style={{ width: "100%", padding: "6px 10px", fontSize: "13px", borderRadius: "6px", border: "1px solid var(--line, #E4DFD1)" }}
            >
              <option value="">All Grades</option>
              <option value="Grade A">Grade A (Premium)</option>
              <option value="Grade B">Grade B (Standard)</option>
            </select>
          </div>

          <div style={{ display: "flex", alignItems: "flex-end", gap: "8px" }}>
            <button
              type="button"
              className="btn btn-success btn-sm"
              onClick={() => { setPage(1); fetchListings(); }}
              style={{ padding: "6px 16px", borderRadius: "6px", background: "var(--forest, #1B6B34)", border: "none" }}
            >
              Apply Filters
            </button>
            <button
              type="button"
              className="btn btn-outline btn-sm"
              onClick={() => { setMinPrice(""); setMaxPrice(""); setSortOption("default"); setQualityGrade(""); setPage(1); }}
              style={{ padding: "6px 14px", borderRadius: "6px" }}
            >
              Reset
            </button>
          </div>
        </div>
      ) : null}

      {/* 3. Category Filter Pills Row (matches Screenshot 1) */}
      <div
        className="consumer-category-pills scrollx"
        style={{
          display: "flex",
          gap: "8px",
          overflowX: "auto",
          paddingBottom: "10px",
          marginBottom: "20px",
          scrollbarWidth: "none",
          WebkitOverflowScrolling: "touch",
        }}
      >
        {categories.map((cat) => {
          const isActive = selectedCategory === cat;
          return (
            <button
              key={cat}
              type="button"
              onClick={() => handleCategorySelect(cat)}
              style={{
                flex: "0 0 auto",
                flexShrink: 0,
                minWidth: "max-content",
                padding: "8px 20px",
                fontSize: "13px",
                fontWeight: 600,
                borderRadius: "99px",
                whiteSpace: "nowrap",
                cursor: "pointer",
                border: isActive ? "1px solid var(--forest, #1B6B34)" : "1px solid var(--line, #E4DFD1)",
                background: isActive ? "var(--forest, #1B6B34)" : "#FFFFFF",
                color: isActive ? "#FFFFFF" : "var(--clay, #79705F)",
                boxShadow: isActive ? "0 2px 6px rgba(27,107,52,0.2)" : "none",
                transition: "all 0.15s ease",
              }}
            >
              {cat}
            </button>
          );
        })}
      </div>

      {/* 4. Crop Listings Grid */}
      {loading ? (
        <div className="loading" style={{ padding: "40px 0" }}>Loading marketplace crops...</div>
      ) : listings.length > 0 ? (
        <>
          <div className="consumer-marketplace-grid" style={{ marginBottom: "32px" }}>
            {listings.map((item) => (
              <ConsumerProductCard
                key={item.id}
                item={item}
                onOpen={(id) => navigate(`/p/${id}`)}
                onAddToCart={handleAddToCart}
              />
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 ? (
            <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: "12px", marginTop: "24px" }}>
              <button
                type="button"
                className="btn btn-outline btn-sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                style={{ padding: "5px 14px", borderRadius: "6px" }}
              >
                Previous
              </button>
              <span style={{ fontSize: "13px", color: "var(--clay, #79705F)" }}>
                Page {page} of {totalPages}
              </span>
              <button
                type="button"
                className="btn btn-outline btn-sm"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
                style={{ padding: "5px 14px", borderRadius: "6px" }}
              >
                Next
              </button>
            </div>
          ) : null}
        </>
      ) : (
        <div className="empty" style={{ padding: "40px", background: "#FFFFFF", borderRadius: "12px", border: "1px solid var(--line, #E4DFD1)" }}>
          <h3 style={{ fontFamily: "var(--font-display, 'Fraunces', serif)", color: "var(--forest, #1B6B34)" }}>No crops found</h3>
          <p>Try searching for a different crop or clearing your filters.</p>
        </div>
      )}
    </div>
  );
}
