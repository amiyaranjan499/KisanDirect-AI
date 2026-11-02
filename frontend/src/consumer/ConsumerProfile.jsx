import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  getConsumerDashboardReviews,
  getConsumerProfile,
  getCurrentUser,
  updateConsumerProfile,
} from "../services/api";
import { getStoredLocation, subscribeLocation, setManualLocation } from "../services/locationService";
import ConsumerHelp from "./ConsumerHelp";

function compressAvatar(file, maxSize = 280, quality = 0.85) {
  return new Promise((resolve, reject) => {
    if (!file || !file.type.startsWith("image/")) {
      reject(new Error("Please select an image file (PNG, JPG, JPEG, WEBP)."));
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Failed to read image file."));
    reader.onload = (e) => {
      const img = new Image();
      img.onerror = () => reject(new Error("Failed to process image."));
      img.onload = () => {
        let width = img.width;
        let height = img.height;
        if (width > height) {
          if (width > maxSize) {
            height = Math.round((height * maxSize) / width);
            width = maxSize;
          }
        } else {
          if (height > maxSize) {
            width = Math.round((width * maxSize) / height);
            height = maxSize;
          }
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, width, height);
        const compressed = canvas.toDataURL("image/jpeg", quality);
        resolve(compressed);
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

export default function ConsumerProfile({ onLogout }) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const fileInputRef = useRef(null);

  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [liveLocation, setLiveLocation] = useState(() => getStoredLocation());

  useEffect(() => {
    return subscribeLocation((loc) => {
      setLiveLocation(loc);
    });
  }, []);

  // Section handling from URL ('addresses', 'reviews', 'help', or null)
  const [expandedSection, setExpandedSection] = useState(() => searchParams.get("section") || null);

  useEffect(() => {
    const sec = searchParams.get("section");
    setExpandedSection(sec || null);
  }, [searchParams]);

  // Profile Edit inline mode
  const [editingProfile, setEditingProfile] = useState(false);
  const [profileForm, setProfileForm] = useState({ name: "", phone: "" });

  // Address Edit form
  const [editingAddress, setEditingAddress] = useState(false);
  const [addressForm, setAddressForm] = useState(() => {
    const stored = getStoredLocation();
    return {
      address: stored?.address || stored?.address_line || "",
      city: stored?.city || "",
      district: stored?.district || stored?.city || "",
      state: stored?.state || "",
      pin_code: stored?.pin_code || "",
    };
  });

  // Avatar
  const [avatarUrl, setAvatarUrl] = useState(() => {
    return typeof localStorage !== "undefined"
      ? localStorage.getItem("kisandirect_consumer_avatar")
      : null;
  });

  // Reviews state
  const [reviews, setReviews] = useState([]);

  const loadProfileData = () => {
    setLoading(true);
    const storedLoc = getStoredLocation();
    Promise.all([
      getCurrentUser().catch(() => null),
      getConsumerProfile().catch(() => null),
      getConsumerDashboardReviews().catch(() => []),
    ])
      .then(([userData, profileData, reviewsData]) => {
        if (userData) setUser(userData);
        if (profileData) {
          setProfile(profileData);
          setProfileForm({
            name: profileData.name || "",
            phone: profileData.phone || "",
          });
          setAddressForm({
            address: profileData.address || profileData.address_line || storedLoc?.address || storedLoc?.address_line || "",
            city: profileData.city || storedLoc?.city || "",
            district: profileData.district || storedLoc?.district || "",
            state: profileData.state || storedLoc?.state || "",
            pin_code: profileData.pin_code || storedLoc?.pin_code || "",
          });
        }
        if (Array.isArray(reviewsData)) setReviews(reviewsData);
      })
      .catch((err) => setMessage(err.message || "Failed to load profile."))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadProfileData();
  }, []);

  const handleAvatarChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const compressed = await compressAvatar(file, 280, 0.85);
      setAvatarUrl(compressed);
      if (typeof localStorage !== "undefined") {
        try {
          localStorage.setItem("kisandirect_consumer_avatar", compressed);
        } catch (storageErr) {
          console.warn("Storage quota fallback:", storageErr);
        }
      }
      window.dispatchEvent(new CustomEvent("kisandirect_avatar_changed", { detail: compressed }));
      setMessage("Profile photo updated.");
      setTimeout(() => setMessage(""), 2500);
    } catch (err) {
      console.error("Avatar upload failed:", err);
      setMessage(err.message || "Failed to update profile photo.");
    } finally {
      if (e.target) e.target.value = "";
    }
  };

  const handleSaveProfile = async (e) => {
    e.preventDefault();
    if (!profileForm.name.trim()) {
      setMessage("Name cannot be empty.");
      return;
    }
    setSaving(true);
    try {
      const updated = await updateConsumerProfile({
        name: profileForm.name.trim(),
        phone: profileForm.phone.trim() || null,
      });
      setProfile(updated);
      setEditingProfile(false);
      setMessage("Profile information saved.");
      setTimeout(() => setMessage(""), 2500);
    } catch (err) {
      setMessage(err.message || "Failed to save profile.");
    } finally {
      setSaving(false);
    }
  };

  const handleSaveAddress = async (e) => {
    e.preventDefault();
    if (addressForm.pin_code && !/^\d{6}$/.test(addressForm.pin_code)) {
      setMessage("PIN Code must be a 6-digit number.");
      return;
    }
    setSaving(true);
    try {
      const updated = await updateConsumerProfile({
        address: addressForm.address.trim() || null,
        city: addressForm.city.trim() || null,
        district: addressForm.district.trim() || null,
        state: addressForm.state.trim() || null,
        pin_code: addressForm.pin_code.trim() || null,
      });
      setProfile(updated);
      setManualLocation({
        address: addressForm.address.trim(),
        city: addressForm.city.trim(),
        district: addressForm.district.trim(),
        state: addressForm.state.trim(),
        pin_code: addressForm.pin_code.trim(),
      }, false);
      setEditingAddress(false);
      setMessage("Delivery address updated successfully.");
      setTimeout(() => setMessage(""), 2500);
    } catch (err) {
      setMessage(err.message || "Failed to update address.");
    } finally {
      setSaving(false);
    }
  };

  const displayName = profile?.name || user?.name || (user?.email ? user.email.split("@")[0] : "Customer");
  const displayPhone = profile?.phone || user?.phone || "Not provided";
  const displayEmail = user?.email || "";

  // Subpage: Help & Support (when section=help)
  if (expandedSection === "help" || searchParams.get("section") === "help") {
    return <ConsumerHelp onBack={() => navigate("/profile")} />;
  }

  // Subpage: My Reviews (when section=reviews)
  if (expandedSection === "reviews" || searchParams.get("section") === "reviews") {
    return (
      <div className="consumer-profile-page wrap" style={{ maxWidth: "760px", margin: "0 auto", padding: "16px 20px 48px" }}>
        <button
          type="button"
          onClick={() => navigate("/profile")}
          style={{
            background: "#FFFFFF",
            border: "1px solid var(--line, #E4DFD1)",
            color: "var(--forest, #1B6B34)",
            padding: "6px 14px",
            borderRadius: "8px",
            fontSize: "13px",
            fontWeight: 600,
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            gap: "6px",
            marginBottom: "16px",
          }}
        >
          <i className="bi bi-chevron-left" style={{ fontSize: "11px" }} />
          <span>Back to profile</span>
        </button>

        <div style={{ marginBottom: "20px" }}>
          <h2 style={{ fontSize: "24px", fontWeight: 700, color: "var(--forest, #1B6B34)", margin: "0 0 4px", fontFamily: "Fraunces, Georgia, serif" }}>
            My Reviews
          </h2>
          <p style={{ fontSize: "13.5px", color: "var(--clay, #79705F)", margin: 0 }}>
            Reviews and feedback you have written for purchased produce.
          </p>
        </div>

        {reviews.length > 0 ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            {reviews.map((r) => (
              <div
                key={r.id}
                className="card card-pad"
                style={{
                  padding: "16px 20px",
                  borderRadius: "14px",
                  border: "1px solid var(--line, #E4DFD1)",
                  background: "#FFFFFF",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                  <span style={{ fontWeight: 700, fontSize: "14px", color: "var(--ink, #1C1C16)" }}>
                    {r.crop_name || "Fresh Produce"}
                  </span>
                  <span style={{ color: "#D97706", fontSize: "13px" }}>
                    {"★".repeat(r.rating || 5)}{"☆".repeat(Math.max(0, 5 - (r.rating || 5)))}
                  </span>
                </div>
                <div style={{ fontSize: "12px", color: "var(--clay, #79705F)", marginBottom: "8px" }}>
                  {r.created_at ? new Date(r.created_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "Recent"}
                </div>
                <p style={{ fontSize: "13.5px", color: "var(--ink, #1C1C16)", margin: 0, lineHeight: 1.5 }}>
                  {r.comment || "Good quality produce directly from farm."}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <div
            className="card card-pad"
            style={{
              textAlign: "center",
              padding: "48px 20px",
              background: "#FFFFFF",
              borderRadius: "14px",
              border: "1px solid var(--line, #E4DFD1)",
            }}
          >
            <div style={{ fontSize: "36px", color: "var(--clay, #79705F)", marginBottom: "12px" }}>
              <i className="bi bi-star" />
            </div>
            <h3 style={{ fontSize: "17px", fontWeight: 700, margin: "0 0 6px", color: "var(--forest, #1B6B34)", fontFamily: "'Fraunces', Georgia, serif" }}>
              No reviews written yet
            </h3>
            <p style={{ fontSize: "13.5px", color: "var(--clay, #79705F)", maxWidth: "380px", margin: "0 auto 20px" }}>
              You can rate and review produce from your completed orders under My Orders.
            </p>
            <button
              type="button"
              onClick={() => navigate("/marketplace")}
              style={{
                background: "var(--forest, #1B6B34)",
                color: "#FFFFFF",
                border: "none",
                borderRadius: "8px",
                padding: "8px 20px",
                fontSize: "13.5px",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Explore Fresh Crops
            </button>
          </div>
        )}
      </div>
    );
  }

  // Subpage: Addresses (when section=addresses)
  if (expandedSection === "addresses" || searchParams.get("section") === "addresses") {
    return (
      <div className="consumer-profile-page wrap" style={{ maxWidth: "760px", margin: "0 auto", padding: "16px 20px 48px" }}>
        <button
          type="button"
          onClick={() => navigate("/profile")}
          style={{
            background: "#FFFFFF",
            border: "1px solid var(--line, #E4DFD1)",
            color: "var(--forest, #1B6B34)",
            padding: "6px 14px",
            borderRadius: "8px",
            fontSize: "13px",
            fontWeight: 600,
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            gap: "6px",
            marginBottom: "16px",
          }}
        >
          <i className="bi bi-chevron-left" style={{ fontSize: "11px" }} />
          <span>Back to profile</span>
        </button>

        <div style={{ marginBottom: "20px" }}>
          <h2 style={{ fontSize: "24px", fontWeight: 700, color: "var(--forest, #1B6B34)", margin: "0 0 4px", fontFamily: "Fraunces, Georgia, serif" }}>
            Delivery Addresses
          </h2>
          <p style={{ fontSize: "13.5px", color: "var(--clay, #79705F)", margin: 0 }}>
            Manage and update your primary delivery address.
          </p>
        </div>

        {/* Address Card */}
        <div
          className="card card-pad"
          style={{
            padding: "20px",
            background: "#FFFFFF",
            borderRadius: "14px",
            border: "1px solid var(--line, #E4DFD1)",
            marginBottom: "16px",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "8px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span style={{ fontWeight: 700, fontSize: "15px", color: "var(--ink, #1C1C16)" }}>Home / Primary Address</span>
              <span style={{ background: "#E8F5E9", color: "#1B6B34", fontSize: "11px", fontWeight: 700, padding: "2px 8px", borderRadius: "10px" }}>
                Default
              </span>
            </div>
            <button
              type="button"
              onClick={() => setEditingAddress((prev) => !prev)}
              style={{
                background: "transparent",
                border: "none",
                color: "var(--forest, #1B6B34)",
                fontSize: "13px",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              {editingAddress ? "Close" : "Edit Address"}
            </button>
          </div>

          <div style={{ fontSize: "13.5px", color: "var(--clay, #79705F)", lineHeight: 1.5 }}>
            {addressForm.address || "Yelahanka New Town"}<br />
            {[addressForm.city, addressForm.district, addressForm.state].filter(Boolean).join(", ") || "Bangalore Urban, Karnataka"}{" "}
            {addressForm.pin_code ? `- ${addressForm.pin_code}` : "- 560064"}
          </div>
        </div>

        {/* Address Edit Form */}
        {editingAddress && (
          <form
            onSubmit={handleSaveAddress}
            className="card card-pad"
            style={{
              padding: "20px",
              background: "#FFFFFF",
              borderRadius: "14px",
              border: "1.5px solid var(--forest, #1B6B34)",
              marginBottom: "16px",
            }}
          >
            <h4 style={{ fontSize: "14.5px", fontWeight: 700, color: "var(--forest, #1B6B34)", margin: "0 0 12px", fontFamily: "'Fraunces', Georgia, serif" }}>
              Edit Address Details
            </h4>
            <div style={{ display: "flex", flexDirection: "column", gap: "12px", marginBottom: "16px" }}>
              <div>
                <label style={{ fontSize: "12px", fontWeight: 600, color: "var(--clay, #79705F)", display: "block", marginBottom: "4px" }}>
                  Street Address
                </label>
                <input
                  type="text"
                  value={addressForm.address}
                  onChange={(e) => setAddressForm((prev) => ({ ...prev, address: e.target.value }))}
                  style={{ width: "100%", padding: "8px 12px", borderRadius: "8px", border: "1px solid var(--line, #E4DFD1)", fontSize: "13.5px" }}
                  required
                />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                <div>
                  <label style={{ fontSize: "12px", fontWeight: 600, color: "var(--clay, #79705F)", display: "block", marginBottom: "4px" }}>
                    City
                  </label>
                  <input
                    type="text"
                    value={addressForm.city}
                    onChange={(e) => setAddressForm((prev) => ({ ...prev, city: e.target.value }))}
                    style={{ width: "100%", padding: "8px 12px", borderRadius: "8px", border: "1px solid var(--line, #E4DFD1)", fontSize: "13.5px" }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: "12px", fontWeight: 600, color: "var(--clay, #79705F)", display: "block", marginBottom: "4px" }}>
                    PIN Code
                  </label>
                  <input
                    type="text"
                    maxLength={6}
                    value={addressForm.pin_code}
                    onChange={(e) => setAddressForm((prev) => ({ ...prev, pin_code: e.target.value }))}
                    style={{ width: "100%", padding: "8px 12px", borderRadius: "8px", border: "1px solid var(--line, #E4DFD1)", fontSize: "13.5px" }}
                  />
                </div>
              </div>
            </div>
            <div style={{ display: "flex", gap: "10px" }}>
              <button
                type="submit"
                disabled={saving}
                style={{
                  background: "var(--forest, #1B6B34)",
                  color: "#FFFFFF",
                  border: "none",
                  borderRadius: "8px",
                  padding: "8px 18px",
                  fontSize: "13px",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                {saving ? "Saving..." : "Save Address"}
              </button>
              <button
                type="button"
                onClick={() => setEditingAddress(false)}
                style={{
                  background: "#FFFFFF",
                  border: "1px solid var(--line, #E4DFD1)",
                  color: "var(--clay, #79705F)",
                  borderRadius: "8px",
                  padding: "8px 16px",
                  fontSize: "13px",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>
    );
  }

  // Main /profile View: ONLY Profile Information (as requested by user)
  return (
    <div className="consumer-profile-page wrap" style={{ maxWidth: "760px", margin: "0 auto", padding: "16px 20px 48px" }}>
      {/* Hidden file input for photo upload */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        style={{ display: "none" }}
        onChange={handleAvatarChange}
      />

      {/* Toast Notification */}
      {message && (
        <div
          style={{
            position: "fixed",
            bottom: "74px",
            right: "20px",
            zIndex: 9999,
            background: "var(--forest, #1B6B34)",
            color: "#FFFFFF",
            padding: "10px 18px",
            borderRadius: "8px",
            fontSize: "13.5px",
            boxShadow: "0 4px 12px rgba(0,0,0,0.18)",
            display: "flex",
            alignItems: "center",
            gap: "8px",
          }}
        >
          <i className="bi bi-check-circle-fill text-white" />
          <span>{message}</span>
        </div>
      )}

      {/* Page Title */}
      <div className="section-title" style={{ marginBottom: "16px" }}>
        <h2 style={{ fontSize: "24px", fontWeight: 700, color: "var(--forest, #1B6B34)", margin: 0, fontFamily: "Fraunces, Georgia, serif" }}>
          My Profile
        </h2>
      </div>

      {/* 1. Profile Top Avatar Header */}
      <div
        className="card card-pad"
        style={{
          display: "flex",
          alignItems: "center",
          gap: "18px",
          marginBottom: "16px",
          borderRadius: "14px",
          border: "1px solid var(--line, #E4DFD1)",
          background: "#FFFFFF",
          padding: "20px 24px",
          boxShadow: "0 1px 4px rgba(0, 0, 0, 0.02)",
        }}
      >
        {/* Avatar with Camera Badge */}
        <div style={{ position: "relative" }}>
          <div
            className="avatar avatar-round"
            style={{
              width: "72px",
              height: "72px",
              borderRadius: "50%",
              overflow: "hidden",
              background: "var(--sage-light, #E3F5E4)",
              border: "2px solid #FFFFFF",
              boxShadow: "0 2px 6px rgba(0,0,0,0.1)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "26px",
              fontWeight: 700,
              color: "var(--forest, #1B6B34)",
            }}
          >
            {avatarUrl ? (
              <img src={avatarUrl} alt={displayName} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            ) : (
              displayName.slice(0, 1).toUpperCase()
            )}
          </div>

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            title="Upload profile photo"
            style={{
              position: "absolute",
              bottom: "0",
              right: "-2px",
              width: "26px",
              height: "26px",
              borderRadius: "50%",
              background: "var(--forest, #1B6B34)",
              color: "#FFFFFF",
              border: "2px solid #FFFFFF",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              fontSize: "12px",
            }}
          >
            <i className="bi bi-camera-fill" />
          </button>
        </div>

        {/* User Info */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 800, fontSize: "20px", color: "var(--forest, #1B6B34)", fontFamily: "Fraunces, Georgia, serif" }}>
            {displayName}
          </div>
          <div style={{ fontSize: "13px", color: "var(--clay, #79705F)", marginTop: "2px" }}>
            {displayPhone !== "Not provided" ? `${displayPhone} · ` : ""}{displayEmail}
          </div>
        </div>

        {/* Edit Profile Button */}
        <button
          type="button"
          onClick={() => setEditingProfile((prev) => !prev)}
          style={{
            padding: "7px 16px",
            fontSize: "13px",
            fontWeight: 600,
            borderRadius: "8px",
            border: "1px solid var(--line, #E4DFD1)",
            background: editingProfile ? "var(--sage-light, #E3F5E4)" : "#FFFFFF",
            color: "var(--ink, #1C1C16)",
            display: "inline-flex",
            alignItems: "center",
            gap: "5px",
            cursor: "pointer",
          }}
        >
          <i className="bi bi-pencil" style={{ fontSize: "11px" }} />
          <span>{editingProfile ? "Close" : "Edit"}</span>
        </button>
      </div>

      {/* Inline Edit Profile Panel */}
      {editingProfile && (
        <form
          onSubmit={handleSaveProfile}
          className="card card-pad"
          style={{
            marginBottom: "16px",
            borderRadius: "14px",
            border: "1.5px solid var(--forest, #1B6B34)",
            background: "#FFFFFF",
            padding: "18px 20px",
          }}
        >
          <h3 style={{ fontSize: "15px", fontWeight: 700, color: "var(--forest, #1B6B34)", margin: "0 0 14px 0", fontFamily: "'Fraunces', Georgia, serif" }}>
            Edit Profile Information
          </h3>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "14px" }}>
            <div>
              <label style={{ fontSize: "12px", fontWeight: 600, color: "var(--clay, #79705F)", display: "block", marginBottom: "4px" }}>
                Full Name
              </label>
              <input
                type="text"
                value={profileForm.name}
                onChange={(e) => setProfileForm((prev) => ({ ...prev, name: e.target.value }))}
                style={{ width: "100%", padding: "8px 12px", fontSize: "13.5px", borderRadius: "8px", border: "1px solid var(--line, #E4DFD1)" }}
                required
              />
            </div>
            <div>
              <label style={{ fontSize: "12px", fontWeight: 600, color: "var(--clay, #79705F)", display: "block", marginBottom: "4px" }}>
                Phone Number
              </label>
              <input
                type="tel"
                value={profileForm.phone}
                onChange={(e) => setProfileForm((prev) => ({ ...prev, phone: e.target.value }))}
                placeholder="+91"
                style={{ width: "100%", padding: "8px 12px", fontSize: "13.5px", borderRadius: "8px", border: "1px solid var(--line, #E4DFD1)" }}
              />
            </div>
          </div>
          <div style={{ display: "flex", gap: "8px" }}>
            <button
              type="submit"
              disabled={saving}
              style={{
                padding: "7px 18px",
                borderRadius: "8px",
                background: "var(--forest, #1B6B34)",
                border: "none",
                color: "#FFF",
                fontWeight: 600,
                fontSize: "13px",
                cursor: "pointer",
              }}
            >
              {saving ? "Saving..." : "Save Changes"}
            </button>
            <button
              type="button"
              onClick={() => setEditingProfile(false)}
              style={{
                padding: "7px 16px",
                borderRadius: "8px",
                background: "#FFF",
                border: "1px solid var(--line, #E4DFD1)",
                color: "var(--clay, #79705F)",
                fontSize: "13px",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* 2. ONLY Profile Information Display (as explicitly requested: "in profile page only profile information come not anything") */}
      <div
        className="card card-pad"
        style={{
          borderRadius: "14px",
          border: "1px solid var(--line, #E4DFD1)",
          background: "#FFFFFF",
          padding: "20px 24px",
          marginBottom: "24px",
          boxShadow: "0 1px 4px rgba(0, 0, 0, 0.02)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px", borderBottom: "1px solid #F1ECE1", paddingBottom: "10px" }}>
          <h3 style={{ fontSize: "15px", fontWeight: 700, margin: 0, color: "var(--forest, #1B6B34)", fontFamily: "'Fraunces', Georgia, serif", display: "flex", alignItems: "center", gap: "6px" }}>
            <i className="bi bi-person-badge" /> Profile Information
          </h3>
          <span style={{ fontSize: "11.5px", fontWeight: 700, background: "#E8F5E9", color: "#1B6B34", padding: "2px 8px", borderRadius: "12px" }}>
            Verified Account
          </span>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "18px" }}>
          <div>
            <span style={{ fontSize: "11.5px", color: "var(--clay, #79705F)", fontWeight: 600, textTransform: "uppercase", display: "block", marginBottom: "3px" }}>
              Full Name
            </span>
            <span style={{ fontSize: "14.5px", fontWeight: 600, color: "var(--ink, #1C1C16)" }}>
              {displayName}
            </span>
          </div>

          <div>
            <span style={{ fontSize: "11.5px", color: "var(--clay, #79705F)", fontWeight: 600, textTransform: "uppercase", display: "block", marginBottom: "3px" }}>
              Email Address
            </span>
            <span style={{ fontSize: "14.5px", fontWeight: 600, color: "var(--ink, #1C1C16)" }}>
              {displayEmail}
            </span>
          </div>

          <div>
            <span style={{ fontSize: "11.5px", color: "var(--clay, #79705F)", fontWeight: 600, textTransform: "uppercase", display: "block", marginBottom: "3px" }}>
              Mobile Phone
            </span>
            <span style={{ fontSize: "14.5px", fontWeight: 600, color: "var(--ink, #1C1C16)" }}>
              {displayPhone}
            </span>
          </div>

          <div>
            <span style={{ fontSize: "11.5px", color: "var(--clay, #79705F)", fontWeight: 600, textTransform: "uppercase", display: "block", marginBottom: "3px" }}>
              Primary Location
            </span>
            <span style={{ fontSize: "14.5px", fontWeight: 600, color: "var(--ink, #1C1C16)" }}>
              {[addressForm.city, addressForm.district, addressForm.state].filter(Boolean).join(", ") || addressForm.address || "Yelahanka, Karnataka - 560064"}
            </span>
          </div>
        </div>
      </div>

      {/* 3. Logout Button */}
      <div style={{ textAlign: "center", marginTop: "12px" }}>
        <button
          type="button"
          onClick={() => {
            if (onLogout) {
              onLogout();
            } else {
              navigate("/login");
            }
          }}
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "7px",
            padding: "8px 24px",
            borderRadius: "8px",
            border: "1px solid rgba(180, 67, 47, 0.25)",
            background: "var(--danger-light, #F6E1DC)",
            color: "var(--danger, #B4432F)",
            fontWeight: 600,
            fontSize: "13px",
            cursor: "pointer",
            transition: "all 0.15s ease",
          }}
        >
          <i className="bi bi-box-arrow-right" style={{ fontSize: "14px" }} />
          <span>Logout</span>
        </button>
      </div>
    </div>
  );
}
