import { useEffect, useState } from "react";
import {
  getHubOperationsOverview,
  listHubStaffHubs,
  markHubShipmentReady,
  receiveHubStockDelivery,
  startHubOrderPacking,
} from "../services/api";
import { useI18n } from "../i18n";

const formatMoney = (value) =>
  `₹${Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

function formatItems(items = []) {
  return items.map((item) => `${item.crop_name} · ${item.quantity} ${item.unit}`).join(", ");
}

export default function HubStaffOperationsPage() {
  const { t } = useI18n();
  const [hubs, setHubs] = useState([]);
  const [hubId, setHubId] = useState("");
  const [overview, setOverview] = useState(null);
  const [loadingHubs, setLoadingHubs] = useState(true);
  const [loadingOverview, setLoadingOverview] = useState(false);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    listHubStaffHubs()
      .then((data) => {
        const assigned = Array.isArray(data) ? data : [];
        setHubs(assigned);
        setHubId(assigned[0]?.id || "");
      })
      .catch((requestError) => setError(requestError.message || t("hubOperations.staff.loadError")))
      .finally(() => setLoadingHubs(false));
  }, [t]);

  const loadOverview = async (selectedHubId = hubId) => {
    if (!selectedHubId) {
      setOverview(null);
      return;
    }
    try {
      setLoadingOverview(true);
      setError("");
      setOverview(await getHubOperationsOverview(selectedHubId));
    } catch (requestError) {
      setError(requestError.message || t("hubOperations.staff.loadError"));
      setOverview(null);
    } finally {
      setLoadingOverview(false);
    }
  };

  useEffect(() => {
    if (hubId) loadOverview(hubId);
  }, [hubId]);

  const perform = async (id, action) => {
    try {
      setBusyId(id);
      setError("");
      await action();
      await loadOverview();
    } catch (requestError) {
      setError(requestError.message || t("hubOperations.staff.actionError"));
    } finally {
      setBusyId("");
    }
  };

  if (loadingHubs) {
    return <section className="detail-view"><div className="loading">{t("hubOperations.staff.loading")}</div></section>;
  }

  return (
    <section className="detail-view farmer-orders-page">
      <div className="consumer-screen-header farmer-page-header">
        <div>
          <span className="eyebrow">{t("hubOperations.staff.eyebrow")}</span>
          <h1>{t("hubOperations.staff.title")}</h1>
          <p>{t("hubOperations.staff.description")}</p>
        </div>
      </div>

      {error && <div className="error" role="alert">{error}</div>}
      {!hubs.length ? (
        <div className="empty"><p>{t("hubOperations.staff.noHubs")}</p></div>
      ) : (
        <>
          <div className="mb-4">
            <label className="form-label" htmlFor="hub-staff-hub">{t("hubOperations.staff.selectHub")}</label>
            <select id="hub-staff-hub" className="form-select" value={hubId} onChange={(event) => setHubId(event.target.value)}>
              {hubs.map((hub) => <option value={hub.id} key={hub.id}>{hub.name} · {hub.address}</option>)}
            </select>
          </div>

          {loadingOverview ? (
            <div className="loading">{t("hubOperations.staff.loading")}</div>
          ) : overview ? (
            <>
              <section className="mb-5">
                <div className="consumer-screen-header">
                  <span className="eyebrow">{t("hubOperations.staff.inventoryEyebrow")}</span>
                  <h2>{t("hubOperations.staff.incomingTitle")}</h2>
                </div>
                <div className="farmer-table-wrap">
                  <table className="farmer-order-table">
                    <thead><tr>
                      <th>{t("hubOperations.staff.farmer")}</th>
                      <th>{t("hubOperations.staff.crop")}</th>
                      <th>{t("hubOperations.staff.quantity")}</th>
                      <th>{t("hubOperations.staff.action")}</th>
                    </tr></thead>
                    <tbody>
                      {overview.incoming_deliveries.map((delivery) => (
                        <tr key={delivery.id}>
                          <td>{delivery.farmer_name}</td>
                          <td>{delivery.crop_name}</td>
                          <td>{delivery.quantity} {delivery.unit}</td>
                          <td>
                            <button className="farmer-small-button solid" type="button" disabled={busyId === delivery.id} onClick={() => perform(delivery.id, () => receiveHubStockDelivery(hubId, delivery.id))}>
                              {busyId === delivery.id ? t("hubOperations.staff.saving") : t("hubOperations.staff.receive")}
                            </button>
                          </td>
                        </tr>
                      ))}
                      {!overview.incoming_deliveries.length && <tr><td colSpan="4">{t("hubOperations.staff.noIncoming")}</td></tr>}
                    </tbody>
                  </table>
                </div>
              </section>

              <section className="mb-5">
                <div className="consumer-screen-header">
                  <span className="eyebrow">{t("hubOperations.staff.packingEyebrow")}</span>
                  <h2>{t("hubOperations.staff.ordersToPack")}</h2>
                </div>
                <div className="farmer-table-wrap">
                  <table className="farmer-order-table">
                    <thead><tr>
                      <th>{t("hubOperations.staff.order")}</th>
                      <th>{t("hubOperations.staff.items")}</th>
                      <th>{t("hubOperations.staff.amount")}</th>
                      <th>{t("hubOperations.staff.action")}</th>
                    </tr></thead>
                    <tbody>
                      {overview.orders_to_pack.map((order) => (
                        <tr key={order.id}>
                          <td>{order.consumer_name} · {String(order.id).slice(0, 8).toUpperCase()}</td>
                          <td>{formatItems(order.items)}</td>
                          <td>{formatMoney(order.total_amount)}</td>
                          <td>
                            <button className="farmer-small-button secondary" type="button" disabled={busyId === order.id} onClick={() => perform(order.id, () => startHubOrderPacking(hubId, order.id))}>
                              {busyId === order.id ? t("hubOperations.staff.saving") : t("hubOperations.staff.startPacking")}
                            </button>
                          </td>
                        </tr>
                      ))}
                      {!overview.orders_to_pack.length && <tr><td colSpan="4">{t("hubOperations.staff.noOrders")}</td></tr>}
                    </tbody>
                  </table>
                </div>
              </section>

              <section>
                <div className="consumer-screen-header">
                  <span className="eyebrow">{t("hubOperations.staff.packingEyebrow")}</span>
                  <h2>{t("hubOperations.staff.packingShipments")}</h2>
                </div>
                <div className="farmer-table-wrap">
                  <table className="farmer-order-table">
                    <thead><tr>
                      <th>{t("hubOperations.staff.order")}</th>
                      <th>{t("hubOperations.staff.items")}</th>
                      <th>{t("hubOperations.staff.action")}</th>
                    </tr></thead>
                    <tbody>
                      {overview.packing_shipments.map((shipment) => (
                        <tr key={shipment.id}>
                          <td>{shipment.consumer_name} · {String(shipment.order_id).slice(0, 8).toUpperCase()}</td>
                          <td>{formatItems(shipment.items)}</td>
                          <td>
                            <button className="farmer-small-button solid" type="button" disabled={busyId === shipment.id} onClick={() => perform(shipment.id, () => markHubShipmentReady(hubId, shipment.id))}>
                              {busyId === shipment.id ? t("hubOperations.staff.saving") : t("hubOperations.staff.markReady")}
                            </button>
                          </td>
                        </tr>
                      ))}
                      {!overview.packing_shipments.length && <tr><td colSpan="3">{t("hubOperations.staff.noPackingShipments")}</td></tr>}
                    </tbody>
                  </table>
                </div>
              </section>
            </>
          ) : (
            <div className="empty"><p>{t("hubOperations.staff.emptyOverview")}</p></div>
          )}
        </>
      )}
    </section>
  );
}
