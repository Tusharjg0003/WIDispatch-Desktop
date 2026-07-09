import React from "react";

const clean = (v) => (v == null || v === "" || v === "NULL" ? null : v);
const dash = (v) => clean(v) ?? "N/A";
const plantTypeLabel = (t) => (t === "water_purification" ? "Water Purification" : "Seawater Desalination");
const statusLabel = (s) => (s ? s.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase()) : "N/A");
const statusBadgeClass = (s) => (s === "operational" ? "in-operation" : s || "unknown");
const statusBadgeText = (s) => (s === "operational" ? "In Operation" : statusLabel(s));
const formatDateTime = (value) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
};

// Field: label + value cell, inline (label left, value right), matching the
// reference form-group/form-display layout.
function Field({ label, value, full }) {
  return (
    <div className={`form-group${full ? " full-width" : ""}`}>
      <label>{label}</label>
      <div className="form-display">{dash(value)}</div>
    </div>
  );
}

// Granular project-lifetime formatter — years when >= 1yr, else months, else
// days. Ported from the reference's calculateProjectLifetime.
function projectLifetime(startDate, endDate) {
  if (!startDate || !endDate) return null;
  const start = new Date(startDate).getTime();
  const end = new Date(endDate).getTime();
  if (Number.isNaN(start) || Number.isNaN(end) || end <= start) return null;
  const diffMs = end - start;
  const diffYears = diffMs / (1000 * 60 * 60 * 24 * 365.25);
  if (diffYears >= 1) return `${diffYears.toFixed(1)} years`;
  const diffMonths = diffMs / (1000 * 60 * 60 * 24 * 30.4375);
  if (diffMonths >= 1) return `${diffMonths.toFixed(1)} months`;
  const diffDays = diffMs / (1000 * 60 * 60 * 24);
  return `${Math.floor(diffDays)} days`;
}

// Read-only field sections for a single asset (plant or pump station),
// rendered as the same 3-column inline form-grid the reference app uses for
// General Information / Asset Specifications / Financial Breakdown.
export default function AssetDetailFields({ asset }) {
  const spec = asset.specifications || {};
  const isProduction = asset.category === "plant" && spec.plant_category !== "treatment";
  const isTreatment = asset.category === "plant" && spec.plant_category === "treatment";
  const lifetime = projectLifetime(asset.commissioning_date, asset.decommissioning_date);

  return (
    <>
      <div className="form-content">
        <h3>General Information</h3>
        <div className="form-grid">
          <Field label="Generated ID" value={asset.generated_id || asset.id} />
          <Field label="Created" value={formatDateTime(asset.created_at)} />
          <Field label="Last Updated" value={formatDateTime(asset.updated_at)} />
          <Field label="External ID" value={asset.external_id} />
          <Field label="Asset Name (EN)" value={asset.name} />
          <Field label="Asset Name (AR)" value={asset.asset_name_ar} />
          <Field label="Cluster" value={asset.cluster} />
          <Field label="Region" value={asset.region} />
          <Field label="Governorate" value={asset.governorate} />
          <Field label="City" value={asset.city} />
          <Field label="Entity" value={asset.entity} />
          <Field label="Entity Type" value={asset.entity_type} />
          <div className="form-group">
            <label>Operational Status</label>
            <div className="form-display">
              <span className={`status-badge ${statusBadgeClass(asset.status)}`}>
                {statusBadgeText(asset.status)}
              </span>
            </div>
          </div>
          <Field label="Activity" value={asset.activity} />
          <Field label="Asset Type" value={asset.asset_type} />
          <Field label="Commissioning Date" value={asset.commissioning_date} />
          <Field label="Decommissioning Date" value={asset.decommissioning_date} />
        </div>
      </div>

      {asset.category === "plant" && (isProduction || isTreatment) && (
        <div className="form-section">
          <h3>Asset Specifications</h3>
          <div className="form-grid">
            {isProduction && (
              <>
                <Field label="Plant Type" value={spec.plant_type && plantTypeLabel(spec.plant_type)} />
                <Field label="PSID" value={spec.psid} />
                <Field label="Dispatch ID" value={spec.dispatch_id} />
                <Field label="Production System" value={spec.production_system} />
                <Field label="Water Source" value={spec.water_source} />
                <Field label="Technology" value={spec.technology} />
                <Field label="Design Capacity (m³/day)" value={spec.design_capacity} />
                <Field label="Maximum Capacity (m³/day)" value={spec.maximum_capacity} />
                <Field label="Contracted Capacity (m³/day)" value={spec.contracted_capacity} />
                <Field label="Fund Status" value={spec.fund_status} />
                <Field label="Plant Manager" value={spec.plant_manager_name} />
                <Field label="Phone Number" value={spec.phone_number} />
                <Field label="Source" value={spec.source} />
              </>
            )}
            {isTreatment && (
              <>
                <Field label="Maximum Capacity (m³/day)" value={spec.maximum_capacity} />
                <Field label="Expansion Date" value={spec.expansion_date} />
                <Field label="Treatment Level" value={spec.treatment_level} />
                <Field label="Design Capacity (m³/day)" value={spec.design_capacity} />
                <Field label="Expansion Capacity (m³/day)" value={spec.expansion_capacity} />
                <Field label="Source" value={spec.source} />
              </>
            )}
          </div>
        </div>
      )}

      {isProduction && (spec.ccr != null || spec.fixed_om != null || spec.variable_om != null || spec.capex != null) && (
        <div className="form-section">
          <h3>Financial Breakdown</h3>
          <div className="form-grid">
            <Field label="CCR (SAR/month)" value={spec.ccr} />
            <Field label="Fixed O&M (SAR/month)" value={spec.fixed_om} />
            <Field label="Variable O&M (SAR/m³)" value={spec.variable_om} />
            <Field label="CAPEX (SAR)" value={spec.capex} />
          </div>
          <div className="form-grid">
            <Field label="Project Lifetime" value={lifetime} />
          </div>
        </div>
      )}

      {asset.category === "pump" && Array.isArray(spec.pumps) && spec.pumps.length > 0 && (
        <div className="form-section">
          <h3>Pump Configuration</h3>
          <table className="pump-config-table">
            <thead>
              <tr><th>Name</th><th>Capacity (m³/day)</th><th>Role</th><th>State</th></tr>
            </thead>
            <tbody>
              {spec.pumps.map((p) => (
                <tr key={p.id}>
                  <td>{p.name || "—"}</td>
                  <td>{p.capacity_m3_day ?? "—"}</td>
                  <td>{p.role === "backup" ? "Backup" : "Functional"}</td>
                  <td>{p.active ? "On" : "Off"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {asset.category === "handover_point" && (
        <div className="form-section">
          <h3>Asset Specifications</h3>
          <div className="form-grid">
            <Field label="Capacity (m³/day)" value={spec.design_capacity} />
            <Field
              label="Capacity Limitation"
              value={
                spec.capacity_limitation_type && spec.capacity_limitation_type !== "none"
                  ? `${spec.capacity_limitation_value ?? "—"}${spec.capacity_limitation_type === "percentage" ? "%" : " m³/day"}`
                  : spec.capacity_limitation_type === "none"
                  ? "None"
                  : null
              }
            />
          </div>
        </div>
      )}
    </>
  );
}
