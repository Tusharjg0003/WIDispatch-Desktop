import React from "react";
import { MapContainer, TileLayer, CircleMarker, Tooltip } from "react-leaflet";
import "leaflet/dist/leaflet.css";

// Read-only satellite map with a marker at the plant location.
export default function SinglePlantMap({ latitude, longitude, name, height = 220 }) {
  const lat = Number(latitude);
  const lng = Number(longitude);
  if (Number.isNaN(lat) || Number.isNaN(lng)) {
    return (
      <div style={{ height, display: "flex", alignItems: "center", justifyContent: "center", border: "1px solid #d0d7de", borderRadius: 2, color: "#6b7280", fontSize: "0.75rem" }}>
        No coordinates for this plant
      </div>
    );
  }
  return (
    <div style={{ height, borderRadius: 2, overflow: "hidden", border: "1px solid #d0d7de" }}>
      <MapContainer center={[lat, lng]} zoom={13} style={{ height: "100%", width: "100%" }} scrollWheelZoom={false}>
        <TileLayer
          attribution="Tiles &copy; Esri"
          url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
        />
        <CircleMarker center={[lat, lng]} radius={8} pathOptions={{ color: "#003eb1", fillColor: "#003eb1", fillOpacity: 0.7 }}>
          {name && <Tooltip>{name}</Tooltip>}
        </CircleMarker>
      </MapContainer>
    </div>
  );
}
