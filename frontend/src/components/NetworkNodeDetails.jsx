import React, { useEffect, useState } from "react";
import { ENTITY_TYPE_LABELS } from "../cytoscape/buildCyStyle";
import { lineBelongsToSystem } from "../lib/transmissionLines";
import { Switch } from "./AssetFormControls";
import TransmissionLinePicker from "./TransmissionLinePicker";
import {
  IconDroplet,
  IconPipe,
  IconPlant,
  IconStorageTank,
  IconTarget,
} from "./IconAssets";

const MATERIALS = [
  { value: "steel", label: "Steel" },
  { value: "ductile_iron", label: "Ductile Iron" },
  { value: "hdpe", label: "HDPE" },
  { value: "concrete", label: "Concrete" },
  { value: "pvc", label: "PVC" },
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

const LIFECYCLE_LEGEND = [
  { key: "planned", label: "Planned" },
  { key: "operational", label: "Operational" },
  { key: "construction", label: "Under construction" },
  { key: "inactive", label: "Inactive" },
];

const ASSET_LEGEND = [
  { key: "plant", label: "Plant", icon: IconPlant },
  { key: "tank", label: "Tank", icon: IconStorageTank },
  { key: "handover", label: "Handover point", icon: IconTarget },
  { key: "pump", label: "Pump station", icon: IconDroplet },
  { key: "junction", label: "Junction", dot: true },
  { key: "pipe", label: "Pipe", icon: IconPipe },
];

const RUN_OVERLAY_LEGEND = [
  { key: "capacity", label: "Capacity-limited", tone: "capacity" },
  { key: "utilisation", label: "High utilisation", tone: "utilisation" },
  { key: "bottleneck", label: "Bottleneck", tone: "bottleneck" },
  { key: "shortage", label: "Shortage point", tone: "shortage", dashed: true },
];

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

function CanvasLegend() {
  return (
    <div className="ns2-legend" aria-label="Canvas legend">
      <div className="ns2-legend__title">Canvas Legend</div>

      <section className="ns2-legend__section">
        <div className="ns2-legend__section-title">Lifecycle</div>
        <div className="ns2-legend__grid">
          {LIFECYCLE_LEGEND.map((item) => (
            <div className="ns2-legend__item" key={item.key} title={item.label}>
              <span
                aria-hidden="true"
                className={`ns2-legend__status ns2-legend__status--${item.key}`}
              />
              <span className="ns2-legend__label">{item.label}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="ns2-legend__section">
        <div className="ns2-legend__section-title">Assets</div>
        <div className="ns2-legend__grid">
          {ASSET_LEGEND.map((item) => {
            const Icon = item.icon;
            return (
              <div className="ns2-legend__item" key={item.key} title={item.label}>
                <span className="ns2-legend__asset" aria-hidden="true">
                  {Icon ? (
                    <Icon size={13} />
                  ) : item.dot ? (
                    <span className="ns2-legend__junction" />
                  ) : (
                    <span className="ns2-legend__asset-text">{item.text}</span>
                  )}
                </span>
                <span className="ns2-legend__label">{item.label}</span>
              </div>
            );
          })}
        </div>
      </section>

      <section className="ns2-legend__section">
        <div className="ns2-legend__section-title">Run overlays</div>
        <div className="ns2-legend__grid">
          {RUN_OVERLAY_LEGEND.map((item) => (
            <div className="ns2-legend__item" key={item.key} title={item.label}>
              <span
                aria-hidden="true"
                className={`ns2-legend__line ns2-legend__line--${item.tone}${item.dashed ? " ns2-legend__line--dashed" : ""}`}
              />
              <span className="ns2-legend__label">{item.label}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

// Right-panel inspector for the selected canvas element. `selected` is a plain
// object of the element's cytoscape data plus `_group` ("node" | "edge").
export default function NetworkNodeDetails({
  selected, systems, lines,
  onLabelChange, onSpecChange, onSpecBooleanChange, onSpecArrayChange,
  onEdgeFieldChange, onActiveChange, onCreateLine, onDelete, onNodeSpecChange,
}) {
  const [lineDraft, setLineDraft] = useState({
    newLineName: "",
    isBranch: false,
    parentLineId: "",
    branchName: "",
  });
  const [lineSaving, setLineSaving] = useState(false);
  const [lineError, setLineError] = useState(null);

  useEffect(() => {
    setLineDraft({ newLineName: "", isBranch: false, parentLineId: "", branchName: "" });
    setLineError(null);
  }, [selected?.id]);

  const setLineDraftField = (key, value) => setLineDraft((draft) => ({ ...draft, [key]: value }));

  if (!selected) {
    return (
      <div className="nnd nnd--empty">
        <CanvasLegend />
      </div>
    );
  }

  if (selected._group === "edge") {
    const pipeSpec = selected.meta?.specifications || {};
    const systemLines = pipeSpec.transmissionSystemId
      ? lines.filter((line) => lineBelongsToSystem(line, pipeSpec.transmissionSystemId))
      : [];
    const createLineForPipe = async () => {
      const lineName = lineDraft.isBranch
        ? lineDraft.newLineName.trim() || lineDraft.branchName.trim()
        : lineDraft.newLineName.trim();
      if (!onCreateLine || !lineName) return;
      if (!pipeSpec.transmissionSystemId) {
        setLineError("Choose a transmission system before adding a line.");
        return;
      }
      if (lineDraft.isBranch && !lineDraft.parentLineId) {
        setLineError("Choose a parent line before creating a branch.");
        return;
      }
      setLineSaving(true);
      setLineError(null);
      try {
        const created = await onCreateLine({
          name: lineName,
          systemId: pipeSpec.transmissionSystemId,
          isBranch: lineDraft.isBranch,
          parentLineId: lineDraft.isBranch ? lineDraft.parentLineId || null : null,
          branchName: lineDraft.isBranch ? lineDraft.branchName.trim() || lineName : null,
        });
        onSpecArrayChange("lineGroupIds", [created.id]);
        setLineDraft({ newLineName: "", isBranch: false, parentLineId: "", branchName: "" });
      } catch (err) {
        setLineError(err.message || "Failed to add line");
      } finally {
        setLineSaving(false);
      }
    };

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
              onChange={(e) => {
                onSpecChange("transmissionSystemId", e.target.value);
                onSpecArrayChange("lineGroupIds", []);
                setLineDraft({ newLineName: "", isBranch: false, parentLineId: "", branchName: "" });
                setLineError(null);
              }}
            >
              <option value="">—</option>
              {systems.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </label>
          <TransmissionLinePicker
            lines={systemLines}
            selectedIds={pipeSpec.lineGroupIds || []}
            onSelectedIdsChange={(ids) => onSpecArrayChange("lineGroupIds", ids.slice(0, 1))}
            newLineName={lineDraft.newLineName}
            onNewLineNameChange={(value) => setLineDraftField("newLineName", value)}
            isBranch={lineDraft.isBranch}
            onIsBranchChange={(checked) => setLineDraftField("isBranch", checked)}
            parentLineId={lineDraft.parentLineId}
            onParentLineIdChange={(value) => setLineDraftField("parentLineId", value)}
            branchName={lineDraft.branchName}
            onBranchNameChange={(value) => setLineDraftField("branchName", value)}
            onCreateLine={createLineForPipe}
            creating={lineSaving}
            createError={lineError}
            emptyMessage={
              pipeSpec.transmissionSystemId
                ? "No saved transmission lines for this system yet."
                : "Choose a transmission system before selecting or adding lines."
            }
          />

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
          <dl className="adr__list">
            <Row label={isNote ? "Text" : "Label"} value={selected.label} />
          </dl>
        </div>
      </div>
    );
  }

  const spec = selected.meta?.specifications || {};
  const meta = selected.meta || {};
  const setTankTransmissionSystem = (id) => {
    const system = systems.find((candidate) => candidate.id === id);
    onNodeSpecChange?.("transmission_system_id", system?.id || "");
    onNodeSpecChange?.("transmission_system_name", system?.name || "");
  };
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
        <div className="af__section">Asset</div>
        <dl className="adr__list">
          <Row label="Label" value={selected.label} />
          <Row label="Status" value={statusLabel(selected.status)} />
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

        {selected.category === "tank" && (
          <>
            <div className="af__section">Tank Specifications</div>
            {onNodeSpecChange && (
              <label className="af__field nnd__field">
                Transmission System
                <select
                  value={spec.transmission_system_id || ""}
                  onChange={(e) => setTankTransmissionSystem(e.target.value)}
                >
                  <option value="">Unassigned</option>
                  {systems.map((system) => (
                    <option key={system.id} value={system.id}>{system.name || system.id}</option>
                  ))}
                </select>
              </label>
            )}
            <dl className="adr__list">
              <Row label="Total capacity (m³)" value={spec.total_capacity_m3} />
              <Row label="Number of tanks" value={spec.number_tanks} />
              <Row label="Storage material" value={spec.storage_material} />
              <Row label="Source" value={spec.source} />
              <Row label="Transmission system ID" value={spec.transmission_system_id} />
              <Row label="Transmission system name" value={spec.transmission_system_name} />
            </dl>
          </>
        )}

        {selected.category === "handover_point" && Object.keys(spec).length > 0 && (
          <>
            <div className="af__section">Specifications</div>
            <dl className="adr__list">
              <Row label="Capacity (m³/day)" value={spec.design_capacity} />
              <Row
                label="Capacity limitation"
                value={
                  spec.capacity_limitation_type && spec.capacity_limitation_type !== "none"
                    ? `${spec.capacity_limitation_value ?? "—"}${spec.capacity_limitation_type === "percentage" ? "%" : " m³/day"}`
                    : spec.capacity_limitation_type === "none"
                    ? "None"
                    : null
                }
              />
            </dl>
          </>
        )}
      </div>
    </div>
  );
}
