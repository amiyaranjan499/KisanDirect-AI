import { useCallback, useEffect, useMemo, useState } from "react";
import AdminDataTable from "../components/AdminDataTable";
import AdminFilterTabs from "../components/AdminFilterTabs";
import AdminDetailDrawer from "../components/AdminDetailDrawer";
import { listAdminReviews } from "../../services/adminApi";

const formatDate = (value) =>
  value
    ? new Date(value).toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      })
    : "—";

export default function AdminReviewsPage() {
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [ratingFilter, setRatingFilter] = useState("ALL");

  const [selectedReview, setSelectedReview] = useState(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const loadReviews = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const rows = await listAdminReviews();
      setReviews(Array.isArray(rows) ? rows : []);
    } catch (err) {
      setError(err.message || "Failed to load customer feedback.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadReviews();
  }, [loadReviews]);

  const filteredReviews = useMemo(() => {
    const q = search.trim().toLowerCase();
    return reviews.filter((r) => {
      const matchesSearch =
        !q ||
        `${r.consumer_name || ""} ${r.crop_name || ""} ${r.farmer_name || ""} ${r.comment || ""}`
          .toLowerCase()
          .includes(q);
      const matchesRating =
        ratingFilter === "ALL" || String(r.rating) === ratingFilter;
      return matchesSearch && matchesRating;
    });
  }, [reviews, search, ratingFilter]);

  const handleView = (review, e) => {
    if (e) e.stopPropagation();
    setSelectedReview(review);
    setDrawerOpen(true);
  };

  const columns = [
    {
      key: "consumer_name",
      label: "Customer / Reviewer",
      sortable: true,
      render: (r) => (
        <div className="admin-entity-cell">
          <span className="admin-avatar-mini">
            {(r.consumer_name || "C").slice(0, 1).toUpperCase()}
          </span>
          <span>{r.consumer_name || "Direct Customer"}</span>
        </div>
      ),
    },
    {
      key: "crop_name",
      label: "Reviewed Produce",
      sortable: true,
      render: (r) => <strong>{r.crop_name || "General Produce"}</strong>,
    },
    {
      key: "farmer_name",
      label: "Farmer",
      sortable: true,
      render: (r) => r.farmer_name || "Platform Farmer",
    },
    {
      key: "rating",
      label: "Rating",
      sortable: true,
      width: "140px",
      render: (r) => (
        <div className="d-flex align-items-center text-warning" title={`${r.rating} of 5 stars`}>
          {Array.from({ length: 5 }).map((_, i) => (
            <i
              key={i}
              className={`bi ${i < r.rating ? "bi-star-fill" : "bi-star text-muted opacity-25"} me-1`}
              style={{ fontSize: "0.85rem" }}
            />
          ))}
          <span className="text-dark small ms-1 fw-bold">({r.rating})</span>
        </div>
      ),
    },
    {
      key: "comment",
      label: "Customer Feedback",
      render: (r) => (
        <span
          className="text-truncate d-inline-block"
          style={{ maxWidth: "260px" }}
          title={r.comment}
        >
          {r.comment || "No written remarks."}
        </span>
      ),
    },
    {
      key: "created_at",
      label: "Submitted",
      sortable: true,
      width: "120px",
      render: (r) => formatDate(r.created_at),
    },
    {
      key: "actions",
      label: "Actions",
      width: "90px",
      align: "right",
      render: (r) => (
        <button
          type="button"
          className="admin-table-action-btn"
          onClick={(e) => handleView(r, e)}
        >
          <i className="bi bi-eye" /> View
        </button>
      ),
    },
  ];

  const ratingTabs = [
    { key: "ALL", label: "All Ratings", count: reviews.length },
    { key: "5", label: "5 Stars", count: reviews.filter((r) => r.rating === 5).length },
    { key: "4", label: "4 Stars", count: reviews.filter((r) => r.rating === 4).length },
    { key: "3", label: "3 Stars", count: reviews.filter((r) => r.rating === 3).length },
    { key: "2", label: "2 Stars", count: reviews.filter((r) => r.rating === 2).length },
    { key: "1", label: "1 Star", count: reviews.filter((r) => r.rating === 1).length },
  ];

  return (
    <div className="admin-page-container">
      <div className="admin-page-header">
        <div>
          <span className="eyebrow">Customer Sentiment</span>
          <h1>Product Reviews & Ratings</h1>
          <p>Examine customer evaluations of farm crop freshness, flavor, packaging, and farmer fulfillment.</p>
        </div>
        <div className="admin-header-actions">
          <button type="button" className="admin-btn-secondary" onClick={loadReviews} disabled={loading}>
            <i className={`bi bi-arrow-clockwise ${loading ? "spin" : ""}`} /> Refresh
          </button>
        </div>
      </div>

      <AdminFilterTabs tabs={ratingTabs} activeTab={ratingFilter} onChange={setRatingFilter} />

      <AdminDataTable
        columns={columns}
        data={filteredReviews}
        loading={loading}
        error={error}
        onRetry={loadReviews}
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search reviews by produce, farmer, customer, or comments..."
        pageSize={12}
        emptyTitle="No customer reviews found"
        emptyDescription="There are no ratings or review comments matching your filter."
        onRowClick={handleView}
      />

      {/* Review Detail Drawer */}
      <AdminDetailDrawer
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title="Review Feedback"
        subtitle={`Submitted on ${formatDate(selectedReview?.created_at)}`}
        badge={
          selectedReview && (
            <span className="badge bg-warning text-dark">
              ★ {selectedReview.rating} / 5
            </span>
          )
        }
      >
        {selectedReview && (
          <>
            <section className="admin-detail-section">
              <h4>Evaluation Summary</h4>
              <dl className="admin-detail-list">
                <dt>Produce Name</dt>
                <dd><strong>{selectedReview.crop_name}</strong></dd>
                <dt>Farmer Supplier</dt>
                <dd>{selectedReview.farmer_name}</dd>
                <dt>Reviewer</dt>
                <dd>{selectedReview.consumer_name || "Customer"}</dd>
                <dt>Rating Given</dt>
                <dd>{selectedReview.rating} out of 5 stars</dd>
                <dt>Date Submitted</dt>
                <dd>{formatDate(selectedReview.created_at)}</dd>
              </dl>
            </section>

            <section className="admin-detail-section">
              <h4>Customer Comment</h4>
              <div className="p-3 bg-light rounded border">
                <p className="mb-0 text-dark fst-italic">
                  "{selectedReview.comment || "No comment provided."}"
                </p>
              </div>
            </section>
          </>
        )}
      </AdminDetailDrawer>
    </div>
  );
}
