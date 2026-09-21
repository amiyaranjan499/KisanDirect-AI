import { useEffect, useState } from "react";
import { listMyFarmerListings } from "../services/api";

export default function FarmerCropDetails({ onBack }) {
  const [listings, setListings] = useState(null); const [error, setError] = useState("");
  useEffect(() => { listMyFarmerListings().then(setListings).catch((e) => setError(e.message)); }, []);
  const items = Array.isArray(listings) ? listings : listings?.items || [];
  return <section className="detail-view"><button className="back-button" onClick={onBack}>Back</button><h1>Crop details</h1>{error ? <div className="error">{error}</div> : !listings ? <div className="loading">Loading...</div> : items.length ? <div className="review-list">{items.map((item) => <article className="review-card" key={item.id}><b>{item.crop_name || item.name}</b><span>{item.quantity} {item.unit} · {item.availability_status || "Available"}</span></article>)}</div> : <div className="empty">No listings yet.</div>}</section>;
}
