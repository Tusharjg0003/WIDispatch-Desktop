import React from "react";
import CanvasDayScrubber from "../../components/simulation/CanvasDayScrubber";

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

/** Simulation View → Bottlenecks floating list (SWIIMS bottleneck panel). */
export function BottleneckPanel({ items, onFocus, onClose }) {
  return (
    <section className="nb-trace-float nb-bottleneck-float" aria-label="Bottlenecks">
      <header className="nb-trace-float__head">
        <strong>Bottlenecks</strong>
        <span className="cr-count">{items.length} binding</span>
        <span className="cr-spacer" />
        <button type="button" className="cr-btn cr-btn--sm cr-btn--icon" onClick={onClose} aria-label="Close bottlenecks">×</button>
      </header>
      <div className="nb-trace-float__body">
        {items.length === 0 ? (
          <span className="nb-trace-card__empty">Nothing was binding on this day.</span>
        ) : (
          <table className="cr-table">
            <thead>
              <tr><th>Element</th><th>Kind</th><th className="num">Util.</th><th className="num">Flow m³/d</th></tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className="is-clickable" onClick={() => onFocus(item.id)}>
                  <td className="cr-td--strong">{item.name}</td>
                  <td className="cr-td--muted">{item.kind}</td>
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

/** Bottom run bar: notices, legend, Show Gap and the day scrubber. */
export function SimulationRunBar({ sim, plan, showLegend, onToggleLegend }) {
  if (!plan) {
    return (
      <div className="nb-run-bar">
        <div className="metric__notice">No run yet — use Home → Run to simulate this configuration and paint the results on the canvas.</div>
      </div>
    );
  }
  const emptyRun = plan?.kpis?.totalRequiredM3 === 0;
  return (
    <div className="nb-run-bar">
      {sim.stale.missingFromCanvas.length > 0 && (
        <div className="metric__notice metric__notice--warn">
          {sim.stale.missingFromCanvas.length} element(s) this run used are no longer on the canvas.
        </div>
      )}
      {emptyRun && <div className="metric__notice">This run had no demand to dispatch, so every pipe shows as idle.</div>}
      {sim.cleared ? (
        <div className="nb-run-bar__row">
          <span className="cr-count">Run overlay cleared.</span>
          <button type="button" className="cr-btn cr-btn--sm" onClick={sim.restore}>Show results again</button>
        </div>
      ) : (
        <>
          <div className="nb-run-bar__row">
            <span className="cr-count">
              Run {new Date(plan.runAt).toLocaleString()} · {plan.from} → {plan.to}
              {sim.overlay?.totals ? ` · day short ${fmt(sim.overlay.totals.shortage)} m³` : ""}
            </span>
            <span className="cr-spacer" />
            {sim.canShowGap && (
              <button type="button" className="cr-btn cr-btn--sm" onClick={() => sim.showGap(sim.selection.id)} title="Binding pipes upstream and plants with spare capacity">
                Show Gap
              </button>
            )}
            {sim.gap && <button type="button" className="cr-btn cr-btn--sm" onClick={sim.clearGap}>Clear Gap</button>}
            <button type="button" className={`cr-btn cr-btn--sm${showLegend ? " active" : ""}`} onClick={onToggleLegend} aria-pressed={showLegend}>Legend</button>
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
