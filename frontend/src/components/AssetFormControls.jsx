import React from "react";

// Shared bits reused by CreateAssetForm, PlantFields and PumpStationFields.

export function Field({ label, children }) {
  return (
    <div className="form-group af__field">
      <label>{label}</label>
      {children}
    </div>
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
    <div className="form-group af__field af__field--toggle">
      <label>{label}</label>
      <Switch checked={checked} onChange={onChange} onLabel={onLabel} offLabel={offLabel} />
    </div>
  );
}
