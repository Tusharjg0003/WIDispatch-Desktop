import React from "react";
import { ENTITY_TYPE_LABELS } from "../cytoscape/buildCyStyle";

const STATUSES = [
  "operational",
  "maintenance",
  "under_construction",
  "planned",
  "decommissioned",
];

const statusLabel = (s) =>
  s ? s.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase()) : "—";
const clean = (v) => (v == null || v === "" || v === "NULL" ? null : v);

function Row({ label, value }) {
  const v = clean(value);
  if (v == null) return null;
  return (
    <div className="adr__row">
      <dt>{label}</dt>
      <dd>{String(v)}</dd>
    </div>
  );
}

// Right-panel inspector for the selected canvas element. `selected` is a plain
// object of the element's cytoscape data plus `_group` ("node" | "edge").
export default function NetworkNodeDetails({ selected, onLabelChange, onStatusChange, onSpecChange, onDelete }) {
  if (!selected) {
    return (
      <div className="nnd nnd--empty">
        <p>Select a node or pipe to see its details.</p>
        <p className="nnd__hint">
          Pick an asset from the library, then click the canvas to place it.
        </p>
      </div>
    );
  }

  if (selected._group === "edge") {
    const pipeSpec = selected.meta?.specifications || {};
    return (
      <div className="nnd">
        <header className="nnd__head">
          <span className="adr__cat">{selected.assetId ? "Pipeline" : "Pipe"}</span>
          <h3 className="adr__name">{selected.label || `${selected.sourceLabel} → ${selected.targetLabel}`}</h3>
          {selected.status && (
            <span className={`st st--${selected.status}`}>{statusLabel(selected.status)}</span>
          )}
        </header>
        <div className="adr__body nnd__body">
          <label className="af__field nnd__field">
            Label
            <input
              type="text"
              value={selected.label || ""}
              placeholder="Optional pipe label"
              onChange={(e) => onLabelChange(e.target.value)}
            />
          </label>
          <label className="af__field nnd__field">
            Status
            <select value={selected.status || ""} onChange={(e) => onStatusChange(e.target.value)}>
              <option value="">—</option>
              {STATUSES.map((s) => (
                <option key={s} value={s}>{statusLabel(s)}</option>
              ))}
            </select>
          </label>

          <div className="af__section">Pipeline variables</div>
          <label className="af__field nnd__field">
            Length (km)
            <input
              type="number"
              step="any"
              value={pipeSpec.length_km ?? ""}
              onChange={(e) => onSpecChange("length_km", e.target.value)}
            />
          </label>
          <label className="af__field nnd__field">
            Diameter (mm)
            <input
              type="number"
              step="any"
              value={pipeSpec.diameter_mm ?? ""}
              onChange={(e) => onSpecChange("diameter_mm", e.target.value)}
            />
          </label>
          <label className="af__field nnd__field">
            Material
            <input
              type="text"
              value={pipeSpec.material ?? ""}
              onChange={(e) => onSpecChange("material", e.target.value)}
            />
          </label>

          <div className="af__section">Connection</div>
          <dl className="adr__list">
            <Row label="From" value={selected.sourceLabel} />
            <Row label="To" value={selected.targetLabel} />
            <Row label="Asset ID" value={selected.assetId} />
          </dl>
          <button className="af__btn nnd__delete" onClick={onDelete}>Delete pipe</button>
        </div>
      </div>
    );
  }

  if (selected.type === "note" || selected.type === "group-box") {
    const isNote = selected.type === "note";
    return (
      <div className="nnd">
        <header className="nnd__head">
          <span className="adr__cat">{isNote ? "Note" : "Group box"}</span>
          <h3 className="adr__name">{isNote ? "Sticky note" : selected.label || "Group"}</h3>
        </header>
        <div className="adr__body nnd__body">
          <label className="af__field nnd__field">
            {isNote ? "Text" : "Label"}
            {isNote ? (
              <textarea
                rows={4}
                value={selected.label || ""}
                onChange={(e) => onLabelChange(e.target.value)}
              />
            ) : (
              <input type="text" value={selected.label || ""} onChange={(e) => onLabelChange(e.target.value)} />
            )}
          </label>
          {isNote && <p className="nnd__hint">Use the Note Format group in the toolbar to style the text.</p>}
          <button className="af__btn nnd__delete" onClick={onDelete}>Delete {isNote ? "note" : "group box"}</button>
        </div>
      </div>
    );
  }

  const spec = selected.meta?.specifications || {};
  const meta = selected.meta || {};
  const coords =
    Number.isFinite(meta.latitude) && Number.isFinite(meta.longitude)
      ? `${meta.latitude}, ${meta.longitude}`
      : null;

  return (
    <div className="nnd">
      <header className="nnd__head">
        <span className="adr__cat">{ENTITY_TYPE_LABELS[selected.category] || selected.category}</span>
        <h3 className="adr__name">{selected.label || selected.assetId}</h3>
        <span className={`st st--${selected.status || "unknown"}`}>
          {statusLabel(selected.status)}
        </span>
      </header>

      <div className="adr__body nnd__body">
        <label className="af__field nnd__field">
          Label
          <input
            type="text"
            value={selected.label || ""}
            onChange={(e) => onLabelChange(e.target.value)}
          />
        </label>
        <label className="af__field nnd__field">
          Status
          <select value={selected.status || ""} onChange={(e) => onStatusChange(e.target.value)}>
            <option value="">—</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>{statusLabel(s)}</option>
            ))}
          </select>
        </label>

        <div className="af__section">Asset</div>
        <dl className="adr__list">
          <Row label="Asset ID" value={selected.assetId} />
          <Row label="Category" value={ENTITY_TYPE_LABELS[selected.category] || selected.category} />
          <Row label="Region" value={meta.region} />
          <Row label="Cluster" value={meta.cluster} />
          <Row label="Asset type" value={meta.asset_type} />
          <Row label="Coordinates" value={coords} />
        </dl>

        {Object.keys(spec).length > 0 && (
          <>
            <div className="af__section">Specifications</div>
            <dl className="adr__list">
              <Row label="Technology" value={spec.technology} />
              <Row label="Water source" value={spec.water_source} />
              <Row label="Design capacity (m³/day)" value={spec.design_capacity} />
              <Row label="Length (km)" value={spec.length_km} />
              <Row label="Diameter (mm)" value={spec.diameter_mm} />
            </dl>
          </>
        )}

        <button className="af__btn nnd__delete" onClick={onDelete}>Delete node</button>
      </div>
    </div>
  );
}
