import React from "react";
import {
  ArrowRight,
  CircleDot,
  Cylinder,
  Droplets,
  Factory,
  Fuel,
  Layers,
  LocateFixed,
  MapPinned,
  Pencil,
  Spline,
  SquareDashed,
  StickyNote,
  Trash2,
} from "lucide-react";
import { ENTITY_TYPE_COLORS, ENTITY_TYPE_LABELS } from "../../cytoscape/buildCyStyle";
import { lineDisplayName } from "../../lib/transmissionLines";
import "./SelectionInspector.css";

// Right panel → Details while something is selected on the canvas: a
// read-only summary of the asset / pipe / note with Edit, Zoom to and Delete.
// Editing happens in the floating form that Edit opens, so this panel never
// grows into a long form.

const PIPE_COLOUR = "#5b7ca3";
const TYPE_ICONS = {
  plant: Factory,
  stp: Factory,
  tank: Cylinder,
  pump: Droplets,
  handover_point: MapPinned,
  filling_station: Fuel,
  node: CircleDot,
  note: StickyNote,
  "group-box": SquareDashed,
};
const TYPE_LABELS = {
  ...ENTITY_TYPE_LABELS,
  stp: "Treatment Plant",
  filling_station: "Filling Station",
  note: "Note",
  "group-box": "Group box",
};
const MATERIALS = { steel: "Steel", ductile_iron: "Ductile Iron", hdpe: "HDPE", concrete: "Concrete", pvc: "PVC" };

// Specification keys already shown in a dedicated row, per kind, so the
// "Other properties" catch-all doesn't repeat them.
const SHOWN_SPEC_KEYS = new Set([
  "plant_type", "water_source", "technology", "design_capacity", "maximum_capacity", "contracted_capacity",
  "treatment_level", "capacity_limit_mode", "capacity_limit_percentage", "capacity_limit_absolute", "variable_om",
  "pumps", "total_capacity_m3", "number_tanks", "storage_material", "source", "transmission_system_id",
  "transmission_system_name", "capacity_limitation_type", "capacity_limitation_value",
  "capacity", "pipelineLength", "pipelineDiameter", "pipelineMaterial", "designCapacity", "maximumCapacity",
  "infraSource", "bidirectional", "transmissionSystemId", "lineGroupIds", "capacityLimitationType",
  "capacityLimitationValue",
]);

const isBlank = (v) => v == null || v === "" || v === "NULL" || (Array.isArray(v) && v.length === 0);
const humanize = (key) =>
  key.replace(/_/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^\w/, (c) => c.toUpperCase());
const statusText = (s) => (s ? humanize(s) : "No status");
const number = (v, unit) => {
  if (isBlank(v)) return null;
  const n = Number(v);
  const text = Number.isFinite(n) ? n.toLocaleString(undefined, { maximumFractionDigits: 3 }) : String(v);
  return unit ? `${text} ${unit}` : text;
};
const yesNo = (v) => (v == null ? null : v ? "Yes" : "No");
const formatDate = (v) => {
  if (isBlank(v)) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? String(v) : d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
};
const plainValue = (v) => {
  if (isBlank(v)) return null;
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (Array.isArray(v)) return v.map((x) => (typeof x === "object" ? JSON.stringify(x) : String(x))).join(", ");
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
};
const statusTone = (s) => {
  const key = String(s || "").toLowerCase();
  if (key === "operational") return "ok";
  if (key === "maintenance") return "warn";
  if (key === "decommissioned" || key === "inactive") return "off";
  if (key === "planned" || key === "under_construction") return "acc";
  return "muted";
};

function Section({ title, rows }) {
  const visible = rows.filter(([, value]) => !isBlank(value));
  if (!visible.length) return null;
  return (
    <section className="si__section">
      <h4 className="si__section-title">{title}</h4>
      <dl className="si__list">
        {visible.map(([label, value]) => (
          <div className="si__row" key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function Actions({ readOnly, onEdit, onZoom, onDelete, deleteLabel = "Delete", canEdit = true }) {
  return (
    <div className="si__actions">
      {!readOnly && canEdit && onEdit && (
        <button type="button" className="si__btn si__btn--primary" onClick={onEdit}>
          <Pencil size={13} aria-hidden="true" /> Edit
        </button>
      )}
      {onZoom && (
        <button type="button" className="si__btn" onClick={onZoom} title="Centre the canvas on it">
          <LocateFixed size={13} aria-hidden="true" /> Zoom to
        </button>
      )}
      {!readOnly && onDelete && (
        <button type="button" className="si__btn si__btn--danger" onClick={onDelete}>
          <Trash2 size={13} aria-hidden="true" /> {deleteLabel}
        </button>
      )}
    </div>
  );
}

function Header({ kind, colour, eyebrow, name, status, id }) {
  const Icon = TYPE_ICONS[kind] || (kind === "pipe" ? Spline : CircleDot);
  return (
    <header className="si__head" style={{ "--si-colour": colour }}>
      <span className="si__icon" aria-hidden="true"><Icon size={18} /></span>
      <div className="si__titles">
        <span className="si__eyebrow">{eyebrow}</span>
        <h3 className="si__name" title={name}>{name}</h3>
        <div className="si__meta">
          {status !== undefined && (
            <span className={`si__status si__status--${statusTone(status)}`}>{statusText(status)}</span>
          )}
          {id && <span className="si__id" title={id}>{id}</span>}
        </div>
      </div>
    </header>
  );
}

function otherSpecRows(spec) {
  return Object.entries(spec || {})
    .filter(([key, value]) => !SHOWN_SPEC_KEYS.has(key) && !isBlank(value))
    .map(([key, value]) => [humanize(key), plainValue(value)]);
}

export default function SelectionInspector({
  selected,
  selectedCount = 0,
  selectedEdgeCount = 0,
  systems = [],
  lines = [],
  readOnly = false,
  onEdit,
  onZoom,
  onDelete,
}) {
  // ── Several things selected ───────────────────────────────────────────────
  if (!selected && selectedCount > 1) {
    const pipes = selectedEdgeCount;
    const others = selectedCount - pipes;
    const parts = [others && `${others} asset${others === 1 ? "" : "s"}`, pipes && `${pipes} pipe${pipes === 1 ? "" : "s"}`].filter(Boolean);
    return (
      <div className="si">
        <header className="si__head" style={{ "--si-colour": "var(--acc)" }}>
          <span className="si__icon" aria-hidden="true"><Layers size={18} /></span>
          <div className="si__titles">
            <span className="si__eyebrow">Selection</span>
            <h3 className="si__name">{selectedCount} items selected</h3>
            <div className="si__meta"><span className="si__muted">{parts.join(" · ")}</span></div>
          </div>
        </header>
        <Actions readOnly={readOnly} onZoom={onZoom} onDelete={onDelete} deleteLabel={`Delete ${selectedCount}`} />
        <p className="si__hint">Select a single item to see its details.</p>
      </div>
    );
  }
  if (!selected) return null;

  const systemName = (id) => (id ? systems.find((s) => s.id === id)?.name || id : null);
  const lineName = (ids) => {
    const id = Array.isArray(ids) ? ids[0] : ids;
    if (!id) return null;
    const line = lines.find((l) => l.id === id);
    return line ? lineDisplayName(line) : id;
  };

  // ── Pipe ──────────────────────────────────────────────────────────────────
  if (selected._group === "edge") {
    const spec = selected.meta?.specifications || {};
    const limit =
      spec.capacityLimitationType && spec.capacityLimitationType !== "none"
        ? spec.capacityLimitationType === "percentage"
          ? number(spec.capacityLimitationValue, "%")
          : number(spec.capacityLimitationValue, "m³/day")
        : null;
    return (
      <div className="si">
        <Header
          kind="pipe"
          colour={PIPE_COLOUR}
          eyebrow="Pipe"
          name={selected.label || `${selected.sourceLabel} → ${selected.targetLabel}`}
          status={selected.status}
        />
        <Actions readOnly={readOnly} onEdit={onEdit} onZoom={onZoom} onDelete={onDelete} />

        <section className="si__section">
          <h4 className="si__section-title">Connection</h4>
          <div className="si__route">
            <span className="si__route-end" title={selected.sourceLabel}>{selected.sourceLabel || "—"}</span>
            <ArrowRight size={14} className="si__route-arrow" aria-hidden="true" />
            <span className="si__route-end" title={selected.targetLabel}>{selected.targetLabel || "—"}</span>
          </div>
          {spec.bidirectional && <span className="si__tag">Bidirectional</span>}
        </section>

        <Section
          title="Pipeline"
          rows={[
            ["Capacity", number(spec.capacity, "m³/day")],
            ["Design capacity", number(spec.designCapacity, "m³/day")],
            ["Max capacity", number(spec.maximumCapacity, "m³/day")],
            ["Length", number(spec.pipelineLength, "km")],
            ["Diameter", number(spec.pipelineDiameter, "mm")],
            ["Material", MATERIALS[spec.pipelineMaterial] || spec.pipelineMaterial],
            ["Source", spec.infraSource],
            ["Capacity limit", limit],
          ]}
        />
        <Section
          title="Transmission"
          rows={[
            ["System", systemName(spec.transmissionSystemId)],
            ["Line", lineName(spec.lineGroupIds)],
          ]}
        />
        <Section
          title="Lifecycle"
          rows={[
            ["Active", yesNo(selected.active)],
            ["Commissioned", formatDate(selected.commissioningDate)],
            ["Decommissioned", formatDate(selected.decommissioningDate)],
          ]}
        />
        <Section title="Other properties" rows={otherSpecRows(spec)} />
      </div>
    );
  }

  // ── Note / group box ──────────────────────────────────────────────────────
  if (selected.type === "note" || selected.type === "group-box") {
    const isNote = selected.type === "note";
    return (
      <div className="si">
        <Header
          kind={selected.type}
          colour="var(--amber, #f59e0b)"
          eyebrow={isNote ? "Note" : "Group box"}
          name={isNote ? "Sticky note" : selected.label || "Group"}
        />
        <Actions readOnly={readOnly} onEdit={isNote ? null : onEdit} onZoom={onZoom} onDelete={onDelete} />
        {isNote ? (
          <p className="si__hint">Click inside the note on the canvas to edit its text.</p>
        ) : (
          <Section title="Group box" rows={[["Label", selected.label]]} />
        )}
      </div>
    );
  }

  // ── Asset / junction ──────────────────────────────────────────────────────
  const kind = selected.type || selected.category;
  const meta = selected.meta || {};
  const spec = meta.specifications || {};
  const coords =
    Number.isFinite(meta.latitude) && Number.isFinite(meta.longitude)
      ? `${Number(meta.latitude).toFixed(5)}, ${Number(meta.longitude).toFixed(5)}`
      : null;
  const plantLimit = (() => {
    const mode = spec.capacity_limit_mode;
    if (!mode || mode === "none") return null;
    return mode === "percentage" ? number(spec.capacity_limit_percentage, "% of design") : number(spec.capacity_limit_absolute, "m³/day");
  })();
  const hpLimit =
    spec.capacity_limitation_type && spec.capacity_limitation_type !== "none"
      ? number(spec.capacity_limitation_value, spec.capacity_limitation_type === "percentage" ? "%" : "m³/day")
      : null;

  return (
    <div className="si">
      <Header
        kind={kind}
        colour={ENTITY_TYPE_COLORS[kind] || "#94a3b8"}
        eyebrow={TYPE_LABELS[kind] || humanize(kind || "asset")}
        name={selected.label || selected.assetId || (kind === "node" ? "Junction" : "Unnamed asset")}
        status={kind === "node" ? undefined : selected.status}
        id={selected.assetId}
      />
      <Actions readOnly={readOnly} onEdit={onEdit} onZoom={onZoom} onDelete={onDelete} />

      <Section
        title="General"
        rows={[
          ["Region", meta.region],
          ["Cluster", meta.cluster],
          ["Asset type", meta.asset_type && humanize(meta.asset_type)],
          ["Entity category", meta.entity_category],
          ["Active", yesNo(meta.active)],
          ["Coordinates", coords],
          ["Commissioned", formatDate(meta.commissioning_date)],
          ["Decommissioned", formatDate(meta.decommissioning_date)],
        ]}
      />

      {(kind === "plant" || kind === "stp") && (
        <Section
          title="Capacity & process"
          rows={[
            ["Design capacity", number(spec.design_capacity, "m³/day")],
            ["Maximum capacity", number(spec.maximum_capacity, "m³/day")],
            ["Contracted capacity", number(spec.contracted_capacity, "m³/day")],
            ["Capacity limit", plantLimit],
            ["Plant type", spec.plant_type],
            ["Water source", spec.water_source],
            ["Technology", spec.technology],
            ["Treatment level", spec.treatment_level],
            ["Variable O&M", number(spec.variable_om, "SAR/m³")],
          ]}
        />
      )}

      {kind === "pump" && Array.isArray(spec.pumps) && spec.pumps.length > 0 && (
        <section className="si__section">
          <h4 className="si__section-title">Pumps ({spec.pumps.length})</h4>
          <ul className="si__pumps">
            {spec.pumps.map((pump, index) => (
              <li key={pump.id || index} className="si__pump">
                <span className="si__pump-name">{pump.name || `Pump ${index + 1}`}</span>
                <span className="si__muted">{number(pump.capacity_m3_day, "m³/day") || "—"}</span>
                <span className={`si__status si__status--${pump.role === "backup" ? "acc" : "ok"}`}>
                  {pump.role === "backup" ? "Backup" : "Duty"}
                </span>
                {pump.active === false && <span className="si__status si__status--off">Off</span>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {kind === "tank" && (
        <Section
          title="Storage"
          rows={[
            ["Total capacity", number(spec.total_capacity_m3, "m³")],
            ["Number of tanks", number(spec.number_tanks)],
            ["Material", spec.storage_material],
            ["Source", spec.source],
            ["Transmission system", spec.transmission_system_name || systemName(spec.transmission_system_id)],
          ]}
        />
      )}

      {kind === "handover_point" && (
        <Section
          title="Delivery"
          rows={[
            ["Capacity", number(spec.design_capacity, "m³/day")],
            ["Capacity limit", hpLimit],
          ]}
        />
      )}

      <Section title="Other properties" rows={otherSpecRows(spec)} />
    </div>
  );
}
