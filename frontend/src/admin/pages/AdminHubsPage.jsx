import { useCallback, useEffect, useState } from "react";
import { useI18n } from "../../i18n";
import AdminHubLocationPicker from "../components/AdminHubLocationPicker";
import { createAdminHub, listAdminHubs, updateAdminHub } from "../../services/adminApi";

const emptyForm = {
  name: "",
  address: "",
  pincode: "",
  service_radius_km: "8",
  status: "ACTIVE",
};

export default function AdminHubsPage() {
  const { t } = useI18n();
  const [hubs, setHubs] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [location, setLocation] = useState(null);
  const [editingId, setEditingId] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const refresh = useCallback(() => {
    setLoading(true);
    listAdminHubs()
      .then((rows) => setHubs(Array.isArray(rows) ? rows : []))
      .catch((requestError) => setError(requestError.message || t("adminHubLoadError")))
      .finally(() => setLoading(false));
  }, [t]);

  useEffect(() => refresh(), [refresh]);

  function setField(event) {
    setForm((current) => ({ ...current, [event.target.name]: event.target.value }));
  }

  function startEdit(hub) {
    setEditingId(hub.id);
    setForm({
      name: hub.name,
      address: hub.address,
      pincode: hub.pincode,
      service_radius_km: String(hub.service_radius_km),
      status: hub.status,
    });
    setLocation({ latitude: hub.latitude, longitude: hub.longitude });
    setError("");
    setNotice("");
  }

  function resetForm() {
    setForm(emptyForm);
    setLocation(null);
    setEditingId("");
  }

  function requestBrowserLocation() {
    setError("");
    if (!navigator.geolocation) {
      setError(t("adminHubBrowserUnsupported"));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => setLocation({ latitude: coords.latitude, longitude: coords.longitude }),
      (locationError) => setError(locationError.code === locationError.PERMISSION_DENIED ? t("adminHubPermissionDenied") : t("adminHubLocationError")),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    );
  }

  async function saveHub(event) {
    event.preventDefault();
    if (!location) {
      setError(t("adminHubChooseLocation"));
      return;
    }
    setSaving(true);
    setError("");
    setNotice("");
    const payload = {
      ...form,
      service_radius_km: Number(form.service_radius_km),
      latitude: location.latitude,
      longitude: location.longitude,
    };
    try {
      if (editingId) await updateAdminHub(editingId, payload);
      else await createAdminHub(payload);
      setNotice(editingId ? t("adminHubUpdated") : t("adminHubCreated"));
      resetForm();
      refresh();
    } catch (requestError) {
      setError(requestError.message || t("adminHubSaveError"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="detail-view admin-page-explicit">
      <div className="consumer-screen-header admin-header-block"><div><span className="eyebrow">{t("adminHubEyebrow")}</span><h1>{t("adminHubTitle")}</h1></div></div>
      <section className="admin-panel admin-hub-editor">
        <div className="admin-panel-header"><h2>{editingId ? t("adminHubEdit") : t("adminHubCreate")}</h2>{editingId ? <button className="btn btn-sm btn-outline-secondary" type="button" onClick={resetForm}>{t("adminHubCancelEdit")}</button> : null}</div>
        <form onSubmit={saveHub} className="admin-form-grid">
          <label>{t("adminHubName")}<input className="form-control" name="name" value={form.name} onChange={setField} required maxLength={160} /></label>
          <label>{t("adminHubAddress")}<input className="form-control" name="address" value={form.address} onChange={setField} required maxLength={500} /></label>
          <label>{t("adminHubPincode")}<input className="form-control" name="pincode" inputMode="numeric" pattern="\d{6}" value={form.pincode} onChange={setField} required maxLength={6} /></label>
          <label>{t("adminHubRadius")}<input className="form-control" name="service_radius_km" type="number" min="0.01" step="0.01" value={form.service_radius_km} onChange={setField} required /></label>
          <label>{t("adminHubStatus")}<select className="form-select" name="status" value={form.status} onChange={setField}><option value="ACTIVE">{t("adminHubActive")}</option><option value="INACTIVE">{t("adminHubInactive")}</option></select></label>
          <div className="admin-location-tools">
            <button type="button" className="btn btn-outline-primary" onClick={requestBrowserLocation}>{t("adminHubUseBrowserLocation")}</button>
            <span>{location ? t("adminHubLocationSelected") : t("adminHubLocationMissing")}</span>
          </div>
          <AdminHubLocationPicker location={location} onChange={setLocation} />
          <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? t("adminHubSaving") : editingId ? t("adminHubSave") : t("adminHubCreate")}</button>
        </form>
      </section>
      {error ? <div className="error" role="alert">{error}</div> : null}
      {notice ? <div className="success-message" role="status">{notice}</div> : null}
      {loading ? <div className="loading">{t("adminHubLoading")}</div> : null}
      {!loading && !hubs.length ? <div className="empty"><h2>{t("adminHubEmptyTitle")}</h2><p>{t("adminHubEmptyText")}</p></div> : null}
      <div className="admin-section-grid">
        {hubs.map((hub) => (
          <section className="admin-panel" key={hub.id}>
            <div className="admin-panel-header"><h2>{hub.name}</h2><span className="admin-badge admin-badge-status">{hub.status}</span></div>
            <p>{hub.address} · {hub.pincode}</p>
            <p>{t("adminHubRadiusLabel")} {hub.service_radius_km} km</p>
            <button type="button" className="btn btn-sm btn-outline-primary" onClick={() => startEdit(hub)}>{t("adminHubEdit")}</button>
            <h3>{t("adminHubStock")}</h3>
            {hub.stock.length ? <ul>{hub.stock.map((stock) => <li key={stock.listing_id}>{stock.crop_name}: {stock.quantity} {stock.unit}</li>)}</ul> : <p>{t("adminHubNoStock")}</p>}
            <h3>{t("adminHubRecentDeliveries")}</h3>
            {hub.recent_deliveries.length ? <ul>{hub.recent_deliveries.map((delivery) => <li key={delivery.id}>{delivery.crop_name} — {delivery.farmer_name}, {delivery.quantity}, {delivery.status}</li>)}</ul> : <p>{t("adminHubNoDeliveries")}</p>}
          </section>
        ))}
      </div>
    </section>
  );
}
