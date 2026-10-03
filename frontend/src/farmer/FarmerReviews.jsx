import { useEffect, useState } from "react";
import { getFarmerDashboardReviews } from "../services/farmerApi";

export default function FarmerReviews() {
  const [data, setData] = useState(null); const [error, setError] = useState("");
  useEffect(() => { getFarmerDashboardReviews().then(setData).catch((requestError) => setError(requestError.message)); }, []);
  if (error) return <section className="detail-view"><div className="error">{error}</div></section>;
  if (!data) return <section className="detail-view"><div className="loading">Loading reviews...</div></section>;
  return <section className="detail-view farmer-reviews-page"><div className="consumer-screen-header"><span className="eyebrow">Customer feedback</span><h1>Reviews</h1><p>Keep a clear view of the feedback attached to your farm listings.</p></div><div className="reference-kpi-grid"><div className="consumer-panel"><span>Review count</span><b>{data.review_count}</b></div><div className="consumer-panel"><span>Average rating</span><b>{data.average_rating || "Unavailable"}</b></div><div className="consumer-panel"><span>Recent feedback</span><b>{data.recent_reviews?.length || 0}</b></div></div><div className="review-list">{data.recent_reviews?.length ? data.recent_reviews.map((review) => <article className="review-card" key={review.id}><div className="review-header"><b>{review.reviewer_name}</b><span className="review-rating">{review.rating}/5</span></div><p>{review.comment}</p></article>) : <div className="empty"><h2>No reviews yet</h2><p>Verified customer feedback will appear here.</p></div>}</div></section>;
}
