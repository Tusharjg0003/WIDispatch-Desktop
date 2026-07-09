import React from "react";
import { Field } from "./AssetFormControls";

const PLANT_CATEGORIES = [
  { value: "production", label: "Production Plant" },
  { value: "treatment", label: "Treatment Plant" },
];

const PLANT_TYPES = [
  { value: "seawater_desalination", label: "Seawater Desalination" },
  { value: "water_purification", label: "Water Purification" },
];

// Years between commissioning and decommissioning, or null if either date is
// missing/invalid. Purely a display value — never sent to the backend.
function projectLifetimeYears(commissioning, decommissioning) {
  if (!commissioning || !decommissioning) return null;
  const start = new Date(commissioning).getTime();
  const end = new Date(decommissioning).getTime();
  if (Number.isNaN(start) || Number.isNaN(end) || end <= start) return null;
  const years = (end - start) / (1000 * 60 * 60 * 24 * 365.25);
  return Math.round(years * 10) / 10;
}

// Plant-specific fields shown in CreateAssetForm when category === "plant".
// `spec` holds the plant's `specifications` object; `set(key)` returns an
// onChange handler that writes into it. `commissioningDate`/`decommissioningDate`
// come from the common Lifecycle section, for the computed Project Lifetime.
export default function PlantFields({ spec, set, commissioningDate, decommissioningDate }) {
  const category = spec.plant_category || "";
  const lifetime = projectLifetimeYears(commissioningDate, decommissioningDate);

  return (
    <>
      <div className="af__section">Plant Category</div>
      <div className="af__grid">
        <Field label="Plant Category *">
          <select value={category} onChange={set("plant_category")} required>
            <option value="" disabled>Select category</option>
            {PLANT_CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
        </Field>
      </div>

      {category === "production" && (
        <>
          <div className="af__section">Production Plant</div>
          <div className="af__grid">
            <Field label="Plant Type *">
              <select value={spec.plant_type || ""} onChange={set("plant_type")} required>
                <option value="" disabled>Select plant type</option>
                {PLANT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </Field>
            <Field label="PSID"><input value={spec.psid || ""} onChange={set("psid")} /></Field>
            <Field label="Dispatch ID"><input value={spec.dispatch_id || ""} onChange={set("dispatch_id")} /></Field>
            <Field label="Production System"><input value={spec.production_system || ""} onChange={set("production_system")} /></Field>
            <Field label="Water Source"><input value={spec.water_source || ""} onChange={set("water_source")} placeholder="e.g. Seawater" /></Field>
            <Field label="Technology"><input value={spec.technology || ""} onChange={set("technology")} placeholder="e.g. RO" /></Field>
            <Field label="Design Capacity (m³/day)"><input type="number" step="any" value={spec.design_capacity ?? ""} onChange={set("design_capacity")} /></Field>
            <Field label="Maximum Capacity (m³/day)"><input type="number" step="any" value={spec.maximum_capacity ?? ""} onChange={set("maximum_capacity")} /></Field>
            <Field label="Contracted Capacity (m³/day)"><input type="number" step="any" value={spec.contracted_capacity ?? ""} onChange={set("contracted_capacity")} /></Field>
            <Field label="Fund Status"><input value={spec.fund_status || ""} onChange={set("fund_status")} /></Field>
            <Field label="Plant Manager Name"><input value={spec.plant_manager_name || ""} onChange={set("plant_manager_name")} /></Field>
            <Field label="Phone Number"><input type="tel" value={spec.phone_number || ""} onChange={set("phone_number")} /></Field>
            <Field label="Source"><input value={spec.source || ""} onChange={set("source")} /></Field>
          </div>

          <div className="af__section">Financial</div>
          <div className="af__grid">
            <Field label="CCR (SAR/month)"><input type="number" step="any" value={spec.ccr ?? ""} onChange={set("ccr")} /></Field>
            <Field label="Fixed O&M (SAR/month)"><input type="number" step="any" value={spec.fixed_om ?? ""} onChange={set("fixed_om")} /></Field>
            <Field label="Variable O&M (SAR/m³)"><input type="number" step="any" value={spec.variable_om ?? ""} onChange={set("variable_om")} /></Field>
            <Field label="CAPEX (SAR)"><input type="number" step="any" value={spec.capex ?? ""} onChange={set("capex")} /></Field>
            <Field label="Project Lifetime (years)">
              <input type="text" value={lifetime != null ? lifetime : "—"} disabled />
            </Field>
          </div>
        </>
      )}

      {category === "treatment" && (
        <>
          <div className="af__section">Treatment Plant</div>
          <div className="af__grid">
            <Field label="Maximum Capacity (m³/day)"><input type="number" step="any" value={spec.maximum_capacity ?? ""} onChange={set("maximum_capacity")} /></Field>
            <Field label="Expansion Date"><input type="date" value={spec.expansion_date || ""} onChange={set("expansion_date")} /></Field>
            <Field label="Treatment Level"><input value={spec.treatment_level || ""} onChange={set("treatment_level")} /></Field>
            <Field label="Design Capacity (m³/day)"><input type="number" step="any" value={spec.design_capacity ?? ""} onChange={set("design_capacity")} /></Field>
            <Field label="Expansion Capacity (m³/day)"><input type="number" step="any" value={spec.expansion_capacity ?? ""} onChange={set("expansion_capacity")} /></Field>
            <Field label="Source"><input value={spec.source || ""} onChange={set("source")} /></Field>
          </div>
        </>
      )}
    </>
  );
}
