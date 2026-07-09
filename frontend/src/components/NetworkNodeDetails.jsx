import React from "react";
import { ENTITY_TYPE_LABELS } from "../cytoscape/buildCyStyle";
import { Switch } from "./AssetFormControls";

const MATERIALS = [
  { value: "steel", label: "Steel" },
  { value: "ductile_iron", label: "Ductile Iron" },
  { value: "hdpe", label: "HDPE" },
  { value: "concrete", label: "Concrete" },
  { value: "pvc", label: "PVC" },
];

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

function capacityLimitLabel(spec) {
  const mode = spec.capacity_limit_mode;
  if (!mode) return null;
  if (mode === "none") return "None";
  if (mode === "percentage") {
    return spec.capacity_limit_percentage != null
      ? `${spec.capacity_limit_percentage}% of design capacity`
      : "Percentage (value not set)";
  }
  if (mode === "absolute") {
    return spec.capacity_limit_absolute != null
      ? `${spec.capacity_limit_absolute} m³/day`
      : "Absolute (value not set)";
  }
  return null;
}

const yesNo = (v) => (v == null ? null : v ? "Yes" : "No");

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
export default function NetworkNodeDetails({
  selected, systems, lines,
  onLabelChange, onStatusChange, onSpecChange, onSpecBooleanChange, onSpecArrayChange,
  onEdgeFieldChange, onActiveChange, onDelete,
}) {
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
          <span className="adr__cat">Pipe</span>
          <h3 className="adr__name">{selected.label || `${selected.sourceLabel} → ${selected.targetLabel}`}</h3>
          {selected.status && (
            <span className={`st st--${selected.status}`}>{statusLabel(selected.status)}</span>
          )}
        </header>
        <div className="adr__body nnd__body">
          <label className="af__field nnd__field">
            Pipe Name
            <input
              type="text"
              value={selected.label || ""}
              placeholder="Pipe name"
              onChange={(e) => onLabelChange(e.target.value)}
            />
          </label>
          <label className="af__field nnd__field">
            Active
            <Switch checked={!!selected.active} onChange={onActiveChange} />
          </label>
          <label className="af__field nnd__field">
            Commissioning Date
            <input
              type="date"
              value={selected.commissioningDate || ""}
              onChange={(e) => onEdgeFieldChange("commissioningDate", e.target.value)}
            />
          </label>
          <label className="af__field nnd__field">
            Decommissioning Date
            <input
              type="date"
              value={selected.decommissioningDate || ""}
              onChange={(e) => onEdgeFieldChange("decommissioningDate", e.target.value)}
            />
          </label>

          <div className="af__section">Pipeline variables</div>
          <label className="af__field nnd__field">
            Capacity (m³/day)
            <input
              type="number"
              step="any"
              value={pipeSpec.capacity ?? ""}
              onChange={(e) => onSpecChange("capacity", e.target.value)}
            />
          </label>
          <label className="af__field nnd__field">
            Length (km)
            <input
              type="number"
              step="any"
              value={pipeSpec.pipelineLength ?? ""}
              onChange={(e) => onSpecChange("pipelineLength", e.target.value)}
            />
          </label>
          <label className="af__field nnd__field">
            Diameter (mm)
            <input
              type="number"
              step="any"
              value={pipeSpec.pipelineDiameter ?? ""}
              onChange={(e) => onSpecChange("pipelineDiameter", e.target.value)}
            />
          </label>
          <label className="af__field nnd__field">
            Material
            <select
              value={pipeSpec.pipelineMaterial || ""}
              onChange={(e) => onSpecChange("pipelineMaterial", e.target.value)}
            >
              <option value="">—</option>
              {MATERIALS.map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          </label>
          <label className="af__field nnd__field">
            Design Capacity (m³/day)
            <input
              type="number"
              step="any"
              value={pipeSpec.designCapacity ?? ""}
              onChange={(e) => onSpecChange("designCapacity", e.target.value)}
            />
          </label>
          <label className="af__field nnd__field">
            Max Capacity (m³/day)
            <input
              type="number"
              step="any"
              value={pipeSpec.maximumCapacity ?? ""}
              onChange={(e) => onSpecChange("maximumCapacity", e.target.value)}
            />
          </label>
          <label className="af__field nnd__field">
            Source
            <input
              type="text"
              value={pipeSpec.infraSource || ""}
              onChange={(e) => onSpecChange("infraSource", e.target.value)}
            />
          </label>
          <label className="af__field nnd__field">
            Bidirectional
            <Switch
              checked={!!pipeSpec.bidirectional}
              onChange={(v) => onSpecBooleanChange("bidirectional", v)}
            />
          </label>

          <div className="af__section">Transmission</div>
          <label className="af__field nnd__field">
            Transmission System
            <select
              value={pipeSpec.transmissionSystemId || ""}
              onChange={(e) => onSpecChange("transmissionSystemId", e.target.value)}
            >
              <option value="">—</option>
              {systems.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </label>
          <label className="af__field nnd__field">
            Transmission Lines
            <select
              multiple
              value={pipeSpec.lineGroupIds || []}
              onChange={(e) =>
                onSpecArrayChange("lineGroupIds", Array.from(e.target.selectedOptions, (o) => o.value))
              }
            >
              {lines.map((l) => (
                <option key={l.id} value={l.id}>{l.name}</option>
              ))}
            </select>
          </label>

          <div className="af__section">Capacity Limitation</div>
          <label className="af__field nnd__field">
            Capacity Limitation
            <select
              value={pipeSpec.capacityLimitationType || "none"}
              onChange={(e) => {
                onSpecChange("capacityLimitationType", e.target.value);
                if (e.target.value === "none") onSpecChange("capacityLimitationValue", "");
              }}
            >
              <option value="none">None</option>
              <option value="percentage">Percentage (%)</option>
              <option value="absolute">Absolute (m³/day)</option>
            </select>
          </label>
          {pipeSpec.capacityLimitationType && pipeSpec.capacityLimitationType !== "none" && (
            <label className="af__field nnd__field">
              Capacity Limitation Value
              <input
                type="number"
                step="any"
                value={pipeSpec.capacityLimitationValue ?? ""}
                onChange={(e) => onSpecChange("capacityLimitationValue", e.target.value)}
              />
            </label>
          )}

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
          <Row label="Entity category" value={meta.entity_category} />
          <Row label="Active" value={yesNo(meta.active)} />
          <Row label="Coordinates" value={coords} />
        </dl>

        {selected.category === "plant" && Object.keys(spec).length > 0 && (
          <>
            <div className="af__section">Specifications</div>
            <dl className="adr__list">
              <Row label="Plant type" value={spec.plant_type} />
              <Row label="Water source" value={spec.water_source} />
              <Row label="Technology" value={spec.technology} />
              <Row label="Design capacity (m³/day)" value={spec.design_capacity} />
              <Row label="Maximum capacity (m³/day)" value={spec.maximum_capacity} />
              <Row label="Contracted capacity (m³/day)" value={spec.contracted_capacity} />
              <Row label="Treatment level" value={spec.treatment_level} />
              <Row label="Capacity limitation" value={capacityLimitLabel(spec)} />
              <Row label="Variable O&M (SAR/m³)" value={spec.variable_om} />
            </dl>
          </>
        )}

        {selected.category === "pump" && Array.isArray(spec.pumps) && spec.pumps.length > 0 && (
          <>
            <div className="af__section">Pump Configuration</div>
            <dl className="adr__list">
              {spec.pumps.map((p) => (
                <Row
                  key={p.id}
                  label={p.name || "Pump"}
                  value={`${p.capacity_m3_day ?? "—"} m³/day · ${p.role === "backup" ? "Backup" : "Functional"} · ${p.active ? "On" : "Off"}`}
                />
              ))}
            </dl>
          </>
        )}

        <button className="af__btn nnd__delete" onClick={onDelete}>Delete node</button>
      </div>
    </div>
  );
}
