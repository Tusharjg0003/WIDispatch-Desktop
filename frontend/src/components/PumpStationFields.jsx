import React from "react";
import { Switch } from "./AssetFormControls";

const emptyPump = (role) => ({
  id: `p_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
  name: "",
  capacity_m3_day: "",
  role,
  active: true,
});

// Repeatable "Pump Configuration" list for a Pump Station asset. `pumps` is
// the array stored at specifications.pumps; `setPumps` replaces the array.
export default function PumpStationFields({ pumps, setPumps }) {
  const addPump = (role) => setPumps([...pumps, emptyPump(role)]);
  const updatePump = (id, patch) => setPumps(pumps.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  const removePump = (id) => setPumps(pumps.filter((p) => p.id !== id));

  return (
    <div className="form-section">
      <h3>Pump Configuration</h3>
      <div className="af__pump-list">
        {pumps.length === 0 && <p className="af__pump-empty">No pumps added yet.</p>}
        {pumps.map((p) => (
          <div key={p.id} className="af__pump-row">
            <input
              type="text"
              className="af__pump-name"
              placeholder="Pump name"
              value={p.name}
              onChange={(e) => updatePump(p.id, { name: e.target.value })}
            />
            <input
              type="number"
              step="any"
              className="af__pump-capacity"
              placeholder="Capacity m³/day"
              value={p.capacity_m3_day}
              onChange={(e) => updatePump(p.id, { capacity_m3_day: e.target.value })}
            />
            <span className={`af__pump-role af__pump-role--${p.role}`}>
              {p.role === "backup" ? "Backup" : "Functional"}
            </span>
            <Switch
              checked={p.active}
              onChange={(v) => updatePump(p.id, { active: v })}
              onLabel="On"
              offLabel="Off"
            />
            <button
              type="button"
              className="af__pump-remove"
              onClick={() => removePump(p.id)}
              aria-label={`Remove ${p.name || "pump"}`}
            >
              ×
            </button>
          </div>
        ))}
      </div>
      <div className="af__pump-add">
        <button type="button" className="af__btn" onClick={() => addPump("functional")}>+ Functional</button>
        <button type="button" className="af__btn" onClick={() => addPump("backup")}>+ Backup</button>
      </div>
    </div>
  );
}
