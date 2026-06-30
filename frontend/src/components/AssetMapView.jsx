import React, { useEffect, useMemo } from "react";
import { MapContainer, TileLayer, CircleMarker, Polyline, Tooltip, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";

const STATUS_COLOR = {
  operational: "#5fd0a8",
  maintenance: "#ffb056",
  decommissioned: "#ff8a8a",
  under_construction: "#8fb0ff",
  planned: "#8fb0ff",
};

const validCoord = (lat, lng) =>
  Number.isFinite(lat) && Number.isFinite(lng) &&
  Math.abs(lat) <= 90 && Math.abs(lng) <= 180 &&
  !(lat === 0 && lng === 0);

function FitBounds({ points }) {
  const map = useMap();
  useEffect(() => {
    if (points.length === 0) return;
    if (points.length === 1) {
      map.setView(points[0], 9);
    } else {
      map.fitBounds(points, { padding: [40, 40] });
    }
  }, [map, points]);
  return null;
}

const hasLine = (a) =>
  validCoord(a.latitude, a.longitude) && validCoord(a.end_latitude, a.end_longitude);

export default function AssetMapView({ assets, onSelect }) {
  const located = useMemo(
    () => assets.filter((a) => validCoord(a.latitude, a.longitude)),
    [assets]
  );
  // Include both endpoints of pipeline segments when fitting the view.
  const points = useMemo(() => {
    const pts = [];
    for (const a of located) {
      pts.push([a.latitude, a.longitude]);
      if (hasLine(a)) pts.push([a.end_latitude, a.end_longitude]);
    }
    return pts;
  }, [located]);
  const missing = assets.length - located.length;

  return (
    <div className="asset-map">
      {located.length === 0 ? (
        <div className="metric__notice" style={{ margin: 0 }}>
          None of these assets have valid coordinates to map.
        </div>
      ) : (
        <>
          <MapContainer center={[24, 45]} zoom={5} className="asset-map__canvas" scrollWheelZoom>
            <TileLayer
              attribution='&copy; OpenStreetMap contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            <FitBounds points={points} />
            {located.map((a) => {
              const color = STATUS_COLOR[a.status] || "#8fb0ff";
              // Pipelines have a start + end: draw them as a pipe-like segment.
              if (hasLine(a)) {
                return (
                  <Polyline
                    key={`${a.category}-${a.id}`}
                    positions={[[a.latitude, a.longitude], [a.end_latitude, a.end_longitude]]}
                    pathOptions={{ color, weight: 5, opacity: 0.85, lineCap: "round" }}
                    eventHandlers={{ click: () => onSelect(a) }}
                  >
                    <Tooltip>
                      {a.name || a.id}
                      {a.specifications?.length_km ? ` · ${a.specifications.length_km} km` : ""}
                    </Tooltip>
                  </Polyline>
                );
              }
              return (
                <CircleMarker
                  key={`${a.category}-${a.id}`}
                  center={[a.latitude, a.longitude]}
                  radius={6}
                  pathOptions={{ color, fillColor: color, fillOpacity: 0.8, weight: 1.5 }}
                  eventHandlers={{ click: () => onSelect(a) }}
                >
                  <Tooltip>{a.name || a.id}</Tooltip>
                </CircleMarker>
              );
            })}
          </MapContainer>
          {missing > 0 && (
            <p className="asset-map__note">
              {missing} asset{missing === 1 ? "" : "s"} hidden — no valid coordinates.
            </p>
          )}
        </>
      )}
    </div>
  );
}
