import { useEffect, useState } from "react";
import { useI18n } from "../i18n";
import { getRiderHistory } from "../services/api";

export default function RiderHistoryPage() {
  const { t } = useI18n();
  const [history, setHistory] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    getRiderHistory()
      .then(setHistory)
      .catch((requestError) => setError(requestError.message || t("rider.loadError")))
      .finally(() => setLoading(false));
  }, [t]);

  if (loading) {
    return <section className="detail-view"><div className="loading">{t("rider.historyLoading")}</div></section>;
  }

  return (
    <section className="detail-view">
      <header className="consumer-screen-header">
        <span className="eyebrow">{t("rider.eyebrow")}</span>
        <h1>{t("rider.historyTitle")}</h1>
        <p>{t("rider.historyDescription")}</p>
      </header>
      {error && <div className="error" role="alert">{error}</div>}
      {history && (
        <>
          <section className="dashboard-stat mb-4">
            <span>{t("rider.deliveryCount")}</span>
            <strong>{history.delivery_count}</strong>
            <p>{t("rider.earningsNotConfigured")}</p>
          </section>
          {history.completed_deliveries.length ? (
            <div className="listing-grid">
              {history.completed_deliveries.map((delivery) => (
                <article className="consumer-panel" key={delivery.id}>
                  <h2>{delivery.hub_name}</h2>
                  <p>{t("rider.orderReference")} #{delivery.order_id.slice(0, 8).toUpperCase()}</p>
                  <time dateTime={delivery.delivered_at}>{new Date(delivery.delivered_at).toLocaleString()}</time>
                </article>
              ))}
            </div>
          ) : (
            <div className="empty"><p>{t("rider.noHistory")}</p></div>
          )}
        </>
      )}
    </section>
  );
}
