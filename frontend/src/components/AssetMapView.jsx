import React, { useEffect, useMemo } from "react";
import { MapContainer, TileLayer, Marker, Tooltip, Popup, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { assetMarkerIcon } from "../lib/assetMarker";
import "./AssetMapView.css";

const statusLabel = (s) => (s ? s.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase()) : "Unknown");
const gov = (a) => (a.governorate && a.governorate !== "NULL" ? a.governorate : "Unknown");

// Asset markers: see lib/assetMarker.js (shared with the asset view page).

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
              const body = (
                <>
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
                </>
              );
              const key = `${a.category}-${a.id}`;
              const markerLabel = `${a.name || a.id}, ${statusLabel(a.status)}`;
              return (
                <Marker
                  key={key}
                  position={[a.latitude, a.longitude]}
                  icon={assetMarkerIcon(a.category, a.status)}
                  title={markerLabel}
                  alt={markerLabel}
                >
                  {body}
                </Marker>
              );
            })}
          </MapContainer>
        )}
      </div>
    </div>
  );
}
