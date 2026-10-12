import React from "react";
import { AlertTriangle, CircleCheck, Eye, Info, Play, Spline, X } from "lucide-react";
import CanvasDayScrubber from "../../components/simulation/CanvasDayScrubber";

// Simulation-mode canvas chrome (embedded in Simulation Config): the bottom
// run bar (run summary, Show Gap, legend, day scrubber) and the floating
// Bottlenecks list. Same language as the side panels: uppercase header rows,
// pills, 28px buttons with tinted hover / on states.

const LEGEND = [
  ["low", "Below 70%"],
  ["medium", "70–90%"],
  ["high", "90%+"],
  ["bottleneck", "Pipe binding"],
  ["unconstrained", "No capacity on record"],
  ["idle", "No flow"],
  ["node-binding", "Supply / pump binding"],
];

const pct = (v) => (v == null ? "—" : `${Math.round(v * 100)}%`);
const fmt = (v) => (v == null ? "—" : Math.round(v).toLocaleString());
const stamp = (iso) => new Date(iso).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

/** Simulation View → Bottlenecks floating list (SWIIMS bottleneck panel). */
export function BottleneckPanel({ items, onFocus, onClose }) {
  return (
    <section className="nb-trace-float nb-bottleneck-float" aria-label="Bottlenecks">
      <header className="simbar-float__head">
        <span className="simbar-float__icon" aria-hidden="true"><AlertTriangle size={13} /></span>
        <strong>Bottlenecks</strong>
        <span className="simbar-pill simbar-pill--err">{items.length} binding</span>
        <button type="button" className="simbar-btn simbar-btn--icon" onClick={onClose} aria-label="Close bottlenecks" title="Close">
          <X size={14} aria-hidden="true" />
        </button>
      </header>
      <div className="nb-trace-float__body">
        {items.length === 0 ? (
          <span className="simbar-empty"><CircleCheck size={14} aria-hidden="true" /> Nothing was binding on this day.</span>
        ) : (
          <table className="simbar-table">
            <thead>
              <tr><th>Element</th><th>Kind</th><th className="num">Util.</th><th className="num">Flow m³/d</th></tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} onClick={() => onFocus(item.id)} title="Show on the canvas">
                  <td className="simbar-table__name">{item.name}</td>
                  <td className="simbar-table__muted">{item.kind}</td>
                  <td className="num">{pct(item.util)}</td>
                  <td className="num">{fmt(item.flow)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}

function Notice({ tone = "info", children }) {
  const Icon = tone === "warn" ? AlertTriangle : Info;
  return (
    <div className={`simbar-notice simbar-notice--${tone}`}>
      <Icon size={13} aria-hidden="true" />
      <span>{children}</span>
    </div>
  );
}

/** Bottom run bar: notices, run summary, Show Gap, legend and the day scrubber. */
export function SimulationRunBar({ sim, plan, showLegend, onToggleLegend }) {
  if (!plan) {
    return (
      <div className="nb-run-bar">
        <Notice>
          No run yet. Use <strong><Play size={11} aria-hidden="true" /> Run</strong> on the Home tab to simulate this configuration and paint the results on the canvas.
        </Notice>
      </div>
    );
  }
  const emptyRun = plan?.kpis?.totalRequiredM3 === 0;
  const dayShort = sim.overlay?.totals?.shortage;
  return (
    <div className="nb-run-bar">
      {sim.stale.missingFromCanvas.length > 0 && (
        <Notice tone="warn">
          {sim.stale.missingFromCanvas.length} element{sim.stale.missingFromCanvas.length === 1 ? "" : "s"} this run used {sim.stale.missingFromCanvas.length === 1 ? "is" : "are"} no longer on the canvas.
        </Notice>
      )}
      {emptyRun && <Notice>This run had no demand to dispatch, so every pipe shows as idle.</Notice>}
      {sim.cleared ? (
        <div className="nb-run-bar__row">
          <span className="simbar-title">Run overlay hidden</span>
          <span className="simbar-spacer" />
          <button type="button" className="simbar-btn" onClick={sim.restore}>
            <Eye size={13} aria-hidden="true" /> Show results again
          </button>
        </div>
      ) : (
        <>
          <div className="nb-run-bar__row">
            <span className="simbar-title">Run results</span>
            <span className="simbar-pill">{stamp(plan.runAt)}</span>
            <span className="simbar-pill">{plan.from} → {plan.to}</span>
            {dayShort != null && (
              dayShort > 0
                ? <span className="simbar-pill simbar-pill--err">{fmt(dayShort)} m³ short this day</span>
                : <span className="simbar-pill simbar-pill--ok">Fully served this day</span>
            )}
            <span className="simbar-spacer" />
            {sim.canShowGap && (
              <button type="button" className="simbar-btn" onClick={() => sim.showGap(sim.selection.id)} title="Binding pipes upstream and plants with spare capacity">
                <Spline size={13} aria-hidden="true" /> Show gap
              </button>
            )}
            {sim.gap && (
              <button type="button" className="simbar-btn" onClick={sim.clearGap}>
                <X size={13} aria-hidden="true" /> Clear gap
              </button>
            )}
            <button type="button" className={`simbar-btn${showLegend ? " is-on" : ""}`} onClick={onToggleLegend} aria-pressed={showLegend}>
              <Info size={13} aria-hidden="true" /> Legend
            </button>
          </div>
          {showLegend && (
            <div className="nb-run-bar__legend">
              {LEGEND.map(([key, label]) => (
                <span key={key} className="simcanvas__legend-row">
                  <i className={`simcanvas__swatch simcanvas__swatch--${key}`} />
                  {label}
                </span>
              ))}
              <span className="simcanvas__legend-row"><i className="simcanvas__swatch nb-swatch--gap-binding" />Gap: binding upstream</span>
              <span className="simcanvas__legend-row"><i className="simcanvas__swatch nb-swatch--gap-spare" />Gap: spare plant</span>
            </div>
          )}
          <CanvasDayScrubber summaries={sim.summaries} dayIdx={sim.dayIdx} onChange={sim.setDayIdx} />
        </>
      )}
    </div>
  );
}
