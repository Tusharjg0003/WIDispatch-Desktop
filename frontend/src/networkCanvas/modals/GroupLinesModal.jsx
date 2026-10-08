import React, { useState } from "react";
import FloatingPanel from "../../components/FloatingPanel";
import { Field } from "../../components/AssetFormControls";
import TransmissionLinePicker from "../../components/TransmissionLinePicker";
import { lineBelongsToSystem } from "../../lib/transmissionLines";

// Tools → Review → Group Lines (SWIIMS handleCreateLineGroup): put the selected
// pipes into a transmission line — an existing one, a new line, or a branch of
// a line — under an existing or new transmission system. The parent resolves
// any new system/line through the same API path the pipe modal uses.
export default function GroupLinesModal({ pipeCount, systems, lines, initial = {}, onCancel, onSubmit }) {
  const [form, setForm] = useState({
    transmissionSystemId: initial.transmissionSystemId || "",
    newTransmissionSystemName: "",
    lineGroupIds: initial.lineGroupIds || [],
    newLineName: "",
    isBranch: false,
    parentLineId: "",
    branchName: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const setField = (key, value) => setForm((f) => ({ ...f, [key]: value }));
  const systemLines = form.transmissionSystemId ? lines.filter((line) => lineBelongsToSystem(line, form.transmissionSystemId)) : [];

  const submit = async (event) => {
    event.preventDefault();
    const hasLine = form.lineGroupIds.length || form.newLineName.trim() || (form.isBranch && form.branchName.trim());
    if (!hasLine) {
      setError("Choose a transmission line or name a new one.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSubmit(form);
    } catch (err) {
      setError(err.message || "Couldn't group the pipes");
    } finally {
      setSaving(false);
    }
  };

  return (
    <FloatingPanel
      title={`Group ${pipeCount} pipe${pipeCount === 1 ? "" : "s"} into a line`}
      onClose={onCancel}
      storageKey="canvas-form"
      className="nb-pipe-modal"
    >
      <form className="af__body" onSubmit={submit}>
        <div className="af__section">Transmission System</div>
        <div className="af__grid">
          <Field label="Transmission System">
            <select
              value={form.transmissionSystemId}
              onChange={(e) => setForm((f) => ({ ...f, transmissionSystemId: e.target.value, lineGroupIds: [], parentLineId: "" }))}
            >
              <option value="">—</option>
              {systems.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </Field>
          <Field label="Create new system">
            <input
              type="text"
              value={form.newTransmissionSystemName}
              placeholder="e.g. Riyadh Main System"
              onChange={(e) => setField("newTransmissionSystemName", e.target.value)}
            />
          </Field>
        </div>
        <div className="af__section">Transmission Line</div>
        <TransmissionLinePicker
          lines={systemLines}
          selectedIds={form.lineGroupIds}
          onSelectedIdsChange={(ids) => setField("lineGroupIds", ids.slice(0, 1))}
          newLineName={form.newLineName}
          onNewLineNameChange={(v) => setField("newLineName", v)}
          isBranch={form.isBranch}
          onIsBranchChange={(v) => setField("isBranch", v)}
          parentLineId={form.parentLineId}
          onParentLineIdChange={(v) => setField("parentLineId", v)}
          branchName={form.branchName}
          onBranchNameChange={(v) => setField("branchName", v)}
          emptyMessage={form.transmissionSystemId ? "No saved transmission lines for this system yet." : "Choose a system to see its lines, or type a new line below."}
        />
        {error && <div className="af__error">{error}</div>}
        <div className="af__footer">
          <button type="button" className="af__btn af__btn--ghost" onClick={onCancel}>Cancel</button>
          <button type="submit" className="af__btn af__btn--primary" disabled={saving}>{saving ? "Grouping…" : "Group lines"}</button>
        </div>
      </form>
    </FloatingPanel>
  );
}
