import React from "react";

// Shared pieces for the Results charts (SimulationGraphGrid, SupplyDemandChart):
// the chart card shell and the series colours / axis ticks every chart uses.

// Shared series colours, so a measure reads the same in every chart:
// delivered / production = accent, required / demand = purple (dashed),
// shortfall = red, capacity = grey reference.
export const SERIES = {
  supply: "var(--acc)",
  demand: "var(--chart-purple)",
  shortfall: "var(--err)",
  capacity: "var(--chart-reference)",
  cost: "var(--acc)",
  rate: "var(--chart-warning)",
};
export const AXIS_TICK = { fill: "var(--chart-axis)", fontSize: 10.5 };

/** A chart card in the app's card language: uppercase header row, optional hint / control. */
export function ChartShell({ title, hint, aside, children }) {
  return (
    <section className="rp-card simgraph" aria-label={title}>
      <header className="rp-card__head">
        <h3 className="rp-card__title">{title}</h3>
        {hint && <span className="rp-card__hint">{hint}</span>}
        {aside && <span className="rp-card__aside">{aside}</span>}
      </header>
      <div className="simgraph__body">{children}</div>
    </section>
  );
}
