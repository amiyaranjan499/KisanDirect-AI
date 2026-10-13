import { useCallback, useEffect, useState } from "react";
import { useI18n } from "../../i18n";
import { listAdminRiders, updateAdminRiderApproval } from "../../services/adminApi";

const nextAction = {
  PENDING_APPROVAL: ["APPROVED", "adminRidersApprove"],
  APPROVED: ["SUSPENDED", "adminRidersSuspend"],
  SUSPENDED: ["APPROVED", "adminRidersReinstate"],
};

export default function AdminRidersPage() {
  const { t } = useI18n();
  const [riders, setRiders] = useState([]);
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const refresh = useCallback(() => {
    setLoading(true);
    listAdminRiders()
      .then((rows) => setRiders(Array.isArray(rows) ? rows : []))
      .catch((requestError) => setError(requestError.message || t("adminRidersLoadError")))
      .finally(() => setLoading(false));
  }, [t]);

  useEffect(() => refresh(), [refresh]);

  async function updateRider(rider, status) {
    setSavingId(rider.id);
    setError("");
    setNotice("");
    try {
      await updateAdminRiderApproval(rider.id, { approval_status: status, reason });
      setNotice(`${rider.display_name}: ${status.toLowerCase().replaceAll("_", " ")}.`);
      setReason("");
      refresh();
    } catch (requestError) {
      setError(requestError.message || t("adminRidersUpdateError"));
    } finally {
      setSavingId("");
    }
  }

  return (
    <section className="detail-view admin-page-explicit">
      <div className="consumer-screen-header admin-header-block">
        <div><span className="eyebrow">{t("adminRidersEyebrow")}</span><h1>{t("adminRidersTitle")}</h1></div>
      </div>
      <div className="admin-panel admin-action-panel">
        <label htmlFor="rider-action-reason">{t("adminRidersAuditReason")}</label>
        <input id="rider-action-reason" className="form-control" value={reason} onChange={(event) => setReason(event.target.value)} maxLength={1000} />
      </div>
      {error ? <div className="error" role="alert">{error}</div> : null}
      {notice ? <div className="success-message" role="status">{notice}</div> : null}
      {loading ? <div className="loading">{t("adminRidersLoading")}</div> : null}
      {!loading && !riders.length ? <div className="empty"><h2>{t("adminRidersEmptyTitle")}</h2><p>{t("adminRidersEmptyText")}</p></div> : null}
      {!loading && riders.length ? (
        <div className="admin-table-wrap admin-table-large">
          <table>
            <thead><tr><th>{t("adminRidersName")}</th><th>{t("adminRidersApproval")}</th><th>{t("adminRidersAvailability")}</th><th>{t("adminRidersActiveShipments")}</th><th>{t("adminRidersCompleted")}</th><th>{t("adminRidersAction")}</th></tr></thead>
            <tbody>
              {riders.map((rider) => {
                const action = nextAction[rider.approval_status];
                return (
                  <tr key={rider.id}>
                    <td><strong>{rider.display_name}</strong><small className="admin-table-subtext">{rider.email}</small></td>
                    <td><span className="admin-badge admin-badge-status">{rider.approval_status.replaceAll("_", " ")}</span></td>
                    <td>{rider.availability}</td>
                    <td>{rider.active_shipment_count}</td>
                    <td>{rider.completed_delivery_count}</td>
                    <td>{action ? <button type="button" className="btn btn-sm btn-outline-primary" disabled={savingId === rider.id} onClick={() => updateRider(rider, action[0])}>{savingId === rider.id ? t("adminRidersSaving") : t(action[1])}</button> : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}
