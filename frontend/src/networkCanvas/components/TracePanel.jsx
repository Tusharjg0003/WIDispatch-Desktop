import React, { useState } from "react";
import { ChevronDown, ChevronRight, X } from "lucide-react";
import FloatingPanel from "../../components/FloatingPanel";
import { traceEndpointSections } from "../../cytoscape/multiTrace";
import { ENTITY_TYPE_LABELS } from "../../cytoscape/buildCyStyle";

// Same wording as the canvas legend ("City gate", not "Handover Point").
const typeLabel = (type) => (type === "handover_point" ? "City gate" : ENTITY_TYPE_LABELS[type] || type);

const DIRECTION_LABEL = { upstream: "Upstream", downstream: "Downstream", both: "Up + down" };
const fmtFlow = (v) => {
  const n = Number(v) || 0;
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(Math.round(n));
};

// Opens at the canvas's top-left, just below its hint ("Trace HP — click a
// handover point…") so it doesn't cover it. Used when there's no remembered spot.
const belowCanvasHint = (width) => {
  const canvas = document.querySelector(".nb-canvas-wrap");
  if (!canvas) return { x: (window.innerWidth - width) / 2, y: 72 };
  const box = canvas.getBoundingClientRect();
  const hint = canvas.querySelector(":scope > .nb-mode-banner")?.getBoundingClientRect();
  return { x: box.left + 10, y: (hint ? hint.bottom : box.top) + 10 };
};

// Floating "Flow traces" panel (SWIIMS trace panel): one card per traced root
// with its direction, counts, endpoints and direct neighbours, plus per-trace
// and all-traces PDF / Excel export. A FloatingPanel like the canvas's other
// windows: drag it anywhere on screen, or pop it out into its own window.
// Closing it clears the traces.
//
// The same window, as `variant="report"`, is Tools → Trace report: every
// delivery point's trace, read-only (no Clear / per-trace ×), closing just
// hides it, and it opens at the canvas's top-right by default.
export default function TracePanel({ infos, mode, onFocus, onRemove, onClear, onExport, onClose, variant = "traces" }) {
  const [collapsed, setCollapsed] = useState(false);
  const report = variant === "report";
  const noun = report ? "delivery point" : "root";

  return (
    <FloatingPanel
      title={report ? "Traceability report" : "Flow traces"}
      onClose={report ? onClose : onClear}
      storageKey={report ? "trace-report" : "trace-panel"}
      width={400}
      className="nb-trace-fp"
      defaultPosition={report ? undefined : belowCanvasHint}
      autoFocus={false}
    >
      <div className="nb-trace-fp__bar">
        <span className="cr-count">{infos.length} {noun}{infos.length === 1 ? "" : "s"} · {mode === "delivered" ? "delivered" : "reachable"}</span>
        <span className="cr-spacer" />
        <button type="button" className="cr-btn cr-btn--sm" onClick={() => onExport(infos, "pdf")} title={report ? "The whole report as PDF" : "Export these traces as PDF"}>PDF</button>
        <button type="button" className="cr-btn cr-btn--sm" onClick={() => onExport(infos, "xlsx")} title={report ? "The whole report as an Excel workbook" : "Export these traces as Excel"}>Excel</button>
        {onClear && <button type="button" className="cr-btn cr-btn--sm" onClick={onClear}>Clear</button>}
        <button type="button" className="cr-btn cr-btn--sm cr-btn--icon" onClick={() => setCollapsed((v) => !v)} aria-label={collapsed ? "Expand" : "Collapse"}>
          {collapsed ? <ChevronRight size={14} aria-hidden="true" /> : <ChevronDown size={14} aria-hidden="true" />}
        </button>
      </div>
      {!collapsed && (
        <div className="nb-trace-float__body">
          <div className="nb-trace-legend">
            <span><i className="nb-trace-swatch nb-trace-swatch--up" />Upstream</span>
            <span><i className="nb-trace-swatch nb-trace-swatch--down" />Downstream</span>
            <span><i className="nb-trace-swatch nb-trace-swatch--shared" />Shared</span>
          </div>
          {infos.map((info) => (
            <article key={info.rootId} className="nb-trace-card">
              <div className="nb-trace-card__head">
                <button type="button" className="cr-link nb-trace-card__name" onClick={() => onFocus(info.rootId)}>{info.rootName}</button>
                <span className="cr-pill cr-pill--acc">{DIRECTION_LABEL[info.direction]}</span>
                <span className="cr-spacer" />
                <button type="button" className="cr-btn cr-btn--sm" onClick={() => onExport([info], "pdf")} title="This trace as PDF">PDF</button>
                <button type="button" className="cr-btn cr-btn--sm" onClick={() => onExport([info], "xlsx")} title="This trace as Excel">XLS</button>
                {onRemove && <button type="button" className="cr-btn cr-btn--sm cr-btn--icon" onClick={() => onRemove(info.rootId)} aria-label={`Stop tracing ${info.rootName}`}><X size={13} aria-hidden="true" /></button>}
              </div>
              <div className="nb-trace-card__meta">
                {typeLabel(info.rootType)} · {info.upCount} upstream · {info.downCount} downstream
              </div>
              {traceEndpointSections(info).map((section) => (
                <div key={section.key} className="nb-trace-card__section">
                  <div className={`nb-trace-card__label nb-trace-card__label--${section.direction}`}>{section.label} ({section.rows.length})</div>
                  {section.rows.length ? (
                    section.rows.map((row) => (
                      <button key={row.id} type="button" className="nb-trace-card__row" onClick={() => onFocus(row.id)}>{row.name}</button>
                    ))
                  ) : (
                    <span className="nb-trace-card__empty">— none —</span>
                  )}
                </div>
              ))}
              {info.direction !== "downstream" && info.sources.length > 0 && (
                <div className="nb-trace-card__section">
                  <div className="nb-trace-card__label nb-trace-card__label--upstream">Comes from</div>
                  {info.sources.map((s) => (
                    <button key={`s-${s.id}`} type="button" className="nb-trace-card__row" onClick={() => onFocus(s.id)}>
                      {s.name}{info.hasFlow ? <em>{fmtFlow(s.flow)} m³/d</em> : null}
                    </button>
                  ))}
                </div>
              )}
              {info.direction !== "upstream" && info.dests.length > 0 && (
                <div className="nb-trace-card__section">
                  <div className="nb-trace-card__label nb-trace-card__label--downstream">Goes to</div>
                  {info.dests.map((d) => (
                    <button key={`d-${d.id}`} type="button" className="nb-trace-card__row" onClick={() => onFocus(d.id)}>
                      {d.name}{info.hasFlow ? <em>{fmtFlow(d.flow)} m³/d</em> : null}
                    </button>
                  ))}
                </div>
              )}
            </article>
          ))}
        </div>
      )}
    </FloatingPanel>
  );
}
