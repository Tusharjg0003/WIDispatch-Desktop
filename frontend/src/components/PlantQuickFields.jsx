import React from "react";
import { Field } from "./AssetFormControls";

const PLANT_TYPES = [
  { value: "desalination", label: "Desalination" },
  { value: "purification", label: "Purification" },
  { value: "treatment", label: "Treatment" },
];

// The "Plant-specific" section of NetworkEntityCreateModal (the Network
// Builder quick-add flow). `spec` holds the plant's `specifications`
// object; `set(key)` returns an onChange handler that writes into it —
// same calling convention as PlantFields.jsx.
export default function PlantQuickFields({ spec, set }) {
  return (
    <>
      <div className="af__section">Plant-specific</div>
      <div className="af__grid">
        <Field label="Plant Type">
          <select value={spec.plant_type || ""} onChange={set("plant_type")}>
            <option value="">—</option>
            {PLANT_TYPES.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </Field>
        <Field label="Technology">
          <input value={spec.technology || ""} onChange={set("technology")} placeholder="e.g. RO" />
        </Field>
        <Field label="Water Source">
          <input value={spec.water_source || ""} onChange={set("water_source")} placeholder="e.g. Seawater" />
        </Field>
        <Field label="Variable O&M (SAR/m³)">
          <input type="number" step="any" value={spec.variable_om ?? ""} onChange={set("variable_om")} />
        </Field>
      </div>
    </>
  );
}
