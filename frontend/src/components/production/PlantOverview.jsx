import React from "react";
import { format } from "date-fns";
import SinglePlantMap from "./SinglePlantMap";
import ProductionCapacityChart from "./ProductionCapacityChart";
import QualityParameterCharts from "./QualityParameterCharts";
import "./PlantOverview.css";

const fmtDate = (v) => {
  if (!v || v === "NULL" || v === "") return "—";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? "—" : format(d, "PP");
};
const cap = (v) => (v != null && v !== "" ? `${Number(v).toLocaleString()} m³/d` : "N/A");
const val = (v) => (v == null || v === "" || v === "NULL" ? "N/A" : v);
const coord = (lat, lng) => {
  const a = Number(lat), b = Number(lng);
  return Number.isFinite(a) && Number.isFinite(b) ? `${a.toFixed(4)}, ${b.toFixed(4)}` : "N/A";
};

// The web "Plant Facts" card fields (17), pulling from the plant record or its
// specifications, whichever carries the value.
export function assetFacts(asset, { typeLabel = "Plant Type" } = {}) {
  const a = asset || {};
  const s = a.specifications || {};
  const pick = (...vals) => vals.find((v) => v != null && v !== "" && v !== "NULL");
  return [
    ["Asset ID", val(a.external_id), "mono"],
    [typeLabel, val(a.asset_type)],
    ["Entity", val(a.entity)],
    ["Entity Type", val(pick(a.entity_type, a.entityType, s.entity_type))],
    ["Region", val(a.region)],
    ["Cluster", val(pick(a.cluster, s.cluster))],
    ["Governorate", val(pick(a.governorate, s.governorate))],
    ["City", val(a.city)],
    ["Coordinates", coord(a.latitude, a.longitude), "mono"],
    ["Technology", val(pick(s.technology, a.technology))],
    ["Water Source", val(pick(s.water_source, a.water_source))],
    ["Design Capacity", cap(s.design_capacity), "mono"],
    ["Contracted", s.contracted_capacity != null ? cap(s.contracted_capacity) : "Not set", "mono accent"],
    ["Maximum", cap(s.maximum_capacity), "mono"],
    ["Commissioned", fmtDate(a.commissioning_date)],
    ["Decommissioned", fmtDate(a.decommissioning_date)],
    ["Production System", val(pick(s.production_system, a.production_system))],
  ];
}

export function FactsCard({ title = "Plant Facts", asset, typeLabel }) {
  const facts = assetFacts(asset, { typeLabel });
  return (
    <section className="pov__card pov__info">
      <div className="pov__card-head"><h3>{title}</h3></div>
      <div className="pov__facts">
        {facts.map(([label, value, cls]) => (
          <div className="pov__fact" key={label}>
            <div className="pov__label">{label}</div>
            <div className={`pov__value ${cls || ""}`.trim()}>{value}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

// Upcoming maintenance = records for this asset that have not yet ended, soonest
// first. Built from the bundle's maintenanceRecords (same source the tab uses).
export function UpcomingMaintenanceCard({ bundle }) {
  const now = Date.now();
  const rows = (bundle?.maintenanceRecords || [])
    .filter((r) => {
      const end = r.end_datetime || r.end || r.start_datetime;
      return end && new Date(end).getTime() >= now;
    })
    .sort((a, b) => new Date(a.start_datetime || 0) - new Date(b.start_datetime || 0))
    .slice(0, 6);
  return (
    <section className="pov__card pov__maint">
      <div className="pov__card-head"><h3>Upcoming Maintenance</h3><p>{rows.length} scheduled</p></div>
      <div className="pov__card-body pov__maint-body">
        <table className="pov__maint-table">
          <thead><tr><th>ID</th><th>Description</th><th>Start</th><th className="ta-r">Exp. Loss (m³)</th><th>Status</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id || r._id}>
                <td className="mono muted">MNT-{String(r.external_id || r.id || "").slice(-6)}</td>
                <td>{val(r.maintenance_type || r.description || r.type)}</td>
                <td className="muted">{fmtDate(r.start_datetime)}</td>
                <td className="ta-r mono">{r.expected_loss_m3 != null ? Number(r.expected_loss_m3).toLocaleString() : "—"}</td>
                <td><span className={`prod-badge prod-badge-${String(r.submission_status || "").toLowerCase() === "approved" ? "ok" : "info"}`}>{val(r.submission_status)}</span></td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={5} className="pov__maint-empty">No upcoming maintenance</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default function PlantOverview({ plant, plantId, bundle, typeLabel = "Plant Type" }) {
  return (
    <div className="pov">
      <div className="pov__top">
        <FactsCard title="Plant Facts" asset={plant} typeLabel={typeLabel} />
        <UpcomingMaintenanceCard bundle={bundle} />
        <section className="pov__card pov__loc">
          <div className="pov__card-head"><h3>Location</h3><p>Satellite view</p></div>
          <div className="pov__card-body"><SinglePlantMap latitude={plant?.latitude} longitude={plant?.longitude} name={plant?.name} height={300} /></div>
        </section>
      </div>

      <section className="pov__card">
        <div className="pov__card-head"><h3>Production &amp; Capacity</h3><p>Actual vs contracted · design · maximum</p></div>
        <div className="pov__card-body"><ProductionCapacityChart plant={plant} plantId={plantId} bundle={bundle} /></div>
      </section>

      <section className="pov__card">
        <div className="pov__card-head"><h3>Water Quality Parameters</h3><p>Acceptable range shaded · out-of-range flagged</p></div>
        <div className="pov__card-body"><QualityParameterCharts plantId={plantId} bundle={bundle} /></div>
      </section>
    </div>
  );
}
