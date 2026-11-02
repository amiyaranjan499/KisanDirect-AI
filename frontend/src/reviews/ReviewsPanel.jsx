import { useEffect, useState, useMemo } from "react";
import { createReview, deleteReview, listListingReviews, updateReview } from "../services/reviewApi";

const reviewableStatuses = new Set(["COMPLETED", "DELIVERED"]);

export default function ReviewsPanel({ item, consumerProfile, orders = [] }) {
  const [reviews, setReviews] = useState({ items: [], total: 0 });
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState({ order_id: "", rating: "5", comment: "" });
  const [message, setMessage] = useState("");

  const eligibleOrders = useMemo(() => {
    return (orders || []).filter(
      (order) =>
        reviewableStatuses.has(order.status) &&
        order.items?.some((orderItem) => orderItem.listing_id === item?.id)
    );
  }, [orders, item?.id]);

  const myReview = useMemo(() => {
    return (
      consumerProfile &&
      reviews.items?.find((review) => review.consumer_id === consumerProfile.id)
    );
  }, [consumerProfile, reviews.items]);

  const defaultOrderId = eligibleOrders[0]?.id || "";

  useEffect(() => {
    if (!item?.id) return;
    setLoading(true);
    listListingReviews(item.id)
      .then(setReviews)
      .catch((error) => setMessage(error.message))
      .finally(() => setLoading(false));
  }, [item?.id]);

  useEffect(() => {
    setDraft({
      order_id: myReview?.order_id || defaultOrderId,
      rating: String(myReview?.rating || 5),
      comment: myReview?.comment || "",
    });
  }, [myReview?.id, myReview?.order_id, myReview?.rating, myReview?.comment, defaultOrderId]);

  async function submit(event) {
    event.preventDefault();
    try {
      if (myReview) {
        await updateReview(myReview.id, { rating: Number(draft.rating), comment: draft.comment.trim() });
      } else {
        await createReview({
          listing_id: item.id,
          order_id: draft.order_id,
          rating: Number(draft.rating),
          comment: draft.comment.trim(),
        });
      }
      setMessage("Review saved successfully.");
      setReviews(await listListingReviews(item.id));
    } catch (error) {
      setMessage(error.message);
    }
  }

  async function remove() {
    try {
      await deleteReview(myReview.id);
      setMessage("Review removed.");
      setReviews(await listListingReviews(item.id));
    } catch (error) {
      setMessage(error.message);
    }
  }

  return (
    <section className="reviews-panel product-detail-reviews-wrapper">
      <div className="reviews-heading" style={{ marginBottom: "12px", paddingBottom: "10px" }}>
        <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 700, color: "var(--ink, #1C1C16)", fontFamily: "'DM Sans', sans-serif" }}>
          Reviews ({reviews.total})
        </h3>
      </div>

      {message && <div className="info-box" style={{ marginBottom: "14px", padding: "8px 14px", fontSize: "13px" }}>{message}</div>}

      {consumerProfile && (
        <form className="review-form" onSubmit={submit}>
          <div className="review-form-row">
            {!myReview ? (
              <select
                value={draft.order_id}
                onChange={(event) => setDraft({ ...draft, order_id: event.target.value })}
                required
              >
                <option value="">Select an eligible order</option>
                {eligibleOrders.map((order) => (
                  <option key={order.id} value={order.id}>
                    Order #{order.id.slice(0, 8)}
                  </option>
                ))}
              </select>
            ) : (
              <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--forest, #1B6B34)", display: "flex", alignItems: "center" }}>
                <i className="bi bi-patch-check-fill" style={{ marginRight: "6px" }} /> Editing your submitted review
              </div>
            )}

            <select value={draft.rating} onChange={(event) => setDraft({ ...draft, rating: event.target.value })}>
              <option value="5">⭐⭐⭐⭐⭐ (5 stars - Excellent)</option>
              <option value="4">⭐⭐⭐⭐ (4 stars - Very Good)</option>
              <option value="3">⭐⭐⭐ (3 stars - Good)</option>
              <option value="2">⭐⭐ (2 stars - Fair)</option>
              <option value="1">⭐ (1 star - Poor)</option>
            </select>
          </div>

          <textarea
            rows="3"
            value={draft.comment}
            onChange={(event) => setDraft({ ...draft, comment: event.target.value })}
            placeholder="Share your experience with this produce..."
          />

          <div className="review-form-btn-row">
            <button className="primary-button" type="submit">
              {myReview ? "Update Review" : "Submit Review"}
            </button>
            {myReview && (
              <button type="button" className="secondary-button danger" onClick={remove}>
                Delete Review
              </button>
            )}
          </div>
        </form>
      )}

      <div className="review-list">
        {loading ? (
          <div className="loading" style={{ padding: "20px", textAlign: "center", fontSize: "13px" }}>
            <span className="loading-mark" />Loading reviews...
          </div>
        ) : reviews.items.length ? (
          reviews.items.map((review) => (
            <article className="review-card" key={review.id}>
              <div className="review-header">
                <div className="review-author">
                  <div className="review-author-avatar">
                    {(review.reviewer_name || "C")[0].toUpperCase()}
                  </div>
                  <div>
                    <span>{review.reviewer_name || "Verified Customer"}</span>
                    <span className="review-verified-badge" style={{ marginLeft: "8px" }}>
                      <i className="bi bi-shield-check" /> Verified Buyer
                    </span>
                  </div>
                </div>
                <div className="review-stars">
                  {"★".repeat(review.rating || 5)}{"☆".repeat(Math.max(0, 5 - (review.rating || 5)))}
                </div>
              </div>
              <p className="review-comment">{review.comment || "Quality fresh produce directly from farm."}</p>
            </article>
          ))
        ) : (
          <div className="empty" style={{ padding: "24px", textAlign: "center", background: "#FAF8F5", borderRadius: "10px", border: "1px dashed var(--line, #E4DFD1)" }}>
            <i className="bi bi-chat-heart" style={{ fontSize: "28px", color: "var(--forest, #1B6B34)", display: "block", marginBottom: "6px" }} />
            <h4 style={{ fontSize: "15px", fontWeight: 700, margin: "0 0 4px", color: "var(--ink, #1C1C16)", fontFamily: "'DM Sans', sans-serif" }}>No reviews yet</h4>
            <p style={{ fontSize: "12.5px", color: "var(--clay, #79705F)", margin: 0 }}>Verified customers can review this listing after receiving their order.</p>
          </div>
        )}
      </div>
    </section>
  );
}
