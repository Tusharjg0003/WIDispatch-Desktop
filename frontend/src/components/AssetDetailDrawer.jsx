import React from "react";

const statusLabel = (s) => (s ? s.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase()) : "—");
const clean = (v) => (v == null || v === "" || v === "NULL" ? null : v);

function Row({ label, value }) {
  const v = clean(value);
  if (v == null) return null;
  return (
    <div className="adr__row">
      <dt>{label}</dt>
      <dd>{String(v)}</dd>
    </div>
  );
}

export default function AssetDetailDrawer({ asset, onClose }) {
  if (!asset) return null;
  const spec = asset.specifications || {};
  const coords =
    Number.isFinite(asset.latitude) && Number.isFinite(asset.longitude)
      ? `${asset.latitude}, ${asset.longitude}`
      : null;

  return (
    <div className="adr__overlay" onMouseDown={onClose}>
      <aside className="adr" onMouseDown={(e) => e.stopPropagation()}>
        <header className="adr__head">
          <div>
            <span className="adr__cat">{asset.category}</span>
            <h2 className="adr__name">{asset.name || asset.id}</h2>
            <span className={`st st--${asset.status || "unknown"}`}>{statusLabel(asset.status)}</span>
          </div>
          <button className="af__close" onClick={onClose} aria-label="Close">×</button>
        </header>

        <div className="adr__body">
          <div className="af__section">Identity</div>
          <dl className="adr__list">
            <Row label="ID" value={asset.id} />
            <Row label="External ID" value={asset.external_id} />
            <Row label="Name (Arabic)" value={asset.asset_name_ar} />
            <Row label="Entity" value={asset.entity} />
            <Row label="Entity type" value={asset.entity_type} />
          </dl>

          <div className="af__section">Classification</div>
          <dl className="adr__list">
            <Row label="Activity" value={asset.activity} />
            <Row label="Asset type" value={asset.asset_type} />
          </dl>

          <div className="af__section">Location</div>
          <dl className="adr__list">
            <Row label="Region" value={asset.region} />
            <Row label="Cluster" value={asset.cluster} />
            <Row label="Governorate" value={asset.governorate} />
            <Row label="City" value={asset.city} />
            <Row label="Coordinates" value={coords} />
          </dl>

          <div className="af__section">Lifecycle</div>
          <dl className="adr__list">
            <Row label="Commissioned" value={asset.commissioning_date && String(asset.commissioning_date).slice(0, 10)} />
            <Row label="Decommissioned" value={asset.decommissioning_date && String(asset.decommissioning_date).slice(0, 10)} />
          </dl>

          {Object.keys(spec).length > 0 && (
            <>
              <div className="af__section">Specifications</div>
              <dl className="adr__list">
                <Row label="Technology" value={spec.technology} />
                <Row label="Water source" value={spec.water_source} />
                <Row label="Design capacity (m³/day)" value={spec.design_capacity} />
                <Row label="Contracted capacity (m³/day)" value={spec.contracted_capacity} />
                <Row label="Production system" value={spec.production_system} />
                <Row label="Material" value={spec.material} />
                <Row label="Length (km)" value={spec.length_km} />
                <Row label="Diameter (mm)" value={spec.diameter_mm} />
              </dl>
            </>
          )}
        </div>
      </aside>
    </div>
  );
}
