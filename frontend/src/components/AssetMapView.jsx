import React, { useEffect, useMemo } from "react";
import { MapContainer, TileLayer, CircleMarker, Tooltip, Popup, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";

const STATUS_COLOR = {
  operational: "#10b981",
  maintenance: "#f59e0b",
  under_construction: "#3b82f6",
  planned: "#3b82f6",
  decommissioned: "#ef4444",
};
const statusLabel = (s) => (s ? s.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase()) : "Unknown");
const gov = (a) => (a.governorate && a.governorate !== "NULL" ? a.governorate : "Unknown");

const validCoord = (lat, lng) =>
  Number.isFinite(lat) && Number.isFinite(lng) &&
  Math.abs(lat) <= 90 && Math.abs(lng) <= 180 &&
  !(lat === 0 && lng === 0);

function FitBounds({ points }) {
  const map = useMap();
  useEffect(() => {
    if (points.length === 0) return;
    if (points.length === 1) map.setView(points[0], 9);
    else map.fitBounds(points, { padding: [40, 40] });
  }, [map, points]);
  return null;
}

export default function AssetMapView({ assets, onView, onEdit }) {
  const located = useMemo(() => assets.filter((a) => validCoord(a.latitude, a.longitude)), [assets]);
  const points = useMemo(() => located.map((a) => [a.latitude, a.longitude]), [located]);

  return (
    <div className="map-view-container">
      <div className="map-header">
        <h3>Asset Locations</h3>
        <p>Showing {located.length} assets with location data</p>
      </div>
      <div className="map-container">
        {located.length === 0 ? (
          <div className="map-loading"><p>None of these assets have valid coordinates to map.</p></div>
        ) : (
          <MapContainer center={[24, 45]} zoom={5} style={{ height: "100%", width: "100%" }} scrollWheelZoom>
            <TileLayer
              attribution="&copy; OpenStreetMap contributors"
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            <FitBounds points={points} />
            {located.map((a) => {
              const color = STATUS_COLOR[a.status] || "#3b82f6";
              return (
                <CircleMarker
                  key={`${a.category}-${a.id}`}
                  center={[a.latitude, a.longitude]}
                  radius={6}
                  pathOptions={{ color, fillColor: color, fillOpacity: 0.8, weight: 1.5 }}
                >
                  <Tooltip direction="top" offset={[0, -6]} sticky>
                    <div className="asset-tooltip">
                      <strong>{a.name || a.id}</strong><br />
                      <span className="tooltip-id">ID: {a.id}</span><br />
                      <span className="tooltip-status">Status: {statusLabel(a.status)}</span><br />
                      <span className="tooltip-location">{a.region || "Unknown"}, {gov(a)}</span>
                    </div>
                  </Tooltip>
                  <Popup>
                    <div className="asset-popup">
                      <h4>{a.name || a.id}</h4>
                      <p><strong>ID:</strong> {a.id}</p>
                      <p><strong>Status:</strong> {statusLabel(a.status)}</p>
                      <p><strong>Region:</strong> {a.region || "Unknown"}</p>
                      <p><strong>Governorate:</strong> {gov(a)}</p>
                      <div className="popup-actions">
                        <button className="popup-btn view-btn" onClick={() => onView(a)}>View Details</button>
                        <button className="popup-btn edit-btn" onClick={() => onEdit(a)}>Edit</button>
                      </div>
                    </div>
                  </Popup>
                </CircleMarker>
              );
            })}
          </MapContainer>
        )}
      </div>
    </div>
  );
}
