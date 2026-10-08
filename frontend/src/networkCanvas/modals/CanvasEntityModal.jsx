import React, { useMemo, useState } from "react";
import FloatingPanel from "../../components/FloatingPanel";
import { Field, Toggle } from "../../components/AssetFormControls";

// Canvas entity editor — port of SWIIMS NetworkSimulation2Page's entity modal
// (`entityFormFields`). Edits the canvas node itself: name, category, status,
// capacity and limitation, region, activity, asset type, lifecycle dates,
// active flag; plant details; a pump station's pump list; tank storage; and a
// note / group box's size and format. Registry-backed assets keep their
// assetId — edits here are the canvas's working values for this network.
//
// `onSubmit(patch)` receives { label, status, meta, ...annotationFields }.

export const ENTITY_STATUSES = ["operational", "maintenance", "under_construction", "planned", "decommissioned", "inactive"];
const LIMIT_MODES = [
  { value: "none", label: "None" },
  { value: "percentage", label: "Percentage" },
  { value: "absolute", label: "Absolute (m³/day)" },
];
const TITLES = {
  plant: "Plant",
  pump: "Pump Station",
  tank: "Tank",
  handover_point: "Handover Point",
  filling_station: "Filling Station",
  stp: "Treatment Plant",
  node: "Junction",
  note: "Note",
  "group-box": "Group Box",
};
const statusLabel = (s) => s.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
const str = (v) => (v == null ? "" : String(v));
const numOrNull = (v) => (v === "" || v == null || !Number.isFinite(Number(v)) ? null : Number(v));

function initialForm(data) {
  const meta = data?.meta || {};
  const spec = meta.specifications || {};
  return {
    label: str(data?.label),
    status: str(data?.status),
    entity_category: str(meta.entity_category),
    capacity: str(spec.design_capacity ?? spec.capacity ?? spec.contracted_capacity),
    capacity_limit_mode: str(spec.capacity_limit_mode || spec.capacityLimitationType || "none"),
    capacity_limit_percentage: str(spec.capacity_limit_percentage),
    capacity_limit_absolute: str(spec.capacity_limit_absolute ?? spec.capacityLimitationValue),
    region: str(meta.region),
    activity: str(meta.activity),
    asset_type: str(meta.asset_type),
    commissioning_date: str(meta.commissioning_date).slice(0, 10),
    decommissioning_date: str(meta.decommissioning_date).slice(0, 10),
    active: meta.active !== false,
    plant_type: str(spec.plant_type),
    technology: str(spec.technology),
    water_source: str(spec.water_source),
    variable_om: str(spec.variable_om_sar_m3),
    total_capacity_m3: str(spec.total_capacity_m3),
    number_tanks: str(spec.number_tanks),
    pumps: Array.isArray(spec.pumps)
      ? spec.pumps.map((p) => ({ name: str(p.name), capacity_m3_day: str(p.capacity_m3_day), role: str(p.role || "functional"), on: p.on !== false }))
      : [],
    boxWidth: str(data?.boxWidth),
    boxHeight: str(data?.boxHeight),
    noteFont: str(data?.noteFont || "sans"),
    noteSize: str(data?.noteSize || "normal"),
  };
}

export default function CanvasEntityModal({ type, data = null, mode = "edit", onCancel, onSubmit }) {
  const [form, setForm] = useState(() => initialForm(data));
  const [error, setError] = useState(null);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const isAnnotation = type === "note" || type === "group-box";
  const isJunction = type === "node";
  const isPlant = type === "plant" || type === "stp";
  const isPump = type === "pump";
  const isTank = type === "tank";
  const title = useMemo(() => `${mode === "create" ? "Add" : "Edit"} ${TITLES[type] || "Asset"}`, [mode, type]);

  const setPump = (i, key, value) =>
    setForm((f) => ({ ...f, pumps: f.pumps.map((p, idx) => (idx === i ? { ...p, [key]: value } : p)) }));

  const submit = (event) => {
    event.preventDefault();
    if (!isAnnotation && !isJunction && !form.label.trim()) {
      setError("Name is required.");
      return;
    }
    const meta = { ...(data?.meta || {}) };
    if (isAnnotation) {
      onSubmit({
        label: form.label,
        boxWidth: numOrNull(form.boxWidth) ?? undefined,
        boxHeight: numOrNull(form.boxHeight) ?? undefined,
        noteFont: type === "note" ? form.noteFont : undefined,
        noteSize: type === "note" ? form.noteSize : undefined,
      });
      return;
    }
    const spec = { ...(meta.specifications || {}) };
    spec.design_capacity = numOrNull(form.capacity);
    spec.capacity_limit_mode = form.capacity_limit_mode;
    spec.capacity_limit_percentage = form.capacity_limit_mode === "percentage" ? numOrNull(form.capacity_limit_percentage) : null;
    spec.capacity_limit_absolute = form.capacity_limit_mode === "absolute" ? numOrNull(form.capacity_limit_absolute) : null;
    if (isPlant) {
      spec.plant_type = form.plant_type || null;
      spec.technology = form.technology || null;
      spec.water_source = form.water_source || null;
      spec.variable_om_sar_m3 = numOrNull(form.variable_om);
    }
    if (isTank) {
      spec.total_capacity_m3 = numOrNull(form.total_capacity_m3);
      spec.number_tanks = numOrNull(form.number_tanks);
    }
    if (isPump) {
      const pumps = form.pumps.map((p) => ({ name: p.name, capacity_m3_day: numOrNull(p.capacity_m3_day), role: p.role, on: p.on }));
      spec.pumps = pumps;
      spec.active_pumps = pumps.filter((p) => p.role === "functional" && p.on);
      spec.standby_pumps = pumps.filter((p) => p.role === "backup");
    }
    onSubmit({
      label: form.label.trim(),
      status: form.status,
      meta: {
        ...meta,
        entity_category: form.entity_category || null,
        region: form.region || null,
        activity: form.activity || null,
        asset_type: form.asset_type || null,
        commissioning_date: form.commissioning_date || null,
        decommissioning_date: form.decommissioning_date || null,
        active: form.active,
        specifications: spec,
      },
    });
  };

  return (
    <FloatingPanel
      title={title}
      onClose={onCancel}
      storageKey="canvas-form"
      className="nb-entity-modal"
    >
      <form className="af__body" onSubmit={submit}>
        {isAnnotation ? (
          <div className="af__grid">
            <Field label={type === "note" ? "Text" : "Name"}>
              <input type="text" value={form.label} onChange={set("label")} autoFocus />
            </Field>
            <Field label="Box Width">
              <input type="number" min="40" step="10" value={form.boxWidth} onChange={set("boxWidth")} />
            </Field>
            <Field label="Box Height">
              <input type="number" min="30" step="10" value={form.boxHeight} onChange={set("boxHeight")} />
            </Field>
            {type === "note" && (
              <>
                <Field label="Font">
                  <select value={form.noteFont} onChange={set("noteFont")}>
                    <option value="sans">Sans</option>
                    <option value="serif">Serif</option>
                    <option value="mono">Mono</option>
                  </select>
                </Field>
                <Field label="Size">
                  <select value={form.noteSize} onChange={set("noteSize")}>
                    {["small", "normal", "large", "xlarge"].map((s) => <option key={s} value={s}>{statusLabel(s)}</option>)}
                  </select>
                </Field>
              </>
            )}
          </div>
        ) : (
          <>
            <div className="af__grid">
              <Field label={isJunction ? "Name" : "Name *"}>
                <input type="text" value={form.label} onChange={set("label")} autoFocus required={!isJunction} />
              </Field>
              {!isJunction && (
                <>
                  <Field label="Entity Category">
                    <input type="text" value={form.entity_category} onChange={set("entity_category")} />
                  </Field>
                  <Field label="Status">
                    <select value={form.status} onChange={set("status")}>
                      <option value="">Auto (from lifecycle dates)</option>
                      {ENTITY_STATUSES.map((s) => <option key={s} value={s}>{statusLabel(s)}</option>)}
                    </select>
                  </Field>
                  <Field label="Capacity (m³/day)">
                    <input type="number" step="any" value={form.capacity} onChange={set("capacity")} />
                  </Field>
                  <Field label="Capacity Limitation">
                    <select value={form.capacity_limit_mode} onChange={set("capacity_limit_mode")}>
                      {LIMIT_MODES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                    </select>
                  </Field>
                  {form.capacity_limit_mode === "percentage" && (
                    <Field label="Limit (%)">
                      <input type="number" min="0" max="100" step="any" value={form.capacity_limit_percentage} onChange={set("capacity_limit_percentage")} />
                    </Field>
                  )}
                  {form.capacity_limit_mode === "absolute" && (
                    <Field label="Limit (m³/day)">
                      <input type="number" min="0" step="any" value={form.capacity_limit_absolute} onChange={set("capacity_limit_absolute")} />
                    </Field>
                  )}
                  <Field label="Region">
                    <input type="text" value={form.region} onChange={set("region")} />
                  </Field>
                  <Field label="Activity">
                    <input type="text" value={form.activity} onChange={set("activity")} />
                  </Field>
                  <Field label="Asset Type">
                    <input type="text" value={form.asset_type} onChange={set("asset_type")} />
                  </Field>
                  <Field label="Commissioning Date">
                    <input type="date" value={form.commissioning_date} onChange={set("commissioning_date")} />
                  </Field>
                  <Field label="Decommissioning Date">
                    <input type="date" value={form.decommissioning_date} onChange={set("decommissioning_date")} />
                  </Field>
                  <Toggle label="Active" checked={form.active} onChange={(v) => setForm((f) => ({ ...f, active: v }))} />
                </>
              )}
            </div>

            {isPlant && (
              <>
                <div className="af__section">Plant Details</div>
                <div className="af__grid">
                  <Field label="Plant Type"><input type="text" value={form.plant_type} onChange={set("plant_type")} /></Field>
                  <Field label="Technology"><input type="text" value={form.technology} onChange={set("technology")} /></Field>
                  <Field label="Water Source"><input type="text" value={form.water_source} onChange={set("water_source")} /></Field>
                  <Field label="Variable O&M (SAR/m³)"><input type="number" step="any" value={form.variable_om} onChange={set("variable_om")} /></Field>
                </div>
              </>
            )}

            {isTank && (
              <>
                <div className="af__section">Storage</div>
                <div className="af__grid">
                  <Field label="Total Capacity (m³)"><input type="number" step="any" value={form.total_capacity_m3} onChange={set("total_capacity_m3")} /></Field>
                  <Field label="Number of Tanks"><input type="number" step="1" value={form.number_tanks} onChange={set("number_tanks")} /></Field>
                </div>
              </>
            )}

            {isPump && (
              <>
                <div className="af__section">Pumps</div>
                <table className="cr-table nb-entity-modal__pumps">
                  <thead>
                    <tr><th>Name</th><th className="num">Capacity (m³/day)</th><th>Role</th><th>On</th><th /></tr>
                  </thead>
                  <tbody>
                    {form.pumps.map((pump, i) => (
                      <tr key={i}>
                        <td><input className="cr-input" value={pump.name} onChange={(e) => setPump(i, "name", e.target.value)} aria-label={`Pump ${i + 1} name`} /></td>
                        <td><input className="cr-input" type="number" step="any" value={pump.capacity_m3_day} onChange={(e) => setPump(i, "capacity_m3_day", e.target.value)} aria-label={`Pump ${i + 1} capacity`} /></td>
                        <td>
                          <select className="cr-select" value={pump.role} onChange={(e) => setPump(i, "role", e.target.value)} aria-label={`Pump ${i + 1} role`}>
                            <option value="functional">Functional</option>
                            <option value="backup">Backup</option>
                          </select>
                        </td>
                        <td><input type="checkbox" checked={pump.on} onChange={(e) => setPump(i, "on", e.target.checked)} aria-label={`Pump ${i + 1} on`} /></td>
                        <td>
                          <button type="button" className="cr-btn cr-btn--sm" onClick={() => setForm((f) => ({ ...f, pumps: f.pumps.filter((_, idx) => idx !== i) }))}>Remove</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <button
                  type="button"
                  className="cr-btn cr-btn--sm"
                  style={{ marginTop: 6 }}
                  onClick={() => setForm((f) => ({ ...f, pumps: [...f.pumps, { name: `Pump ${f.pumps.length + 1}`, capacity_m3_day: "", role: "functional", on: true }] }))}
                >
                  + Add pump
                </button>
              </>
            )}
          </>
        )}

        {error && <div className="af__error">{error}</div>}
        <div className="af__footer">
          <button type="button" className="af__btn af__btn--ghost" onClick={onCancel}>Cancel</button>
          <button type="submit" className="af__btn af__btn--primary">{mode === "create" ? "Add" : "Save"}</button>
        </div>
      </form>
    </FloatingPanel>
  );
}
