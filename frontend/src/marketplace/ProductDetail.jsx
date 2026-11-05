import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { mediaUrl, getFarmer, addCartItem } from "../services/api";
import { formatLocationLabel, unavailable } from "../utils/listing";
import ReviewsPanel from "../reviews/ReviewsPanel";
import "./product-detail.css";

export default function ProductDetail({ item, consumerProfile, orders, onFarmer, user, onBack }) {
  const navigate = useNavigate();
  const [qty, setQty] = useState(1);
  const [adding, setAdding] = useState(false);
  const [toastMsg, setToastMsg] = useState("");
  const [farmerData, setFarmerData] = useState(null);

  useEffect(() => {
    if (item?.farmer_id) {
      getFarmer(item.farmer_id)
        .then(setFarmerData)
        .catch(() => {});
    }
  }, [item?.farmer_id]);

  const maxQty = Number(item.quantity) || 999;
  const isOutOfStock = maxQty <= 0;

  const handleAddToCart = async () => {
    if (isOutOfStock) return;
    if (user && user.role !== "CONSUMER") {
      setToastMsg("Please login with a consumer account to buy.");
      setTimeout(() => setToastMsg(""), 3000);
      return;
    }
    try {
      setAdding(true);
      await addCartItem({ listing_id: item.id, quantity: qty });
      window.dispatchEvent(new CustomEvent("kisandirect_cart_updated"));
      setToastMsg(`Added ${qty} ${item.unit || "kg"} to cart!`);
      setTimeout(() => setToastMsg(""), 3000);
    } catch (err) {
      if (err.status === 401 || err.message?.toLowerCase().includes("unauthorized")) {
        setToastMsg("Please login to add to cart.");
      } else {
        setToastMsg(err.message || "Failed to add to cart.");
      }
      setTimeout(() => setToastMsg(""), 3000);
    } finally {
      setAdding(false);
    }
  };

  const cropImage = item.image_url
    ? mediaUrl(item.image_url)
    : item.images?.[0]
    ? mediaUrl(item.images[0])
    : String(item.crop_name || "").toLowerCase().includes("tomato")
    ? "/assets/images/tomato.jpg"
    : String(item.crop_name || "").toLowerCase().includes("onion")
    ? "/assets/images/onion.png"
    : String(item.crop_name || "").toLowerCase().includes("potato")
    ? "/assets/images/potato.png"
    : "/assets/images/image7.png";

  const farmerName = farmerData?.name || item.farmer_name || "Local Farmer";
  const farmerLoc = [farmerData?.city, farmerData?.district, farmerData?.state].filter(Boolean).join(", ")
    || farmerData?.address
    || formatLocationLabel(item.location);
  const farmerRating = farmerData?.rating ? Number(farmerData.rating).toFixed(1) : (item.farmer_rating ? Number(item.farmer_rating).toFixed(1) : "4.8");

  return (
    <section className="detail-view product-detail-page">
      {/* Toast Notification */}
      {toastMsg && (
        <div
          style={{
            position: "fixed",
            bottom: "76px",
            right: "20px",
            zIndex: 9999,
            background: "#1B6B34",
            color: "#FFFFFF",
            padding: "9px 16px",
            borderRadius: "8px",
            fontSize: "13px",
            fontWeight: 600,
            boxShadow: "0 6px 20px rgba(0,0,0,0.18)",
            display: "flex",
            alignItems: "center",
            gap: "8px",
          }}
        >
          <i className="bi bi-check2-circle" />
          <span>{toastMsg}</span>
          <button
            onClick={() => navigate("/cart")}
            style={{
              marginLeft: "6px",
              background: "#FFFFFF",
              color: "#1B6B34",
              border: "none",
              borderRadius: "5px",
              padding: "2px 8px",
              fontSize: "11.5px",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Cart
          </button>
        </div>
      )}

      {/* Back to Marketplace */}
      <div className="product-detail-top-bar">
        <button
          className="product-detail-back-btn"
          onClick={() => {
            if (onBack) onBack();
            else navigate(-1);
          }}
        >
          <i className="bi bi-arrow-left" /> Back to Products
        </button>
      </div>

      {/* Main Zepto Product Card */}
      <div className="product-detail-card">
        {/* Left Column: Clean Image Showcase */}
        <div className="product-detail-gallery">
          <div className="product-detail-main-img-box">
            {item.quality && (
              <span className="product-detail-badge-top-left">
                <i className="bi bi-patch-check-fill" /> {item.quality}
              </span>
            )}
            <img src={cropImage} alt={item.crop_name} />
          </div>

          <div className="product-detail-trust-pills">
            <i className="bi bi-shield-check" />
            <span>100% Direct from Farm · No Middlemen · Quality Assured</span>
          </div>
        </div>

        {/* Right Column: Clean Details & Action */}
        <div className="product-detail-info">
          {/* Top Row: Category & Delivery */}
          <div className="product-detail-cat-row">
            <span className="product-detail-category-pill">
              {unavailable(item.category)}
            </span>
            <span className="product-detail-delivery-tag">
              <i className="bi bi-lightning-charge-fill" /> 45-90 min delivery
            </span>
          </div>

          {/* Title */}
          <h1 className="product-detail-title">{item.crop_name}</h1>

          {/* Subtitle / Unit / Rating */}
          <div className="product-detail-meta-line">
            <span>{item.crop_category || "Farm Fresh"}</span>
            <span>·</span>
            <span>{Number(item.quantity).toFixed(0)} {item.unit} in stock</span>
            <span>·</span>
            <span><i className="bi bi-star-fill" style={{ color: "#F59E0B" }} /> {farmerRating}</span>
          </div>

          {/* Price */}
          <div className="product-detail-price-box">
            <span className="product-detail-price">₹{Number(item.asking_price).toFixed(2)}</span>
            <span className="product-detail-unit">/ {item.unit}</span>
          </div>
          <div className="product-detail-tax-note">Inclusive of all taxes · Direct farmer price</div>

          {/* Farm Origin Box */}
          <div className="product-detail-farmer-box">
            <div className="product-detail-farmer-left">
              <div className="product-detail-farmer-icon">
                <i className="bi bi-flower1" />
              </div>
              <div className="product-detail-farmer-meta">
                <span className="sold-by">Grown & Harvested By</span>
                <span className="name">{farmerName}</span>
                <span className="loc">
                  <i className="bi bi-geo-alt-fill" style={{ color: "#166534", fontSize: "11px", marginRight: "3px" }} />
                  {farmerLoc}
                </span>
              </div>
            </div>
            <button
              className="product-detail-farmer-btn"
              type="button"
              onClick={() => {
                if (farmerData) onFarmer(farmerData);
                else getFarmer(item.farmer_id).then(onFarmer);
              }}
            >
              View Farm →
            </button>
          </div>

          {/* Add to Cart Stepper & Button */}
          <div className="product-detail-action-section">
            <div className="product-detail-qty-control">
              <button
                className="product-detail-qty-btn"
                type="button"
                onClick={() => setQty((prev) => Math.max(1, prev - 1))}
                disabled={qty <= 1 || isOutOfStock}
                aria-label="Decrease quantity"
              >
                −
              </button>
              <span className="product-detail-qty-num">{qty}</span>
              <button
                className="product-detail-qty-btn"
                type="button"
                onClick={() => setQty((prev) => Math.min(maxQty, prev + 1))}
                disabled={qty >= maxQty || isOutOfStock}
                aria-label="Increase quantity"
              >
                +
              </button>
            </div>

            <button
              className="product-detail-add-btn"
              type="button"
              onClick={handleAddToCart}
              disabled={adding || isOutOfStock}
            >
              <i className="bi bi-cart-plus-fill" />
              <span>{adding ? "Adding..." : isOutOfStock ? "Out of Stock" : "ADD TO CART"}</span>
            </button>
          </div>

          {/* Hub Promise */}
          <div className="product-detail-hub-promise">
            <i className="bi bi-truck" />
            <span>Dispatched from nearest Kisan Hub directly to your doorstep in 45-90 mins</span>
          </div>
        </div>
      </div>

      {/* Description if present */}
      {item.description && (
        <div className="product-detail-desc-box">
          <h4 style={{ fontSize: "14px", fontWeight: 700, margin: "0 0 6px", color: "var(--forest, #1B6B34)", fontFamily: "'Fraunces', Georgia, serif" }}>About this Produce</h4>
          <p style={{ margin: 0, fontSize: "13.5px", color: "var(--clay, #79705F)", lineHeight: 1.6 }}>{item.description}</p>
        </div>
      )}

      {/* Ratings & Reviews Panel */}
      <div className="product-detail-reviews-card">
        <ReviewsPanel item={item} consumerProfile={consumerProfile} orders={orders} />
      </div>
    </section>
  );
}
