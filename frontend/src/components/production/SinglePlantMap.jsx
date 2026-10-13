import React, { useEffect } from "react";
import { MapContainer, TileLayer, CircleMarker, Tooltip, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";

// Leaflet measures its box once; when the card around it grows or shrinks
// (cards in a row stretch to the tallest), re-measure and re-centre.
function FollowSize({ lat, lng }) {
  const map = useMap();
  useEffect(() => {
    const el = map.getContainer();
    const observer = new ResizeObserver(() => {
      map.invalidateSize();
      map.setView([lat, lng], map.getZoom(), { animate: false });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [map, lat, lng]);
  return null;
}

// Read-only satellite map with a marker at the plant location. `height="fill"`
// makes it fill its (flex) container instead of a fixed height.
export default function SinglePlantMap({ latitude, longitude, name, height = 220 }) {
  const fill = height === "fill";
  const box = fill ? { flex: 1, minHeight: 240, height: "100%" } : { height };
  const lat = Number(latitude);
  const lng = Number(longitude);
  if (Number.isNaN(lat) || Number.isNaN(lng)) {
    return (
      <div style={{ ...box, display: "flex", alignItems: "center", justifyContent: "center", border: "1px solid var(--line)", borderRadius: 2, color: "var(--mut)", fontSize: "0.75rem" }}>
        No coordinates for this plant
      </div>
    );
  }
  return (
    <div style={{ ...box, borderRadius: 2, overflow: "hidden", border: "1px solid var(--line)" }}>
      <MapContainer center={[lat, lng]} zoom={13} style={{ height: "100%", width: "100%" }} scrollWheelZoom={false}>
        <TileLayer
          attribution="Tiles &copy; Esri"
          url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
        />
        <FollowSize lat={lat} lng={lng} />
        <CircleMarker center={[lat, lng]} radius={8} pathOptions={{ color: "var(--acc)", fillColor: "var(--acc)", fillOpacity: 0.7 }}>
          {name && <Tooltip>{name}</Tooltip>}
        </CircleMarker>
      </MapContainer>
    </div>
  );
}
