import { useEffect, useState } from "react";
import { getFarmerDashboardReviews } from "../services/farmerApi";

export default function FarmerReviews() {
  const [data, setData] = useState(null); const [error, setError] = useState("");
  useEffect(() => { getFarmerDashboardReviews().then(setData).catch((requestError) => setError(requestError.message)); }, []);
  if (error) return <section className="detail-view"><div className="error">{error}</div></section>;
  if (!data) return <section className="detail-view"><div className="loading">Loading reviews...</div></section>;
  return <section className="detail-view"><div className="farmer-hero"><span className="eyebrow">Customer feedback</span><h1>Reviews</h1><p>{data.review_count} reviews · {data.average_rating || "No"} average rating</p></div><div className="review-list">{data.recent_reviews?.length ? data.recent_reviews.map((review) => <article className="review-card" key={review.id}><div className="review-header"><b>{review.reviewer_name}</b><span>{review.rating}/5</span></div><p>{review.comment}</p></article>) : <div className="empty">No reviews yet.</div>}</div></section>;
}
