import React from "react";
import { Field, Toggle } from "./AssetFormControls";

const lineName = (line) => (line?.isBranch ? line.branchName || line.name : line?.name) || line?.id || "Line";

export default function TransmissionLinePicker({
  lines,
  selectedIds,
  onSelectedIdsChange,
  newLineName,
  onNewLineNameChange,
  isBranch,
  onIsBranchChange,
  parentLineId,
  onParentLineIdChange,
  branchName,
  onBranchNameChange,
  onCreateLine,
  creating = false,
  createError = null,
  emptyMessage = "No saved transmission lines for this system yet.",
}) {
  const selectedSet = new Set(selectedIds || []);
  const lineById = new Map(lines.map((line) => [line.id, line]));
  const parentLines = lines.filter((line) => !line.isBranch);
  const toggleLine = (lineId) => {
    const next = new Set(selectedSet);
    if (next.has(lineId)) next.delete(lineId);
    else next.add(lineId);
    onSelectedIdsChange(Array.from(next));
  };

  return (
    <div className="tlp">
      <div className="tlp__group">
        <div className="tlp__label">Existing Lines</div>
        <div className="tlp__check-list">
          {lines.length === 0 ? (
            <div className="tlp__empty">{emptyMessage}</div>
          ) : (
            lines.map((line) => (
              <label className="tlp__check" key={line.id}>
                <input
                  type="checkbox"
                  checked={selectedSet.has(line.id)}
                  onChange={() => toggleLine(line.id)}
                />
                <span className="tlp__check-copy">
                  <strong>{lineName(line)}</strong>
                  {(line.isBranch || line.parentLineId) && (
                    <small>{line.isBranch ? "Branch" : "Line"}{line.parentLineId ? ` of ${lineName(lineById.get(line.parentLineId))}` : ""}</small>
                  )}
                </span>
              </label>
            ))
          )}
        </div>
      </div>

      <Field label="New Line Name">
        <input
          type="text"
          value={newLineName}
          placeholder="e.g. Line 3"
          onChange={(e) => onNewLineNameChange(e.target.value)}
        />
      </Field>

      <Toggle
        label="Line Type"
        checked={isBranch}
        onChange={(checked) => {
          onIsBranchChange(checked);
          if (!checked) {
            onParentLineIdChange("");
            onBranchNameChange("");
          }
        }}
        onLabel="Branch"
        offLabel="Main line"
      />

      {isBranch && (
        <div className="tlp__branch-panel">
          <div className="tlp__label">Branch Details</div>
          <div className="tlp__group">
            <div className="tlp__label">Branch Parent Line</div>
            <div className="tlp__check-list">
              {parentLines.length === 0 ? (
                <div className="tlp__empty">No saved parent lines yet.</div>
              ) : (
                parentLines.map((line) => (
                  <label className="tlp__check" key={line.id}>
                    <input
                      type="checkbox"
                      checked={parentLineId === line.id}
                      onChange={(e) => onParentLineIdChange(e.target.checked ? line.id : "")}
                    />
                    <span className="tlp__check-copy">
                      <strong>{lineName(line)}</strong>
                      <small>Main line</small>
                    </span>
                  </label>
                ))
              )}
            </div>
          </div>
          <Field label="Branch Name">
            <input
              type="text"
              value={branchName}
              placeholder="e.g. North spur"
              onChange={(e) => onBranchNameChange(e.target.value)}
            />
          </Field>
        </div>
      )}

      {onCreateLine && (
        <div className="tlp__actions">
          <button
            type="button"
            className="af__btn af__btn--primary"
            onClick={onCreateLine}
            disabled={creating || !newLineName.trim() || (isBranch && !parentLineId)}
          >
            {creating ? "Adding..." : "Add line to pipe"}
          </button>
          {createError && <div className="af__error">{createError}</div>}
        </div>
      )}
    </div>
  );
}
