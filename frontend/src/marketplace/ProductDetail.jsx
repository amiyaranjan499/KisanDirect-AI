import { mediaUrl, getFarmer } from "../services/marketplaceApi";
import { formatLocationLabel, unavailable } from "../utils/listing";
import ReviewsPanel from "../reviews/ReviewsPanel";

export default function ProductDetail({ item, consumerProfile, orders, onFarmer }) {
  return <section className="detail-view"><div className="detail-grid"><div className="detail-image">{item.images?.[0] ? <img src={mediaUrl(item.images[0])} alt={item.crop_name} /> : <span>Image unavailable</span>}</div><div className="detail-copy"><span className="eyebrow">{unavailable(item.category)}</span><h1>{item.crop_name}</h1><p className="lead">{item.description || "No additional listing description was provided."}</p><button className="farmer-link" onClick={() => getFarmer(item.farmer_id).then(onFarmer)}>View {item.farmer_name}'s farm →</button><div className="detail-stats"><div><b>₹{item.asking_price}</b><span>seller price / {item.unit}</span></div><div><b>{item.quantity} {item.unit}</b><span>available quantity</span></div><div><b>{unavailable(item.quality)}</b><span>quality grade</span></div><div><b>{formatLocationLabel(item.location)}</b><span>farm location</span></div></div></div></div><ReviewsPanel item={item} consumerProfile={consumerProfile} orders={orders} /></section>;
}
