import React, { useId } from "react";
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
  const choiceName = useId();
  const selectedId = (selectedIds || [])[0] || "";
  const lineById = new Map(lines.map((line) => [line.id, line]));
  const parentLines = lines.filter((line) => !line.isBranch);
  const hasNewLineName = !!newLineName.trim();
  const hasBranchName = !!branchName.trim();
  const canCreateLine = isBranch ? (hasNewLineName || hasBranchName) && !!parentLineId : hasNewLineName;
  const clearNewLineDraft = () => {
    onNewLineNameChange("");
    onIsBranchChange(false);
    onParentLineIdChange("");
    onBranchNameChange("");
  };
  const chooseExistingLine = (lineId) => {
    onSelectedIdsChange(selectedId === lineId ? [] : [lineId]);
    clearNewLineDraft();
  };
  const setNewName = (value) => {
    onSelectedIdsChange([]);
    onNewLineNameChange(value);
  };
  const setLineType = (checked) => {
    onSelectedIdsChange([]);
    onIsBranchChange(checked);
    if (!checked) {
      onParentLineIdChange("");
      onBranchNameChange("");
    }
  };
  const setParentLine = (lineId) => {
    onSelectedIdsChange([]);
    onParentLineIdChange(parentLineId === lineId ? "" : lineId);
  };
  const setBranchDisplayName = (value) => {
    onSelectedIdsChange([]);
    onBranchNameChange(value);
  };

  return (
    <div className="tlp">
      <div className="tlp__group">
        <div className="tlp__label">Choose Existing Line / Branch</div>
        <div className="tlp__check-list">
          {lines.length === 0 ? (
            <div className="tlp__empty">{emptyMessage}</div>
          ) : (
            lines.map((line) => (
              <label className="tlp__check" key={line.id}>
                <input
                  type="radio"
                  name={`${choiceName}-line-choice`}
                  checked={selectedId === line.id}
                  onClick={(e) => {
                    if (selectedId === line.id) {
                      e.preventDefault();
                      chooseExistingLine(line.id);
                    }
                  }}
                  onChange={() => chooseExistingLine(line.id)}
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

      <Field label={isBranch ? "New Branch Name" : "New Line Name"}>
        <input
          type="text"
          value={newLineName}
          placeholder={isBranch ? "e.g. North spur" : "e.g. Line 3"}
          onChange={(e) => setNewName(e.target.value)}
        />
      </Field>

      <Toggle
        label="Line Type"
        checked={isBranch}
        onChange={setLineType}
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
                      type="radio"
                      name={`${choiceName}-branch-parent`}
                      checked={parentLineId === line.id}
                      onClick={(e) => {
                        if (parentLineId === line.id) {
                          e.preventDefault();
                          setParentLine(line.id);
                        }
                      }}
                      onChange={() => setParentLine(line.id)}
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
          <Field label="Branch Display Name (optional)">
            <input
              type="text"
              value={branchName}
              placeholder="Defaults to new branch name"
              onChange={(e) => setBranchDisplayName(e.target.value)}
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
            disabled={creating || !canCreateLine}
          >
            {creating ? "Adding..." : "Add line to pipe"}
          </button>
          {createError && <div className="af__error">{createError}</div>}
        </div>
      )}
    </div>
  );
}
