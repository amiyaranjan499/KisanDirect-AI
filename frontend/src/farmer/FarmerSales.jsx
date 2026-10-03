import { useEffect, useMemo, useState } from "react";
import { getFarmerDashboardAnalytics } from "../services/api";

const formatMoney = (value) => `₹${Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

export default function FarmerSales({ onBack }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    getFarmerDashboardAnalytics().then(setData).catch((requestError) => setError(requestError.message || "Unable to load sales."));
  }, []);

  const summary = useMemo(() => {
    const statusTotals = Object.values(data?.orders_by_status || {});
    const totalOrders = statusTotals.reduce((sum, value) => sum + Number(value || 0), 0);
    const totalSales = Number(data?.total_sales || 0);
    const avgOrderValue = totalOrders ? totalSales / totalOrders : 0;
    return { totalSales, totalOrders, avgOrderValue, cropSales: Object.entries(data?.crop_wise_sales || {}) };
  }, [data]);

  const topCrops = [...summary.cropSales].sort(([, left], [, right]) => Number(right) - Number(left)).slice(0, 3);

  return (
    <section className="detail-view sales-page farmer-sales-page">
      <div className="consumer-screen-header farmer-page-header">
        <div>
          <span className="eyebrow">Farmer workspace</span>
          <h1>Sales & Earnings</h1>
        </div>
      </div>

      {error ? (
        <div className="error">{error}</div>
      ) : !data ? (
        <div className="loading">Loading sales...</div>
      ) : (
        <>
          <div className="farmer-stat-grid">
            <div className="farmer-stat-card">
              <span>Total Earnings</span>
              <strong>{formatMoney(summary.totalSales)}</strong>
            </div>
            <div className="farmer-stat-card">
              <span>This Month</span>
              <strong>{formatMoney(summary.totalSales)}</strong>
            </div>
            <div className="farmer-stat-card">
              <span>Total Orders</span>
              <strong>{summary.totalOrders}</strong>
            </div>
            <div className="farmer-stat-card">
              <span>Avg. Order Value</span>
              <strong>{formatMoney(summary.avgOrderValue)}</strong>
            </div>
          </div>

          <div className="farmer-segment-grid">
            <div className="farmer-panel">
              <h3>Top Selling Crops</h3>
              {topCrops.length ? (
                <div className="farmer-list-stack">
                  {topCrops.map(([crop, value], index) => (
                    <div className="farmer-mini-row" key={`${crop}-${index}`}>
                      <span>{index + 1}. {crop}</span>
                      <strong>{formatMoney(value)}</strong>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="muted">No crop sales recorded yet.</p>
              )}
            </div>

            <div className="farmer-panel">
              <h3>Sales History</h3>
              {data.recent_orders?.length ? (
                <div className="farmer-list-stack">
                  {data.recent_orders.map((order) => (
                    <div className="farmer-mini-row" key={order.id}>
                      <span>{new Date(order.created_at).toLocaleDateString()}</span>
                      <strong>{formatMoney(order.total_amount)}</strong>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="muted">No recent sales activity yet.</p>
              )}
            </div>
          </div>
        </>
      )}
    </section>
  );
}

