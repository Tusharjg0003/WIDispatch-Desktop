import React, { useEffect, useState } from "react";

// View → Geo Anchor (port of SWIIMS GeoAnchorPanel): pin the selected asset to
// its real latitude / longitude. Suggests the asset record's own coordinates,
// or the position derived from existing anchors; two or more anchors enable
// the Map view and KMZ export.
//
// node: { id, name, isAnchor, lat, lng, candidate?: {lat,lng}, derived?: {lat,lng} } | null
export default function GeoAnchorPanel({ node, status, anchorCount, onSet, onClear, onClose }) {
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  useEffect(() => {
    if (!node) {
      setLat("");
      setLng("");
      return;
    }
    const seed = node.isAnchor ? { lat: node.lat, lng: node.lng } : node.candidate || node.derived || null;
    setLat(seed && Number.isFinite(seed.lat) ? String(seed.lat) : "");
    setLng(seed && Number.isFinite(seed.lng) ? String(seed.lng) : "");
  }, [node?.id, node?.isAnchor]); // eslint-disable-line react-hooks/exhaustive-deps

  const latN = Number(lat);
  const lngN = Number(lng);
  const canSet = lat !== "" && lng !== "" && Number.isFinite(latN) && Number.isFinite(lngN) && latN >= -90 && latN <= 90 && lngN >= -180 && lngN <= 180;

  return (
    <section
      className="nb-geo-panel"
      aria-label="Georeference"
      onMouseDown={(e) => e.stopPropagation()}
      onWheel={(e) => e.stopPropagation()}
    >
      <header className="nb-geo-panel__head">
        <strong>Georeference</strong>
        <button type="button" className="cr-btn cr-btn--sm cr-btn--icon" onClick={onClose} aria-label="Close georeference panel">×</button>
      </header>
      <div className={`nb-geo-panel__status cr-pill cr-pill--${status.ok ? "ok" : "amber"}`}>{status.message}</div>
      {!node ? (
        <p className="nb-geo-panel__hint">Select an asset on the canvas, then pin it to its real latitude / longitude.</p>
      ) : (
        <div className="nb-geo-panel__node">
          <div className="nb-geo-panel__name" title={node.name}>
            {node.name}
            {node.isAnchor && <span className="cr-pill cr-pill--acc">anchor</span>}
          </div>
          <label className="nb-geo-panel__field">
            <span>Latitude</span>
            <input className="cr-input" type="number" step="any" value={lat} onChange={(e) => setLat(e.target.value)} placeholder="24.7136" />
          </label>
          <label className="nb-geo-panel__field">
            <span>Longitude</span>
            <input className="cr-input" type="number" step="any" value={lng} onChange={(e) => setLng(e.target.value)} placeholder="46.6753" />
          </label>
          {!node.isAnchor && node.candidate && (
            <div className="nb-geo-panel__derived">From the asset record: {node.candidate.lat.toFixed(5)}, {node.candidate.lng.toFixed(5)}</div>
          )}
          {!node.isAnchor && !node.candidate && node.derived && (
            <div className="nb-geo-panel__derived">Derived from the anchors: {node.derived.lat.toFixed(5)}, {node.derived.lng.toFixed(5)}</div>
          )}
          <div className="nb-geo-panel__actions">
            <button type="button" className="cr-btn cr-btn--primary cr-btn--sm" disabled={!canSet} onClick={() => onSet(latN, lngN)}>
              {node.isAnchor ? "Update anchor" : "Set as anchor"}
            </button>
            {node.isAnchor && (
              <button type="button" className="cr-btn cr-btn--sm" onClick={onClear}>Remove anchor</button>
            )}
          </div>
        </div>
      )}
      <div className="nb-geo-panel__count">{anchorCount} anchor{anchorCount === 1 ? "" : "s"} set</div>
    </section>
  );
}
