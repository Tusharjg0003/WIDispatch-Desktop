import React, { useState } from "react";
import FloatingPanel from "./FloatingPanel";
import { Field, Toggle } from "./AssetFormControls";
import TransmissionLinePicker from "./TransmissionLinePicker";
import { lineBelongsToSystem } from "../lib/transmissionLines";

const MATERIALS = [
  { value: "steel", label: "Steel" },
  { value: "ductile_iron", label: "Ductile Iron" },
  { value: "hdpe", label: "HDPE" },
  { value: "concrete", label: "Concrete" },
  { value: "pvc", label: "PVC" },
];

// Segment label for a pipe drawn as part of a route: "Line A - 2".
export const segmentName = (lineName, index) => `${lineName.trim() || "Line"} - ${index}`;

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
//
// `routeSegments` > 0 means the pipe(s) come from Draw Route: the name is the
// route's line name, the route is saved as that transmission line (so a
// system is required), and the parent names each segment "<name> - <n>".
//
// `initial` pre-fills the form; with `mode="edit"` it edits an existing pipe
// (Details → Edit) instead of adding one.
export default function PipeVariablesModal({ systems, lines, routeSegments = 0, mode = "create", initial = null, onCancel, onSubmit }) {
  const isRoute = routeSegments > 0;
  const isEdit = mode === "edit";
  const [form, setForm] = useState(() => ({ ...EMPTY_FORM, ...(initial || {}) }));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const setChecked = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));
  const setFormField = (key, value) => setForm((f) => ({ ...f, [key]: value }));
  const systemLines = form.transmissionSystemId
    ? lines.filter((line) => lineBelongsToSystem(line, form.transmissionSystemId))
    : [];
  const setTransmissionSystem = (e) => {
    const transmissionSystemId = e.target.value;
    setForm((f) => ({
      ...f,
      transmissionSystemId,
      lineGroupIds: [],
      parentLineId: "",
    }));
  };

  const submit = async (e) => {
    e.preventDefault();
    if (isRoute && !form.transmissionSystemId && !form.newTransmissionSystemName.trim()) {
      setError("Choose or create a transmission system. The route is saved as a line under it.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSubmit(form);
    } catch (err) {
      setError(err.message || (isEdit ? "Couldn't save the pipe" : "Failed to add pipe"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <FloatingPanel
      title={isEdit ? `Edit pipe${initial?.name ? ` · ${initial.name}` : ""}` : isRoute ? `New route · ${routeSegments} segment${routeSegments === 1 ? "" : "s"}` : "Pipeline variables"}
      onClose={onCancel}
      storageKey="canvas-form"
      className="nb-pipe-modal"
    >
      <form className="af__body" onSubmit={submit}>
        <div className="af__grid">
          <Field label={isRoute ? "Line Name *" : "Pipe Name *"}>
            <input
              type="text" value={form.name} placeholder={isRoute ? "e.g. Line A" : "e.g. West trunk main"}
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
        {isRoute && (
          <p className="af__hint">
            Segments will be named{" "}
            <strong>{segmentName(form.name, 1)}</strong>
            {routeSegments > 1 && <> … <strong>{segmentName(form.name, routeSegments)}</strong></>}
            {" "}and grouped as one transmission line.
          </p>
        )}

        <div className="af__section">Transmission System{isRoute ? " *" : ""}</div>
        <div className="af__grid">
          <Field label="Transmission System">
            <select value={form.transmissionSystemId} onChange={setTransmissionSystem}>
              <option value="">—</option>
              {systems.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              {/* Editing a pipe whose system isn't in the loaded list: keep it visible. */}
              {form.transmissionSystemId && !systems.some((s) => s.id === form.transmissionSystemId) && (
                <option value={form.transmissionSystemId}>{form.transmissionSystemId}</option>
              )}
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

        <div className="af__section">Transmission Line{isRoute ? "" : "s"}</div>
        {isRoute ? (
          <p className="af__hint">
            This route becomes the line <strong>{form.name.trim() || "named above"}</strong> in the chosen
            system. If the system already has a line with that name, the segments join it.
          </p>
        ) : (
        <TransmissionLinePicker
          lines={systemLines}
          selectedIds={form.lineGroupIds}
          onSelectedIdsChange={(ids) => setFormField("lineGroupIds", ids.slice(0, 1))}
          newLineName={form.newLineName}
          onNewLineNameChange={(value) => setFormField("newLineName", value)}
          isBranch={form.isBranch}
          onIsBranchChange={(checked) => setFormField("isBranch", checked)}
          parentLineId={form.parentLineId}
          onParentLineIdChange={(value) => setFormField("parentLineId", value)}
          branchName={form.branchName}
          onBranchNameChange={(value) => setFormField("branchName", value)}
          emptyMessage={
            form.transmissionSystemId
              ? "No saved transmission lines for this system yet."
              : "Choose an existing system to see its saved lines, or type a new line below."
          }
        />
        )}

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
            {saving ? "Saving…" : isEdit ? "Save changes" : isRoute ? "Add route" : "Add pipe"}
          </button>
        </div>
      </form>
    </FloatingPanel>
  );
}
