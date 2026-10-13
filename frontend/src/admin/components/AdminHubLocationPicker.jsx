import { MapContainer, Marker, TileLayer } from "react-leaflet";
import { useI18n } from "../../i18n";
import AdminHubMapClickHandler from "./AdminHubMapClickHandler";

export default function AdminHubLocationPicker({ location, onChange }) {
  const { t } = useI18n();
  if (!location) {
    return <p className="admin-muted">{t("adminHubMapCenterHint")}</p>;
  }

  const center = [location.latitude, location.longitude];
  return (
    <div className="admin-hub-map" aria-label="Choose hub location on map">
      <MapContainer center={center} zoom={14} scrollWheelZoom>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <AdminHubMapClickHandler onSelect={onChange} />
        <Marker position={center} />
      </MapContainer>
      <small>{t("adminHubMapClickHint")}</small>
    </div>
  );
}
