import React, { useState } from "react";
import { traceEndpointSections } from "../../cytoscape/multiTrace";

const DIRECTION_LABEL = { upstream: "Upstream", downstream: "Downstream", both: "Up + down" };
const fmtFlow = (v) => {
  const n = Number(v) || 0;
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(Math.round(n));
};

// Floating "Flow traces" panel (SWIIMS trace panel): one card per traced root
// with its direction, counts, endpoints and direct neighbours, plus per-trace
// and all-traces PDF / Excel export.
export default function TracePanel({ infos, mode, onFocus, onRemove, onClear, onExport }) {
  const [collapsed, setCollapsed] = useState(false);
  return (
    <section className="nb-trace-float" aria-label="Flow traces">
      <header className="nb-trace-float__head">
        <strong>Flow traces</strong>
        <span className="cr-count">{infos.length} root{infos.length === 1 ? "" : "s"} · {mode === "delivered" ? "delivered" : "reachable"}</span>
        <span className="cr-spacer" />
        <button type="button" className="cr-btn cr-btn--sm" onClick={() => onExport(infos, "pdf")} title="Export these traces as PDF">PDF</button>
        <button type="button" className="cr-btn cr-btn--sm" onClick={() => onExport(infos, "xlsx")} title="Export these traces as Excel">Excel</button>
        <button type="button" className="cr-btn cr-btn--sm" onClick={onClear}>Clear</button>
        <button type="button" className="cr-btn cr-btn--sm cr-btn--icon" onClick={() => setCollapsed((v) => !v)} aria-label={collapsed ? "Expand" : "Collapse"}>
          {collapsed ? "▸" : "▾"}
        </button>
      </header>
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
                <button type="button" className="cr-btn cr-btn--sm cr-btn--icon" onClick={() => onRemove(info.rootId)} aria-label={`Stop tracing ${info.rootName}`}>×</button>
              </div>
              <div className="nb-trace-card__meta">
                {info.rootType} · {info.upCount} upstream · {info.downCount} downstream
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
    </section>
  );
}
