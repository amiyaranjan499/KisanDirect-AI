import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  analyzeCropQuality,
  createQualityPrediction,
  deleteFarmerListing,
  getFarmerListing,
  listMyFarmerListings,
  mediaUrl,
  updateFarmerListing,
} from "../services/api";

function CropsIcon({ size = 24, className = "" }) {
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

const formatMoney = (value) =>
  `₹${Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;

const resolveCropHeroImage = (item) => {
  if (item?.images?.[0]) return mediaUrl(item.images[0]);
  const name = String(item?.crop_name || "").toLowerCase();
  if (name.includes("tomato")) return "/assets/images/tomato.jpg";
  if (name.includes("onion")) return "/assets/images/onion.png";
  if (name.includes("potato") || name.includes("potao")) return "/assets/images/potato.png";
  return "";
};

function resolveCropQuality(item) {
  const rawLabel =
    item?.ai_quality_label ||
    item?.quality_label ||
    item?.quality ||
    item?.quality_information ||
    item?.quality_grade ||
    null;

  let quality = "Unassessed";
  if (rawLabel) {
    const l = String(rawLabel).toLowerCase().trim();
    if (l === "good" || l.includes("grade a")) {
      quality = "Good";
    } else if (l === "average" || l.includes("grade b")) {
      quality = "Average";
    } else if (l === "poor" || l.includes("grade c")) {
      quality = "Poor";
    }
  }

  return {
    quality,
    badgeClass:
      quality === "Good"
        ? "badge-sage"
        : quality === "Average"
        ? "badge-warning"
        : quality === "Poor"
        ? "badge-danger"
        : "badge-neutral",
  };
}

const PAGE_SIZE = 5;

export default function FarmerCropDetails({ onBack }) {
  const navigate = useNavigate();
  const { id: paramId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();

  const CROP_CACHE_KEY = "kd_farmer_crops_cache";

  // All hook states declared unconditionally at top level
  const [listings, setListings] = useState(() => {
    try {
      const cached = sessionStorage.getItem(CROP_CACHE_KEY);
      if (cached) {
        const parsed = JSON.parse(cached);
        const arr = Array.isArray(parsed) ? parsed : parsed?.items || [];
        if (arr.length > 0) return arr;
      }
    } catch {
      // ignore
    }
    return [];
  });
  const [totalRecords, setTotalRecords] = useState(0);
  const [stats, setStats] = useState({ total: 0, active: 0, sold: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(1);

  const [selectedListingId, setSelectedListingId] = useState(null);
  const [directCrop, setDirectCrop] = useState(null);
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);

  // Edit form state
  const [editForm, setEditForm] = useState({
    crop_name: "",
    crop_category: "Vegetables",
    quantity: "",
    unit: "kg",
    asking_price: "",
    availability_status: "AVAILABLE",
  });

  const loadListings = async (
    pageToLoad = currentPage,
    currentFilter = filter,
    currentSearch = debouncedSearch
  ) => {
    try {
      setLoading(true);
      setError("");
      const params = {
        limit: PAGE_SIZE,
        offset: (pageToLoad - 1) * PAGE_SIZE,
        exclude_unavailable: true,
      };
      if (currentFilter !== "all") {
        params.status = currentFilter;
      }
      const trimmedSearch = (currentSearch || "").trim();
      if (trimmedSearch) {
        params.search = trimmedSearch;
      }
      const data = await listMyFarmerListings(params);
      let items = [];
      if (Array.isArray(data)) {
        items = data;
        setListings(data);
        setTotalRecords(data.length);
      } else {
        items = data.items || [];
        setListings(items);
        setTotalRecords(data.total || 0);
        if (data.stats) {
          setStats(data.stats);
        }
      }
      try {
        if (items.length > 0 && currentFilter === "all" && !trimmedSearch) {
          sessionStorage.setItem(CROP_CACHE_KEY, JSON.stringify(items));
        }
      } catch {
        // storage disabled
      }
    } catch (requestError) {
      setError(requestError.message || "Unable to load listings.");
    } finally {
      setLoading(false);
    }
  };

  // Search input debounce (250ms)
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
    }, 250);
    return () => clearTimeout(timer);
  }, [search]);

  // Reset page when filter changes
  useEffect(() => {
    setCurrentPage(1);
  }, [filter, debouncedSearch]);

  // Load paginated listings on page, filter, or debounced search change
  useEffect(() => {
    loadListings(currentPage, filter, debouncedSearch);
  }, [currentPage, filter, debouncedSearch]);

  // Real-time synchronization across pages and background updates
  useEffect(() => {
    const handleCropAdded = (event) => {
      const newCrop = event?.detail;
      if (newCrop) {
        setListings((prev) => {
          const list = Array.isArray(prev) ? prev : prev?.items || [];
          const filtered = list.filter((c) => String(c.id) !== String(newCrop.id));
          const updated = [newCrop, ...filtered];
          try {
            sessionStorage.setItem(CROP_CACHE_KEY, JSON.stringify(updated));
          } catch {
            // storage disabled
          }
          return updated;
        });
        setTotalRecords((t) => t + 1);
      }
      setCurrentPage(1);
      loadListings(1, filter, debouncedSearch);
    };

    const handleCropUpdated = () => {
      loadListings(currentPage, filter, debouncedSearch);
    };

    const handleCropDeleted = () => {
      setCurrentPage(1);
      loadListings(1, filter, debouncedSearch);
    };

    window.addEventListener("farmer-crop-added", handleCropAdded);
    window.addEventListener("farmer-crop-updated", handleCropUpdated);
    window.addEventListener("farmer-crop-deleted", handleCropDeleted);
    return () => {
      window.removeEventListener("farmer-crop-added", handleCropAdded);
      window.removeEventListener("farmer-crop-updated", handleCropUpdated);
      window.removeEventListener("farmer-crop-deleted", handleCropDeleted);
    };
  }, [currentPage, filter, debouncedSearch]);

  // Determine active listing ID and mode
  const activeId = paramId || searchParams.get("view") || searchParams.get("edit") || selectedListingId;
  const isEditMode = Boolean(searchParams.get("edit") || searchParams.get("mode") === "edit");
  const isViewMode = Boolean(activeId && !isEditMode);

  // Active listing resolution: check directCrop first, then listings
  const activeListing = useMemo(() => {
    if (!activeId) return null;
    if (directCrop && String(directCrop.id) === String(activeId)) return directCrop;
    const base = Array.isArray(listings) ? listings : listings?.items || [];
    return base.find((item) => String(item.id) === String(activeId)) || null;
  }, [activeId, directCrop, listings]);

  // Fetch individual crop listing directly if navigating straight to /farmer/crops/:id
  useEffect(() => {
    if (activeId && !activeListing) {
      getFarmerListing(activeId)
        .then((data) => {
          if (data) setDirectCrop(data);
        })
        .catch(() => {});
    }
  }, [activeId, activeListing]);

  // Sync edit form whenever activeListing or edit mode changes
  useEffect(() => {
    if (activeListing && isEditMode) {
      setEditForm({
        crop_name: activeListing.crop_name || "",
        crop_category: activeListing.crop_category || "Vegetables",
        quantity: activeListing.quantity != null ? String(activeListing.quantity) : "",
        unit: activeListing.unit || "kg",
        asking_price: activeListing.asking_price != null ? String(activeListing.asking_price) : "",
        availability_status:
          activeListing.availability_status === "SOLD_OUT" || activeListing.availability_status === "SOLD"
            ? "SOLD_OUT"
            : "AVAILABLE",
      });
    }
  }, [activeListing, isEditMode]);

  const totalPages = Math.max(1, Math.ceil(totalRecords / PAGE_SIZE));
  const startRecord = totalRecords === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1;
  const endRecord = Math.min(currentPage * PAGE_SIZE, totalRecords);

  const [isEvaluatingQuality, setIsEvaluatingQuality] = useState(false);

  // Navigation handlers
  const handleOpenView = (item) => {
    setDirectCrop(item);
    setSelectedListingId(item.id);
    setError("");
    setSuccessMsg("");
    navigate(`/farmer/crops/${item.id}`);
  };

  const handleUpdateQuality = async () => {
    if (!activeListing || isEvaluatingQuality) return;
    const imgUrl = resolveCropHeroImage(activeListing);
    if (!imgUrl) {
      setError("No crop image found to assess quality.");
      return;
    }

    try {
      setIsEvaluatingQuality(true);
      setError("");
      setSuccessMsg("");
      const res = await fetch(imgUrl);
      const blob = await res.blob();
      const file = new File([blob], `${activeListing.crop_name || "crop"}.jpg`, {
        type: blob.type || "image/jpeg",
      });

      let updatedQuality = "Average";
      try {
        const pred = await createQualityPrediction(activeListing.id, file);
        if (pred && pred.quality_label) {
          const rawL = String(pred.quality_label).toLowerCase();
          if (rawL === "good" || rawL.includes("grade a")) updatedQuality = "Good";
          else if (rawL === "average" || rawL.includes("grade b")) updatedQuality = "Average";
          else if (rawL === "poor" || rawL.includes("grade c")) updatedQuality = "Poor";
        }
      } catch (predErr) {
        console.warn("createQualityPrediction fallback:", predErr);
        const directPred = await analyzeCropQuality(file);
        if (directPred && directPred.quality_label) {
          const rawL = String(directPred.quality_label).toLowerCase();
          if (rawL === "good" || rawL.includes("grade a")) updatedQuality = "Good";
          else if (rawL === "average" || rawL.includes("grade b")) updatedQuality = "Average";
          else if (rawL === "poor" || rawL.includes("grade c")) updatedQuality = "Poor";
        }
        await updateFarmerListing(activeListing.id, { quality_information: updatedQuality });
      }

      const updatedItem = {
        ...activeListing,
        quality: updatedQuality,
        quality_label: updatedQuality,
        ai_quality_label: updatedQuality,
        quality_grade: updatedQuality,
        quality_information: updatedQuality,
      };
      setDirectCrop(updatedItem);
      setListings((prev) => {
        const list = Array.isArray(prev) ? prev : prev?.items || [];
        return list.map((item) => (String(item.id) === String(activeListing.id) ? updatedItem : item));
      });
      setSuccessMsg(`Quality updated: ${updatedQuality}`);
      window.dispatchEvent(new CustomEvent("farmer-crop-updated", { detail: updatedItem }));
    } catch (err) {
      setError(err.message || "Failed to update crop quality.");
    } finally {
      setIsEvaluatingQuality(false);
    }
  };

  const handleOpenEdit = (item) => {
    setDirectCrop(item);
    setSelectedListingId(item.id);
    setError("");
    setSuccessMsg("");
    setEditForm({
      crop_name: item.crop_name || "",
      crop_category: item.crop_category || "Vegetables",
      quantity: item.quantity != null ? String(item.quantity) : "",
      unit: item.unit || "kg",
      asking_price: item.asking_price != null ? String(item.asking_price) : "",
      availability_status:
        item.availability_status === "SOLD_OUT" || item.availability_status === "SOLD"
          ? "SOLD_OUT"
          : "AVAILABLE",
    });
    setSearchParams({ edit: item.id });
  };

  const handleBackToListings = () => {
    setSelectedListingId(null);
    setDirectCrop(null);
    setError("");
    setSuccessMsg("");
    setSearchParams({});
    if (paramId) {
      navigate("/farmer/crops");
    }
    loadListings(currentPage, filter, debouncedSearch);
  };

  const handleSwitchToEdit = () => {
    if (!activeListing) return;
    setEditForm({
      crop_name: activeListing.crop_name || "",
      crop_category: activeListing.crop_category || "Vegetables",
      quantity: activeListing.quantity != null ? String(activeListing.quantity) : "",
      unit: activeListing.unit || "kg",
      asking_price: activeListing.asking_price != null ? String(activeListing.asking_price) : "",
      availability_status:
        activeListing.availability_status === "SOLD_OUT" || activeListing.availability_status === "SOLD"
          ? "SOLD_OUT"
          : "AVAILABLE",
    });
    setSearchParams({ edit: activeListing.id });
  };

  const handleCancelEdit = () => {
    setError("");
    if (activeListing) {
      setSearchParams({ view: activeListing.id });
    } else {
      handleBackToListings();
    }
  };

  const handleSaveChanges = async (e) => {
    e.preventDefault();
    if (!activeListing) return;
    setError("");
    setSuccessMsg("");

    const name = editForm.crop_name.trim();
    if (!name) {
      setError("Crop name cannot be empty.");
      return;
    }
    const qty = parseFloat(editForm.quantity);
    if (isNaN(qty) || qty <= 0) {
      setError("Please enter a valid quantity greater than 0.");
      return;
    }
    const price = parseFloat(editForm.asking_price);
    if (isNaN(price) || price < 0) {
      setError("Please enter a valid asking price (₹0 or greater).");
      return;
    }

    try {
      setSaving(true);
      const payload = {
        crop_name: name,
        crop_category: editForm.crop_category.trim() || "Vegetables",
        quantity: qty,
        unit: editForm.unit.trim() || "kg",
        asking_price: price,
        availability_status: editForm.availability_status,
      };

      const updated = await updateFarmerListing(activeListing.id, payload);
      setDirectCrop(updated);
      try {
        sessionStorage.removeItem("kd_farmer_dashboard_cache");
      } catch {
        // storage disabled
      }
      window.dispatchEvent(new CustomEvent("farmer-crop-updated", { detail: updated }));

      setSuccessMsg(`Crop listing "${updated.crop_name || name}" updated successfully.`);
      setSearchParams({ view: activeListing.id });
      loadListings(currentPage, filter, debouncedSearch);
    } catch (err) {
      setError(err.message || "Failed to update listing.");
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveListing = async () => {
    if (!activeListing) return;
    const confirmed = window.confirm(`Are you sure you want to remove "${activeListing.crop_name}" from your listings?`);
    if (!confirmed) return;

    try {
      setRemoving(true);
      setError("");
      await deleteFarmerListing(activeListing.id);

      try {
        sessionStorage.removeItem("kd_farmer_dashboard_cache");
      } catch {
        // storage disabled
      }

      window.dispatchEvent(
        new CustomEvent("farmer-crop-deleted", {
          detail: { id: activeListing.id, listing: activeListing },
        })
      );

      setSuccessMsg(`Crop "${activeListing.crop_name}" removed from your listings.`);
      handleBackToListings();
      setCurrentPage(1);
      loadListings(1, filter, debouncedSearch);
    } catch (err) {
      setError(err.message || "Failed to remove listing.");
    } finally {
      setRemoving(false);
    }
  };

  // --- RENDER 1: CROP VIEW OR EDIT MODE ---
  if (activeId && activeListing) {
    const isAvailable =
      String(activeListing.availability_status || "AVAILABLE").toUpperCase() === "AVAILABLE";
    const statusLabel = isAvailable ? "Active" : "Sold";
    const statusBadgeClass = isAvailable ? "badge-sage" : "badge-neutral";
    const heroImage = resolveCropHeroImage(activeListing);
    const qualityInfo = resolveCropQuality(activeListing);

    return (
      <section className="farmer-dashboard-view" style={{ maxWidth: "860px", margin: "0 auto", paddingBottom: "40px" }}>
        {/* Back Button with Small Arrow Icon */}
        <div style={{ marginBottom: "16px" }}>
          <button
            type="button"
            className="btn btn-outline btn-sm"
            onClick={isEditMode ? handleCancelEdit : handleBackToListings}
            style={{
              padding: "6px 14px",
              fontSize: "13px",
              borderRadius: "8px",
              color: "var(--farmer-forest, #073a26)",
              borderColor: "var(--farmer-border, #e0d8c8)",
              background: "#FFFFFF",
              fontWeight: 600,
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
            }}
          >
            <i className="bi bi-arrow-left" /> {isEditMode ? "Back to Crop Details" : "Back to My Crops"}
          </button>
        </div>

        {/* Global Notifications */}
        {error ? (
          <div className="alert alert-danger py-2 px-3 mb-3 d-flex align-items-center gap-2" style={{ fontSize: "13px" }}>
            <i className="bi bi-exclamation-triangle-fill text-danger" />
            <span>{error}</span>
          </div>
        ) : null}

        {successMsg ? (
          <div className="alert alert-success py-2 px-3 mb-3 d-flex align-items-center gap-2" style={{ fontSize: "13px" }}>
            <i className="bi bi-check-circle-fill text-success" />
            <span>{successMsg}</span>
          </div>
        ) : null}

        {/* Main Card with Small, Neatly Sized Image */}
        <div
          className="kisan-card"
          style={{
            border: "1px solid var(--farmer-border, #e0d8c8)",
            borderRadius: "14px",
            background: "#FFFFFF",
            boxShadow: "0 2px 10px rgba(7, 58, 38, 0.04)",
            padding: "24px",
          }}
        >
          {/* Header Section: Small Neatly Sized Image + Crop Info */}
          <div
            style={{
              display: "flex",
              gap: "20px",
              alignItems: "flex-start",
              flexWrap: "wrap",
              marginBottom: "20px",
              paddingBottom: "18px",
              borderBottom: "1px solid var(--farmer-border, #e0d8c8)",
            }}
          >
            {/* Small Neatly Sized Image (150px x 130px, clickable to update quality) */}
            <div
              onClick={handleUpdateQuality}
              title="Click photo to assess or update crop quality"
              style={{
                width: "150px",
                height: "130px",
                flexShrink: 0,
                borderRadius: "12px",
                overflow: "hidden",
                border: "1px solid var(--farmer-border, #e0d8c8)",
                background: "var(--farmer-cream, #f7f4ec)",
                position: "relative",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
              }}
            >
              {heroImage ? (
                <img
                  src={heroImage}
                  alt={activeListing.crop_name}
                  style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                  onError={(e) => {
                    e.currentTarget.style.display = "none";
                    const fallback = e.currentTarget.parentElement?.querySelector(".crop-view-fallback");
                    if (fallback) fallback.style.display = "flex";
                  }}
                />
              ) : null}
              <div
                className="crop-view-fallback"
                style={{
                  display: heroImage ? "none" : "flex",
                  width: "100%",
                  height: "100%",
                  alignItems: "center",
                  justifyContent: "center",
                  flexDirection: "column",
                  gap: "6px",
                  color: "var(--farmer-muted, #65766e)",
                  fontSize: "12px",
                }}
              >
                <CropsIcon size={32} />
                <span>No photo</span>
              </div>
              {isEvaluatingQuality && (
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    background: "rgba(0,0,0,0.5)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "#FFFFFF",
                    fontSize: "11px",
                    fontWeight: 600,
                  }}
                >
                  Assessing...
                </div>
              )}
            </div>

            {/* Header Titles and Status */}
            <div style={{ flex: 1, minWidth: "220px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "10px" }}>
                <div>
                  <span
                    style={{
                      fontSize: "11.5px",
                      textTransform: "uppercase",
                      letterSpacing: "0.5px",
                      fontWeight: 700,
                      color: "var(--farmer-muted, #65766e)",
                    }}
                  >
                    {activeListing.crop_category || "Vegetables"}
                  </span>
                  <h1
                    style={{
                      fontFamily: "var(--font-display, 'Fraunces', Georgia, serif)",
                      fontSize: "24px",
                      fontWeight: 700,
                      color: "var(--forest, #1B6B34)",
                      margin: "2px 0 6px 0",
                      letterSpacing: "-0.01em",
                    }}
                  >
                    {isEditMode ? `Edit ${activeListing.crop_name}` : activeListing.crop_name}
                  </h1>
                </div>

                <span
                  className={`badge ${statusBadgeClass}`}
                  style={{ fontSize: "12px", padding: "5px 14px", borderRadius: "99px", fontWeight: 700 }}
                >
                  {statusLabel}
                </span>
              </div>

              {/* Price & Quantity Highlights */}
              <div style={{ display: "flex", alignItems: "center", gap: "12px", marginTop: "8px", flexWrap: "wrap" }}>
                <span
                  style={{
                    fontFamily: "var(--font-display, 'Fraunces', Georgia, serif)",
                    fontSize: "20px",
                    fontWeight: 700,
                    color: "var(--farmer-forest, #073a26)",
                  }}
                >
                  ₹{Number(activeListing.asking_price).toFixed(0)}{" "}
                  <span style={{ fontSize: "13px", fontWeight: 400, color: "var(--farmer-muted, #65766e)" }}>
                    / {activeListing.unit || "kg"}
                  </span>
                </span>
                <span style={{ color: "var(--farmer-border, #e0d8c8)" }}>|</span>
                <span style={{ fontSize: "13px", color: "var(--farmer-muted, #65766e)" }}>
                  Available:{" "}
                  <b style={{ color: "var(--ink, #1C1C16)" }}>
                    {activeListing.quantity} {activeListing.unit || "kg"}
                  </b>
                </span>
              </div>

              {/* Quality Badge and Action */}
              <div style={{ marginTop: "10px", display: "flex", alignItems: "center", gap: "8px" }}>
                <span
                  className={`badge ${qualityInfo.badgeClass}`}
                  style={{ fontSize: "12px", padding: "4px 10px", fontWeight: 700, cursor: "pointer" }}
                  onClick={handleUpdateQuality}
                  title="Click to assess or update crop quality"
                >
                  {qualityInfo.quality}
                </span>
                <button
                  type="button"
                  className="btn btn-sm btn-outline-success"
                  onClick={handleUpdateQuality}
                  disabled={isEvaluatingQuality}
                  style={{ fontSize: "11px", padding: "2px 8px", borderRadius: "6px" }}
                >
                  {isEvaluatingQuality ? "Assessing..." : "Update Quality"}
                </button>
              </div>
            </div>
          </div>

          {/* --- VIEW MODE --- */}
          {!isEditMode ? (
            <div>
              {/* Detailed Key-Values: strictly Crop Name | Category | Price | Available Quantity | Asking Price | Quality | Listing Status | Harvest Date */}
              <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginBottom: "20px" }}>
                <div className="kv" style={{ padding: "8px 0", borderBottom: "1px solid #f0ece1" }}>
                  <span style={{ color: "var(--farmer-muted, #65766e)", fontSize: "13.5px" }}>Crop Name</span>
                  <b style={{ color: "var(--ink, #1C1C16)", fontSize: "14px" }}>{activeListing.crop_name}</b>
                </div>
                <div className="kv" style={{ padding: "8px 0", borderBottom: "1px solid #f0ece1" }}>
                  <span style={{ color: "var(--farmer-muted, #65766e)", fontSize: "13.5px" }}>Category</span>
                  <b style={{ color: "var(--ink, #1C1C16)", fontSize: "14px" }}>{activeListing.crop_category || "Vegetables"}</b>
                </div>
                <div className="kv" style={{ padding: "8px 0", borderBottom: "1px solid #f0ece1" }}>
                  <span style={{ color: "var(--farmer-muted, #65766e)", fontSize: "13.5px" }}>Price</span>
                  <b style={{ color: "var(--farmer-forest, #073a26)", fontSize: "15px", fontWeight: 700 }}>
                    ₹{Number(activeListing.asking_price).toFixed(0)} / {activeListing.unit || "kg"}
                  </b>
                </div>
                <div className="kv" style={{ padding: "8px 0", borderBottom: "1px solid #f0ece1" }}>
                  <span style={{ color: "var(--farmer-muted, #65766e)", fontSize: "13.5px" }}>Available Quantity</span>
                  <b style={{ color: "var(--ink, #1C1C16)", fontSize: "14px" }}>
                    {activeListing.quantity} {activeListing.unit || "kg"}
                  </b>
                </div>
                <div className="kv" style={{ padding: "8px 0", borderBottom: "1px solid #f0ece1" }}>
                  <span style={{ color: "var(--farmer-muted, #65766e)", fontSize: "13.5px" }}>Asking Price</span>
                  <b style={{ color: "var(--farmer-forest, #073a26)", fontSize: "15px", fontWeight: 700 }}>
                    ₹{Number(activeListing.asking_price).toFixed(0)} / {activeListing.unit || "kg"}
                  </b>
                </div>
                <div className="kv" style={{ padding: "8px 0", borderBottom: "1px solid #f0ece1" }}>
                  <span style={{ color: "var(--farmer-muted, #65766e)", fontSize: "13.5px" }}>Quality</span>
                  <span
                    className={`badge ${qualityInfo.badgeClass}`}
                    style={{ fontSize: "12px", padding: "4px 10px", fontWeight: 700, cursor: "pointer" }}
                    onClick={handleUpdateQuality}
                    title="Click to assess or update crop quality"
                  >
                    {qualityInfo.quality}
                  </span>
                </div>
                <div className="kv" style={{ padding: "8px 0", borderBottom: "1px solid #f0ece1" }}>
                  <span style={{ color: "var(--farmer-muted, #65766e)", fontSize: "13.5px" }}>Listing Status</span>
                  <b style={{ color: "var(--ink, #1C1C16)", fontSize: "14px" }}>{statusLabel}</b>
                </div>
                <div className="kv" style={{ padding: "8px 0", borderBottom: "1px solid #f0ece1" }}>
                  <span style={{ color: "var(--farmer-muted, #65766e)", fontSize: "13.5px" }}>Harvest Date</span>
                  <b style={{ color: "var(--ink, #1C1C16)", fontSize: "14px" }}>
                    {activeListing.harvest_date
                      ? new Date(activeListing.harvest_date).toLocaleDateString("en-IN", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })
                      : "Not specified"}
                  </b>
                </div>
              </div>

              {/* View Actions: Edit Listing and Remove */}
              <div style={{ display: "flex", gap: "12px", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap" }}>
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={handleSwitchToEdit}
                  style={{
                    padding: "8px 24px",
                    fontSize: "13px",
                    borderRadius: "8px",
                    fontWeight: 600,
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px",
                    color: "var(--farmer-forest, #073a26)",
                    borderColor: "var(--farmer-border, #e0d8c8)",
                    background: "#FFFFFF",
                  }}
                >
                  <i className="bi bi-pencil" /> Edit Listing
                </button>

                <button
                  type="button"
                  className="btn btn-outline-danger"
                  onClick={handleRemoveListing}
                  disabled={removing}
                  style={{
                    padding: "8px 24px",
                    fontSize: "13px",
                    borderRadius: "8px",
                    fontWeight: 600,
                    background: "#FDF2F2",
                    border: "1px solid #F5C6CB",
                    color: "#C62828",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px",
                  }}
                >
                  <i className="bi bi-trash3" /> {removing ? "Removing..." : "Remove"}
                </button>
              </div>
            </div>
          ) : (
            /* --- EDIT MODE --- */
            <form onSubmit={handleSaveChanges} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "16px" }}>
                <div>
                  <label style={{ fontSize: "12.5px", fontWeight: 600, color: "var(--farmer-muted, #65766e)", display: "block", marginBottom: "6px" }}>
                    Crop Name
                  </label>
                  <input
                    type="text"
                    value={editForm.crop_name}
                    onChange={(e) => setEditForm({ ...editForm, crop_name: e.target.value })}
                    required
                    placeholder="e.g. Fresh Tomato"
                    style={{
                      width: "100%",
                      padding: "9px 12px",
                      fontSize: "13.5px",
                      borderRadius: "8px",
                      border: "1px solid var(--farmer-border, #e0d8c8)",
                      background: "#FFFFFF",
                    }}
                  />
                </div>

                <div>
                  <label style={{ fontSize: "12.5px", fontWeight: 600, color: "var(--farmer-muted, #65766e)", display: "block", marginBottom: "6px" }}>
                    Category
                  </label>
                  <select
                    value={editForm.crop_category}
                    onChange={(e) => setEditForm({ ...editForm, crop_category: e.target.value })}
                    style={{
                      width: "100%",
                      padding: "9px 12px",
                      fontSize: "13.5px",
                      borderRadius: "8px",
                      border: "1px solid var(--farmer-border, #e0d8c8)",
                      background: "#FFFFFF",
                    }}
                  >
                    <option value="Vegetables">Vegetables</option>
                    <option value="Fruits">Fruits</option>
                    <option value="Grains & Cereals">Grains &amp; Cereals</option>
                    <option value="Pulses & Lentils">Pulses &amp; Lentils</option>
                    <option value="Spices & Condiments">Spices &amp; Condiments</option>
                    <option value="Roots & Tubers">Roots &amp; Tubers</option>
                    <option value="Leafy Greens & Herbs">Leafy Greens &amp; Herbs</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "16px" }}>
                <div>
                  <label style={{ fontSize: "12.5px", fontWeight: 600, color: "var(--farmer-muted, #65766e)", display: "block", marginBottom: "6px" }}>
                    Available Quantity
                  </label>
                  <div style={{ display: "flex", gap: "8px" }}>
                    <input
                      type="number"
                      step="any"
                      min="0.001"
                      value={editForm.quantity}
                      onChange={(e) => setEditForm({ ...editForm, quantity: e.target.value })}
                      required
                      placeholder="e.g. 120"
                      style={{
                        flex: 1,
                        padding: "9px 12px",
                        fontSize: "13.5px",
                        borderRadius: "8px",
                        border: "1px solid var(--farmer-border, #e0d8c8)",
                        background: "#FFFFFF",
                      }}
                    />
                    <select
                      value={editForm.unit}
                      onChange={(e) => setEditForm({ ...editForm, unit: e.target.value })}
                      style={{
                        width: "95px",
                        padding: "9px 10px",
                        fontSize: "13px",
                        borderRadius: "8px",
                        border: "1px solid var(--farmer-border, #e0d8c8)",
                        background: "#FFFFFF",
                      }}
                    >
                      <option value="kg">kg</option>
                      <option value="quintal">quintal</option>
                      <option value="ton">ton</option>
                      <option value="bunch">bunch</option>
                      <option value="crate">crate</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label style={{ fontSize: "12.5px", fontWeight: 600, color: "var(--farmer-muted, #65766e)", display: "block", marginBottom: "6px" }}>
                    Asking Price (₹/unit)
                  </label>
                  <div style={{ position: "relative" }}>
                    <span style={{ position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)", fontWeight: 600, color: "var(--farmer-muted, #65766e)" }}>
                      ₹
                    </span>
                    <input
                      type="number"
                      step="any"
                      min="0"
                      value={editForm.asking_price}
                      onChange={(e) => setEditForm({ ...editForm, asking_price: e.target.value })}
                      required
                      placeholder="28"
                      style={{
                        width: "100%",
                        padding: "9px 12px 9px 28px",
                        fontSize: "13.5px",
                        borderRadius: "8px",
                        border: "1px solid var(--farmer-border, #e0d8c8)",
                        background: "#FFFFFF",
                      }}
                    />
                  </div>
                </div>
              </div>

              <div>
                <label style={{ fontSize: "12.5px", fontWeight: 600, color: "var(--farmer-muted, #65766e)", display: "block", marginBottom: "6px" }}>
                  Listing Status
                </label>
                <select
                  value={editForm.availability_status}
                  onChange={(e) => setEditForm({ ...editForm, availability_status: e.target.value })}
                  style={{
                    width: "100%",
                    padding: "9px 12px",
                    fontSize: "13.5px",
                    borderRadius: "8px",
                    border: "1px solid var(--farmer-border, #e0d8c8)",
                    background: "#FFFFFF",
                  }}
                >
                  <option value="AVAILABLE">Active</option>
                  <option value="SOLD_OUT">Sold</option>
                </select>
              </div>

              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginTop: "16px",
                  paddingTop: "16px",
                  borderTop: "1px solid var(--farmer-border, #e0d8c8)",
                }}
              >
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={handleCancelEdit}
                  style={{
                    padding: "8px 24px",
                    fontSize: "13px",
                    borderRadius: "8px",
                    fontWeight: 600,
                    color: "var(--farmer-muted, #65766e)",
                    borderColor: "var(--farmer-border, #e0d8c8)",
                    background: "#FFFFFF",
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-success"
                  disabled={saving}
                  style={{
                    padding: "9px 36px",
                    fontSize: "13.5px",
                    borderRadius: "8px",
                    background: "var(--farmer-forest, #073a26)",
                    border: "none",
                    fontWeight: 600,
                    color: "#FFFFFF",
                    boxShadow: "0 2px 6px rgba(7, 58, 38, 0.2)",
                  }}
                >
                  {saving ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </form>
          )}
        </div>
      </section>
    );
  }

  // --- RENDER 2: MY CROPS MAIN PAGE ---
  return (
    <section className="farmer-dashboard-view">
      {/* Dynamic style tag ensuring 4 compact cards per row on desktop */}
      <style>{`
        .farmer-crops-desktop-grid {
          display: grid;
          grid-template-columns: repeat(1, 1fr);
          gap: 14px;
        }
        @media (min-width: 576px) {
          .farmer-crops-desktop-grid {
            grid-template-columns: repeat(2, 1fr);
            gap: 14px;
          }
        }
        @media (min-width: 768px) {
          .farmer-crops-desktop-grid {
            grid-template-columns: repeat(3, 1fr);
            gap: 14px;
          }
        }
        @media (min-width: 992px) {
          .farmer-crops-desktop-grid {
            grid-template-columns: repeat(4, 1fr) !important;
            gap: 14px;
          }
        }
        @media (min-width: 1400px) {
          .farmer-crops-desktop-grid {
            grid-template-columns: repeat(4, 1fr) !important;
            gap: 16px;
          }
        }
      `}</style>

      {/* 1. Header Row: Title exactly 'My Crops' */}
      <div className="farmer-page-header">
        <div>
          <span className="eyebrow" style={{ color: "var(--farmer-forest, #073a26)", fontWeight: 700 }}>
            HARVEST INVENTORY
          </span>
          <h1
            className="farmer-page-title"
            style={{
              fontFamily: "var(--font-display, 'Fraunces', Georgia, serif)",
              fontSize: "26px",
              fontWeight: 700,
              color: "var(--forest, #1B6B34)",
              margin: "2px 0 6px 0",
              letterSpacing: "-0.01em",
            }}
          >
            My Crops
          </h1>
          <p style={{ color: "var(--farmer-muted, #65766e)", margin: 0, fontSize: "14px" }}>
            Manage active produce harvests, stock levels, asking prices, and AI quality assurance badges.
          </p>
        </div>
        <div className="farmer-header-actions">
          <button
            type="button"
            className="farmer-action-pill primary"
            onClick={() => navigate("/farmer/crops/new")}
            style={{
              background: "var(--farmer-forest, #073a26)",
              color: "#FFFFFF",
              border: "none",
              borderRadius: "8px",
              padding: "9px 18px",
              fontWeight: 600,
              fontSize: "13.5px",
              display: "inline-flex",
              alignItems: "center",
              gap: "8px",
              cursor: "pointer",
              boxShadow: "0 2px 6px rgba(7, 58, 38, 0.2)",
            }}
          >
            <i className="bi bi-plus-circle" /> Add New Crop
          </button>
        </div>
      </div>

      {/* 2. Real Crop Statistics Grid */}
      <div className="kisan-stat-grid" style={{ marginBottom: "20px" }}>
        <div className="kisan-card kisan-card-pad" style={{ border: "1px solid var(--farmer-border, #e0d8c8)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: "12px", color: "var(--farmer-muted, #65766e)", fontWeight: 600 }}>Total Crops Listed</span>
            <span style={{ color: "var(--farmer-forest, #073a26)" }}><i className="bi bi-basket2" /></span>
          </div>
          <div
            style={{
              fontFamily: "var(--font-display, 'Fraunces', Georgia, serif)",
              fontSize: "28px",
              fontWeight: 700,
              color: "var(--farmer-forest, #073a26)",
              marginTop: "8px",
            }}
          >
            {loading && !listings ? "—" : stats.total}
          </div>
          <div style={{ fontSize: "11.5px", color: "var(--farmer-muted, #65766e)", marginTop: "4px" }}>
            Across all categories
          </div>
        </div>

        <div className="kisan-card kisan-card-pad" style={{ border: "1px solid var(--farmer-border, #e0d8c8)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: "12px", color: "var(--farmer-muted, #65766e)", fontWeight: 600 }}>Active &amp; Live</span>
            <span style={{ color: "#2E7D32" }}><i className="bi bi-check-circle-fill" /></span>
          </div>
          <div
            style={{
              fontFamily: "var(--font-display, 'Fraunces', Georgia, serif)",
              fontSize: "28px",
              fontWeight: 700,
              color: "#2E7D32",
              marginTop: "8px",
            }}
          >
            {loading && !listings ? "—" : stats.active}
          </div>
          <div style={{ fontSize: "11.5px", color: "var(--farmer-muted, #65766e)", marginTop: "4px" }}>
            Available for customer orders
          </div>
        </div>

        <div className="kisan-card kisan-card-pad" style={{ border: "1px solid var(--farmer-border, #e0d8c8)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: "12px", color: "var(--farmer-muted, #65766e)", fontWeight: 600 }}>Sold</span>
            <span style={{ color: "#79705F" }}><i className="bi bi-check2-all" /></span>
          </div>
          <div
            style={{
              fontFamily: "var(--font-display, 'Fraunces', Georgia, serif)",
              fontSize: "28px",
              fontWeight: 700,
              color: "#79705F",
              marginTop: "8px",
            }}
          >
            {loading && !listings ? "—" : stats.sold}
          </div>
          <div style={{ fontSize: "11.5px", color: "var(--farmer-muted, #65766e)", marginTop: "4px" }}>
            Crops marked as sold
          </div>
        </div>
      </div>

      {/* Global Notifications */}
      {error ? (
        <div className="alert alert-danger py-2 px-3 mb-3 d-flex align-items-center gap-2" style={{ fontSize: "13px" }}>
          <i className="bi bi-exclamation-triangle-fill text-danger" />
          <span>{error}</span>
        </div>
      ) : null}

      {successMsg ? (
        <div className="alert alert-success py-2 px-3 mb-3 d-flex align-items-center gap-2" style={{ fontSize: "13px" }}>
          <i className="bi bi-check-circle-fill text-success" />
          <span>{successMsg}</span>
        </div>
      ) : null}

      {/* 3. Search Bar */}
      <div className="farmer-search-row" style={{ marginBottom: "16px" }}>
        <div className="farmer-search-box" style={{ background: "#FFFFFF", borderColor: "var(--farmer-border, #e0d8c8)" }}>
          <i className="bi bi-search" aria-hidden="true" style={{ color: "var(--farmer-forest, #073a26)" }} />
          <input
            type="text"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search your crops by name or category..."
            aria-label="Search crops"
          />
          {search ? (
            <button
              type="button"
              className="farmer-search-clear-btn"
              onClick={() => setSearch("")}
              aria-label="Clear search query"
              title="Clear search"
            >
              <i className="bi bi-x-circle-fill" />
            </button>
          ) : null}
        </div>
      </div>

      {/* 4. Filter Tabs: All, Active, Sold */}
      <div
        className="tabs farmer-order-tabs"
        style={{
          display: "flex",
          alignItems: "center",
          gap: "10px",
          overflowX: "auto",
          paddingBottom: "12px",
          marginBottom: "20px",
          borderBottom: "1.5px solid var(--farmer-border, #e0d8c8)",
        }}
      >
        {[
          { key: "all", label: `All (${stats.total})` },
          { key: "active", label: `Active (${stats.active})` },
          { key: "sold", label: `Sold (${stats.sold})` },
        ].map((tab) => {
          const isActive = filter === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              className={`tab ${isActive ? "active" : ""}`}
              onClick={() => setFilter(tab.key)}
              style={{
                backgroundColor: isActive ? "var(--farmer-forest, #073a26)" : "#FFFFFF",
                color: isActive ? "#FFFFFF" : "var(--farmer-muted, #65766e)",
                border: isActive ? "1.5px solid var(--farmer-forest, #073a26)" : "1.5px solid var(--farmer-border, #e0d8c8)",
                borderRadius: "999px",
                padding: "7px 18px",
                fontSize: "13px",
                fontWeight: 700,
                cursor: "pointer",
                whiteSpace: "nowrap",
                boxShadow: isActive ? "0 2px 6px rgba(7, 58, 38, 0.2)" : "none",
                transition: "all 0.15s ease",
              }}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* 5. Compact Crop Cards Grid: At least 4 cards per row on desktop */}
      {loading && !listings.length ? (
        <div className="farmer-crops-desktop-grid">
          {[1, 2, 3, 4, 5].map((idx) => (
            <div className="card farmer-crop-card farmer-skeleton-card" key={idx} style={{ background: "#FFFFFF", borderRadius: "12px", border: "1px solid #e0d8c8", overflow: "hidden" }}>
              <div className="farmer-skeleton-shimmer" style={{ height: "110px", width: "100%" }} />
              <div className="card-pad" style={{ padding: "10px 12px" }}>
                <div className="farmer-skeleton-shimmer" style={{ height: "16px", width: "65%", marginBottom: "6px" }} />
                <div className="farmer-skeleton-shimmer" style={{ height: "12px", width: "40%", marginBottom: "12px" }} />
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "12px" }}>
                  <div className="farmer-skeleton-shimmer" style={{ height: "12px", width: "30%" }} />
                  <div className="farmer-skeleton-shimmer" style={{ height: "14px", width: "25%" }} />
                </div>
                <div className="farmer-skeleton-shimmer" style={{ height: "28px", width: "100%", borderRadius: "6px" }} />
              </div>
            </div>
          ))}
        </div>
      ) : listings.length ? (
        <>
          <div className="farmer-crops-desktop-grid">
            {listings.map((item) => {
              const isAvailable =
                String(item.availability_status || "AVAILABLE").toUpperCase() === "AVAILABLE";
              const statusBadge = isAvailable
                ? { label: "Active", className: "badge-sage" }
                : { label: "Sold", className: "badge-neutral" };
              const image = resolveCropHeroImage(item);
              const qualityInfo = resolveCropQuality(item);

              return (
                <div
                  className="card farmer-crop-card"
                  key={item.id}
                  style={{
                    backgroundColor: "#FFFFFF",
                    borderRadius: "12px",
                    border: "1px solid var(--farmer-border, #e0d8c8)",
                    overflow: "hidden",
                    display: "flex",
                    flexDirection: "column",
                    boxShadow: "0 2px 8px rgba(7, 58, 38, 0.04)",
                    transition: "transform 0.15s ease, box-shadow 0.15s ease",
                  }}
                >
                  {/* Consistent crop image container: complete image, object-fit: contain, object-position: center */}
                  <div
                    className="farmer-crop-img-wrap"
                    style={{
                      width: "100%",
                      height: "110px",
                      position: "relative",
                      overflow: "hidden",
                      backgroundColor: "var(--farmer-cream, #f7f4ec)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      padding: "4px",
                      boxSizing: "border-box",
                    }}
                  >
                    {image ? (
                      <img
                        src={image}
                        alt={item.crop_name || "Crop"}
                        className="farmer-crop-img"
                        style={{
                          width: "100%",
                          height: "100%",
                          objectFit: "contain",
                          objectPosition: "center",
                          display: "block",
                        }}
                        onError={(e) => {
                          e.currentTarget.style.display = "none";
                          const fallback = e.currentTarget.parentElement?.querySelector(".farmer-crop-no-img");
                          if (fallback) fallback.style.display = "flex";
                        }}
                      />
                    ) : null}
                    <div
                      className="farmer-crop-no-img"
                      style={{
                        display: image ? "none" : "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: "2px",
                        color: "var(--farmer-muted, #65766e)",
                        width: "100%",
                        height: "100%",
                        fontSize: "11px",
                      }}
                    >
                      <CropsIcon size={20} />
                      <span>No photo</span>
                    </div>

                    {/* Quality badge overlay */}
                    <div
                      style={{
                        position: "absolute",
                        bottom: "6px",
                        left: "6px",
                      }}
                    >
                      <span
                        className={`badge ${qualityInfo.badgeClass}`}
                        style={{
                          fontSize: "10px",
                          padding: "2px 6px",
                          fontWeight: 700,
                          boxShadow: "0 1px 3px rgba(0,0,0,0.12)",
                        }}
                      >
                        {qualityInfo.quality}
                      </span>
                    </div>
                  </div>

                  {/* Compact Card Content */}
                  <div
                    className="card-pad"
                    style={{
                      padding: "10px 12px",
                      display: "flex",
                      flexDirection: "column",
                      flex: 1,
                      justifyContent: "space-between",
                    }}
                  >
                    <div>
                      <div
                        className="farmer-crop-card-top"
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "flex-start",
                          marginBottom: "4px",
                          gap: "6px",
                        }}
                      >
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div
                            className="farmer-crop-title"
                            style={{
                              fontWeight: 700,
                              fontSize: "13.5px",
                              color: "var(--farmer-forest, #073a26)",
                              textTransform: "capitalize",
                              whiteSpace: "nowrap",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                            }}
                            title={item.crop_name}
                          >
                            {item.crop_name || "Untitled Crop"}
                          </div>
                          <div
                            className="farmer-crop-cat"
                            style={{
                              fontSize: "11px",
                              color: "var(--farmer-muted, #65766e)",
                              marginTop: "1px",
                              whiteSpace: "nowrap",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                            }}
                          >
                            {item.crop_category || "Vegetables"}
                          </div>
                        </div>

                        <span
                          className={`badge ${statusBadge.className}`}
                          style={{
                            padding: "2px 6px",
                            borderRadius: "999px",
                            fontSize: "10.5px",
                            fontWeight: 700,
                            flexShrink: 0,
                          }}
                        >
                          {statusBadge.label}
                        </span>
                      </div>

                      <div
                        className="farmer-crop-card-mid"
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "baseline",
                          margin: "6px 0 8px",
                        }}
                      >
                        <span className="farmer-crop-qty" style={{ fontSize: "11.5px", color: "var(--farmer-muted, #65766e)" }}>
                          {item.quantity} {item.unit || "kg"}
                        </span>
                        <b
                          className="farmer-crop-price"
                          style={{ fontSize: "14px", color: "var(--farmer-forest, #073a26)", fontWeight: 700 }}
                        >
                          {formatMoney(item.asking_price)}
                        </b>
                      </div>
                    </div>

                    {/* Both Edit and View Buttons on each card */}
                    <div
                      className="farmer-crop-card-actions"
                      style={{
                        display: "flex",
                        gap: "6px",
                        marginTop: "8px",
                        borderTop: "1px solid #F0ECE1",
                        paddingTop: "8px",
                      }}
                    >
                      <button
                        type="button"
                        className="btn btn-outline btn-sm"
                        onClick={() => handleOpenEdit(item)}
                        style={{
                          flex: 1,
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: "4px",
                          borderRadius: "6px",
                          border: "1px solid var(--farmer-border, #e0d8c8)",
                          background: "#FFFFFF",
                          color: "var(--farmer-forest, #073a26)",
                          fontSize: "12px",
                          fontWeight: 600,
                          padding: "5px 6px",
                          cursor: "pointer",
                        }}
                      >
                        <i className="bi bi-pencil" /> Edit
                      </button>
                      <button
                        type="button"
                        className="btn btn-sm"
                        onClick={() => handleOpenView(item)}
                        style={{
                          flex: 1,
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: "4px",
                          borderRadius: "6px",
                          border: "none",
                          background: "var(--farmer-cream, #f7f4ec)",
                          fontSize: "12px",
                          fontWeight: 600,
                          padding: "5px 6px",
                          color: "var(--farmer-forest, #073a26)",
                          cursor: "pointer",
                        }}
                      >
                        View
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Pagination Footer matching Admin Listings design */}
          <div
            className="admin-pagination-bar"
            style={{
              marginTop: "20px",
              background: "#FFFFFF",
              border: "1px solid var(--farmer-border, #e0d8c8)",
              borderRadius: "12px",
              padding: "12px 18px",
            }}
          >
            <div className="admin-pagination-info">
              Showing <b>{startRecord}</b> to <b>{endRecord}</b> of <b>{totalRecords}</b> records
            </div>

            <div className="admin-pagination-controls">
              <button
                type="button"
                className="admin-page-btn"
                disabled={currentPage <= 1 || loading}
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                aria-label="Previous page"
              >
                <i className="bi bi-chevron-left" /> Previous
              </button>

              <span className="admin-page-indicator">
                Page <b>{currentPage}</b> of <b>{totalPages}</b>
              </span>

              <button
                type="button"
                className="admin-page-btn"
                disabled={currentPage >= totalPages || loading}
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                aria-label="Next page"
              >
                Next <i className="bi bi-chevron-right" />
              </button>
            </div>
          </div>
        </>
      ) : (
        <div className="empty" style={{ background: "#FFFFFF", borderRadius: "14px", border: "1px solid var(--farmer-border, #e0d8c8)", padding: "40px 20px" }}>
          <h2
            style={{
              fontFamily: "var(--font-display, 'Fraunces', Georgia, serif)",
              fontSize: "20px",
              fontWeight: 700,
              color: "var(--forest, #1B6B34)",
            }}
          >
            {debouncedSearch || filter !== "all" ? "No matching crops found" : "No listings yet"}
          </h2>
          <p style={{ color: "var(--farmer-muted, #65766e)" }}>
            {debouncedSearch || filter !== "all"
              ? "Try clearing your search query or switching filters."
              : "Add your first crop when you are ready to sell."}
          </p>
          {!debouncedSearch && filter === "all" ? (
            <button
              type="button"
              className="farmer-action-pill primary"
              onClick={() => navigate("/farmer/crops/new")}
              style={{
                marginTop: "12px",
                background: "var(--farmer-forest, #073a26)",
                color: "#FFFFFF",
                border: "none",
                borderRadius: "8px",
                padding: "8px 18px",
                fontWeight: 600,
                fontSize: "13px",
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
              }}
            >
              <i className="bi bi-plus-circle" /> Add New Crop
            </button>
          ) : null}
        </div>
      )}
    </section>
  );
}
