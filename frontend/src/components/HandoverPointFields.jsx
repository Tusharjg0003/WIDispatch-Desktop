import React from "react";
import { Field } from "./AssetFormControls";

const LIMITATION_TYPES = [
  { value: "none", label: "None" },
  { value: "percentage", label: "Percentage (%)" },
  { value: "absolute", label: "Absolute (m³/day)" },
];

// Handover-Point-specific fields shown in CreateAssetForm when
// category === "handover_point". `spec` holds the asset's `specifications`
// object; `set(key)` returns an onChange handler that writes into it,
// same contract as PlantFields/PumpStationFields.
export default function HandoverPointFields({ spec, set }) {
  const limitationType = spec.capacity_limitation_type || "none";

  return (
    <>
      <div className="af__section">Capacity</div>
      <div className="af__grid">
        <Field label="Capacity (m³/day)">
          <input
            type="number" min="0" step="any" placeholder="e.g. 50000"
            value={spec.design_capacity ?? ""} onChange={set("design_capacity")}
          />
        </Field>
      </div>

      <div className="af__section">Capacity Limitation</div>
      <div className="af__grid">
        <Field label="Capacity Limitation">
          <div className="af__radio-group">
            {LIMITATION_TYPES.map((t) => (
              <label key={t.value} className="af__radio">
                <input
                  type="radio"
                  name="capacity_limitation_type"
                  value={t.value}
                  checked={limitationType === t.value}
                  onChange={set("capacity_limitation_type")}
                />
                {t.label}
              </label>
            ))}
          </div>
        </Field>
        {limitationType !== "none" && (
          <Field label="Capacity Limitation Value">
            <input
              type="number" step="any"
              value={spec.capacity_limitation_value ?? ""}
              onChange={set("capacity_limitation_value")}
            />
          </Field>
        )}
      </div>
    </>
  );
}
