import { useEffect, useState, useRef, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  getCurrentUser,
  getFarmerDashboardAnalytics,
  getFarmerDashboardSummary,
  listFarmerDashboardOrders,
  getFarmerProfile,
  reverseGeocodeLocation,
  updateFarmerProfile,
  uploadFarmerProfileImage,
  uploadFarmerCoverImage,
  mediaUrl,
} from "../services/api";

const COVER_PRESETS = [
  {
    id: "paddy",
    name: "Lush Green Paddy",
    desc: "Vibrant emerald rice terrace fields",
    image: "https://images.unsplash.com/photo-1500937386664-56d1dfef3854?auto=format&fit=crop&w=1200&q=80",
  },
  {
    id: "wheat",
    name: "Golden Wheat Harvest",
    desc: "Sunlit ripe wheat stalks at harvest",
    image: "https://images.unsplash.com/photo-1500382017468-9049fed747ef?auto=format&fit=crop&w=1200&q=80",
  },
  {
    id: "organic",
    name: "Organic Farm Rows",
    desc: "Rich fertile soil and green crops",
    image: "https://images.unsplash.com/photo-1592417817098-8f3d69104a49?auto=format&fit=crop&w=1200&q=80",
  },
  {
    id: "sunrise",
    name: "Sunrise Orchard",
    desc: "Morning golden glow across trees",
    image: "https://images.unsplash.com/photo-1523348837708-15d4a09cfac2?auto=format&fit=crop&w=1200&q=80",
  },
];

const emptyForm = {
  name: "",
  phone: "",
  village: "",
  city: "",
  district: "",
  state: "",
  pin_code: "",
  address: "",
  latitude: "",
  longitude: "",
  profile_image: "",
  cover_image: "",
};

const formatDate = (dateString) => {
  if (!dateString) return "—";
  try {
    return new Date(dateString).toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return String(dateString);
  }
};

const sanitizeProfilePayload = (data) => {
  const payload = {};
  if (data.name && String(data.name).trim()) payload.name = String(data.name).trim();
  if (data.phone && String(data.phone).trim()) payload.phone = String(data.phone).trim();
  if (data.address && String(data.address).trim()) payload.address = String(data.address).trim();
  if (data.village && String(data.village).trim()) payload.village = String(data.village).trim();
  if (data.city && String(data.city).trim()) payload.city = String(data.city).trim();
  if (data.district && String(data.district).trim()) payload.district = String(data.district).trim();
  if (data.state && String(data.state).trim().length >= 2) payload.state = String(data.state).trim();
  if (data.pin_code && /^\d{6}$/.test(String(data.pin_code).trim())) {
    payload.pin_code = String(data.pin_code).trim();
  }
  const rawLat = data.latitude !== undefined && data.latitude !== "" ? data.latitude : data.location?.latitude;
  const rawLng = data.longitude !== undefined && data.longitude !== "" ? data.longitude : data.location?.longitude;
  const lat = parseFloat(rawLat);
  const lng = parseFloat(rawLng);
  if (!isNaN(lat) && !isNaN(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
    payload.location = { latitude: lat, longitude: lng };
  }
  return payload;
};

export default function FarmerProfile({ onBack, onDashboard, onLogout }) {
  const navigate = useNavigate();
  const [profile, setProfile] = useState(null);
  const [user, setUser] = useState(null);
  const [summary, setSummary] = useState(null);
  const [orders, setOrders] = useState([]);
  const [analytics, setAnalytics] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [locLoading, setLocLoading] = useState(false);
  const [locStatus, setLocStatus] = useState("");

  const profileFileRef = useRef(null);
  const coverFileRef = useRef(null);
  const [uploadingProfile, setUploadingProfile] = useState(false);
  const [uploadingCover, setUploadingCover] = useState(false);
  const [showCoverPresetModal, setShowCoverPresetModal] = useState(false);

  const loadData = async (isBackground = false) => {
    try {
      if (!isBackground) {
        setLoading(true);
        setError("");
      }
      const [u, p, sum, ords, an] = await Promise.all([
        getCurrentUser().catch(() => null),
        getFarmerProfile().catch(() => null),
        getFarmerDashboardSummary().catch(() => null),
        listFarmerDashboardOrders().catch(() => []),
        getFarmerDashboardAnalytics().catch(() => null),
      ]);
      if (u) setUser(u);
      if (p) setProfile(p);
      if (sum) setSummary(sum);
      if (Array.isArray(ords)) setOrders(ords);
      if (an) setAnalytics(an);

      if (p && !isBackground) {
        setForm({
          name: p.name || u?.name || "",
          phone: p.phone || u?.phone || "",
          village: p.village || "",
          city: p.city || "",
          district: p.district || "",
          state: p.state || "",
          pin_code: p.pin_code || "",
          address: p.address || "",
          latitude: p.location?.latitude != null ? String(p.location.latitude) : "",
          longitude: p.location?.longitude != null ? String(p.location.longitude) : "",
          profile_image: p.profile_image || "",
          cover_image: p.cover_image || "",
        });
      }
    } catch (err) {
      if (!isBackground) {
        setError(err?.message || "Failed to load farmer profile");
      }
    } finally {
      if (!isBackground) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    loadData();

    // Refetch real-time stats when window regains focus or visibility
    const handleFocus = () => loadData(true);
    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, []);

  const cropsCount = summary?.total_listings ?? 0;
  const activeOrdersCount = useMemo(() => {
    if (orders && orders.length > 0) {
      return orders.filter(
        (o) => !["COMPLETED", "DELIVERED", "CANCELLED"].includes((o.status || "").toUpperCase())
      ).length;
    }
    if (summary?.active_orders !== undefined) {
      return summary.active_orders;
    }
    if (summary) {
      return (summary.pending_orders || 0) + (summary.confirmed_orders || 0);
    }
    return 0;
  }, [orders, summary]);

  const handleProfileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setError("Only JPEG, PNG, and WebP images are supported");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError("Profile image must be less than 5MB");
      return;
    }
    try {
      setUploadingProfile(true);
      setError("");
      const res = await uploadFarmerProfileImage(file);
      setProfile((prev) => ({ ...prev, profile_image: res.profile_image }));
      window.dispatchEvent(new CustomEvent("farmer-profile-updated", { detail: { profile_image: res.profile_image } }));
      setSuccess("Profile picture updated successfully!");
    } catch (err) {
      setError(err?.message || "Failed to upload profile picture");
    } finally {
      setUploadingProfile(false);
      if (profileFileRef.current) profileFileRef.current.value = "";
    }
  };

  const handleCoverUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setError("Only JPEG, PNG, and WebP images are supported");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError("Cover image must be less than 5MB");
      return;
    }
    try {
      setUploadingCover(true);
      setError("");
      const res = await uploadFarmerCoverImage(file);
      setProfile((prev) => ({ ...prev, cover_image: res.cover_image }));
      setSuccess("Cover background image updated successfully!");
    } catch (err) {
      setError(err?.message || "Failed to upload cover image");
    } finally {
      setUploadingCover(false);
      if (coverFileRef.current) coverFileRef.current.value = "";
    }
  };

  const handleSelectPresetCover = async (presetUrl) => {
    try {
      setUploadingCover(true);
      setError("");
      const updated = await updateFarmerProfile({ cover_image: presetUrl });
      setProfile((prev) => ({ ...prev, cover_image: updated.cover_image }));
      setShowCoverPresetModal(false);
      setSuccess("Farm cover background theme applied!");
    } catch (err) {
      setError(err?.message || "Failed to apply cover preset");
    } finally {
      setUploadingCover(false);
    }
  };

  const handleRemoveProfileImage = async () => {
    try {
      setUploadingProfile(true);
      setError("");
      const updated = await updateFarmerProfile({ profile_image: "" });
      setProfile((prev) => ({ ...prev, profile_image: updated.profile_image || null }));
      window.dispatchEvent(new CustomEvent("farmer-profile-updated", { detail: { profile_image: null } }));
      setSuccess("Profile picture removed");
    } catch (err) {
      setError(err?.message || "Failed to remove profile picture");
    } finally {
      setUploadingProfile(false);
    }
  };

  const handleRemoveCoverImage = async () => {
    try {
      setUploadingCover(true);
      setError("");
      const updated = await updateFarmerProfile({ cover_image: "" });
      setProfile((prev) => ({ ...prev, cover_image: updated.cover_image || null }));
      setShowCoverPresetModal(false);
      setSuccess("Cover background removed");
    } catch (err) {
      setError(err?.message || "Failed to remove cover image");
    } finally {
      setUploadingCover(false);
    }
  };

  const handleDetectLocation = () => {
    if (!navigator.geolocation) {
      setLocStatus("Geolocation is not supported by your browser");
      return;
    }
    setLocLoading(true);
    setLocStatus("Locating farm GPS...");

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        setForm((prev) => ({
          ...prev,
          latitude: lat.toFixed(6),
          longitude: lng.toFixed(6),
        }));
        setLocStatus("Detected coordinates. Fetching address...");
        try {
          const rev = await reverseGeocodeLocation(lat, lng);
          if (rev) {
            setForm((prev) => ({
              ...prev,
              village: rev.village || rev.suburb || prev.village,
              city: rev.city || rev.town || prev.city,
              district: rev.district || rev.county || prev.district,
              state: rev.state || prev.state,
              pin_code: rev.postcode || prev.pin_code,
              address: rev.display_name || prev.address,
            }));
            setLocStatus("GPS and address populated successfully!");
          }
        } catch {
          setLocStatus("GPS coordinates captured (could not reverse geocode address).");
        } finally {
          setLocLoading(false);
        }
      },
      (err) => {
        setLocLoading(false);
        setLocStatus(`GPS detection failed: ${err.message}`);
      },
      { timeout: 10000, enableHighAccuracy: true }
    );
  };

  const handleSaveProfile = async (e) => {
    e.preventDefault();
    try {
      setSaving(true);
      setError("");
      setSuccess("");

      if (!form.name.trim()) {
        throw new Error("Full name is required");
      }
      if (form.pin_code && !/^\d{6}$/.test(form.pin_code.trim())) {
        throw new Error("PIN code must be a valid 6-digit number");
      }

      const payload = sanitizeProfilePayload(form);
      const updated = await updateFarmerProfile(payload);
      setProfile(updated);
      if (updated.profile_image !== undefined) {
        window.dispatchEvent(new CustomEvent("farmer-profile-updated", { detail: { profile_image: updated.profile_image } }));
      }
      setEditing(false);
      setSuccess("Profile details updated successfully!");
    } catch (err) {
      setError(err?.message || "Failed to update profile");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="farmer-page-content" style={{ padding: "40px 24px", textAlign: "center" }}>
        <div className="spinner-border text-success" role="status" style={{ width: "2.5rem", height: "2.5rem" }} />
        <p style={{ marginTop: "16px", color: "var(--farmer-muted)", fontSize: "0.9rem" }}>
          Loading farmer profile...
        </p>
      </div>
    );
  }

  const farmerName = profile?.name || user?.name || "Farmer";
  const farmerEmail = user?.email || "—";
  const farmerPhone = profile?.phone || user?.phone || "—";
  const memberSince = formatDate(profile?.created_at || user?.created_at);
  const locationCoords =
    profile?.location?.latitude != null && profile?.location?.longitude != null
      ? `${Number(profile.location.latitude).toFixed(4)}° N, ${Number(profile.location.longitude).toFixed(4)}° E`
      : "Not set";

  return (
    <div className="farmer-page-content" style={{ padding: "24px 28px", maxWidth: "1100px", margin: "0 auto" }}>
      {/* Standard Farmer Page Header */}
      <div className="farmer-page-header">
        <div>
          <div className="eyebrow"><i className="bi bi-person-circle me-1" /> ACCOUNT MANAGEMENT</div>
          <h1 className="farmer-page-title">Farmer Profile</h1>
          <p className="farmer-page-sub">Manage your personal farm details, registered contact information, and farm GPS location.</p>
        </div>

        <div className="farmer-header-actions">
          {!editing ? (
            <button
              type="button"
              className="kisan-btn-accent"
              onClick={() => {
                setEditing(true);
                setError("");
                setSuccess("");
              }}
            >
              <i className="bi bi-pencil-square me-1" /> Edit Profile
            </button>
          ) : (
            <button
              type="button"
              className="kisan-btn-outline"
              onClick={() => {
                setEditing(false);
                setError("");
              }}
            >
              Cancel
            </button>
          )}

          {onLogout && (
            <button
              type="button"
              onClick={onLogout}
              style={{ border: "1px solid #fecaca", background: "#fff1f2", color: "#dc2626", padding: "8px 16px", borderRadius: "8px", fontWeight: 600, fontSize: "0.85rem", cursor: "pointer" }}
            >
              <i className="bi bi-box-arrow-right me-1" /> Sign Out
            </button>
          )}
        </div>
      </div>

      {/* Alerts */}
      {error && (
        <div style={{ background: "var(--farmer-danger-soft)", border: "1px solid #fca5a5", color: "var(--farmer-danger)", padding: "12px 16px", borderRadius: "8px", marginBottom: "20px", fontSize: "0.88rem", display: "flex", alignItems: "center", gap: "10px" }}>
          <i className="bi bi-exclamation-triangle-fill" /> {error}
        </div>
      )}
      {success && (
        <div style={{ background: "var(--farmer-lime-soft)", border: "1px solid #86efac", color: "var(--farmer-forest)", padding: "12px 16px", borderRadius: "8px", marginBottom: "20px", fontSize: "0.88rem", display: "flex", alignItems: "center", gap: "10px" }}>
          <i className="bi bi-check-circle-fill" /> {success}
        </div>
      )}

      {/* Hidden File Inputs for Profile and Cover Images */}
      <input
        type="file"
        ref={profileFileRef}
        accept="image/jpeg,image/png,image/webp"
        onChange={handleProfileUpload}
        style={{ display: "none" }}
      />
      <input
        type="file"
        ref={coverFileRef}
        accept="image/jpeg,image/png,image/webp"
        onChange={handleCoverUpload}
        style={{ display: "none" }}
      />

      {/* Hero Profile Summary Card with Cover Background & Profile Photo */}
      <div className="farmer-profile-hero">
        {/* Cover Photo Banner */}
        <div
          className="farmer-cover-banner"
          style={{
            backgroundImage: profile?.cover_image
              ? `url(${mediaUrl(profile.cover_image)})`
              : "linear-gradient(135deg, #073a26 0%, #0e5a3c 60%, #167a52 100%)",
          }}
        >
          <div className="farmer-cover-overlay">
            <button
              type="button"
              className="farmer-cover-btn"
              onClick={() => coverFileRef.current?.click()}
              disabled={uploadingCover}
              title="Upload custom cover photo from your device"
            >
              <i className="bi bi-camera-fill" />
              <span>{uploadingCover ? "Uploading..." : profile?.cover_image ? "Change Cover" : "Upload Cover"}</span>
            </button>
            <button
              type="button"
              className="farmer-cover-btn"
              onClick={() => setShowCoverPresetModal(true)}
              title="Choose from farm theme backgrounds"
            >
              <i className="bi bi-images" />
              <span>Themes</span>
            </button>
            {profile?.cover_image && (
              <button
                type="button"
                className="farmer-cover-btn text-danger"
                onClick={handleRemoveCoverImage}
                title="Remove cover photo"
              >
                <i className="bi bi-trash" />
              </button>
            )}
          </div>
        </div>

        {/* Profile Info & Avatar Row */}
        <div className="farmer-profile-meta-bar">
          <div className="farmer-profile-identity-wrap">
            <div className="farmer-profile-avatar-box">
              {profile?.profile_image ? (
                <img
                  src={mediaUrl(profile.profile_image)}
                  alt={farmerName}
                  className="farmer-profile-avatar-img"
                />
              ) : (
                <div className="farmer-profile-avatar-fallback">
                  {farmerName.charAt(0).toUpperCase()}
                </div>
              )}
              <button
                type="button"
                className="farmer-avatar-camera-btn"
                onClick={() => profileFileRef.current?.click()}
                disabled={uploadingProfile}
                title="Upload profile picture"
              >
                {uploadingProfile ? (
                  <span className="spinner-border spinner-border-sm" style={{ width: "12px", height: "12px" }} />
                ) : (
                  <i className="bi bi-camera-fill" />
                )}
              </button>
            </div>

            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
                <h2 style={{ fontFamily: "var(--font-display, 'Fraunces', Georgia, serif)", fontSize: "1.45rem", fontWeight: 700, margin: 0, color: "var(--farmer-ink)" }}>
                  {farmerName}
                </h2>
                <span style={{ background: "var(--farmer-forest)", color: "#ffffff", padding: "2px 8px", borderRadius: "12px", fontSize: "0.7rem", fontWeight: 800, letterSpacing: "0.04em" }}>
                  VERIFIED PRODUCER
                </span>
                {profile?.profile_image && (
                  <button
                    type="button"
                    onClick={handleRemoveProfileImage}
                    style={{ background: "none", border: "none", color: "#dc2626", fontSize: "0.75rem", cursor: "pointer", textDecoration: "underline", padding: "0" }}
                  >
                    Remove Photo
                  </button>
                )}
              </div>
              <div style={{ fontSize: "0.85rem", color: "var(--farmer-muted)", marginTop: "4px", display: "flex", gap: "16px", flexWrap: "wrap" }}>
                <span><i className="bi bi-envelope" style={{ marginRight: "6px" }} />{farmerEmail}</span>
                <span><i className="bi bi-telephone" style={{ marginRight: "6px" }} />{farmerPhone}</span>
                <span><i className="bi bi-calendar-event" style={{ marginRight: "6px" }} />Member since {memberSince}</span>
              </div>
            </div>
          </div>

          {/* Quick summary stats with real-time API values */}
          <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", alignItems: "center" }}>
            <button
              type="button"
              onClick={() => navigate("/farmer/crops")}
              className="farmer-profile-stat-badge"
              title="Click to view all listed crops"
            >
              <div className="farmer-profile-stat-number">
                {cropsCount}
              </div>
              <div className="farmer-profile-stat-tag">
                Crops Listed
              </div>
            </button>
            <button
              type="button"
              onClick={() => navigate("/farmer/orders")}
              className="farmer-profile-stat-badge"
              title="Click to view all active orders"
            >
              <div className="farmer-profile-stat-number">
                {activeOrdersCount}
              </div>
              <div className="farmer-profile-stat-tag">
                Active Orders
              </div>
            </button>
          </div>
        </div>
      </div>

      {/* Main Details View / Edit Form */}
      {!editing ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "20px" }}>
          {/* Identity & Contact Card */}
          <div className="farmer-kpi-card" style={{ flexDirection: "column", padding: "20px", background: "#ffffff", borderRadius: "12px", border: "1px solid var(--farmer-border)" }}>
            <h3 style={{ fontSize: "1.05rem", fontWeight: 700, color: "var(--farmer-forest)", margin: "0 0 16px", display: "flex", alignItems: "center", gap: "8px" }}>
              <i className="bi bi-person-badge" /> Personal & Account Identity
            </h3>

            <div style={{ display: "grid", gap: "14px", fontSize: "0.88rem" }}>
              <div>
                <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--farmer-muted)", textTransform: "uppercase" }}>Full Legal Name</div>
                <div style={{ fontWeight: 600, color: "var(--farmer-ink)", marginTop: "2px" }}>{farmerName}</div>
              </div>
              <div>
                <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--farmer-muted)", textTransform: "uppercase" }}>Email Address</div>
                <div style={{ fontWeight: 600, color: "var(--farmer-ink)", marginTop: "2px" }}>{farmerEmail}</div>
                <small style={{ color: "var(--farmer-muted)", fontSize: "0.75rem" }}>Login & primary notification address</small>
              </div>
              <div>
                <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--farmer-muted)", textTransform: "uppercase" }}>Phone Number</div>
                <div style={{ fontWeight: 600, color: "var(--farmer-ink)", marginTop: "2px" }}>{farmerPhone}</div>
              </div>
              <div>
                <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--farmer-muted)", textTransform: "uppercase" }}>Account Role</div>
                <div style={{ fontWeight: 600, color: "var(--farmer-ink)", marginTop: "2px" }}>
                  <span style={{ background: "var(--farmer-lime-soft)", color: "var(--farmer-forest)", padding: "2px 8px", borderRadius: "4px", fontSize: "0.78rem" }}>
                    FARMER / PRODUCER
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Farm Location & GPS Card */}
          <div className="farmer-kpi-card" style={{ flexDirection: "column", padding: "20px", background: "#ffffff", borderRadius: "12px", border: "1px solid var(--farmer-border)" }}>
            <h3 style={{ fontSize: "1.05rem", fontWeight: 700, color: "var(--farmer-forest)", margin: "0 0 16px", display: "flex", alignItems: "center", gap: "8px" }}>
              <i className="bi bi-geo-alt" /> Farm Location & Dispatch Hub
            </h3>

            <div style={{ display: "grid", gap: "14px", fontSize: "0.88rem" }}>
              <div>
                <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--farmer-muted)", textTransform: "uppercase" }}>Village / City / Town</div>
                <div style={{ fontWeight: 600, color: "var(--farmer-ink)", marginTop: "2px" }}>
                  {profile?.village || profile?.city || "—"}
                </div>
              </div>
              <div>
                <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--farmer-muted)", textTransform: "uppercase" }}>District & State</div>
                <div style={{ fontWeight: 600, color: "var(--farmer-ink)", marginTop: "2px" }}>
                  {[profile?.district, profile?.state].filter(Boolean).join(", ") || "—"}
                </div>
              </div>
              <div>
                <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--farmer-muted)", textTransform: "uppercase" }}>Postal PIN Code</div>
                <div style={{ fontWeight: 600, color: "var(--farmer-ink)", marginTop: "2px" }}>
                  {profile?.pin_code || "—"}
                </div>
              </div>
              <div>
                <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--farmer-muted)", textTransform: "uppercase" }}>Full Street / Farm Address</div>
                <div style={{ fontWeight: 600, color: "var(--farmer-ink)", marginTop: "2px" }}>
                  {profile?.address || "—"}
                </div>
              </div>
              <div>
                <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--farmer-muted)", textTransform: "uppercase" }}>Farm GPS Coordinates</div>
                <div style={{ fontWeight: 600, color: "var(--farmer-forest-med)", marginTop: "2px", display: "flex", alignItems: "center", gap: "6px" }}>
                  <i className="bi bi-crosshair" /> {locationCoords}
                </div>
                <small style={{ color: "var(--farmer-muted)", fontSize: "0.75rem" }}>
                  Used for consumer proximity matching and rider dispatch directions.
                </small>
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* Edit Profile Form */
        <div style={{ background: "#ffffff", borderRadius: "14px", border: "1px solid var(--farmer-border)", padding: "24px", boxShadow: "var(--farmer-shadow-sm)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px", borderBottom: "1px solid var(--farmer-border)", paddingBottom: "14px" }}>
            <h3 style={{ fontSize: "1.2rem", fontWeight: 700, color: "var(--farmer-forest)", margin: 0 }}>
              Edit Farmer Information
            </h3>
            <button
              type="button"
              className="farmer-action-pill"
              onClick={handleDetectLocation}
              disabled={locLoading}
              style={{ border: "1px solid var(--farmer-border)", background: "var(--farmer-lime-soft)", color: "var(--farmer-forest)", padding: "6px 12px", borderRadius: "6px", fontWeight: 600, fontSize: "0.8rem", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: "6px" }}
            >
              <i className="bi bi-geo-alt-fill" /> {locLoading ? "Detecting GPS..." : "Detect Farm GPS"}
            </button>
          </div>

          {locStatus && (
            <div style={{ fontSize: "0.82rem", color: "var(--farmer-forest-med)", marginBottom: "16px", padding: "8px 12px", background: "var(--farmer-surface-muted)", borderRadius: "6px" }}>
              <i className="bi bi-info-circle" style={{ marginRight: "6px" }} /> {locStatus}
            </div>
          )}

          <form onSubmit={handleSaveProfile}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "16px", marginBottom: "20px" }}>
              <div className="farmer-form-group">
                <label>Full Legal Name *</label>
                <input
                  type="text"
                  className="farmer-form-control"
                  value={form.name}
                  onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                  required
                />
              </div>

              <div className="farmer-form-group">
                <label>Phone Number</label>
                <input
                  type="text"
                  className="farmer-form-control"
                  value={form.phone}
                  onChange={(e) => setForm((prev) => ({ ...prev, phone: e.target.value }))}
                  placeholder="e.g. +91 9876543210"
                />
              </div>

              <div className="farmer-form-group">
                <label>Village / Gram Panchayat</label>
                <input
                  type="text"
                  className="farmer-form-control"
                  value={form.village}
                  onChange={(e) => setForm((prev) => ({ ...prev, village: e.target.value }))}
                  placeholder="e.g. Rampur"
                />
              </div>

              <div className="farmer-form-group">
                <label>City / Town</label>
                <input
                  type="text"
                  className="farmer-form-control"
                  value={form.city}
                  onChange={(e) => setForm((prev) => ({ ...prev, city: e.target.value }))}
                  placeholder="e.g. Cuttack"
                />
              </div>

              <div className="farmer-form-group">
                <label>District</label>
                <input
                  type="text"
                  className="farmer-form-control"
                  value={form.district}
                  onChange={(e) => setForm((prev) => ({ ...prev, district: e.target.value }))}
                  placeholder="e.g. Cuttack"
                />
              </div>

              <div className="farmer-form-group">
                <label>State</label>
                <input
                  type="text"
                  className="farmer-form-control"
                  value={form.state}
                  onChange={(e) => setForm((prev) => ({ ...prev, state: e.target.value }))}
                  placeholder="e.g. Odisha"
                />
              </div>

              <div className="farmer-form-group">
                <label>PIN Code (6 digits)</label>
                <input
                  type="text"
                  maxLength={6}
                  className="farmer-form-control"
                  value={form.pin_code}
                  onChange={(e) => setForm((prev) => ({ ...prev, pin_code: e.target.value }))}
                  placeholder="e.g. 753001"
                />
              </div>

              <div className="farmer-form-group">
                <label>Farm Latitude (° N)</label>
                <input
                  type="number"
                  step="0.000001"
                  className="farmer-form-control"
                  value={form.latitude}
                  onChange={(e) => setForm((prev) => ({ ...prev, latitude: e.target.value }))}
                  placeholder="e.g. 20.462521"
                />
              </div>

              <div className="farmer-form-group">
                <label>Farm Longitude (° E)</label>
                <input
                  type="number"
                  step="0.000001"
                  className="farmer-form-control"
                  value={form.longitude}
                  onChange={(e) => setForm((prev) => ({ ...prev, longitude: e.target.value }))}
                  placeholder="e.g. 85.882988"
                />
              </div>
            </div>

            <div className="farmer-form-group" style={{ marginBottom: "24px" }}>
              <label>Full Address / Landmark Details</label>
              <textarea
                rows={3}
                className="farmer-form-control"
                value={form.address}
                onChange={(e) => setForm((prev) => ({ ...prev, address: e.target.value }))}
                placeholder="Enter complete address, farm landmarks, or pickup instructions"
              />
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "12px" }}>
              <button
                type="button"
                className="farmer-action-pill"
                onClick={() => setEditing(false)}
                disabled={saving}
                style={{ border: "1px solid var(--farmer-border)", background: "#ffffff", padding: "8px 18px", borderRadius: "8px", fontWeight: 600, fontSize: "0.88rem" }}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="farmer-action-pill primary"
                disabled={saving}
                style={{ border: "none", background: "var(--farmer-forest)", color: "#ffffff", padding: "8px 24px", borderRadius: "8px", fontWeight: 700, fontSize: "0.88rem", cursor: "pointer" }}
              >
                {saving ? "Saving Changes..." : "Save Profile"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Cover Presets Modal */}
      {showCoverPresetModal && (
        <div className="farmer-preset-modal-backdrop" onClick={() => setShowCoverPresetModal(false)}>
          <div className="farmer-preset-modal" onClick={(e) => e.stopPropagation()}>
            <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--farmer-border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <h3 style={{ margin: 0, fontSize: "1.05rem", fontWeight: 700, color: "var(--farmer-forest)" }}>
                  Choose Farm Theme Background
                </h3>
                <small style={{ color: "var(--farmer-muted)" }}>Select a high-resolution farm theme or upload your own</small>
              </div>
              <button
                type="button"
                onClick={() => setShowCoverPresetModal(false)}
                style={{ background: "none", border: "none", fontSize: "1.2rem", cursor: "pointer", color: "var(--farmer-muted)" }}
                aria-label="Close"
              >
                <i className="bi bi-x-lg" />
              </button>
            </div>

            <div className="farmer-preset-grid">
              {COVER_PRESETS.map((preset) => (
                <div
                  key={preset.id}
                  className="farmer-preset-card"
                  onClick={() => handleSelectPresetCover(preset.image)}
                >
                  <img
                    src={preset.image}
                    alt={preset.name}
                    style={{ width: "100%", height: "100px", objectFit: "cover" }}
                  />
                  <div style={{ padding: "10px" }}>
                    <strong style={{ fontSize: "0.85rem", display: "block", color: "var(--farmer-ink)" }}>{preset.name}</strong>
                    <small style={{ fontSize: "0.72rem", color: "var(--farmer-muted)" }}>{preset.desc}</small>
                  </div>
                </div>
              ))}
            </div>

            <div style={{ padding: "12px 20px", background: "var(--farmer-surface-muted)", borderTop: "1px solid var(--farmer-border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <button
                type="button"
                onClick={() => {
                  setShowCoverPresetModal(false);
                  coverFileRef.current?.click();
                }}
                className="farmer-action-pill"
                style={{ background: "#ffffff", border: "1px solid var(--farmer-border)", padding: "6px 14px", borderRadius: "8px", fontSize: "0.82rem", cursor: "pointer", fontWeight: 600 }}
              >
                <i className="bi bi-upload me-1" /> Upload from Computer
              </button>
              <button
                type="button"
                onClick={() => setShowCoverPresetModal(false)}
                className="farmer-action-pill"
                style={{ background: "none", border: "none", padding: "6px 14px", fontSize: "0.82rem", cursor: "pointer", color: "var(--farmer-muted)" }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
