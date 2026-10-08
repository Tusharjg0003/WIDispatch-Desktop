import React from "react";

// Read-only detail sections for one asset (asset view page). Each section is
// a card with an uppercase header row and a label / value grid — values read
// as text, not as input boxes. Which sections show depends on the category
// (production plant, treatment plant, pump station, tank, city gate).

const clean = (v) => (v == null || v === "" || v === "NULL" ? null : v);
const plantTypeLabel = (t) => (t === "water_purification" ? "Water purification" : "Seawater desalination");
const isFunctionalPump = (pump) => ["active", "functional"].includes(String(pump?.role || "").toLowerCase());
const isBackupPump = (pump) => ["standby", "backup"].includes(String(pump?.role || "").toLowerCase());
const number = (v, unit) => {
  const raw = clean(v);
  if (raw == null) return null;
  const n = Number(raw);
  const text = Number.isFinite(n) ? n.toLocaleString(undefined, { maximumFractionDigits: 3 }) : String(raw);
  return unit ? `${text} ${unit}` : text;
};
export const formatDate = (value) => {
  if (!clean(value)) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
};

function pumpNameList(pumps, fallback) {
  if (!Array.isArray(pumps) || pumps.length === 0) return null;
  return pumps.map((pump, index) => pump.name || pump.id || `${fallback} ${index + 1}`).join(", ");
}

// Years when ≥ 1 year, else months, else days.
function projectLifetime(startDate, endDate) {
  if (!startDate || !endDate) return null;
  const start = new Date(startDate).getTime();
  const end = new Date(endDate).getTime();
  if (Number.isNaN(start) || Number.isNaN(end) || end <= start) return null;
  const diffMs = end - start;
  const years = diffMs / (1000 * 60 * 60 * 24 * 365.25);
  if (years >= 1) return `${years.toFixed(1)} years`;
  const months = diffMs / (1000 * 60 * 60 * 24 * 30.4375);
  if (months >= 1) return `${months.toFixed(1)} months`;
  return `${Math.floor(diffMs / (1000 * 60 * 60 * 24))} days`;
}

/** One card: header row + label/value grid. Rows are [label, value, options]. */
export function DetailCard({ title, rows = [], children, wide = false }) {
  return (
    <section className={`ad-card${wide ? " ad-card--wide" : ""}`} aria-label={title}>
      <h3 className="ad-card__title">{title}</h3>
      {rows.length > 0 && (
        <dl className="ad-grid">
          {rows.map(([label, value, opts = {}]) => (
            <div key={label} className={`ad-field${opts.full ? " ad-field--full" : ""}`}>
              <dt>{label}</dt>
              <dd className={opts.mono ? "ad-mono" : undefined} dir={opts.dir}>
                {clean(value) ?? <span className="ad-empty">—</span>}
              </dd>
            </div>
          ))}
        </dl>
      )}
      {children}
    </section>
  );
}

export default function AssetDetailFields({ asset }) {
  const spec = asset.specifications || {};
  const isProduction = asset.category === "plant" && spec.plant_category !== "treatment";
  const isTreatment = asset.category === "plant" && spec.plant_category === "treatment";
  const lifetime = projectLifetime(asset.commissioning_date, asset.decommissioning_date);
  const configuredPumps = Array.isArray(spec.pumps) ? spec.pumps : [];
  const activePumps = Array.isArray(spec.active_pumps) ? spec.active_pumps : configuredPumps.filter(isFunctionalPump);
  const standbyPumps = Array.isArray(spec.standby_pumps) ? spec.standby_pumps : configuredPumps.filter(isBackupPump);

  return (
    <>
      <DetailCard
        title="General information"
        rows={[
          ["Asset name (EN)", asset.name],
          ["Asset name (AR)", asset.asset_name_ar, { dir: "rtl" }],
          ["Activity", asset.activity],
          ["Asset type", asset.asset_type],
          ["Region", asset.region],
          ["Governorate", asset.governorate],
          ["City", asset.city],
          ["Cluster", asset.cluster],
          ["Entity", asset.entity],
          ["Entity type", asset.entity_type],
          ["Commissioned", formatDate(asset.commissioning_date)],
          ["Decommissioned", formatDate(asset.decommissioning_date)],
        ]}
      />

      {asset.category === "plant" && isProduction && (
        <DetailCard
          title="Specifications"
          rows={[
            ["Plant type", spec.plant_type && plantTypeLabel(spec.plant_type)],
            ["Technology", spec.technology],
            ["Water source", spec.water_source],
            ["Production system", spec.production_system],
            ["Design capacity", number(spec.design_capacity, "m³/day")],
            ["Maximum capacity", number(spec.maximum_capacity, "m³/day")],
            ["Contracted capacity", number(spec.contracted_capacity, "m³/day")],
            ["PSID", spec.psid, { mono: true }],
            ["Dispatch ID", spec.dispatch_id, { mono: true }],
            ["Fund status", spec.fund_status],
            ["Plant manager", spec.plant_manager_name],
            ["Phone number", spec.phone_number],
            ["Source", spec.source],
          ]}
        />
      )}

      {asset.category === "plant" && isTreatment && (
        <DetailCard
          title="Specifications"
          rows={[
            ["Treatment level", spec.treatment_level],
            ["Design capacity", number(spec.design_capacity, "m³/day")],
            ["Maximum capacity", number(spec.maximum_capacity, "m³/day")],
            ["Expansion capacity", number(spec.expansion_capacity, "m³/day")],
            ["Expansion date", formatDate(spec.expansion_date)],
            ["Source", spec.source],
          ]}
        />
      )}

      {isProduction && (spec.ccr != null || spec.fixed_om != null || spec.variable_om != null || spec.capex != null) && (
        <DetailCard
          title="Financials"
          rows={[
            ["CCR", number(spec.ccr, "SAR / month")],
            ["Fixed O&M", number(spec.fixed_om, "SAR / month")],
            ["Variable O&M", number(spec.variable_om, "SAR / m³")],
            ["CAPEX", number(spec.capex, "SAR")],
            ["Project lifetime", lifetime],
          ]}
        />
      )}

      {asset.category === "pump" && (
        <DetailCard
          title="Specifications"
          rows={[
            ["Design capacity", number(spec.design_capacity, "m³/day")],
            ["Duty pumps", pumpNameList(activePumps, "Duty pump"), { full: true }],
            ["Standby pumps", pumpNameList(standbyPumps, "Standby pump"), { full: true }],
          ]}
        />
      )}

      {asset.category === "pump" && configuredPumps.length > 0 && (
        <DetailCard title={`Pumps (${configuredPumps.length})`}>
          <table className="ad-table">
            <thead>
              <tr><th>Name</th><th>Capacity</th><th>Role</th><th>State</th></tr>
            </thead>
            <tbody>
              {configuredPumps.map((p, i) => (
                <tr key={p.id || i}>
                  <td className="ad-table__name">{p.name || `Pump ${i + 1}`}</td>
                  <td>{number(p.capacity_m3_day, "m³/day") || <span className="ad-empty">—</span>}</td>
                  <td>
                    <span className={`ad-pill ${p.role === "backup" ? "ad-pill--acc" : "ad-pill--ok"}`}>
                      {p.role === "backup" ? "Standby" : "Duty"}
                    </span>
                  </td>
                  <td>
                    <span className={`ad-pill ${p.active ? "ad-pill--ok" : "ad-pill--off"}`}>{p.active ? "On" : "Off"}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </DetailCard>
      )}

      {asset.category === "tank" && (
        <DetailCard
          title="Storage"
          rows={[
            ["Total capacity", number(spec.total_capacity_m3, "m³")],
            ["Number of tanks", number(spec.number_tanks)],
            ["Storage material", spec.storage_material],
            ["Source", spec.source],
            ["Transmission system", spec.transmission_system_name],
            ["Transmission system ID", spec.transmission_system_id, { mono: true }],
          ]}
        />
      )}

      {asset.category === "handover_point" && (
        <DetailCard
          title="Delivery"
          rows={[
            ["Contracted capacity", number(spec.contracted_capacity, "m³/day")],
            ["Design capacity", number(spec.design_capacity, "m³/day")],
            ["Maximum capacity", number(spec.maximum_capacity, "m³/day")],
            [
              "Capacity limit",
              spec.capacity_limitation_type && spec.capacity_limitation_type !== "none"
                ? number(spec.capacity_limitation_value, spec.capacity_limitation_type === "percentage" ? "%" : "m³/day")
                : spec.capacity_limitation_type === "none"
                ? "None"
                : null,
            ],
          ]}
        />
      )}
    </>
  );
}
