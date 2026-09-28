import { useEffect, useMemo, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { MapContainer, Marker, Polyline, TileLayer, Tooltip, useMap, useMapEvents } from "react-leaflet";
import { ENTITY_TYPE_COLORS } from "../../cytoscape/buildCyStyle";
import "./NetworkCanvasMapView.css";

// Geographic view of the Network Builder canvas. Ported from the reference
// SWIIMS NetworkCanvasMapView; the marker colours are keyed by WIDispatch canvas
// categories. Positions come from canvasGeoreference (pixelToGeo) once the user
// has pinned >= 2 geo anchors.
const SAUDI_CENTER = [24.7136, 46.6753];

const markerIcon = (type, isAnchor) => L.divIcon({
  className: "",
  html: `<span class="ncm-marker${isAnchor ? " ncm-marker--anchor" : ""}" style="--ncm-color:${ENTITY_TYPE_COLORS[type] || "#8aa5b8"}"></span>`,
  iconSize: [18, 18],
  iconAnchor: [9, 9],
});

function FitGeography({ nodes }) {
  const map = useMap();
  useEffect(() => {
    const points = nodes.map((node) => [node.lat, node.lng]).filter(([lat, lng]) => Number.isFinite(lat) && Number.isFinite(lng));
    if (points.length === 1) map.setView(points[0], 12);
    else if (points.length > 1) map.fitBounds(points, { padding: [36, 36], maxZoom: 14 });
  }, [map, nodes]);
  return null;
}

function MapRouteClick({ active, onVertex }) {
  useMapEvents({
    click(event) {
      if (!active) return;
      onVertex({
        lat: event.latlng.lat,
        lng: event.latlng.lng,
        kind: event.originalEvent?.shiftKey ? "bend" : "junction",
      });
    },
  });
  return null;
}

export default function NetworkCanvasMapView({
  nodes = [], edges = [], status, readOnly = false, onMoveNode, onCreateRoute,
}) {
  const [drawing, setDrawing] = useState(false);
  const [draft, setDraft] = useState({ sourceId: null, steps: [] });
  const byId = useMemo(() => new Map(nodes.map((node) => [node.id, node])), [nodes]);
  const source = draft.sourceId ? byId.get(draft.sourceId) : null;
  const draftPositions = source
    ? [[source.lat, source.lng], ...draft.steps.map((step) => [step.lat, step.lng])]
    : [];

  const resetDraft = () => setDraft({ sourceId: null, steps: [] });
  const toggleDrawing = () => {
    setDrawing((value) => !value);
    resetDraft();
  };
  const handleMarkerClick = (node, event) => {
    if (!drawing || readOnly) return;
    L.DomEvent.stopPropagation(event.originalEvent);
    if (!draft.sourceId) {
      setDraft({ sourceId: node.id, steps: [] });
      return;
    }
    if (node.id === draft.sourceId) return;
    onCreateRoute?.({ sourceId: draft.sourceId, targetId: node.id, steps: draft.steps });
    setDrawing(false);
    resetDraft();
  };

  return (
    <div className="ncm-root" role="region" aria-label="Geographic network map">
      <div className="ncm-toolbar">
        <div>
          <strong>Geographic network</strong>
          <span>{status?.message || "Set two geo anchors to enable the map"}</span>
        </div>
        {!readOnly && (
          <button type="button" className={drawing ? "ncm-active" : ""} disabled={!status?.ok} onClick={toggleDrawing}>
            {drawing ? "Cancel route" : "Draw route"}
          </button>
        )}
      </div>
      {drawing && (
        <div className="ncm-hint">
          {draft.sourceId
            ? "Click for a junction, Shift+click for a bend, then click the target asset."
            : "Click the source asset."}
          {draft.steps.length > 0 && <button type="button" onClick={() => setDraft((value) => ({ ...value, steps: value.steps.slice(0, -1) }))}>Undo point</button>}
        </div>
      )}
      {!status?.ok ? (
        <div className="ncm-empty">At least two valid geo anchors are required before geographic positions can be calculated.</div>
      ) : (
        <MapContainer center={SAUDI_CENTER} zoom={6} className="ncm-map" preferCanvas>
          <TileLayer
            attribution="&copy; OpenStreetMap contributors"
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <FitGeography nodes={nodes} />
          <MapRouteClick active={drawing && Boolean(draft.sourceId)} onVertex={(step) => setDraft((value) => ({ ...value, steps: [...value.steps, step] }))} />
          {edges.map((edge) => edge.positions.length >= 2 && (
            <Polyline key={edge.id} positions={edge.positions} pathOptions={{ color: "#1d4f91", weight: 4, opacity: 0.78 }}>
              <Tooltip sticky>{edge.name || edge.id}</Tooltip>
            </Polyline>
          ))}
          {draftPositions.length > 1 && <Polyline positions={draftPositions} pathOptions={{ color: "#f97316", weight: 3, dashArray: "8 6" }} />}
          {nodes.map((node) => (
            <Marker
              key={node.id}
              position={[node.lat, node.lng]}
              icon={markerIcon(node.type, node.isAnchor)}
              draggable={!readOnly}
              eventHandlers={{
                click: (event) => handleMarkerClick(node, event),
                dragend: (event) => {
                  const next = event.target.getLatLng();
                  onMoveNode?.(node.id, { lat: next.lat, lng: next.lng });
                },
              }}
            >
              <Tooltip direction="top" offset={[0, -8]}>{node.name || node.id}{node.isAnchor ? " · anchor" : ""}</Tooltip>
            </Marker>
          ))}
        </MapContainer>
      )}
    </div>
  );
}
