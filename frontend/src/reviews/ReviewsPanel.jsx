import { useEffect, useState } from "react";
import { createReview, deleteReview, listListingReviews, updateReview } from "../services/reviewApi";

const reviewableStatuses = new Set(["COMPLETED", "DELIVERED"]);

export default function ReviewsPanel({ item, consumerProfile, orders = [] }) {
  const [reviews, setReviews] = useState({ items: [], total: 0 });
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState({ order_id: "", rating: "5", comment: "" });
  const [message, setMessage] = useState("");
  const eligibleOrders = orders.filter((order) => reviewableStatuses.has(order.status) && order.items.some((orderItem) => orderItem.listing_id === item.id));
  const myReview = consumerProfile && reviews.items.find((review) => review.consumer_id === consumerProfile.id);

  useEffect(() => { setLoading(true); listListingReviews(item.id).then(setReviews).catch((error) => setMessage(error.message)).finally(() => setLoading(false)); }, [item.id]);
  useEffect(() => { setDraft({ order_id: myReview?.order_id || eligibleOrders[0]?.id || "", rating: String(myReview?.rating || 5), comment: myReview?.comment || "" }); }, [myReview, eligibleOrders]);

  async function submit(event) {
    event.preventDefault();
    try {
      if (myReview) await updateReview(myReview.id, { rating: Number(draft.rating), comment: draft.comment.trim() });
      else await createReview({ listing_id: item.id, order_id: draft.order_id, rating: Number(draft.rating), comment: draft.comment.trim() });
      setMessage("Review saved."); setReviews(await listListingReviews(item.id));
    } catch (error) { setMessage(error.message); }
  }

  async function remove() {
    try { await deleteReview(myReview.id); setMessage("Review removed."); setReviews(await listListingReviews(item.id)); }
    catch (error) { setMessage(error.message); }
  }

  return <section className="reviews-panel"><div className="reviews-heading"><div><span className="eyebrow">Ratings & reviews</span><h2>Listing feedback</h2></div><strong>{reviews.total} reviews</strong></div>
    {message && <div className="info-box">{message}</div>}
    {consumerProfile && <form className="review-form" onSubmit={submit}>{!myReview && <select value={draft.order_id} onChange={(event) => setDraft({ ...draft, order_id: event.target.value })}><option value="">Select an eligible order</option>{eligibleOrders.map((order) => <option key={order.id} value={order.id}>Order {order.id.slice(0, 8)}</option>)}</select>}<select value={draft.rating} onChange={(event) => setDraft({ ...draft, rating: event.target.value })}>{[5, 4, 3, 2, 1].map((rating) => <option key={rating} value={rating}>{rating} stars</option>)}</select><textarea rows="3" value={draft.comment} onChange={(event) => setDraft({ ...draft, comment: event.target.value })} placeholder="Share your experience" /><button className="primary-button">{myReview ? "Update review" : "Submit review"}</button>{myReview && <button type="button" className="secondary-button danger" onClick={remove}>Delete review</button>}</form>}
    <div className="review-list">{loading ? <div className="loading"><span className="loading-mark" />Loading reviews...</div> : reviews.items.length ? reviews.items.map((review) => <article className="review-card" key={review.id}><div className="review-header"><b>{review.reviewer_name}</b><span className="review-rating">{review.rating}/5</span></div><p>{review.comment}</p></article>) : <div className="empty"><h3>No reviews yet</h3><p>Verified customer feedback will appear here.</p></div>}</div>
  </section>;
}
