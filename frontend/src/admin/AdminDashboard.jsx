import { useEffect, useState } from "react";
import { getAdminDashboardSummary, listAdminFarmers, listAdminConsumers, listAdminOrders } from "../services/adminApi";

export default function AdminDashboard() {
	const [data, setData] = useState(null); const [error, setError] = useState("");
	useEffect(() => { Promise.all([getAdminDashboardSummary(), listAdminFarmers(), listAdminConsumers(), listAdminOrders()]).then(([summary, farmers, consumers, orders]) => setData({ summary, farmers, consumers, orders })).catch((requestError) => setError(requestError.message)); }, []);
	if (error) return <section className="detail-view"><div className="error">{error}</div></section>;
	if (!data) return <section className="detail-view"><div className="loading">Loading dashboard...</div></section>;
	return <section className="detail-view admin-dashboard"><div className="farmer-hero"><span className="eyebrow">Admin dashboard</span><h1>Platform overview</h1><p>Live operational data for the marketplace.</p></div><div className="detail-stats"><div><b>{data.summary.total_users}</b><span>Total users</span></div><div><b>{data.summary.total_farmers}</b><span>Farmers</span></div><div><b>{data.summary.total_consumers}</b><span>Consumers</span></div><div><b>{data.summary.total_orders}</b><span>Orders</span></div></div><div className="admin-sections"><section className="admin-section"><h2>Farmers</h2>{data.farmers.map((farmer) => <article className="admin-card" key={farmer.id}><h3>{farmer.name}</h3><p>{farmer.email}</p></article>)}</section><section className="admin-section"><h2>Consumers</h2>{data.consumers.map((consumer) => <article className="admin-card" key={consumer.id}><h3>{consumer.name}</h3><p>{consumer.email}</p></article>)}</section><section className="admin-section"><h2>Orders</h2>{data.orders.map((order) => <article className="admin-card" key={order.id}><b>{order.consumer_name || "Consumer"}</b><span>{order.status}</span></article>)}</section></div></section>;
}
