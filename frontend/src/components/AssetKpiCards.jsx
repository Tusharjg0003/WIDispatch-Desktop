import React from "react";
import { Cylinder, Droplets, Factory, Layers, MapPinned } from "lucide-react";
import { ENTITY_TYPE_COLORS } from "../cytoscape/buildCyStyle";
import "./AssetKpiCards.css";

const STATUS_ORDER = ["operational", "maintenance", "under_construction", "planned", "decommissioned"];
const STATUS_LABEL = {
  operational: "Operational",
  maintenance: "Maintenance",
  under_construction: "Under construction",
  planned: "Planned",
  decommissioned: "Decommissioned",
};
const CATEGORIES = [
  { key: "plant", label: "Plants", icon: Factory },
  { key: "pump", label: "Pump stations", icon: Droplets },
  { key: "tank", label: "Tanks", icon: Cylinder },
  { key: "handover_point", label: "City gates", icon: MapPinned },
];

function Breakdown({ statuses, total }) {
  const breakdown = STATUS_ORDER.filter((s) => statuses[s] > 0);
  if (breakdown.length === 0) return <p className="kpi-card__empty">No assets yet</p>;
  return (
    <>
      {/* Proportion bar: each status's share of the category. */}
      <div className="kpi-card__bar" aria-hidden="true">
        {breakdown.map((s) => (
          <span key={s} className={`kpi-card__seg kpi-tone--${s}`} style={{ flexGrow: statuses[s] }} />
        ))}
      </div>
      <ul className="kpi-card__list">
        {breakdown.map((s) => (
          <li key={s} title={`${statuses[s]} of ${total} ${STATUS_LABEL[s].toLowerCase()}`}>
            <span className={`kpi-card__dot kpi-tone--${s}`} aria-hidden="true" />
            <span className="kpi-card__status">{STATUS_LABEL[s]}</span>
            <strong>{statuses[s]}</strong>
          </li>
        ))}
      </ul>
    </>
  );
}

function Card({ label, value, icon: Icon, colour, statuses, total = false }) {
  return (
    <section className={`kpi-card${total ? " kpi-card--total" : ""}`} style={{ "--kpi-colour": colour }} aria-label={label}>
      <header className="kpi-card__head">
        <span className="kpi-card__icon" aria-hidden="true"><Icon size={16} /></span>
        <span className="kpi-card__label">{label}</span>
        <span className="kpi-card__value">{value}</span>
      </header>
      <Breakdown statuses={statuses} total={value} />
    </section>
  );
}

// Per-category KPI strip (Plants / Pump stations / Tanks / City gates) plus a
// Total card, in the same language as the side panels: colour-coded icon
// tile, uppercase label, large count, then the status breakdown as a
// proportion bar and a dot list. Counts come from the currently-filtered
// asset set so the cards react to the filters.
export default function AssetKpiCards({ kpis }) {
  if (!kpis) return null;
  return (
    <div className="kpi-grid">
      {CATEGORIES.map(({ key, label, icon }) => (
        <Card
          key={key}
          label={label}
          icon={icon}
          colour={ENTITY_TYPE_COLORS[key]}
          value={kpis.byCategory?.[key] || 0}
          statuses={kpis.statusByCategory?.[key] || {}}
        />
      ))}
      <Card label="All assets" icon={Layers} colour="var(--acc)" value={kpis.total || 0} statuses={kpis.totalStatus || {}} total />
    </div>
  );
}
