import { useEffect, useState } from "react";
import { getConsumerProfile, updateConsumerProfile } from "../services/api";
import { states } from "../i18n/stateLanguages";
import { useI18n } from "../i18n";

const emptyForm = {
  name: "",
  phone: "",
  address: "",
  village: "",
  post_office: "",
  city: "",
  district: "",
  state: "",
  pin_code: "",
  address_line: "",
};

export default function ConsumerProfile({ onBack, onDashboard, onNavigate, onLogout }) {
  const { t } = useI18n();
  const [profile, setProfile] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    getConsumerProfile()
      .then((next) => {
        setProfile(next);
        setForm({
          name: next.name || "",
          phone: next.phone || "",
          address: next.address || "",
          village: next.village || "",
          post_office: next.post_office || "",
          city: next.city || "",
          district: next.district || "",
          state: next.state || "",
          pin_code: next.pin_code || "",
          address_line: next.address_line || "",
        });
      })
      .catch((error) => setMessage(error.message || "Unable to load your profile."))
      .finally(() => setLoading(false));
  }, []);

  const update = (field) => (event) => setForm((previous) => ({ ...previous, [field]: event.target.value }));

  const save = async (event) => {
    event.preventDefault();
    if (!form.name.trim()) {
      setMessage("Name is required.");
      return;
    }

    try {
      setSaving(true);
      if (form.pin_code && !/^\d{6}$/.test(form.pin_code)) {
        setMessage("PIN Code must be exactly 6 digits.");
        return;
      }

      const next = await updateConsumerProfile({
        ...form,
        name: form.name.trim(),
        phone: form.phone.trim() || null,
        address: form.address.trim() || null,
        state: form.state || null,
      });

      setProfile(next);
      setEditing(false);
      setMessage("Profile updated successfully.");
    } catch (error) {
      setMessage(error.message || "Unable to update your profile.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <section className="detail-view">
        <button className="back-button" onClick={onBack}>← {t("back")}</button>
        <div className="loading">{t("loading")}</div>
      </section>
    );
  }

  return (
    <section className="detail-view profile-page consumer-profile-page">
      <div className="profile-heading consumer-profile-header">
        <div>
          <button className="back-button" onClick={onBack}>← {t("back")}</button>
          <span className="eyebrow">Consumer profile</span>
          <h1>Your buyer profile</h1>
          <p>Keep your contact and delivery details ready for checkout.</p>
        </div>

        <div className="profile-actions">{!editing && <button className="primary-button" onClick={() => { setMessage(""); setEditing(true); }}><i className="bi bi-pencil" /> {t("edit")}</button>}</div>
      </div>

      {message && <div className={message.includes("success") ? "success" : "error"}>{message}</div>}

      {!editing ? (
        <div className="profile-summary simplified-profile">
          <div className="profile-identity">
            <span className="profile-initial">{profile?.name?.slice(0, 1).toUpperCase()}</span>
            <div>
              <span className="eyebrow">Registered buyer</span>
              <h2>{profile?.name}</h2>
              <p>{[profile?.phone, profile?.email].filter(Boolean).join(" · ") || "Contact details not provided."}</p>
            </div>
          </div>

          <div className="profile-badges">
            <span>{profile?.phone || "Phone not provided"}</span>
            <span>{profile?.state || "State not provided"}</span>
            <span>{profile?.pin_code ? `PIN ${profile.pin_code}` : "PIN not provided"}</span>
          </div>

          <dl className="profile-details">
            <div><dt>Phone</dt><dd>{profile?.phone || "Not provided"}</dd></div>
            <div><dt>State</dt><dd>{profile?.state || "Not provided"}</dd></div>
            <div><dt>PIN Code</dt><dd>{profile?.pin_code || "Not provided"}</dd></div>
            <div><dt>Updated</dt><dd>{profile?.updated_at ? new Date(profile.updated_at).toLocaleDateString() : "Not available"}</dd></div>
          </dl>
        </div>
      ) : (
        <form className="profile-form" onSubmit={save}>
          <div className="profile-form-grid">
            <label>
              Name
              <input value={form.name} onChange={update("name")} required />
            </label>
            <label>
              Phone
              <input value={form.phone} onChange={update("phone")} />
            </label>
            <label>
              At / Village
              <input value={form.village} onChange={update("village")} />
            </label>
            <label>
              Post Office
              <input value={form.post_office} onChange={update("post_office")} />
            </label>
            <label>
              City / Town
              <input value={form.city} onChange={update("city")} />
            </label>
            <label>
              District
              <input value={form.district} onChange={update("district")} />
            </label>
            <label>
              State
              <select value={form.state} onChange={update("state")}>
                <option value="">Select state</option>
                {states.map((state) => <option key={state} value={state}>{state}</option>)}
              </select>
            </label>
            <label>
              PIN Code
              <input value={form.pin_code} onChange={update("pin_code")} maxLength={6} />
            </label>
            <label className="profile-wide">
              Address / Landmark
              <textarea value={form.address_line} onChange={update("address_line")} rows={3} />
            </label>

            <div className="profile-form-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={() => {
                  setEditing(false);
                  setForm(profile ? { ...profile, address: profile.address || "", pin_code: profile.pin_code || "" } : emptyForm);
                }}
              >
                {t("cancel")}
              </button>
              <button type="submit" className="primary-button" disabled={saving}>
                {saving ? "Saving..." : t("save")}
              </button>
            </div>
          </div>
        </form>
      )}

      {!editing && <div className="consumer-profile-menu">
        <button className="consumer-profile-row" onClick={() => { setMessage(""); setEditing(true); }}><span className="profile-row-icon"><i className="bi bi-geo-alt" /></span><span><b>Addresses</b><small>{profile?.address_line || profile?.address || "Add a delivery address"}</small></span><i className="bi bi-chevron-right" /></button>
        <button className="consumer-profile-row" onClick={() => onNavigate?.("payment-methods")}><span className="profile-row-icon"><i className="bi bi-credit-card" /></span><span><b>Payment Methods</b><small>Manage saved cards and UPI</small></span><i className="bi bi-chevron-right" /></button>
        <button className="consumer-profile-row" onClick={() => onNavigate?.("orders")}><span className="profile-row-icon"><i className="bi bi-receipt" /></span><span><b>My Orders</b><small>Track and manage orders</small></span><i className="bi bi-chevron-right" /></button>
        <button className="consumer-profile-row" onClick={() => setMessage("Reviews are available on completed purchases from each listing detail page.")}><span className="profile-row-icon"><i className="bi bi-star-fill" /></span><span><b>My Reviews</b><small>Reviews you have written</small></span><i className="bi bi-chevron-right" /></button>
        <button className="consumer-profile-row" onClick={() => onNavigate?.("notifications")}><span className="profile-row-icon"><i className="bi bi-bell" /></span><span><b>Notifications</b><small>Order and platform updates</small></span><i className="bi bi-chevron-right" /></button>
        <button className="consumer-profile-row" onClick={() => onNavigate?.("settings")}><span className="profile-row-icon"><i className="bi bi-gear" /></span><span><b>Settings</b><small>Profile and app preferences</small></span><i className="bi bi-chevron-right" /></button>
        <button className="consumer-profile-row" onClick={() => setMessage("Help and support are not configured in the current backend.")}><span className="profile-row-icon"><i className="bi bi-question-circle" /></span><span><b>Help & Support</b><small>FAQs and contact</small></span><i className="bi bi-chevron-right" /></button>
        <button className="consumer-logout-row" onClick={onLogout}><i className="bi bi-box-arrow-right" /><b>Logout</b></button>
      </div>}
    </section>
  );
}
