import { useState } from "react";
import { mediaUrl } from "../services/api";

function CropsIcon({ size = 26, className = "" }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={{ display: "inline-block", verticalAlign: "-0.15em", flexShrink: 0 }}
      aria-hidden="true"
    >
      <path d="M12 21V9" />
      <path d="M12 9C12 9 6 9 6 3c6 0 6 6 6 6Z" />
      <path d="M12 13c0 0 6 0 6-6c-6 0-6 6-6 6Z" />
    </svg>
  );
}

export function resolveCropHeroImage(item) {
  if (item?.image_url) return mediaUrl(item.image_url);
  if (item?.images?.[0]) return mediaUrl(item.images[0]);
  const name = String(item?.crop_name || "").toLowerCase();
  if (name.includes("tomato")) return "/assets/images/tomato.jpg";
  if (name.includes("onion")) return "/assets/images/onion.png";
  if (name.includes("potato") || name.includes("potao")) return "/assets/images/potato.png";
  if (name.includes("apple")) return "/assets/images/image7.png";
  return "/assets/images/image7.png";
}

export default function ConsumerProductCard({ item, onOpen, onAddToCart }) {
  const [added, setAdded] = useState(false);
  const image = resolveCropHeroImage(item);
  const quality = item.quality_grade || item.quality || "Grade A";
  const rating = Number(item.rating || item.farmer_rating || 4.7).toFixed(1);
  const distance = item.distance_km != null ? `${Number(item.distance_km).toFixed(1)} km` : "2.3 km";
  const price = Number(item.asking_price || 0).toFixed(0);
  const unit = item.unit || "kg";

  const handleAdd = (e) => {
    e.stopPropagation();
    if (onAddToCart) {
      onAddToCart(item);
      setAdded(true);
      setTimeout(() => setAdded(false), 1200);
    }
  };

  return (
    <article
      className="prod-card"
      onClick={() => onOpen && onOpen(item.id)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen && onOpen(item.id);
        }
      }}
      style={{
        background: "#FFFFFF",
        border: "1px solid var(--line, #E4DFD1)",
        borderRadius: "14px",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        cursor: "pointer",
        transition: "transform 0.18s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.18s cubic-bezier(0.16, 1, 0.3, 1), border-color 0.18s ease",
        boxShadow: "0 2px 8px rgba(27, 107, 52, 0.04)",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = "translateY(-3px)";
        e.currentTarget.style.boxShadow = "0 10px 26px -4px rgba(27, 107, 52, 0.12), 0 2px 8px rgba(0,0,0,0.04)";
        e.currentTarget.style.borderColor = "rgba(27, 107, 52, 0.3)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = "translateY(0)";
        e.currentTarget.style.boxShadow = "0 2px 8px rgba(27, 107, 52, 0.04)";
        e.currentTarget.style.borderColor = "var(--line, #E4DFD1)";
      }}
    >
      {/* Top Image Banner with fixed compact height */}
      <div
        className="prod-img"
        style={{
          position: "relative",
          height: "140px",
          width: "100%",
          background: "#F4F7F4",
          overflow: "hidden",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "6px",
        }}
      >
        {/* AI Quality Grade Pill */}
        <div
          style={{
            position: "absolute",
            top: "8px",
            left: "8px",
            background: "rgba(255, 255, 255, 0.94)",
            backdropFilter: "blur(6px)",
            WebkitBackdropFilter: "blur(6px)",
            border: "1px solid rgba(27, 107, 52, 0.18)",
            borderRadius: "99px",
            padding: "2px 8px",
            fontSize: "10.5px",
            fontWeight: 700,
            color: "var(--forest, #1B6B34)",
            display: "inline-flex",
            alignItems: "center",
            gap: "4px",
            boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
            zIndex: 2,
          }}
        >
          <span
            style={{
              width: "5px",
              height: "5px",
              borderRadius: "50%",
              background: "#16A34A",
            }}
          />
          <span>{quality}</span>
        </div>

        {image ? (
          <img
            src={image}
            alt={item.crop_name}
            style={{ width: "100%", height: "100%", maxHeight: "128px", objectFit: "contain", padding: "4px" }}
            onError={(e) => {
              e.currentTarget.style.display = "none";
              const fb = e.currentTarget.parentElement?.querySelector(".crop-card-fallback");
              if (fb) fb.style.display = "flex";
            }}
          />
        ) : null}
        <div
          className="crop-card-fallback"
          style={{
            display: image ? "none" : "flex",
            width: "100%",
            height: "100%",
            alignItems: "center",
            justifyContent: "center",
            background: "linear-gradient(135deg, #E3F5E4 0%, #D1EEDB 100%)",
            color: "var(--forest, #1B6B34)",
            flexDirection: "column",
            gap: "4px",
          }}
        >
          <CropsIcon size={28} />
          <span style={{ fontSize: "10.5px", fontWeight: 600, color: "var(--clay, #79705F)" }}>Farm Fresh</span>
        </div>
      </div>

      {/* Card Content Pad */}
      <div className="prod-body" style={{ padding: "10px 12px 12px", display: "flex", flexDirection: "column", flex: 1, justifyContent: "space-between" }}>
        <div>
          {/* Crop Title */}
          <div
            className="prod-name"
            style={{
              fontSize: "14.5px",
              fontWeight: 600,
              color: "var(--ink, #1C1C16)",
              marginBottom: "2px",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {item.crop_name}
          </div>

          {/* Subline: Rating · Distance */}
          <div
            className="prod-meta"
            style={{
              fontSize: "11.5px",
              color: "var(--clay, #79705F)",
              display: "flex",
              alignItems: "center",
              gap: "4px",
              marginBottom: "7px",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            <span style={{ color: "#D97706", fontWeight: 600, display: "inline-flex", alignItems: "center", gap: "2px" }}>
              <i className="bi bi-star-fill" style={{ fontSize: "10px" }} /> {rating}
            </span>
            <span>·</span>
            <span>{distance}</span>
          </div>
        </div>

        {/* Price & Add to Cart Circle Button */}
        <div className="prod-price-row" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "2px" }}>
          <div className="prod-price" style={{ fontSize: "16px", fontWeight: 700, color: "var(--forest, #1B6B34)" }}>
            ₹{price}
            <small style={{ fontSize: "11.5px", fontWeight: 500, color: "var(--clay, #79705F)", marginLeft: "2px" }}>
              /{unit}
            </small>
          </div>

          <button
            type="button"
            className="leaf-add"
            onClick={handleAdd}
            aria-label={`Add ${item.crop_name} to cart`}
            style={{
              width: "32px",
              height: "32px",
              borderRadius: "50%",
              background: added ? "#16A34A" : "var(--forest, #1B6B34)",
              color: "#FFFFFF",
              border: "none",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              transition: "transform 0.12s ease, background 0.15s ease, box-shadow 0.15s ease",
              flexShrink: 0,
              boxShadow: added ? "0 2px 8px rgba(22, 163, 74, 0.4)" : "0 2px 8px rgba(27, 107, 52, 0.25)",
              transform: added ? "scale(1.08)" : "scale(1)",
            }}
          >
            <i className={`bi ${added ? "bi-check-lg" : "bi-plus-lg"}`} style={{ fontSize: "14px" }} />
          </button>
        </div>
      </div>
    </article>
  );
}

