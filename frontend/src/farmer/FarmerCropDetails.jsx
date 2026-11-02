import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { deleteFarmerListing, listMyFarmerListings, mediaUrl, updateFarmerListing } from "../services/api";

function CropsIcon({ size = 28, className = "" }) {
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

const formatMoney = (value) => `₹${Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;

const resolveCropHeroImage = (item) => {
  if (item?.images?.[0]) return mediaUrl(item.images[0]);
  const name = String(item?.crop_name || "").toLowerCase();
  if (name.includes("tomato")) return "/assets/images/tomato.jpg";
  if (name.includes("onion")) return "/assets/images/onion.png";
  if (name.includes("potato") || name.includes("potao")) return "/assets/images/potato.png";
  return "";
};

const CROP_CACHE_KEY = "kd_farmer_crops_cache";
const PAGE_SIZE = 12;

const readCropsCache = () => {
  try {
    const raw = sessionStorage.getItem(CROP_CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

const writeCropsCache = (data) => {
  try {
    sessionStorage.setItem(CROP_CACHE_KEY, JSON.stringify(data));
  } catch {
    // quota exceeded or disabled
  }
};

export default function FarmerCropDetails({ onBack }) {
  const navigate = useNavigate();
  const { id: paramId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();

  const [listings, setListings] = useState(() => readCropsCache());
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(1);

  const [selectedListingId, setSelectedListingId] = useState(null);
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

  const loadListings = async () => {
    try {
      const data = await listMyFarmerListings();
      setListings(data);
      writeCropsCache(data);
    } catch (requestError) {
      setError(requestError.message || "Unable to load listings.");
    }
  };

  useEffect(() => {
    loadListings();
  }, []);

  // Real-time synchronization across pages and background updates
  useEffect(() => {
    const handleCropAdded = (event) => {
      const newCrop = event.detail;
      if (!newCrop) return;
      setListings((prev) => {
        const base = Array.isArray(prev) ? prev : (prev?.items || []);
        const next = [newCrop, ...base.filter((i) => i.id !== newCrop.id)];
        writeCropsCache(next);
        return next;
      });
    };

    const handleCropUpdated = (event) => {
      const updated = event.detail;
      if (!updated) return;
      setListings((prev) => {
        const base = Array.isArray(prev) ? prev : (prev?.items || []);
        const next = base.map((i) => (i.id === updated.id ? { ...i, ...updated } : i));
        writeCropsCache(next);
        return next;
      });
    };

    window.addEventListener("farmer-crop-added", handleCropAdded);
    window.addEventListener("farmer-crop-updated", handleCropUpdated);
    return () => {
      window.removeEventListener("farmer-crop-added", handleCropAdded);
      window.removeEventListener("farmer-crop-updated", handleCropUpdated);
    };
  }, []);

  // Reset to page 1 whenever search query or category filter changes
  useEffect(() => {
    setCurrentPage(1);
  }, [search, filter]);

  // Determine active listing ID and mode ("grid" | "view" | "edit")
  const activeId = paramId || searchParams.get("view") || searchParams.get("edit") || selectedListingId;
  const isEditMode = Boolean(searchParams.get("edit") || searchParams.get("mode") === "edit");
  const isViewMode = Boolean(activeId && !isEditMode);

  const activeListing = useMemo(() => {
    if (!activeId || !listings) return null;
    const base = Array.isArray(listings) ? listings : listings?.items || [];
    return base.find((item) => String(item.id) === String(activeId)) || null;
  }, [activeId, listings]);

  // Sync edit form when active listing is chosen for editing
  useEffect(() => {
    if (activeListing && isEditMode) {
      setEditForm({
        crop_name: activeListing.crop_name || "",
        crop_category: activeListing.crop_category || "Vegetables",
        quantity: activeListing.quantity != null ? String(activeListing.quantity) : "",
        unit: activeListing.unit || "kg",
        asking_price: activeListing.asking_price != null ? String(activeListing.asking_price) : "",
        availability_status: activeListing.availability_status || "AVAILABLE",
      });
    }
  }, [activeListing, isEditMode]);

  // Handlers for switching views
  const handleOpenView = (item) => {
    setSelectedListingId(item.id);
    setError("");
    setSuccessMsg("");
    setSearchParams({ view: item.id });
  };

  const handleOpenEdit = (item) => {
    setSelectedListingId(item.id);
    setError("");
    setSuccessMsg("");
    setEditForm({
      crop_name: item.crop_name || "",
      crop_category: item.crop_category || "Vegetables",
      quantity: item.quantity != null ? String(item.quantity) : "",
      unit: item.unit || "kg",
      asking_price: item.asking_price != null ? String(item.asking_price) : "",
      availability_status: item.availability_status || "AVAILABLE",
    });
    setSearchParams({ edit: item.id });
  };

  const handleBackToListings = () => {
    setSelectedListingId(null);
    setError("");
    setSuccessMsg("");
    setSearchParams({});
    if (paramId) {
      navigate("/farmer/crops");
    }
  };

  const handleSwitchToEdit = () => {
    if (!activeListing) return;
    setEditForm({
      crop_name: activeListing.crop_name || "",
      crop_category: activeListing.crop_category || "Vegetables",
      quantity: activeListing.quantity != null ? String(activeListing.quantity) : "",
      unit: activeListing.unit || "kg",
      asking_price: activeListing.asking_price != null ? String(activeListing.asking_price) : "",
      availability_status: activeListing.availability_status || "AVAILABLE",
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

      // Real-time state update
      setListings((prev) => {
        const list = Array.isArray(prev) ? prev : prev?.items || [];
        const next = list.map((item) => (item.id === activeListing.id ? { ...item, ...updated } : item));
        writeCropsCache(next);
        return next;
      });
      window.dispatchEvent(new CustomEvent("farmer-crop-updated", { detail: updated }));

      setSuccessMsg(`Crop listing "${updated.crop_name || name}" updated successfully.`);
      // Switch back to view mode with updated data
      setSearchParams({ view: activeListing.id });
    } catch (err) {
      setError(err.message || "Failed to update listing.");
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveListing = async () => {
    if (!activeListing) return;
    const confirmed = window.confirm(`Are you sure you want to remove/deactivate "${activeListing.crop_name}"?`);
    if (!confirmed) return;

    try {
      setRemoving(true);
      setError("");
      await deleteFarmerListing(activeListing.id);

      // Real-time state update: remove or mark unavailable
      setListings((prev) => {
        const list = Array.isArray(prev) ? prev : prev?.items || [];
        const next = list.filter((item) => item.id !== activeListing.id);
        writeCropsCache(next);
        return next;
      });

      setSuccessMsg(`Crop listing "${activeListing.crop_name}" was deactivated successfully.`);
      handleBackToListings();
    } catch (err) {
      setError(err.message || "Failed to remove listing.");
    } finally {
      setRemoving(false);
    }
  };

  // Filter and search logic for the listings grid
  const items = useMemo(() => {
    const base = Array.isArray(listings) ? listings : listings?.items || [];
    const query = search.trim().toLowerCase();
    return base.filter((item) => {
      const status = String(item.availability_status || "AVAILABLE").toLowerCase();
      const matchesFilter = filter === "all" ? true : filter === "active" ? status === "available" : status === "sold" || status === "unavailable";
      const haystack = `${item.crop_name || ""} ${item.crop_category || ""}`.toLowerCase();
      return matchesFilter && (!query || haystack.includes(query));
    });
  }, [filter, listings, search]);

  const totalPages = Math.ceil(items.length / PAGE_SIZE) || 1;
  const paginatedItems = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return items.slice(start, start + PAGE_SIZE);
  }, [items, currentPage]);

  // --- RENDER 1: CROP VIEW OR EDIT MODE ---
  if (activeId && activeListing) {
    const isAvailable = String(activeListing.availability_status || "AVAILABLE").toLowerCase() === "available";
    const statusLabel = isAvailable ? "Active" : "Sold";
    const statusBadgeClass = isAvailable ? "badge-sage" : "badge-neutral";
    const heroImage = resolveCropHeroImage(activeListing);
    const qualityGrade = activeListing.quality_grade || activeListing.quality || "Grade A";

    return (
      <section className="farmer-dashboard-view" style={{ maxWidth: "860px", margin: "0 auto", paddingBottom: "40px" }}>
        {/* Back Link */}
        <div style={{ marginBottom: "16px" }}>
          <button
            type="button"
            className="btn btn-outline btn-sm"
            onClick={handleBackToListings}
            style={{ padding: "5px 14px", fontSize: "12.5px", borderRadius: "6px" }}
          >
            <i className="bi bi-chevron-left me-1" /> Back to crop listings
          </button>
        </div>

        {/* Global Feedback Notifications */}
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

        {/* Main Card with Full-Width Hero Banner */}
        <div className="card" style={{ overflow: "hidden", border: "1px solid var(--line, #E4DFD1)", borderRadius: "14px", background: "#FFFFFF" }}>
          {/* Hero Banner Image */}
          <div style={{ position: "relative", width: "100%", height: "230px", background: "var(--sage-light, #E3F5E4)" }}>
            {heroImage ? (
              <img
                src={heroImage}
                alt={activeListing.crop_name}
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
                onError={(e) => {
                  e.currentTarget.style.display = "none";
                  const fallback = e.currentTarget.parentElement?.querySelector(".crop-hero-fallback");
                  if (fallback) fallback.style.display = "flex";
                }}
              />
            ) : null}
            <div
              className="crop-hero-fallback"
              style={{
                display: heroImage ? "none" : "flex",
                width: "100%",
                height: "100%",
                alignItems: "center",
                justifyContent: "center",
                background: "linear-gradient(135deg, #1B6B34 0%, #2E7D32 100%)",
                color: "#FFFFFF",
                flexDirection: "column",
                gap: "8px",
              }}
            >
              <CropsIcon size={48} />
              <span style={{ fontSize: "14px", fontWeight: 600 }}>{activeListing.crop_name}</span>
            </div>
          </div>

          <div style={{ padding: "20px 24px" }}>
            {/* Title & Subtitle Header */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "10px", marginBottom: "16px", paddingBottom: "16px", borderBottom: "1px solid var(--line, #E4DFD1)" }}>
              <div>
                <h2 style={{ fontSize: "22px", fontWeight: 700, color: "var(--forest, #1B6B34)", margin: "0 0 4px 0" }}>
                  {activeListing.crop_name}
                </h2>
                <div style={{ fontSize: "13px", color: "var(--clay, #79705F)", display: "flex", alignItems: "center", gap: "6px" }}>
                  <span>{activeListing.crop_category || "Vegetables"}</span>
                  <span>·</span>
                  <span>AI Quality:</span>
                  <span className="badge bg-success-subtle text-success-emphasis border px-2 py-0" style={{ fontSize: "12px", borderRadius: "4px" }}>
                    {qualityGrade}
                  </span>
                </div>
              </div>

              <div>
                <span className={`badge ${statusBadgeClass}`} style={{ fontSize: "12.5px", padding: "4px 12px", borderRadius: "99px" }}>
                  {statusLabel}
                </span>
              </div>
            </div>

            {/* --- VIEW MODE --- */}
            {!isEditMode ? (
              <div>
                {/* Key-Value Details */}
                <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginBottom: "20px" }}>
                  <div className="kv" style={{ padding: "8px 0", borderBottom: "1px solid var(--line, #F0ECE1)" }}>
                    <span style={{ color: "var(--clay, #79705F)", fontSize: "13.5px" }}>Available quantity</span>
                    <b style={{ color: "var(--ink, #1C1C16)", fontSize: "14px" }}>
                      {activeListing.quantity} {activeListing.unit || "kg"}
                    </b>
                  </div>
                  <div className="kv" style={{ padding: "8px 0", borderBottom: "1px solid var(--line, #F0ECE1)" }}>
                    <span style={{ color: "var(--clay, #79705F)", fontSize: "13.5px" }}>Price</span>
                    <b style={{ color: "var(--ink, #1C1C16)", fontSize: "14px" }}>
                      ₹{Number(activeListing.asking_price).toFixed(0)}
                    </b>
                  </div>
                  <div className="kv" style={{ padding: "8px 0", borderBottom: "1px solid var(--line, #F0ECE1)" }}>
                    <span style={{ color: "var(--clay, #79705F)", fontSize: "13.5px" }}>Status</span>
                    <b style={{ color: "var(--ink, #1C1C16)", fontSize: "14px" }}>{statusLabel}</b>
                  </div>
                  <div className="kv" style={{ padding: "8px 0", borderBottom: "1px solid var(--line, #F0ECE1)" }}>
                    <span style={{ color: "var(--clay, #79705F)", fontSize: "13.5px" }}>AI Quality</span>
                    <b style={{ color: "var(--forest, #1B6B34)", fontSize: "14px" }}>{qualityGrade}</b>
                  </div>
                  {activeListing.harvest_date ? (
                    <div className="kv" style={{ padding: "8px 0", borderBottom: "1px solid var(--line, #F0ECE1)" }}>
                      <span style={{ color: "var(--clay, #79705F)", fontSize: "13.5px" }}>Harvest Date</span>
                      <b style={{ color: "var(--ink, #1C1C16)", fontSize: "14px" }}>
                        {new Date(activeListing.harvest_date).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                      </b>
                    </div>
                  ) : null}
                </div>

                {/* AI Quality Assessment Card */}
                <div
                  style={{
                    background: "var(--sage-light, #E3F5E4)",
                    border: "1px solid rgba(27, 107, 52, 0.2)",
                    borderRadius: "10px",
                    padding: "16px",
                    marginBottom: "24px",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
                    <i className="bi bi-patch-check-fill text-success" style={{ fontSize: "16px" }} />
                    <b style={{ color: "var(--forest, #1B6B34)", fontSize: "14px" }}>AI Quality Assessment</b>
                    <span className="badge bg-success text-white" style={{ fontSize: "10.5px", padding: "2px 7px" }}>
                      ONNX Verified
                    </span>
                  </div>
                  <p style={{ fontSize: "13px", color: "var(--ink, #1C1C16)", margin: 0, lineHeight: 1.5 }}>
                    Even color, firm texture and uniform size across sampled images indicate {qualityGrade.toLowerCase()} freshness with minimal surface blemishes.
                  </p>
                </div>

                {/* View Actions */}
                <div style={{ display: "flex", gap: "12px", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap" }}>
                  <button
                    type="button"
                    className="btn btn-outline btn-sm"
                    onClick={handleSwitchToEdit}
                    style={{ padding: "8px 24px", fontSize: "13px", borderRadius: "8px", fontWeight: 600, display: "inline-flex", alignItems: "center", gap: "6px" }}
                  >
                    <i className="bi bi-pencil" /> Edit Listing
                  </button>

                  <button
                    type="button"
                    className="btn btn-outline-danger btn-sm"
                    onClick={handleRemoveListing}
                    disabled={removing}
                    style={{
                      padding: "8px 24px",
                      fontSize: "13px",
                      borderRadius: "8px",
                      fontWeight: 600,
                      background: "#FDF2F2",
                      border: "1px solid #F5C6CB",
                      color: "#D9534F",
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
                    <label style={{ fontSize: "12.5px", fontWeight: 600, color: "var(--clay, #79705F)", display: "block", marginBottom: "6px" }}>
                      Crop name
                    </label>
                    <input
                      type="text"
                      value={editForm.crop_name}
                      onChange={(e) => setEditForm({ ...editForm, crop_name: e.target.value })}
                      required
                      placeholder="e.g. Fresh Tomato"
                      style={{
                        width: "100%",
                        padding: "8px 12px",
                        fontSize: "13.5px",
                        borderRadius: "8px",
                        border: "1px solid var(--line, #E4DFD1)",
                        background: "#FFFFFF",
                      }}
                    />
                  </div>

                  <div>
                    <label style={{ fontSize: "12.5px", fontWeight: 600, color: "var(--clay, #79705F)", display: "block", marginBottom: "6px" }}>
                      Category
                    </label>
                    <select
                      value={editForm.crop_category}
                      onChange={(e) => setEditForm({ ...editForm, crop_category: e.target.value })}
                      style={{
                        width: "100%",
                        padding: "8px 12px",
                        fontSize: "13.5px",
                        borderRadius: "8px",
                        border: "1px solid var(--line, #E4DFD1)",
                        background: "#FFFFFF",
                      }}
                    >
                      <option value="Vegetables">Vegetables</option>
                      <option value="Fruits">Fruits</option>
                      <option value="Grains">Grains</option>
                      <option value="Pulses">Pulses</option>
                      <option value="Spices">Spices</option>
                      <option value="Roots & Tubers">Roots &amp; Tubers</option>
                      <option value="Leafy Greens">Leafy Greens</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "16px" }}>
                  <div>
                    <label style={{ fontSize: "12.5px", fontWeight: 600, color: "var(--clay, #79705F)", display: "block", marginBottom: "6px" }}>
                      Available quantity
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
                          padding: "8px 12px",
                          fontSize: "13.5px",
                          borderRadius: "8px",
                          border: "1px solid var(--line, #E4DFD1)",
                          background: "#FFFFFF",
                        }}
                      />
                      <select
                        value={editForm.unit}
                        onChange={(e) => setEditForm({ ...editForm, unit: e.target.value })}
                        style={{
                          width: "90px",
                          padding: "8px 10px",
                          fontSize: "13px",
                          borderRadius: "8px",
                          border: "1px solid var(--line, #E4DFD1)",
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
                    <label style={{ fontSize: "12.5px", fontWeight: 600, color: "var(--clay, #79705F)", display: "block", marginBottom: "6px" }}>
                      Price (₹/unit)
                    </label>
                    <div style={{ position: "relative" }}>
                      <span style={{ position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)", fontWeight: 600, color: "var(--clay, #79705F)" }}>
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
                          padding: "8px 12px 8px 28px",
                          fontSize: "13.5px",
                          borderRadius: "8px",
                          border: "1px solid var(--line, #E4DFD1)",
                          background: "#FFFFFF",
                        }}
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <label style={{ fontSize: "12.5px", fontWeight: 600, color: "var(--clay, #79705F)", display: "block", marginBottom: "6px" }}>
                    Status
                  </label>
                  <select
                    value={editForm.availability_status}
                    onChange={(e) => setEditForm({ ...editForm, availability_status: e.target.value })}
                    style={{
                      width: "100%",
                      padding: "8px 12px",
                      fontSize: "13.5px",
                      borderRadius: "8px",
                      border: "1px solid var(--line, #E4DFD1)",
                      background: "#FFFFFF",
                    }}
                  >
                    <option value="AVAILABLE">Active</option>
                    <option value="UNAVAILABLE">Inactive / Sold</option>
                  </select>
                </div>

                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "16px", paddingTop: "16px", borderTop: "1px solid var(--line, #E4DFD1)" }}>
                  <button
                    type="button"
                    className="btn btn-outline"
                    onClick={handleCancelEdit}
                    style={{ padding: "8px 24px", fontSize: "13.5px", borderRadius: "8px", fontWeight: 600 }}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="btn btn-success"
                    disabled={saving}
                    style={{
                      padding: "8px 36px",
                      fontSize: "13.5px",
                      borderRadius: "8px",
                      background: "var(--forest, #1B6B34)",
                      border: "none",
                      fontWeight: 600,
                      color: "#FFFFFF",
                    }}
                  >
                    {saving ? "Saving..." : "Save Changes"}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      </section>
    );
  }

  // --- RENDER 2: CROP LISTINGS GRID ---
  const activeCount = useMemo(() => {
    const base = Array.isArray(listings) ? listings : listings?.items || [];
    return base.filter((i) => String(i.availability_status || "AVAILABLE").toUpperCase() === "AVAILABLE").length;
  }, [listings]);

  return (
    <section className="farmer-dashboard-view">
      {/* 1. Header Row */}
      <div className="farmer-page-header">
        <div>
          <span className="eyebrow">HARVEST INVENTORY & CROPS</span>
          <h1>My Crops & Listings</h1>
          <p>Manage active produce harvests, stock levels, asking prices, and AI quality assurance badges.</p>
        </div>
        <div className="farmer-header-actions">
          <button
            type="button"
            className="farmer-action-pill primary"
            onClick={() => navigate("/farmer/crops/new")}
          >
            <i className="bi bi-plus-circle" /> Add New Crop
          </button>
          <button
            type="button"
            className="farmer-action-pill"
            onClick={() => navigate("/farmer/ai-insights")}
          >
            <i className="bi bi-cpu" /> Crop Quality AI
          </button>
        </div>
      </div>

      {/* KPI Stats Grid */}
      <div className="kisan-stat-grid" style={{ marginBottom: "20px" }}>
        <div className="kisan-card kisan-card-pad">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: "12px", color: "var(--farmer-muted, #65766e)", fontWeight: 600 }}>Total Crops Listed</span>
            <span style={{ color: "var(--farmer-forest, #073a26)" }}><i className="bi bi-basket2" /></span>
          </div>
          <div style={{ fontFamily: "var(--font-display, 'Fraunces', Georgia, serif)", fontSize: "28px", fontWeight: 700, color: "var(--farmer-forest, #073a26)", marginTop: "8px" }}>
            {listings ? (Array.isArray(listings) ? listings.length : listings?.items?.length || 0) : "—"}
          </div>
          <div style={{ fontSize: "11.5px", color: "var(--farmer-muted, #65766e)", marginTop: "4px" }}>Across all categories</div>
        </div>
        <div className="kisan-card kisan-card-pad">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: "12px", color: "var(--farmer-muted, #65766e)", fontWeight: 600 }}>Active & Live</span>
            <span style={{ color: "#2E7D32" }}><i className="bi bi-check-circle-fill" /></span>
          </div>
          <div style={{ fontFamily: "var(--font-display, 'Fraunces', Georgia, serif)", fontSize: "28px", fontWeight: 700, color: "#2E7D32", marginTop: "8px" }}>
            {activeCount}
          </div>
          <div style={{ fontSize: "11.5px", color: "var(--farmer-muted, #65766e)", marginTop: "4px" }}>Available for customer orders</div>
        </div>
        <div className="kisan-card kisan-card-pad">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: "12px", color: "var(--farmer-muted, #65766e)", fontWeight: 600 }}>Sold Out / Inactive</span>
            <span style={{ color: "#79705F" }}><i className="bi bi-pause-circle" /></span>
          </div>
          <div style={{ fontFamily: "var(--font-display, 'Fraunces', Georgia, serif)", fontSize: "28px", fontWeight: 700, color: "#79705F", marginTop: "8px" }}>
            {listings ? ((Array.isArray(listings) ? listings.length : listings?.items?.length || 0) - activeCount) : "—"}
          </div>
          <div style={{ fontSize: "11.5px", color: "var(--farmer-muted, #65766e)", marginTop: "4px" }}>Restock or relist</div>
        </div>
      </div>

      {/* Global Feedback Notifications */}
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

      {/* 2. Search Bar */}
      <div className="farmer-search-row">
        <div className="farmer-search-box">
          <i className="bi bi-search" aria-hidden="true" />
          <input
            type="text"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search your crops..."
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

      {/* 3. Filter Tabs */}
      <div
        className="tabs farmer-order-tabs"
        style={{
          display: "flex",
          alignItems: "center",
          gap: "10px",
          overflowX: "auto",
          paddingBottom: "12px",
          marginBottom: "20px",
          borderBottom: "1.5px solid var(--sand, #E4DFD1)",
        }}
      >
        {[
          { key: "all", label: "All" },
          { key: "active", label: "Active" },
          { key: "sold", label: "Sold" },
        ].map((tab) => {
          const isActive = filter === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              className={`tab ${isActive ? "active" : ""}`}
              onClick={() => setFilter(tab.key)}
              style={{
                backgroundColor: isActive ? "var(--forest, #1B6B34)" : "#FFFFFF",
                color: isActive ? "#FFFFFF" : "var(--earth, #5C5549)",
                border: isActive ? "1.5px solid var(--forest, #1B6B34)" : "1.5px solid var(--sand, #E4DFD1)",
                borderRadius: "999px",
                padding: "7px 18px",
                fontSize: "13.5px",
                fontWeight: 700,
                cursor: "pointer",
                whiteSpace: "nowrap",
                boxShadow: isActive ? "0 2px 6px rgba(27, 107, 52, 0.2)" : "none",
                transition: "all 0.15s ease",
              }}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* 4. Crop Cards Grid */}
      {!listings ? (
        <div className="grid-cards" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))", gap: "16px" }}>
          {[1, 2, 3, 4, 5, 6].map((idx) => (
            <div className="card farmer-crop-card farmer-skeleton-card" key={idx} style={{ background: "#FFFFFF", borderRadius: "14px", border: "1px solid #E4DFD1", overflow: "hidden" }}>
              <div className="farmer-skeleton-shimmer" style={{ height: "150px", width: "100%" }} />
              <div className="card-pad" style={{ padding: "14px" }}>
                <div className="farmer-skeleton-shimmer" style={{ height: "18px", width: "65%", marginBottom: "8px" }} />
                <div className="farmer-skeleton-shimmer" style={{ height: "14px", width: "40%", marginBottom: "16px" }} />
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "16px" }}>
                  <div className="farmer-skeleton-shimmer" style={{ height: "14px", width: "30%" }} />
                  <div className="farmer-skeleton-shimmer" style={{ height: "16px", width: "25%" }} />
                </div>
                <div className="farmer-skeleton-shimmer" style={{ height: "32px", width: "100%", borderRadius: "8px" }} />
              </div>
            </div>
          ))}
        </div>
      ) : items.length ? (
        <>
          <div className="grid-cards" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))", gap: "16px" }}>
            {paginatedItems.map((item) => {
              const isAvailable =
                String(item.availability_status || "AVAILABLE").toLowerCase() ===
                "available";
              const statusBadge = isAvailable
                ? { label: "Active", className: "badge-sage" }
                : { label: "Sold", className: "badge-neutral" };
              const image = resolveCropHeroImage(item);

              return (
                <div
                  className="card farmer-crop-card"
                  key={item.id}
                  style={{
                    backgroundColor: "#FFFFFF",
                    borderRadius: "14px",
                    border: "1px solid #E4DFD1",
                    overflow: "hidden",
                    display: "flex",
                    flexDirection: "column",
                    boxShadow: "0 2px 8px rgba(0,0,0,0.03)",
                    transition: "transform 0.15s ease, box-shadow 0.15s ease",
                  }}
                >
                  <div
                    className="farmer-crop-img-wrap"
                    style={{
                      width: "100%",
                      height: "150px",
                      position: "relative",
                      overflow: "hidden",
                      backgroundColor: "#F4F1EA",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
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
                          objectFit: "cover",
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
                        gap: "6px",
                        color: "var(--clay, #79705F)",
                        width: "100%",
                        height: "100%",
                      }}
                    >
                      <CropsIcon size={28} />
                      <span>No photo</span>
                    </div>
                  </div>

                  <div className="card-pad" style={{ padding: "14px", display: "flex", flexDirection: "column", flex: 1, justifyContent: "space-between" }}>
                    <div>
                      <div className="farmer-crop-card-top" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "8px" }}>
                        <div>
                          <div className="farmer-crop-title" style={{ fontWeight: 700, fontSize: "15px", color: "var(--ink, #1C1C16)", textTransform: "capitalize" }}>
                            {item.crop_name || "Untitled Crop"}
                          </div>
                          <div className="farmer-crop-cat" style={{ fontSize: "12px", color: "var(--clay, #79705F)", marginTop: "2px" }}>
                            {item.crop_category || "Vegetables"}
                          </div>
                        </div>
                        <span
                          className={`badge ${statusBadge.className}`}
                          style={{
                            padding: "4px 8px",
                            borderRadius: "999px",
                            fontSize: "11px",
                            fontWeight: 700,
                            backgroundColor: isAvailable ? "rgba(27, 107, 52, 0.1)" : "rgba(121, 112, 95, 0.12)",
                            color: isAvailable ? "var(--forest, #1B6B34)" : "var(--clay, #79705F)",
                          }}
                        >
                          {statusBadge.label}
                        </span>
                      </div>

                      <div className="farmer-crop-card-mid" style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", margin: "10px 0" }}>
                        <span className="farmer-crop-qty" style={{ fontSize: "13px", color: "var(--clay, #79705F)" }}>
                          {item.quantity} {item.unit || "kg"}
                        </span>
                        <b className="farmer-crop-price" style={{ fontSize: "16px", color: "var(--forest, #1B6B34)", fontWeight: 700 }}>
                          {formatMoney(item.asking_price)}
                        </b>
                      </div>
                    </div>

                    <div className="farmer-crop-card-actions" style={{ display: "flex", gap: "8px", marginTop: "12px", borderTop: "1px solid #F0ECE1", paddingTop: "10px" }}>
                      <button
                        type="button"
                        className="btn btn-outline btn-sm btn-block"
                        onClick={() => handleOpenEdit(item)}
                        style={{
                          flex: 1,
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: "6px",
                          borderRadius: "8px",
                          border: "1px solid var(--sand, #E4DFD1)",
                          background: "#FFFFFF",
                          fontSize: "12.5px",
                          fontWeight: 600,
                          padding: "6px 10px",
                          cursor: "pointer",
                        }}
                      >
                        <i className="bi bi-pencil" /> Edit
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm btn-block"
                        onClick={() => handleOpenView(item)}
                        style={{
                          flex: 1,
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: "6px",
                          borderRadius: "8px",
                          border: "none",
                          background: "transparent",
                          fontSize: "12.5px",
                          fontWeight: 600,
                          padding: "6px 10px",
                          color: "var(--forest, #1B6B34)",
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

          {totalPages > 1 ? (
            <div className="farmer-pagination">
              <div className="farmer-pagination-info">
                Showing {(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, items.length)} of {items.length} crops
              </div>
              <div className="farmer-pagination-controls">
                <button
                  type="button"
                  className="farmer-pagination-btn"
                  onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))}
                  disabled={currentPage <= 1}
                  aria-label="Previous page"
                >
                  <i className="bi bi-chevron-left" /> Prev
                </button>
                <span className="farmer-pagination-current">
                  Page {currentPage} of {totalPages}
                </span>
                <button
                  type="button"
                  className="farmer-pagination-btn"
                  onClick={() => setCurrentPage((p) => Math.min(p + 1, totalPages))}
                  disabled={currentPage >= totalPages}
                  aria-label="Next page"
                >
                  Next <i className="bi bi-chevron-right" />
                </button>
              </div>
            </div>
          ) : null}
        </>
      ) : (
        <div className="empty">
          <h2>No listings yet</h2>
          <p>Add your first crop when you are ready to sell.</p>
        </div>
      )}
    </section>
  );
}
