import React from "react";

const STATUS_ORDER = ["operational", "maintenance", "under_construction", "planned", "decommissioned"];
const STATUS_LABEL = {
  operational: "Operational",
  maintenance: "Maintenance",
  under_construction: "Under Construction",
  planned: "Planned",
  decommissioned: "Decommissioned",
};
const CATEGORY_LABEL = { plant: "Plants", pump: "Pump Stations", handover_point: "Handover Points" };

function Breakdown({ statuses }) {
  const breakdown = STATUS_ORDER.filter((s) => statuses[s] > 0);
  if (breakdown.length === 0) return null;
  return (
    <div className="card-status-breakdown">
      {breakdown.map((s) => (
        <div className="status-item" key={s}>
          <span className={`status-indicator ${s.replace(/_/g, "-")}`} />
          <span>{STATUS_LABEL[s]} {statuses[s]}</span>
        </div>
      ))}
    </div>
  );
}

// Per-category KPI strip (Plants / Pump Stations / Handover Points) plus a
// Total card, styled after the reference "view-kpis" strip. Counts come from
// the currently-filtered asset set so cards react to the filters.
export default function AssetKpiCards({ kpis }) {
  if (!kpis) return null;
  return (
    <div className="view-kpis">
      {Object.keys(CATEGORY_LABEL).map((cat) => (
        <div className="card" key={cat}>
          <div className="card-title">{CATEGORY_LABEL[cat]}</div>
          <div className="card-value">{kpis.byCategory?.[cat] || 0}</div>
          <div className="card-subtitle">Total assets</div>
          <Breakdown statuses={kpis.statusByCategory?.[cat] || {}} />
        </div>
      ))}
      <div className="card">
        <div className="card-title">Total Assets</div>
        <div className="card-value">{kpis.total || 0}</div>
        <div className="card-subtitle">All categories</div>
        <Breakdown statuses={kpis.totalStatus || {}} />
      </div>
    </div>
  );
}
