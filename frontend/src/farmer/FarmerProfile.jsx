import { useEffect, useState } from "react";
import { getFarmerProfile, updateFarmerProfile } from "../services/api";
import { states } from "../i18n/stateLanguages";
import { useI18n } from "../i18n";

const emptyForm = { name: "", phone: "", address: "", village: "", post_office: "", city: "", district: "", state: "", pin_code: "", address_line: "", latitude: "", longitude: "" };

function profileToForm(profile) {
  return {
    name: profile.name || "",
    phone: profile.phone || "",
    address: profile.address || "",
    village: profile.village || "",
    post_office: profile.post_office || "",
    city: profile.city || "",
    district: profile.district || "",
    state: profile.state || "",
    pin_code: profile.pin_code || "",
    address_line: profile.address_line || "",
    latitude: profile.location?.latitude?.toString() || "",
    longitude: profile.location?.longitude?.toString() || "",
  };
}

function formToPayload(form) {
  const payload = { name: form.name.trim(), phone: form.phone.trim() || null, address: form.address.trim() || null, village: form.village.trim() || null, post_office: form.post_office.trim() || null, city: form.city.trim() || null, district: form.district.trim() || null, state: form.state || null, pin_code: form.pin_code.trim() || null, address_line: form.address_line.trim() || null };
  payload.location = form.latitude.trim() || form.longitude.trim()
    ? { latitude: Number(form.latitude), longitude: Number(form.longitude) }
    : null;
  return payload;
}

function validateForm(form, t = (key) => key) {
  const errors = {};
  if (!form.name.trim()) errors.name = "Name is required.";
  if (form.pin_code.trim() && !/^\d{6}$/.test(form.pin_code.trim())) errors.pin_code = t("enterValidPinCode") || "Enter a valid 6-digit PIN code.";
  const hasLatitude = form.latitude.trim() !== "";
  const hasLongitude = form.longitude.trim() !== "";
  if (hasLatitude !== hasLongitude) {
    errors.location = "Enter both latitude and longitude, or leave both blank.";
  } else if (hasLatitude && hasLongitude) {
    const latitude = Number(form.latitude);
    const longitude = Number(form.longitude);
    if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) errors.location = "Latitude must be between -90 and 90.";
    else if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) errors.location = "Longitude must be between -180 and 180.";
  }
  return errors;
}

export default function FarmerProfile({ onBack, onDashboard }) {
  const { t } = useI18n();
  const [profile, setProfile] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [errors, setErrors] = useState({});
  const [apiError, setApiError] = useState("");
  const [success, setSuccess] = useState("");
  const [pinLookupStatus, setPinLookupStatus] = useState({ type: "idle", message: "" });
  const [postOfficeOptions, setPostOfficeOptions] = useState([]);
  const [locationStatus, setLocationStatus] = useState({ type: "idle", message: "" });

  useEffect(() => {
    let active = true;
    getFarmerProfile()
      .then((nextProfile) => {
        if (!active) return;
        setProfile(nextProfile);
        setForm(profileToForm(nextProfile));
      })
      .catch((error) => {
        if (active) setApiError(error.message || "Unable to load your farmer profile.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, []);

  const updateField = (field) => (event) => {
    setForm((previous) => ({ ...previous, [field]: event.target.value }));
    setErrors((previous) => ({ ...previous, [field]: "", location: "" }));
    setApiError("");
    setSuccess("");
  };

  const beginEditing = () => {
    setErrors({});
    setApiError("");
    setSuccess("");
    setEditing(true);
  };

  const cancelEditing = () => {
    setForm(profile ? profileToForm(profile) : emptyForm);
    setErrors({});
    setApiError("");
    setSuccess("");
    setEditing(false);
  };

  const lookupPinLocation = async (pinCode) => {
    const normalized = pinCode.trim();
    if (!/^\d{6}$/.test(normalized)) {
      setPinLookupStatus({ type: "error", message: t("enterValidPinCode") || "Enter a valid 6-digit PIN code." });
      return;
    }

    setPinLookupStatus({ type: "loading", message: t("findingLocation") || "Finding location..." });
    try {
      const response = await fetch(`https://api.postalpincode.in/pincode/${normalized}`);
      const payload = await response.json();
      const result = Array.isArray(payload) ? payload[0] : null;
      const offices = Array.isArray(result?.PostOffice) ? result.PostOffice : [];
      if (!result || result.Status !== "Success" || offices.length === 0) {
        setPinLookupStatus({ type: "error", message: t("locationDetailsNotFound") || "Location details could not be found. Please check the PIN code." });
        setPostOfficeOptions([]);
        return;
      }

      const parsedOffices = offices.map((office) => ({
        name: office.Name || "",
        district: office.District || "",
        city: office.Block || office.City || office.District || "",
        state: office.State || "",
      })).filter((office) => office.name || office.district || office.city || office.state);

      setPostOfficeOptions(parsedOffices);

      setForm((previous) => ({
        ...previous,
        state: previous.state || parsedOffices[0]?.state || previous.state,
        district: previous.district || parsedOffices[0]?.district || previous.district,
        city: previous.city || parsedOffices[0]?.city || previous.city,
        post_office: previous.post_office || parsedOffices[0]?.name || previous.post_office,
      }));
      setPinLookupStatus({ type: "success", message: t("locationDetailsFound") || "Location details found." });
    } catch (error) {
      setPinLookupStatus({ type: "error", message: t("locationDetailsNotFound") || "Location details could not be found. Please check the PIN code." });
      setPostOfficeOptions([]);
    }
  };

  const handlePinCodeChange = (event) => {
    const value = event.target.value.replace(/\D/g, "").slice(0, 6);
    setForm((previous) => ({ ...previous, pin_code: value }));
    setErrors((previous) => ({ ...previous, pin_code: "" }));
    setApiError("");
    setSuccess("");

    if (!value) {
      setPinLookupStatus({ type: "idle", message: "" });
      setPostOfficeOptions([]);
      return;
    }

    if (value.length < 6) {
      setPinLookupStatus({ type: "error", message: t("enterValidPinCode") || "Enter a valid 6-digit PIN code." });
      return;
    }

    lookupPinLocation(value);
  };

  const handleCurrentLocation = () => {
    if (!navigator.geolocation) {
      setLocationStatus({ type: "error", message: t("locationPermissionDenied") || "Location permission was not granted. You can continue using your postal address." });
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setForm((previous) => ({
          ...previous,
          latitude: String(position.coords.latitude),
          longitude: String(position.coords.longitude),
        }));
        setErrors((previous) => ({ ...previous, location: "" }));
        setLocationStatus({ type: "success", message: t("locationCaptured") || "📍 Location captured successfully." });
      },
      () => {
        setLocationStatus({ type: "error", message: t("locationPermissionDenied") || "Location permission was not granted. You can continue using your postal address." });
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  };

  const saveProfile = async (event) => {
    event.preventDefault();
    const nextErrors = validateForm(form, t);
    setErrors(nextErrors);
    setApiError("");
    setSuccess("");
    if (Object.keys(nextErrors).length) return;
    try {
      setSaving(true);
      const nextProfile = await updateFarmerProfile(formToPayload(form));
      setProfile(nextProfile);
      setForm(profileToForm(nextProfile));
      setEditing(false);
      setSuccess("Profile updated successfully.");
    } catch (error) {
      setApiError(error.message || "Unable to update your farmer profile.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <section className="detail-view"><button className="back-button" onClick={onBack}>← {t("back")}</button><div className="loading">{t("loading")}</div></section>;

  return <section className="detail-view profile-page farmer-profile-page">
    <div className="profile-heading">
      <div><button className="back-button" onClick={onBack}>← {t("back")}</button><span className="eyebrow">{t("farmerProfile")}</span><h1>{t("farmIdentity")}</h1><p>Keep the details consumers see about your farm clear and easy to trust.</p></div>
      <div className="profile-actions"><button className="secondary-button" onClick={onDashboard}>{t("farmerDashboard")}</button>{!editing && profile && <button className="primary-button" onClick={beginEditing}>{t("edit")}</button>}</div>
    </div>
    {apiError && <div className="error">{apiError}</div>}
    {success && <div className="success">{success}</div>}
    {!profile && !apiError ? <div className="empty"><h2>Profile not found</h2><p>Create your farmer profile to appear in the marketplace.</p><button className="primary-button" onClick={() => setEditing(true)}>Create profile</button></div> : null}
    {profile && !editing ? <div className="profile-summary simplified-profile"><div className="profile-identity"><span className="profile-initial">{profile.name.slice(0, 1).toUpperCase()}</span><div><span className="eyebrow">Registered farmer</span><h2>{profile.name}</h2><p>{profile.address || "No farm address provided."}</p></div></div><div className="profile-badges"><span>{profile.state || "State not provided"}</span><span>{profile.phone || "Phone not provided"}</span><span>{profile.location ? "Location ready" : "Location pending"}</span></div><dl className="profile-details"><div><dt>Farm state</dt><dd>{profile.state || "Not provided"}</dd></div><div><dt>Phone</dt><dd>{profile.phone || "Not provided"}</dd></div><div><dt>Farm location</dt><dd>{profile.location ? "Location captured" : "Not provided"}</dd></div><div><dt>Village / city</dt><dd>{profile.village || profile.city || "Not provided"}</dd></div><div><dt>Postal code</dt><dd>{profile.pin_code || "Not provided"}</dd></div><div><dt>Profile updated</dt><dd>{new Date(profile.updated_at).toLocaleDateString()}</dd></div></dl></div> : null}
    {editing ? <form className="profile-form" onSubmit={saveProfile} noValidate><div className="profile-form-grid"><label>{t("farmName") || "Farm or farmer name"}<input value={form.name} onChange={updateField("name")} maxLength={160} aria-invalid={Boolean(errors.name)} />{errors.name && <span className="field-error">{errors.name}</span>}</label><label>{t("phone") || "Phone"}<input value={form.phone} onChange={updateField("phone")} maxLength={32} /></label><label>{t("atVillage") || "At / Village"}<input value={form.village} onChange={updateField("village")} /></label>{postOfficeOptions.length > 1 ? <label>{t("postOffice") || "Post Office"}<select value={form.post_office} onChange={updateField("post_office")}><option value="">{t("selectPostOffice") || "Select a post office"}</option>{postOfficeOptions.map((office) => <option key={`${office.name}-${office.district}`} value={office.name}>{office.name}</option>)}</select></label> : <label>{t("postOffice") || "Post Office"}<input value={form.post_office} onChange={updateField("post_office")} /></label>}<label>{t("cityTown") || "City / Town"}<input value={form.city} onChange={updateField("city")} /></label><label>{t("district") || "District"}<input value={form.district} onChange={updateField("district")} /></label><label>{t("state") || "State"}<select value={form.state} onChange={updateField("state")}><option value="">{t("selectState") || "Select a state"}</option>{states.map((state) => <option key={state} value={state}>{state}</option>)}</select></label><label>{t("pinCode") || "PIN Code"}<input value={form.pin_code} onChange={handlePinCodeChange} inputMode="numeric" maxLength={6} aria-invalid={Boolean(errors.pin_code)} />{errors.pin_code && <span className="field-error">{errors.pin_code}</span>}{pinLookupStatus.message && <span className={`pin-status ${pinLookupStatus.type}`}>{pinLookupStatus.message}</span>}</label><label className="profile-wide">{t("addressLandmark") || "Address / Landmark"}<input value={form.address_line} onChange={updateField("address_line")} /></label><label className="profile-wide">{t("legacyAddress") || "Legacy address"}<textarea value={form.address} onChange={updateField("address")} rows={3} /></label><div className="profile-wide location-capture-panel"><div className="location-header-row"><span className="location-label">{t("farmLocation") || "Farm Location"}</span>{form.latitude && form.longitude && <button type="button" className="secondary-button small-button" onClick={handleCurrentLocation}>{t("updateCurrentLocation") || "Update Current Location"}</button>}</div><button type="button" className="location-capture-button" onClick={handleCurrentLocation}>{form.latitude && form.longitude ? (t("updateCurrentLocation") || "Update Current Location") : (t("useCurrentLocation") || "📍 Use Current Location")}</button>{locationStatus.message && <div className={locationStatus.type === "success" ? "location-success" : "field-error"}>{locationStatus.message}</div>}</div></div>{errors.location && <div className="field-error">{errors.location}</div>}<div className="profile-form-actions"><button type="button" className="secondary-button" onClick={cancelEditing} disabled={saving}>{t("cancel")}</button><button type="submit" className="primary-button" disabled={saving}>{saving ? t("loading") : t("save")}</button></div></form> : null}
  </section>;
}