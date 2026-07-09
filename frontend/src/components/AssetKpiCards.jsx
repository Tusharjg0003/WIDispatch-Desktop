import React from "react";

const STATUS_ORDER = ["operational", "maintenance", "under_construction", "planned", "decommissioned"];
const STATUS_LABEL = {
  operational: "Operational",
  maintenance: "Maintenance",
  under_construction: "Under Construction",
  planned: "Planned",
  decommissioned: "Decommissioned",
};
const CATEGORY_LABEL = { plant: "Plants", pump: "Pump Stations" };

// Per-category KPI cards shown above the list/map, styled after the
// AssetsTaggingPage reference's "view-kpis" strip: total count + a
// status-breakdown ribbon with colored dot indicators.
export default function AssetKpiCards({ kpis }) {
  if (!kpis) return null;
  const categories = Object.keys(CATEGORY_LABEL).filter((c) => kpis.byCategory?.[c] != null);
  if (categories.length === 0) return null;

  return (
    <div className="view-kpis">
      {categories.map((cat) => {
        const total = kpis.byCategory[cat] || 0;
        const statuses = kpis.statusByCategory?.[cat] || {};
        const breakdown = STATUS_ORDER.filter((s) => statuses[s] > 0);
        return (
          <div className="card" key={cat}>
            <div className="card-title">{CATEGORY_LABEL[cat]}</div>
            <div className="card-value">{total}</div>
            <div className="card-subtitle">Total assets</div>
            {breakdown.length > 0 && (
              <div className="card-status-breakdown">
                {breakdown.map((s) => (
                  <div className="status-item" key={s}>
                    <span className={`status-indicator ${s.replace(/_/g, "-")}`} />
                    <span>{STATUS_LABEL[s]} {statuses[s]}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
