import React, { useEffect, useMemo, useState } from "react";
import { MapContainer, Marker, Tooltip, useMap } from "react-leaflet";
import BaseMapLayer from "../BaseMapLayer";
import "leaflet/dist/leaflet.css";
import { assetMarkerIcon } from "../../lib/assetMarker";
import { ENTITY_TYPE_COLORS } from "../../cytoscape/buildCyStyle";
import { normalizeRegion } from "../../lib/homeInsights";
import "../AssetMapView.css";

const CATEGORIES = [
  { key: "plant", label: "Plants" },
  { key: "pump", label: "Pump stations" },
  { key: "tank", label: "Tanks" },
  { key: "handover_point", label: "City gates" },
];

const STATUS_LABEL = { operational: "Operational", maintenance: "Maintenance", planned: "Planned", under_construction: "Under construction" };

const validCoord = (lat, lng) => Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && !(lat === 0 && lng === 0);

/** Where an asset opens: its module page where it has one, else the registry. */
export const assetPath = (asset) => {
  const id = encodeURIComponent(asset.id);
  if (asset.category === "plant") return `/production/${id}`;
  if (asset.category === "handover_point") return `/demand/${id}`;
  if (asset.category === "pump") return `/transmission/pump-stations/${id}`;
  return `/asset-registry/view/${id}`;
};

function FitBounds({ points, signature }) {
  const map = useMap();
  const pointsRef = React.useRef(points);
  pointsRef.current = points;
  useEffect(() => {
    const fit = () => {
      const pts = pointsRef.current;
      map.invalidateSize();
      if (!pts.length) return;
      if (pts.length === 1) map.setView(pts[0], 9);
      else map.fitBounds(pts, { padding: [28, 28], maxZoom: 9 });
    };
    fit();
    // The card is laid out after the map mounts, and can resize later.
    const observer = new ResizeObserver(fit);
    observer.observe(map.getContainer());
    return () => observer.disconnect();
    // Refit only when the set of assets changes, not on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, signature]);
  return null;
}

// Every located asset, as on the canvas (type symbol, lifecycle ring), with
// type chips to filter and a status strip. Hover for details, click to open.
export default function HomeNetworkMap({ assets, region, onOpen }) {
  const [hidden, setHidden] = useState(() => new Set());

  const inRegion = useMemo(
    () => assets.filter((a) => validCoord(a.latitude, a.longitude) && (region === "all" || normalizeRegion(a.region, a.cluster) === region)),
    [assets, region]
  );
  const shown = useMemo(() => inRegion.filter((a) => !hidden.has(a.category)), [inRegion, hidden]);
  const points = useMemo(() => shown.map((a) => [a.latitude, a.longitude]), [shown]);
  const signature = `${region}|${[...hidden].sort().join(",")}|${shown.length}`;

  const counts = useMemo(() => {
    const byCat = {};
    const byStatus = {};
    for (const a of inRegion) {
      byCat[a.category] = (byCat[a.category] || 0) + 1;
      if (!hidden.has(a.category)) byStatus[a.status] = (byStatus[a.status] || 0) + 1;
    }
    return { byCat, byStatus };
  }, [inRegion, hidden]);

  const toggle = (key) =>
    setHidden((set) => {
      const next = new Set(set);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  return (
    <div className="home-map">
      <div className="home-map__chips">
        {CATEGORIES.map((c) => (
          <button
            key={c.key}
            type="button"
            className={`home-chip${hidden.has(c.key) ? " is-off" : ""}`}
            style={{ "--home-colour": ENTITY_TYPE_COLORS[c.key] }}
            onClick={() => toggle(c.key)}
            aria-pressed={!hidden.has(c.key)}
          >
            <i />
            {c.label}
            <b>{counts.byCat[c.key] || 0}</b>
          </button>
        ))}
      </div>
      <div className="home-map__canvas">
        <MapContainer center={[24, 45]} zoom={5} style={{ height: "100%", width: "100%" }} scrollWheelZoom={false}>
          <BaseMapLayer storageKey="home" />
          <FitBounds points={points} signature={signature} />
          {shown.map((a) => (
            <Marker
              key={a.id}
              position={[a.latitude, a.longitude]}
              icon={assetMarkerIcon(a.category, a.status, 24)}
              title={`${a.name || a.id}, ${STATUS_LABEL[a.status] || a.status || "status unknown"} — open`}
              eventHandlers={{ click: () => onOpen(a) }}
            >
              <Tooltip direction="top" offset={[0, -4]}>
                <div className="asset-tooltip">
                  <strong>{a.name || a.id}</strong><br />
                  <span>{STATUS_LABEL[a.status] || a.status || "Unknown"} · {a.region || "—"}</span>
                  {a.capacity ? <><br /><span>{new Intl.NumberFormat("en-US").format(a.capacity)} m³/day</span></> : null}
                </div>
              </Tooltip>
            </Marker>
          ))}
        </MapContainer>
      </div>
      <div className="home-map__status">
        {Object.entries(STATUS_LABEL).map(([key, label]) => (
          <span key={key} className={`home-map__status-item home-map__status-item--${key}`}>
            <i />{label} <b className="mono">{counts.byStatus[key] || 0}</b>
          </span>
        ))}
      </div>
    </div>
  );
}
