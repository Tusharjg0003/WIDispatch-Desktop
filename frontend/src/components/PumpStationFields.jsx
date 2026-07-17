import React from "react";
import { Switch } from "./AssetFormControls";

const emptyPump = (role) => ({
  id: `p_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
  name: "",
  capacity_m3_day: "",
  role,
  active: true,
});

const isFunctionalPump = (pump) =>
  ["active", "functional"].includes(String(pump?.role || "").toLowerCase());

const isBackupPump = (pump) =>
  ["standby", "backup"].includes(String(pump?.role || "").toLowerCase());

const pumpLabel = (pump, index, fallback) => pump.name || pump.id || `${fallback} ${index + 1}`;

function linkedPumpSummary(pumps, predicate, fallback) {
  const linked = pumps.filter(predicate);
  if (!linked.length) return `No ${fallback.toLowerCase()} pumps configured`;
  return linked.map((pump, index) => pumpLabel(pump, index, fallback)).join(", ");
}

// Repeatable "Pump Configuration" list for a Pump Station asset. `pumps` is
// the array stored at specifications.pumps; `setPumps` replaces the array.
export default function PumpStationFields({ pumps, setPumps, spec = {}, setSpec }) {
  const addPump = (role) => setPumps([...pumps, emptyPump(role)]);
  const updatePump = (id, patch) => setPumps(pumps.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  const removePump = (id) => setPumps(pumps.filter((p) => p.id !== id));
  const updateSpec = (key) => setSpec?.(key);

  return (
    <div className="form-section">
      <h3>Pump Configuration</h3>
      <div className="form-grid af__grid">
        <div className="form-group af__field">
          <label>Design Capacity (m³/day)</label>
          <input
            type="number"
            step="any"
            value={spec.design_capacity ?? ""}
            onChange={updateSpec("design_capacity")}
          />
        </div>
        <div className="form-group af__field">
          <label>Active Pumps</label>
          <input readOnly value={linkedPumpSummary(pumps, isFunctionalPump, "Functional pump")} />
        </div>
        <div className="form-group af__field">
          <label>Standby Pumps</label>
          <input readOnly value={linkedPumpSummary(pumps, isBackupPump, "Backup pump")} />
        </div>
      </div>
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
