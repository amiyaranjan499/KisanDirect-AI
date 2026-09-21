import { mediaUrl } from "../services/marketplaceApi";
import { formatLocationLabel, unavailable } from "../utils/listing";

export default function ProductCard({ item, onOpen, onAddToCart }) {
	const image = item.images?.[0];
	return <article className="listing-card" role="button" tabIndex="0" onClick={() => onOpen(item.id)} onKeyDown={(event) => {
		if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onOpen(item.id); }
	}}>
		<div className="card-image">{image ? <img src={mediaUrl(image)} alt={item.crop_name} /> : <span>Fresh from the farm</span>}</div>
		<div className="card-body"><div className="card-top"><span className="eyebrow">{unavailable(item.category)}</span><span className="status">Available</span></div><h3>{item.crop_name}</h3><p className="muted">{item.farmer_name} · {formatLocationLabel(item.location)}</p><div className="metrics"><span>₹{item.asking_price} / {item.unit}</span><span>{item.quantity} {item.unit}</span></div><div className="submetrics"><span>Quality: {unavailable(item.quality)}</span><span>Rating: {item.farmer_rating ? `${item.farmer_rating.toFixed(1)} / 5` : "Unavailable"}</span></div>{onAddToCart && <button className="add-cart-button" onClick={(event) => { event.stopPropagation(); onAddToCart(item); }}>Add to cart</button>}</div>
	</article>;
}
