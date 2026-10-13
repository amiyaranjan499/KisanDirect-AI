import { useCallback, useEffect, useMemo, useState } from "react";
import { useI18n } from "../../i18n";
import {
  cancelAdminShipment,
  listAdminRiders,
  listAdminShipments,
  reassignAdminShipment,
  resetAdminDeliveryOtp,
} from "../../services/adminApi";

export default function AdminDeliveryPage() {
  const { t } = useI18n();
  const [shipments, setShipments] = useState([]);
  const [riders, setRiders] = useState([]);
  const [search, setSearch] = useState("");
  const [riderSelections, setRiderSelections] = useState({});
  const [reasons, setReasons] = useState({});
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const refresh = useCallback(() => {
    setLoading(true);
    Promise.all([listAdminShipments(), listAdminRiders()])
      .then(([shipmentRows, riderRows]) => {
        setShipments(Array.isArray(shipmentRows) ? shipmentRows : []);
        setRiders(Array.isArray(riderRows) ? riderRows : []);
      })
      .catch((requestError) => setError(requestError.message || t("adminDeliveryLoadError")))
      .finally(() => setLoading(false));
  }, [t]);

  useEffect(() => refresh(), [refresh]);

  const eligibleRiders = useMemo(
    () => riders.filter((rider) => rider.approval_status === "APPROVED" && rider.availability === "AVAILABLE"),
    [riders],
  );
  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    return shipments.filter((shipment) =>
      !query || `${shipment.id} ${shipment.order_id} ${shipment.hub_name} ${shipment.rider_name || ""} ${shipment.status}`.toLowerCase().includes(query),
    );
  }, [shipments, search]);

  function getReason(shipmentId) {
    return reasons[shipmentId] || "";
  }

  async function execute(shipment, action) {
    setSavingId(shipment.id);
    setError("");
    setNotice("");
    try {
      const reason = getReason(shipment.id).trim();
      if (action === "reassign") {
        if (!reason || !riderSelections[shipment.id]) throw new Error(t("adminDeliverySelectRiderReason"));
        await reassignAdminShipment(shipment.id, {
          rider_user_id: riderSelections[shipment.id],
          reason,
        });
      } else if (action === "cancel") {
        if (!reason) throw new Error(t("adminDeliveryCancelReason"));
        await cancelAdminShipment(shipment.id, { reason });
      } else {
        if (!reason) throw new Error(t("adminDeliveryResetReason"));
        await resetAdminDeliveryOtp(shipment.id, { reason });
      }
      setNotice(action === "reassign" ? t("adminDeliveryRiderReassigned") : action === "cancel" ? t("adminDeliveryCancelled") : t("adminDeliveryOtpReset"));
      setReasons((current) => ({ ...current, [shipment.id]: "" }));
      refresh();
    } catch (requestError) {
      setError(requestError.message || t("adminDeliveryError"));
    } finally {
      setSavingId("");
    }
  }

  return (
    <section className="detail-view admin-page-explicit">
      <div className="consumer-screen-header admin-header-block">
        <div><span className="eyebrow">{t("adminDeliveryEyebrow")}</span><h1>{t("adminDeliveryTitle")}</h1></div>
      </div>
      <div className="admin-toolbar">
        <div className="admin-search-box"><i className="bi bi-search" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t("adminDeliverySearch")} /></div>
      </div>
      {error ? <div className="error" role="alert">{error}</div> : null}
      {notice ? <div className="success-message" role="status">{notice}</div> : null}
      {loading ? <div className="loading">{t("adminDeliveryLoading")}</div> : null}
      {!loading && !filteredRows.length ? <div className="empty"><h2>{shipments.length ? t("adminDeliveryNoMatches") : t("adminDeliveryEmptyTitle")}</h2><p>{t("adminDeliveryEmptyText")}</p></div> : null}
      {!loading && filteredRows.length ? (
        <div className="admin-section-grid admin-shipment-grid">
          {filteredRows.map((shipment) => (
            <article className="admin-panel admin-shipment-card" key={shipment.id}>
              <div className="admin-panel-header">
                <div><h2>{t("adminDeliveryShipment")} {String(shipment.id).slice(0, 8)}</h2><small>{t("adminDeliveryOrder")} {String(shipment.order_id).slice(0, 8)}</small></div>
                <span className="admin-badge admin-badge-status">{shipment.status.replaceAll("_", " ")}</span>
              </div>
              <dl className="admin-shipment-details">
                <dt>{t("adminDeliveryRider")}</dt><dd>{shipment.rider_name || t("adminDeliveryUnassigned")}</dd>
                <dt>{t("adminDeliveryHub")}</dt><dd>{shipment.hub_name}</dd>
                <dt>{t("adminDeliveryEta")}</dt><dd>{shipment.eta_start ? new Date(shipment.eta_start).toLocaleString() : t("adminDeliveryNotSet")} – {shipment.eta_end ? new Date(shipment.eta_end).toLocaleString() : t("adminDeliveryNotSet")}</dd>
                <dt>{t("adminDeliveryPickup")}</dt><dd>{shipment.pickup_address}</dd>
                <dt>{t("adminDeliveryDropoff")}</dt><dd>{shipment.delivery_address}</dd>
              </dl>
              <label className="admin-action-reason">{t("adminDeliveryActionReason")}
                <input className="form-control" value={getReason(shipment.id)} maxLength={1000} onChange={(event) => setReasons((current) => ({ ...current, [shipment.id]: event.target.value }))} />
              </label>
              {shipment.status === "READY_FOR_PICKUP" || shipment.status === "RIDER_ASSIGNED" ? (
                <div className="admin-inline-action">
                  <select className="form-select" aria-label={t("adminDeliverySelectRider")} value={riderSelections[shipment.id] || ""} onChange={(event) => setRiderSelections((current) => ({ ...current, [shipment.id]: event.target.value }))}>
                    <option value="">{t("adminDeliverySelectRider")}</option>
                    {eligibleRiders.filter((rider) => rider.user_id !== riders.find((candidate) => candidate.id === shipment.rider_id)?.user_id).map((rider) => <option key={rider.id} value={rider.user_id}>{rider.display_name}</option>)}
                  </select>
                  <button type="button" className="btn btn-sm btn-outline-primary" disabled={savingId === shipment.id} onClick={() => execute(shipment, "reassign")}>{t("adminDeliveryReassign")}</button>
                </div>
              ) : null}
              <div className="admin-inline-action">
                {shipment.can_cancel ? <button type="button" className="btn btn-sm btn-outline-danger" disabled={savingId === shipment.id} onClick={() => execute(shipment, "cancel")}>{t("adminDeliveryCancel")}</button> : null}
                {shipment.otp_locked ? <button type="button" className="btn btn-sm btn-outline-warning" disabled={savingId === shipment.id} onClick={() => execute(shipment, "otp")}>{t("adminDeliveryResetOtp")}</button> : null}
              </div>
            </article>
          ))}
        </div>
      ) : null}
    </section>
  );
}
