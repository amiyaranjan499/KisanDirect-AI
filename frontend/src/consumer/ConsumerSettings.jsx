import { useEffect, useState } from "react";
import { getConsumerProfile, updateConsumerProfile } from "../services/api";

export default function ConsumerSettings({ onBack, onLogout }) {
	const [profile, setProfile] = useState(null);
	const [draft, setDraft] = useState({ name: "", phone: "", city: "", state: "" });
	const [message, setMessage] = useState("");
	const [error, setError] = useState("");
	useEffect(() => { getConsumerProfile().then((value) => { setProfile(value); setDraft({ name: value.name || "", phone: value.phone || "", city: value.city || "", state: value.state || "" }); }).catch((e) => setError(e.message)); }, []);
	const save = (event) => { event.preventDefault(); updateConsumerProfile(draft).then((value) => { setProfile(value); setMessage("Profile saved."); }).catch((e) => setError(e.message)); };
	return <section className="detail-view"><button className="back-button" onClick={onBack}>Back</button><h1>Settings</h1>{error && <div className="error">{error}</div>}{!profile ? <div className="loading">Loading...</div> : <form className="panel-block" onSubmit={save}>{Object.keys(draft).map((field) => <label key={field}>{field}<input value={draft[field]} onChange={(event) => setDraft({ ...draft, [field]: event.target.value })} /></label>)}<button type="submit">Save profile</button>{message && <div className="success">{message}</div>}<button type="button" onClick={onLogout}>Log out</button></form>}</section>;
}
