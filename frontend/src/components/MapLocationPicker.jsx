import React, { useEffect } from "react";
import { MapContainer, TileLayer, CircleMarker, useMap, useMapEvents } from "react-leaflet";
import "leaflet/dist/leaflet.css";

// Default view centered on Saudi Arabia, used until a coordinate is set —
// just the initial framing, not a hard pan/zoom restriction.
const DEFAULT_CENTER = [24, 45];
const DEFAULT_ZOOM = 5;
const POINT_ZOOM = 9;

// "" (an empty form field) coerces to 0 via Number(), not NaN, which would
// otherwise be misread as a deliberately-placed (0, 0) — Null Island.
const toCoord = (v) => (v === "" || v == null ? NaN : Number(v));
const validCoord = (lat, lng) =>
  Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;

function ClickCapture({ onPick }) {
  useMapEvents({
    click(e) {
      onPick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

// Recenters the map when the coordinate changes from outside a click on this
// map (e.g. typed into the X/Y number inputs).
function Recenter({ lat, lng }) {
  const map = useMap();
  useEffect(() => {
    if (validCoord(lat, lng)) map.setView([lat, lng], map.getZoom());
  }, [lat, lng, map]);
  return null;
}

// Click-to-place coordinate picker. `latitude`/`longitude` are the current
// (possibly empty-string) form values; `onChange(lat, lng)` fires with plain
// numbers whenever the map is clicked.
export default function MapLocationPicker({ latitude, longitude, onChange }) {
  const lat = toCoord(latitude);
  const lng = toCoord(longitude);
  const hasPoint = validCoord(lat, lng);

  return (
    <div className="af__map">
      <MapContainer
        center={hasPoint ? [lat, lng] : DEFAULT_CENTER}
        zoom={hasPoint ? POINT_ZOOM : DEFAULT_ZOOM}
        className="af__map-canvas"
        scrollWheelZoom
      >
        <TileLayer
          attribution="&copy; OpenStreetMap contributors"
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <ClickCapture onPick={onChange} />
        <Recenter lat={lat} lng={lng} />
        {hasPoint && (
          <CircleMarker
            center={[lat, lng]}
            radius={7}
            pathOptions={{ color: "#567cff", fillColor: "#567cff", fillOpacity: 0.9, weight: 2 }}
          />
        )}
      </MapContainer>
      <p className="af__map-hint">Click the map to set the X/Y coordinates.</p>
    </div>
  );
}
