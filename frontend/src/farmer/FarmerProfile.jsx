import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getCurrentUser, getFarmerProfile, updateFarmerProfile } from "../services/api";

const emptyForm = {
  name: "",
  phone: "",
  district: "",
  city: "",
  state: "",
  pin_code: "",
  address: "",
};

export default function FarmerProfile({ onBack, onDashboard, onLogout }) {
  const navigate = useNavigate();
  const [profile, setProfile] = useState(null);
  const [user, setUser] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  const loadProfile = async () => {
    try {
      const [farmerProfile, currentUser] = await Promise.all([getFarmerProfile(), getCurrentUser()]);
      setProfile(farmerProfile);
      setUser(currentUser);
      setForm({
        name: farmerProfile.name || "",
        phone: farmerProfile.phone || "",
        district: farmerProfile.district || "",
        city: farmerProfile.city || "",
        state: farmerProfile.state || "",
        pin_code: farmerProfile.pin_code || "",
        address: farmerProfile.address || "",
      });
    } catch (requestError) {
      setError(requestError.message || "Unable to load profile.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProfile();
  }, []);

  const updateField = (field) => (event) => {
    const value = event.target.value;
    setForm((previous) => ({ ...previous, [field]: value }));
  };

  const saveProfile = async (event) => {
    event.preventDefault();
    try {
      setSaving(true);
      setError("");
      setSuccess("");
      const nextProfile = await updateFarmerProfile(form);
      setProfile(nextProfile);
      setEditing(false);
      setSuccess("Profile updated successfully.");
    } catch (requestError) {
      setError(requestError.message || "Unable to update profile.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <section className="detail-view profile-page"><div className="loading">Loading profile...</div></section>;
  }

  return (
    <section className="detail-view profile-page farmer-profile-page">
      <div className="consumer-screen-header farmer-page-header">
        <div>
          <span className="eyebrow">Farmer profile</span>
          <h1>{profile?.name || "Farmer profile"}</h1>
        </div>
        {!editing ? (
          <button type="button" className="farmer-small-button secondary" onClick={() => setEditing(true)}>Edit</button>
        ) : null}
      </div>

      {error ? <div className="error">{error}</div> : null}
      {success ? <div className="success">{success}</div> : null}

      {!editing ? (
        <>
          <div className="farmer-profile-summary">
            <div className="farmer-avatar">{(profile?.name || "F").slice(0, 1).toUpperCase()}</div>
            <div>
              <h2>{profile?.name || "Farmer"}</h2>
              <p>{[profile?.city, profile?.state].filter(Boolean).join(", ") || "No address set"}</p>
            </div>
          </div>

          <div className="farmer-profile-grid">
            <div className="farmer-profile-label">Phone</div>
            <div className="farmer-profile-value">{profile?.phone || "Not provided"}</div>

            <div className="farmer-profile-label">Email</div>
            <div className="farmer-profile-value">{user?.email || "Not available"}</div>

            <div className="farmer-profile-label">District</div>
            <div className="farmer-profile-value">{profile?.district || "Not provided"}</div>

            <div className="farmer-profile-label">City</div>
            <div className="farmer-profile-value">{profile?.city || "Not provided"}</div>

            <div className="farmer-profile-label">State</div>
            <div className="farmer-profile-value">{profile?.state || "Not provided"}</div>

            <div className="farmer-profile-label">PIN code</div>
            <div className="farmer-profile-value">{profile?.pin_code || "Not provided"}</div>
          </div>

          <div className="farmer-support-list">
            <button type="button" className="farmer-support-row" onClick={() => navigate("/farmer/dashboard")}>
              <span><i className="bi bi-speedometer2" /> Dashboard</span>
              <i className="bi bi-chevron-right" />
            </button>
            <button type="button" className="farmer-support-row" onClick={() => navigate("/farmer/notifications")}>
              <span><i className="bi bi-bell" /> Notifications</span>
              <i className="bi bi-chevron-right" />
            </button>
          </div>

          <button
            type="button"
            className="farmer-logout"
            onClick={() => {
              localStorage.removeItem("kisandirect_access_token");
              if (onLogout) onLogout();
              else navigate("/login");
            }}
          >
            <i className="bi bi-box-arrow-left" /> Logout
          </button>
        </>
      ) : (
        <form className="profile-form" onSubmit={saveProfile} noValidate>
          <div className="profile-form-grid">
            <label>
              Name
              <input value={form.name} onChange={updateField("name")} />
            </label>
            <label>
              Phone
              <input value={form.phone} onChange={updateField("phone")} />
            </label>
            <label>
              District
              <input value={form.district} onChange={updateField("district")} />
            </label>
            <label>
              City
              <input value={form.city} onChange={updateField("city")} />
            </label>
            <label>
              State
              <input value={form.state} onChange={updateField("state")} />
            </label>
            <label>
              PIN code
              <input value={form.pin_code} onChange={updateField("pin_code")} />
            </label>
            <label className="profile-wide">
              Address
              <textarea rows="4" value={form.address} onChange={updateField("address")} />
            </label>
          </div>

          <div className="profile-form-actions">
            <button type="button" className="secondary-button" onClick={() => setEditing(false)}>Cancel</button>
            <button type="submit" className="primary-button" disabled={saving}>{saving ? "Saving..." : "Save profile"}</button>
          </div>
        </form>
      )}
    </section>
  );
}
