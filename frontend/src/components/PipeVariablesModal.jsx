import React, { useState } from "react";
import { Field, Toggle } from "./AssetFormControls";

const MATERIALS = [
  { value: "steel", label: "Steel" },
  { value: "ductile_iron", label: "Ductile Iron" },
  { value: "hdpe", label: "HDPE" },
  { value: "concrete", label: "Concrete" },
  { value: "pvc", label: "PVC" },
];

const EMPTY_FORM = {
  name: "", capacity: "", pipelineLength: "", pipelineDiameter: "", pipelineMaterial: "",
  designCapacity: "", maximumCapacity: "", infraSource: "",
  commissioningDate: "", decommissioningDate: "", active: true, bidirectional: false,
  transmissionSystemId: "", newTransmissionSystemName: "",
  lineGroupIds: [], newLineName: "", isBranch: false, parentLineId: "", branchName: "",
  capacityLimitationType: "none", capacityLimitationValue: "",
};

// Pipe-drawing modal for the Network Builder canvas (shown after connecting
// two nodes in draw-pipe mode). Self-contained form state, like
// NetworkEntityCreateModal, but `onSubmit` receives the raw, unresolved
// form values rather than an already-created result — the parent
// (NetworkBuilderPage's submitPipe) owns creating any new Transmission
// System/Line so it can keep its own shared systems/lines state in sync
// for the canvas inspector. `systems`/`lines` are the current known lists,
// for the existing-item selects.
export default function PipeVariablesModal({ systems, lines, onCancel, onSubmit }) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const setChecked = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));
  const setLineGroupIds = (e) => {
    const ids = Array.from(e.target.selectedOptions, (o) => o.value);
    setForm((f) => ({ ...f, lineGroupIds: ids }));
  };

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await onSubmit(form);
    } catch (err) {
      setError(err.message || "Failed to add pipe");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="af__overlay" onMouseDown={onCancel}>
      <div className="af__modal nb-pipe-modal" onMouseDown={(e) => e.stopPropagation()}>
        <header className="af__head">
          <h2 className="af__title">Pipeline variables</h2>
          <button className="af__close" onClick={onCancel} aria-label="Close">×</button>
        </header>
        <form className="af__body" onSubmit={submit}>
          <div className="af__grid">
            <Field label="Pipe Name *">
              <input
                type="text" value={form.name} placeholder="e.g. West trunk main"
                onChange={set("name")} required autoFocus
              />
            </Field>
            <Field label="Capacity (m³/day)">
              <input type="number" step="any" value={form.capacity} onChange={set("capacity")} />
            </Field>
            <Field label="Length (km)">
              <input type="number" step="any" value={form.pipelineLength} onChange={set("pipelineLength")} />
            </Field>
            <Field label="Diameter (mm)">
              <input type="number" step="any" value={form.pipelineDiameter} onChange={set("pipelineDiameter")} />
            </Field>
            <Field label="Material">
              <select value={form.pipelineMaterial} onChange={set("pipelineMaterial")}>
                <option value="">—</option>
                {MATERIALS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
            </Field>
            <Field label="Design Capacity (m³/day)">
              <input type="number" step="any" value={form.designCapacity} onChange={set("designCapacity")} />
            </Field>
            <Field label="Max Capacity (m³/day)">
              <input type="number" step="any" value={form.maximumCapacity} onChange={set("maximumCapacity")} />
            </Field>
            <Field label="Source">
              <input type="text" value={form.infraSource} onChange={set("infraSource")} />
            </Field>
            <Field label="Commissioning Date">
              <input type="date" value={form.commissioningDate} onChange={set("commissioningDate")} />
            </Field>
            <Field label="Decommissioning Date">
              <input type="date" value={form.decommissioningDate} onChange={set("decommissioningDate")} />
            </Field>
            <Toggle label="Active" checked={form.active} onChange={setChecked("active")} />
            <Toggle label="Bidirectional" checked={form.bidirectional} onChange={setChecked("bidirectional")} />
          </div>

          <div className="af__section">Transmission System</div>
          <div className="af__grid">
            <Field label="Transmission System">
              <select value={form.transmissionSystemId} onChange={set("transmissionSystemId")}>
                <option value="">—</option>
                {systems.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </Field>
            <Field label="Create new system">
              <input
                type="text" value={form.newTransmissionSystemName}
                placeholder="e.g. Riyadh Main System"
                onChange={set("newTransmissionSystemName")}
              />
            </Field>
          </div>

          <div className="af__section">Transmission Lines</div>
          <div className="af__grid">
            <Field label="Transmission Lines">
              <select multiple value={form.lineGroupIds} onChange={setLineGroupIds}>
                {lines.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </Field>
            <Field label="New Transmission Line">
              <input
                type="text" value={form.newLineName} placeholder="e.g. Line 3"
                onChange={set("newLineName")}
              />
            </Field>
            {form.newLineName.trim() !== "" && (
              <>
                <Toggle label="This line is a branch" checked={form.isBranch} onChange={setChecked("isBranch")} />
                {form.isBranch && (
                  <>
                    <Field label="Branch Of Line">
                      <select value={form.parentLineId} onChange={set("parentLineId")}>
                        <option value="">—</option>
                        {lines.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                      </select>
                    </Field>
                    <Field label="Branch Name">
                      <input type="text" value={form.branchName} onChange={set("branchName")} />
                    </Field>
                  </>
                )}
              </>
            )}
          </div>

          <div className="af__section">Capacity Limitation</div>
          <div className="af__grid">
            <Field label="Capacity Limitation">
              <select value={form.capacityLimitationType} onChange={set("capacityLimitationType")}>
                <option value="none">None</option>
                <option value="percentage">Percentage (%)</option>
                <option value="absolute">Absolute (m³/day)</option>
              </select>
            </Field>
            {form.capacityLimitationType !== "none" && (
              <Field label="Capacity Limitation Value">
                <input
                  type="number" step="any" value={form.capacityLimitationValue}
                  onChange={set("capacityLimitationValue")}
                />
              </Field>
            )}
          </div>

          {error && <div className="af__error">{error}</div>}

          <div className="af__footer">
            <button type="button" className="af__btn af__btn--ghost" onClick={onCancel}>Cancel</button>
            <button type="submit" className="af__btn af__btn--primary" disabled={saving}>
              {saving ? "Saving…" : "Add pipe"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
