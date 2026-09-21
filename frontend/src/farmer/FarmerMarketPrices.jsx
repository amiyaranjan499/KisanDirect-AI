import { useEffect, useState } from "react";
import { getFarmerDashboardAISummary } from "../services/api";

export default function FarmerMarketPrices({ onBack }) { const [data, setData] = useState(null); const [error, setError] = useState(""); useEffect(() => { getFarmerDashboardAISummary().then(setData).catch((e) => setError(e.message)); }, []); return <section className="detail-view"><button className="back-button" onClick={onBack}>Back</button><h1>Market prices</h1>{error ? <div className="error">{error}</div> : !data ? <div className="loading">Loading...</div> : <div className="panel-block"><p>Current AI market signals from your dashboard.</p><pre>{JSON.stringify(data, null, 2)}</pre></div>}</section>; }
