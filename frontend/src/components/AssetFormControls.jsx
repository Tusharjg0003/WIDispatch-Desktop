import React from "react";

// Shared bits reused by CreateAssetForm, PlantFields and PumpStationFields.

export function Field({ label, children }) {
  return (
    <label className="af__field">
      <span>{label}</span>
      {children}
    </label>
  );
}

// Bare switch control (no field wrapper) — usable inline, e.g. in a table row.
export function Switch({ checked, onChange, onLabel = "Active", offLabel = "Inactive" }) {
  return (
    <span className="af__toggle" data-on={checked}>
      <input type="checkbox" checked={!!checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="af__toggle-track">
        <span className="af__toggle-thumb" />
      </span>
      <span className="af__toggle-label">{checked ? onLabel : offLabel}</span>
    </span>
  );
}

export function Toggle({ label, checked, onChange, onLabel, offLabel }) {
  return (
    <label className="af__field af__field--toggle">
      <span>{label}</span>
      <Switch checked={checked} onChange={onChange} onLabel={onLabel} offLabel={offLabel} />
    </label>
  );
}
