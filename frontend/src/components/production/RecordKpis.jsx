import React from "react";
import "./ProductionInputTable.css";

// KPI strip for the asset record tabs (Production / Demand inputs, Quality,
// Maintenance, Outages): the app's KPI card — tinted icon tile, uppercase
// label, large figure with its unit, optional meter and sub line. Styles in
// ProductionInputTable.css (.prod-strip / .prod-strip-cell).
//
// items: [{ label, value, unit?, icon, tone?: "acc"|"ok"|"warn"|"err"|"neutral",
//           sub?, meter?: 0–100 }]
export default function RecordKpis({ items }) {
  return (
    <div className="prod-strip">
      {items.map(({ label, value, unit, icon: Icon, tone = "neutral", sub, meter }) => (
        <section key={label} className={`prod-strip-cell prod-tone--${tone}`} aria-label={label}>
          <header className="prod-kpi-head">
            {Icon && <span className="prod-kpi-icon" aria-hidden="true"><Icon size={15} /></span>}
            <span className="prod-kpi-label">{label}</span>
          </header>
          <div className="prod-kpi-value">{value}{unit && <small>{unit}</small>}</div>
          {meter != null && (
            <div className="prod-kpi-meter" aria-hidden="true">
              <span style={{ width: `${Math.max(0, Math.min(100, meter))}%` }} />
            </div>
          )}
          {sub && <span className="prod-kpi-sub">{sub}</span>}
        </section>
      ))}
    </div>
  );
}
