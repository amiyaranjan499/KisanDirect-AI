import { useEffect, useMemo, useState } from "react";
import { Link, useOutletContext } from "react-router-dom";
import { getRiderHistory } from "../services/api";
import { RiderBikeIcon } from "./RiderShell";

export default function RiderHistoryPage() {
  const context = useOutletContext() || {};
  const [history, setHistory] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");

  const loadHistory = async () => {
    try {
      setLoading(true);
      setError("");
      const data = await getRiderHistory();
      setHistory(data);
    } catch (err) {
      setError(err.message || "Failed to load delivery history.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadHistory();
  }, []);

  const deliveries = useMemo(() => {
    const list = history?.completed_deliveries || [];
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter((item) =>
      `${item.hub_name || ""} ${item.order_id || ""}`.toLowerCase().includes(q)
    );
  }, [history, search]);

  if (loading) {
    return (
      <div className="text-center py-5">
        <div className="spinner-border text-success" role="status">
          <span className="visually-hidden">Loading history...</span>
        </div>
        <p className="mt-2 text-muted small">Loading completed delivery trips...</p>
      </div>
    );
  }

  return (
    <div>
      {/* Page Header */}
      <div className="d-flex align-items-center justify-content-between mb-3 flex-wrap gap-2">
        <div>
          <h2 className="h4 fw-bold mb-1 d-flex align-items-center gap-2">
            <RiderBikeIcon size={26} /> Delivery Trip History
          </h2>
          <p className="text-muted small mb-0">
            Records of all fulfilled Kisan Hub farm-produce shipments delivered by you
          </p>
        </div>
        <Link to="/rider/dashboard" className="btn btn-outline-success btn-sm fw-semibold">
          <i className="bi bi-arrow-left me-1" /> Back to Live Console
        </Link>
      </div>

      {error && (
        <div className="alert alert-danger py-2 px-3 mb-3 d-flex align-items-center gap-2">
          <i className="bi bi-exclamation-triangle-fill" />
          <span>{error}</span>
        </div>
      )}

      {/* Summary KPI Card */}
      <div className="rider-metrics-grid mb-4">
        <div className="rider-metric-card">
          <div className="rider-metric-icon green">
            <i className="bi bi-check2-circle" />
          </div>
          <div className="rider-metric-info">
            <span>Total Delivered Trips</span>
            <strong>{history?.delivery_count || 0}</strong>
          </div>
        </div>

        <div className="rider-metric-card">
          <div className="rider-metric-icon blue">
            <i className="bi bi-shield-check" />
          </div>
          <div className="rider-metric-info">
            <span>Partner Status</span>
            <strong className="text-success" style={{ fontSize: "1rem" }}>
              Verified Courier
            </strong>
          </div>
        </div>

        <div className="rider-metric-card">
          <div className="rider-metric-icon amber">
            <i className="bi bi-wallet2" />
          </div>
          <div className="rider-metric-info">
            <span>Payout Telemetry</span>
            <strong style={{ fontSize: "0.95rem" }}>Per Hub Tariff</strong>
          </div>
        </div>
      </div>

      {/* Search Bar */}
      <div className="mb-3">
        <div className="input-group">
          <span className="input-group-text bg-white border-end-0">
            <i className="bi bi-search text-muted" />
          </span>
          <input
            type="text"
            className="form-control border-start-0"
            placeholder="Search by Order ID or Hub Name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button
              className="btn btn-outline-secondary"
              type="button"
              onClick={() => setSearch("")}
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Deliveries List */}
      {deliveries.length > 0 ? (
        <div className="d-flex flex-column gap-3">
          {deliveries.map((item) => (
            <div
              key={item.id}
              className="card bg-white p-3 border shadow-sm rounded-3"
            >
              <div className="d-flex align-items-center justify-content-between flex-wrap gap-2">
                <div>
                  <div className="fw-bold fs-6 text-success d-flex align-items-center gap-2">
                    <i className="bi bi-building" />
                    {item.hub_name || "Kisan Hub"}
                  </div>
                  <div className="text-muted small mt-1">
                    Order Reference: <strong>#{item.order_id?.slice(0, 8).toUpperCase()}</strong>
                  </div>
                </div>

                <div className="text-end">
                  <span className="badge bg-success-subtle text-success border border-success-subtle px-2 py-1 mb-1 d-inline-block">
                    <i className="bi bi-check-circle-fill me-1" /> Delivered
                  </span>
                  <div className="text-muted small">
                    {new Date(item.delivered_at).toLocaleDateString([], {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}{" "}
                    at{" "}
                    {new Date(item.delivered_at).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="card text-center p-5 bg-white border rounded-3">
          <div className="text-muted mb-3">
            <RiderBikeIcon size={48} />
          </div>
          <h3 className="h6 fw-bold">No Completed Deliveries Found</h3>
          <p className="text-muted small mb-3">
            {search
              ? "No trips matched your search filter."
              : "You have not completed any delivery trips yet. Accept available orders on the live console to start delivering fresh produce!"}
          </p>
          <Link to="/rider/dashboard" className="btn btn-success fw-semibold mx-auto px-4">
            Go to Live Console
          </Link>
        </div>
      )}
    </div>
  );
}
