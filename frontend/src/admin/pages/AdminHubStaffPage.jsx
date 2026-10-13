import { useCallback, useEffect, useMemo, useState } from "react";
import { useI18n } from "../../i18n";
import {
  assignAdminHubStaff,
  createAdminHubStaff,
  listAdminHubStaff,
  listAdminHubs,
  unassignAdminHubStaff,
} from "../../services/adminApi";

export default function AdminHubStaffPage() {
  const { t } = useI18n();
  const [staff, setStaff] = useState([]);
  const [hubs, setHubs] = useState([]);
  const [email, setEmail] = useState("");
  const [initialPassword, setInitialPassword] = useState("");
  const [newHubId, setNewHubId] = useState("");
  const [assignments, setAssignments] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const refresh = useCallback(() => {
    setLoading(true);
    Promise.all([listAdminHubStaff(), listAdminHubs()])
      .then(([staffRows, hubRows]) => {
        setStaff(Array.isArray(staffRows) ? staffRows : []);
        setHubs(Array.isArray(hubRows) ? hubRows : []);
      })
      .catch((requestError) => setError(requestError.message || t("adminStaffLoadError")))
      .finally(() => setLoading(false));
  }, [t]);

  useEffect(() => refresh(), [refresh]);

  const groupedStaff = useMemo(() => {
    const grouped = new Map();
    staff.forEach((entry) => {
      if (!grouped.has(entry.user_id)) grouped.set(entry.user_id, { ...entry, assignments: [] });
      if (entry.hub_id) grouped.get(entry.user_id).assignments.push({ hub_id: entry.hub_id, hub_name: entry.hub_name });
    });
    return [...grouped.values()];
  }, [staff]);

  async function submitCreate(event) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setNotice("");
    try {
      await createAdminHubStaff({ email, initial_password: initialPassword, hub_id: newHubId });
      setEmail("");
      setInitialPassword("");
      setNewHubId("");
      setNotice(t("adminStaffCreated"));
      refresh();
    } catch (requestError) {
      setError(requestError.message || t("adminStaffCreateError"));
    } finally {
      setSaving(false);
    }
  }

  async function assign(userId) {
    const hubId = assignments[userId];
    if (!hubId) return;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      await assignAdminHubStaff({ user_id: userId, hub_id: hubId });
      setNotice(t("adminStaffAssigned"));
      refresh();
    } catch (requestError) {
      setError(requestError.message || t("adminStaffAssignError"));
    } finally {
      setSaving(false);
    }
  }

  async function unassign(userId, hubId) {
    setSaving(true);
    setError("");
    setNotice("");
    try {
      await unassignAdminHubStaff(userId, hubId);
      setNotice(t("adminStaffUnassigned"));
      refresh();
    } catch (requestError) {
      setError(requestError.message || t("adminStaffUnassignError"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="detail-view admin-page-explicit">
      <div className="consumer-screen-header admin-header-block"><div><span className="eyebrow">{t("adminStaffEyebrow")}</span><h1>{t("adminStaffTitle")}</h1></div></div>
      <section className="admin-panel">
        <div className="admin-panel-header"><h2>{t("adminStaffCreateTitle")}</h2></div>
        <form className="admin-form-grid" onSubmit={submitCreate}>
          <label>{t("adminStaffEmail")}<input className="form-control" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required maxLength={320} /></label>
          <label>{t("adminStaffInitialPassword")}<input className="form-control" type="password" value={initialPassword} onChange={(event) => setInitialPassword(event.target.value)} required minLength={12} maxLength={128} autoComplete="new-password" /></label>
          <label>{t("adminStaffHub")}<select className="form-select" value={newHubId} onChange={(event) => setNewHubId(event.target.value)} required><option value="">{t("adminStaffSelectHub")}</option>{hubs.map((hub) => <option key={hub.id} value={hub.id}>{hub.name}</option>)}</select></label>
          <button className="btn btn-primary" type="submit" disabled={saving || !hubs.length}>{saving ? t("adminStaffSaving") : t("adminStaffCreateAssign")}</button>
        </form>
      </section>
      {error ? <div className="error" role="alert">{error}</div> : null}
      {notice ? <div className="success-message" role="status">{notice}</div> : null}
      {loading ? <div className="loading">{t("adminStaffLoading")}</div> : null}
      {!loading && !groupedStaff.length ? <div className="empty"><h2>{t("adminStaffEmptyTitle")}</h2><p>{t("adminStaffEmptyText")}</p></div> : null}
      <div className="admin-section-grid">
        {groupedStaff.map((person) => {
          const assignedIds = new Set(person.assignments.map((assignment) => assignment.hub_id));
          const availableHubs = hubs.filter((hub) => !assignedIds.has(hub.id));
          return (
            <section className="admin-panel" key={person.user_id}>
              <div className="admin-panel-header"><h2>{person.display_name}</h2><span>{person.email}</span></div>
              {person.assignments.map((assignment) => (
                <div className="admin-list-item" key={assignment.hub_id}>
                  <span>{assignment.hub_name}</span>
                  <button className="btn btn-sm btn-outline-danger" type="button" disabled={saving} onClick={() => unassign(person.user_id, assignment.hub_id)}>{t("adminStaffUnassign")}</button>
                </div>
              ))}
              {availableHubs.length ? (
                <div className="admin-inline-action">
                  <select className="form-select" aria-label={`${t("adminStaffHub")} ${person.email}`} value={assignments[person.user_id] || ""} onChange={(event) => setAssignments((current) => ({ ...current, [person.user_id]: event.target.value }))}>
                    <option value="">{t("adminStaffSelectAnotherHub")}</option>{availableHubs.map((hub) => <option key={hub.id} value={hub.id}>{hub.name}</option>)}
                  </select>
                  <button className="btn btn-sm btn-outline-primary" type="button" disabled={saving || !assignments[person.user_id]} onClick={() => assign(person.user_id)}>{t("adminStaffAssign")}</button>
                </div>
              ) : null}
            </section>
          );
        })}
      </div>
    </section>
  );
}
