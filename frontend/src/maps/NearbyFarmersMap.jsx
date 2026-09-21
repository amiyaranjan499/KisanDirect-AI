import { useEffect, useState } from "react";
import { MapContainer, Marker, Popup, TileLayer, useMap } from "react-leaflet";
import { nearbyFarmers } from "../services/api";

function Recenter({ center }) {
  const map = useMap();
  useEffect(() => map.setView(center), [center, map]);
  return null;
}

export default function NearbyFarmers({ onFarmer }) {
  const [location, setLocation] = useState({ latitude: "20.30", longitude: "85.80", radius_km: "25", page: 1, page_size: 6 });
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const center = [Number(location.latitude) || 20.3, Number(location.longitude) || 85.8];

  const search = (page = 1) => {
    setLoading(true); setError("");
    nearbyFarmers({ ...location, page }).then(setData).catch((err) => setError(err.message)).finally(() => setLoading(false));
  };

  const update = (key) => (event) => setLocation({ ...location, [key]: event.target.value });
  return <section className="nearby-view">
    <div className="nearby-heading"><div><span className="eyebrow">Location discovery</span><h1>Farmers within reach.</h1><p>Search by coordinate or place radius to explore farms near you.</p></div><button className="back-button" onClick={() => onFarmer(null)}>← Marketplace</button></div>
    <div className="nearby-controls nearby-search-panel">
      <label className="nearby-field"><span>Latitude</span><input type="number" min="-90" max="90" step=".0001" value={location.latitude} onChange={update("latitude")} placeholder="Latitude" /></label>
      <label className="nearby-field"><span>Longitude</span><input type="number" min="-180" max="180" step=".0001" value={location.longitude} onChange={update("longitude")} placeholder="Longitude" /></label>
      <label className="nearby-field"><span>Radius</span><select value={location.radius_km} onChange={update("radius_km")}><option value="5">5 km</option><option value="25">25 km</option><option value="50">50 km</option><option value="100">100 km</option><option value="250">250 km</option></select></label>
      <button className="primary-button" onClick={() => search(1)}>Find nearby farmers</button>
    </div>
    {error && <div className="error">{error}</div>}
    {loading ? <div className="loading">Finding farmers...</div> : <div className="nearby-layout"><MapContainer center={center} zoom={9} className="map"><Recenter center={center} /><TileLayer attribution='&copy; OpenStreetMap contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" /><Marker position={center}><Popup>Your search location</Popup></Marker>{data?.items.map((farmer) => <Marker key={farmer.id} position={[farmer.location.latitude, farmer.location.longitude]}><Popup><b>{farmer.name}</b><br />{farmer.distance_km.toFixed(1)} km away</Popup></Marker>)}</MapContainer><div className="nearby-results">{data?.items.length ? data.items.map((farmer) => <article className="farmer-card nearby-farmer-card" key={farmer.id}><div><span className="eyebrow">{farmer.distance_km.toFixed(1)} km away</span><h2>{farmer.name}</h2><p className="muted">{farmer.active_listing_count} active listing{farmer.active_listing_count === 1 ? "" : "s"} · Rating: {farmer.rating ? `${farmer.rating.toFixed(1)} / 5` : "Unavailable"}</p></div><button className="farmer-link" onClick={() => onFarmer(farmer.id)}>View farm →</button></article>) : data ? <div className="empty">No active farmers found in this radius.</div> : <div className="empty">Enter a location and search to find nearby farmers.</div>}{data?.pages > 1 && <nav className="pagination"><button disabled={data.page <= 1} onClick={() => search(data.page - 1)}>Previous</button><span>Page {data.page} of {data.pages}</span><button disabled={data.page >= data.pages} onClick={() => search(data.page + 1)}>Next</button></nav>}</div></div>}
  </section>;
}