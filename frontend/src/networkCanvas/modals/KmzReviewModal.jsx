import React, { useState } from "react";
import FloatingPanel from "../../components/FloatingPanel";
import { ENTITY_TYPE_LABELS } from "../../cytoscape/buildCyStyle";

const IMPORT_TYPES = ["plant", "pump", "tank", "handover_point", "filling_station", "stp", "node"];

// Review imported entity types (SWIIMS KMZ review dialog): one row per KML
// folder with its detected type; override any group before placing.
export default function KmzReviewModal({ fileName, pointCount, lineCount, rows: initialRows, onCancel, onConfirm }) {
  const [rows, setRows] = useState(initialRows);
  const setOverride = (groupKey, overrideType) => setRows((rs) => rs.map((r) => (r.groupKey === groupKey ? { ...r, overrideType } : r)));
  return (
    <FloatingPanel
      title="Review imported entity types"
      onClose={onCancel}
      storageKey="kmz-review" width={720}
      className="nb-pipe-modal"
    >
      <div className="af__body">
        <p className="cr-subtitle" style={{ marginBottom: 8 }}>
          {pointCount} feature{pointCount === 1 ? "" : "s"} and {lineCount} line{lineCount === 1 ? "" : "s"} from {fileName}. Confirm the detected type for each group, or override it, before placing on the canvas.
        </p>
        <div style={{ maxHeight: 360, overflow: "auto" }}>
          <table className="cr-table">
            <thead>
              <tr><th>Group</th><th className="num">Count</th><th>Detected</th><th>Import as</th></tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.groupKey}>
                  <td>
                    <div className="cr-td--strong">
                      {row.label}
                      {row.mixed && !row.overrideType && (
                        <span className="cr-pill cr-pill--amber" style={{ marginLeft: 6 }} title="This group mixes several detected types; each feature keeps its own detection unless you override it here.">mixed</span>
                      )}
                    </div>
                    {row.sampleNames.length > 0 && (
                      <div className="cr-td--muted" style={{ fontSize: 10 }} title={row.sampleNames.join(", ")}>
                        e.g. {row.sampleNames.slice(0, 3).join(", ")}{row.count > 3 ? "…" : ""}
                      </div>
                    )}
                  </td>
                  <td className="num">{row.count}</td>
                  <td>
                    {ENTITY_TYPE_LABELS[row.overrideType || row.detectedType] || row.overrideType || row.detectedType}
                    <div className="cr-td--muted" style={{ fontSize: 10 }}>via {row.detectedSource}</div>
                  </td>
                  <td>
                    <select className="cr-select" value={row.overrideType} onChange={(e) => setOverride(row.groupKey, e.target.value)} aria-label={`Import ${row.label} as`}>
                      <option value="">Keep detected</option>
                      {IMPORT_TYPES.map((t) => <option key={t} value={t}>{ENTITY_TYPE_LABELS[t] || t}</option>)}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="af__footer">
          <button type="button" className="af__btn af__btn--ghost" onClick={onCancel}>Cancel</button>
          <button type="button" className="af__btn af__btn--primary" onClick={() => onConfirm(rows)}>Import</button>
        </div>
      </div>
    </FloatingPanel>
  );
}
