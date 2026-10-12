import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Banknote, CircleCheck, Coins, Download, FlaskConical, Gauge, List, Map as MapIcon, Search, TriangleAlert, Waves } from "lucide-react";
import { fetchProductionPlants } from "../api/production";
import { fetchEconomics } from "../api/metrics";
import { currentFinancials } from "../lib/financialEntries";
import { StatusBadge } from "../components/ui/WorkspacePrimitives";
import AssetMapView from "../components/AssetMapView";
import { downloadCsv } from "../lib/exportCsv";
import { recordsToCsv } from "../lib/operatorTables";
import "./ProductionPlantList.css";

const uniqSorted = (values) => [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b));

const EXPORT_COLUMNS = [
  { key: "id", label: "Asset ID", get: (plant) => plant.external_id || "" },
  { key: "name", label: "Plant", get: (plant) => plant.name || "" },
  { key: "type", label: "Type", get: (plant) => plant.asset_type || "" },
  { key: "entity", label: "Entity", get: (plant) => plant.entity || "" },
  { key: "region", label: "Region", get: (plant) => plant.region || "" },
  { key: "status", label: "Status", get: (plant) => plant.status || "" },
  { key: "capacity", label: "Contracted (m3/day)", get: (plant) => plant.specifications?.contracted_capacity ?? "" },
];

const typeBadgeClass = (type) => {
  const normalized = String(type || "").toLowerCase();
  if (normalized.includes("desalination")) return "ppl__badge--type-desalination";
  if (normalized.includes("purification")) return "ppl__badge--type-purification";
  return "ppl__badge--type-other";
};

const isOperational = (plant) => String(plant.status || "").toLowerCase() === "operational";

const money = (v) => (v == null ? "—" : Number(v).toLocaleString("en-US", { maximumFractionDigits: 0 }));
const rate = (v) => (v == null ? "—" : Number(v).toFixed(2));
const compact = (v) => {
  if (v == null) return "—";
  const abs = Math.abs(v);
  if (abs >= 1e9) return `${(v / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${(v / 1e6).toFixed(2)}M`;
  if (abs >= 1e4) return `${(v / 1e3).toFixed(abs >= 1e5 ? 0 : 1)}K`;
  return money(v);
};

const COST_SOURCE = {
  economics: { label: "Economics", cls: "ppl__badge--data" },
  plant_spec: { label: "Asset record", cls: "ppl__badge--type-desalination" },
  missing: { label: "Not set", cls: "ppl__badge--muted" },
};

/**
 * Current cost parameters per plant for the Economics list: approved
 * financial entries resolved per field (newest effective first), with the
 * summary's Variable O&M fallback to the asset record when there is no entry.
 */
function costsByPlant(summary) {
  const entriesByPlant = new Map();
  for (const entry of summary?.entries || []) {
    if (entry.scopeType !== "plant" || !entry.scopeId) continue;
    if (!entriesByPlant.has(entry.scopeId)) entriesByPlant.set(entry.scopeId, []);
    entriesByPlant.get(entry.scopeId).push(entry);
  }
  const out = new Map();
  for (const row of summary?.plants || []) {
    const current = currentFinancials(entriesByPlant.get(row.id) || []);
    out.set(row.id, {
      variableOm: current.variableOm ?? row.variableOm ?? null,
      fixedOm: current.fixedOm,
      ccr: current.ccr,
      capex: current.capex,
      source: row.source || "missing",
      effectiveFrom: current.effectiveFrom ?? row.effectiveFrom ?? null,
    });
  }
  return out;
}

const EXPORT_COST_COLUMNS = [
  { key: "id", label: "Asset ID", get: (plant) => plant.external_id || "" },
  { key: "name", label: "Plant", get: (plant) => plant.name || "" },
  { key: "type", label: "Type", get: (plant) => plant.asset_type || "" },
  { key: "region", label: "Region", get: (plant) => plant.region || "" },
  { key: "variableOm", label: "Variable O&M (SAR/m3)", get: (plant) => plant.cost?.variableOm ?? "" },
  { key: "fixedOm", label: "Fixed O&M (SAR/month)", get: (plant) => plant.cost?.fixedOm ?? "" },
  { key: "ccr", label: "CCR (SAR/month)", get: (plant) => plant.cost?.ccr ?? "" },
  { key: "capex", label: "CAPEX (SAR)", get: (plant) => plant.cost?.capex ?? "" },
  { key: "source", label: "Cost source", get: (plant) => COST_SOURCE[plant.cost?.source]?.label || "" },
];

/** Variable O&M with a bar relative to the most expensive plant (green → amber → red). */
function CostCell({ value, max }) {
  if (value == null) return <span className="muted">—</span>;
  const share = max > 0 ? value / max : 0;
  const colour = share >= 0.8 ? "var(--err)" : share >= 0.5 ? "#f59e0b" : "var(--ok)";
  return (
    <span className="ppl-cost">
      <span className="ppl-cost__bar" aria-hidden="true"><i style={{ width: `${Math.max(4, share * 100)}%`, "--ppl-cost": colour }} /></span>
      <span className="ppl-cost__value mono">{rate(value)}</span>
    </span>
  );
}

function Kpi({ icon: Icon, tone = "", label, value, unit, sub }) {
  return (
    <section className={`ppl-kpi${tone ? ` ppl-kpi--${tone}` : ""}`} aria-label={label}>
      <span className="ppl-kpi__icon" aria-hidden="true"><Icon size={16} /></span>
      <span className="ppl-kpi__text">
        <span className="ppl-kpi__label">{label}</span>
        <span className="ppl-kpi__value">{value}{unit && <small>{unit}</small>}</span>
        {sub && <span className="ppl-kpi__sub">{sub}</span>}
      </span>
    </section>
  );
}

// Production plant list — matches the WIDispatch-Production web app: a single
// panel with a search + count + List/Map toggle toolbar, inline Type/Entity/Region
// filters in the header cells, and an operational-only pre-filter.
export default function ProductionPlantList({
  basePath = "/production", onOpenPlant,
  assetLabel = "plants", assetLabelSingular = "plant",
  nameLabel = "Plant name", typeLabel = "Plant Type",
  // "economics": cost columns (current Variable / Fixed O&M, CCR, CAPEX) and
  // KPI cards instead of the production columns; cheapest plants first.
  variant = "production",
}) {
  const isEconomics = variant === "economics";
  const navigate = useNavigate();
  const [plants, setPlants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [view, setView] = useState("list");
  const [query, setQuery] = useState("");
  const [plantType, setPlantType] = useState("");
  const [entity, setEntity] = useState("");
  const [region, setRegion] = useState("");
  const [economics, setEconomics] = useState(null);

  useEffect(() => {
    let alive = true;
    Promise.all([fetchProductionPlants(), isEconomics ? fetchEconomics() : Promise.resolve(null)])
      .then(([data, summary]) => {
        if (!alive) return;
        setPlants(data);
        setEconomics(summary);
        setLoading(false);
      })
      .catch((requestError) => { if (alive) { setError(requestError.message); setLoading(false); } });
    return () => { alive = false; };
  }, [isEconomics]);

  const costs = useMemo(() => (economics ? costsByPlant(economics) : null), [economics]);

  const operational = useMemo(() => plants.filter(isOperational), [plants]);
  const filterOptions = useMemo(() => ({
    plantTypes: uniqSorted(operational.map((plant) => plant.asset_type)),
    entities: uniqSorted(operational.map((plant) => plant.entity)),
    regions: uniqSorted(operational.map((plant) => plant.region)),
  }), [operational]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const rows = operational.filter((plant) => {
      if (plantType && plant.asset_type !== plantType) return false;
      if (entity && plant.entity !== entity) return false;
      if (region && plant.region !== region) return false;
      if (!q) return true;
      return [plant.name, plant.external_id, plant.city, plant.region, plant.entity, plant.asset_type]
        .filter(Boolean)
        .some((field) => String(field).toLowerCase().includes(q));
    });
    if (!costs) return rows;
    // Economics: attach costs and list in merit order (cheapest Variable O&M first, unpriced last).
    return rows
      .map((plant) => ({ ...plant, cost: costs.get(plant.id) || null }))
      .sort((a, b) => (a.cost?.variableOm ?? Infinity) - (b.cost?.variableOm ?? Infinity) || String(a.name).localeCompare(String(b.name)));
  }, [operational, query, plantType, entity, region, costs]);

  // Production: operational fleet and contracted capacity, split by technology.
  const capacityKpis = useMemo(() => {
    if (isEconomics || !plants.length) return null;
    const capOf = (rows) => rows.reduce((sum, plant) => sum + (Number(plant.specifications?.contracted_capacity) || 0), 0);
    const kind = (plant) => String(plant.asset_type || "").toLowerCase();
    const desal = operational.filter((plant) => kind(plant).includes("desalination"));
    const purif = operational.filter((plant) => kind(plant).includes("purification"));
    return {
      total: plants.length,
      operational: operational.length,
      capacity: capOf(operational),
      desal: desal.length,
      desalCapacity: capOf(desal),
      purif: purif.length,
      purifCapacity: capOf(purif),
    };
  }, [isEconomics, plants, operational]);

  const costKpis = useMemo(() => {
    if (!costs) return null;
    const rows = operational.map((plant) => costs.get(plant.id)).filter(Boolean);
    const priced = rows.filter((c) => c.variableOm != null);
    const values = priced.map((c) => c.variableOm);
    return {
      total: operational.length,
      priced: priced.length,
      fromEconomics: rows.filter((c) => c.source === "economics").length,
      missing: operational.length - priced.length,
      avg: values.length ? values.reduce((a, b) => a + b, 0) / values.length : null,
      min: values.length ? Math.min(...values) : null,
      max: values.length ? Math.max(...values) : null,
      capex: rows.reduce((sum, c) => sum + (c.capex || 0), 0),
    };
  }, [costs, operational]);

  const openPlant = (plant) => {
    if (onOpenPlant) { onOpenPlant(plant); return; }
    navigate(`${basePath}/${encodeURIComponent(plant.id)}`);
  };
  const exportRows = () => downloadCsv(
    `widispatch-${isEconomics ? "plant-costs" : assetLabel}.csv`,
    recordsToCsv(filtered, isEconomics ? EXPORT_COST_COLUMNS : EXPORT_COLUMNS),
  );
  const maxVariableOm = costKpis?.max ?? 0;

  return (
    <main className={`ppl ppl--compact${isEconomics ? " ppl--economics" : ""}`}>
      {capacityKpis && (
        <div className="ppl-kpis">
          <Kpi icon={CircleCheck} tone="ok" label="Operational plants" value={capacityKpis.operational} unit={`/ ${capacityKpis.total}`}
            sub={capacityKpis.total - capacityKpis.operational ? `${capacityKpis.total - capacityKpis.operational} not operational` : "Whole fleet operational"} />
          <Kpi icon={Gauge} label="Contracted capacity" value={compact(capacityKpis.capacity)} unit="m³/day" sub="Operational plants" />
          <Kpi icon={Waves} label="Desalination" value={compact(capacityKpis.desalCapacity)} unit="m³/day"
            sub={`${capacityKpis.desal} plant${capacityKpis.desal === 1 ? "" : "s"}`} />
          <Kpi icon={FlaskConical} tone="ok" label="Purification" value={compact(capacityKpis.purifCapacity)} unit="m³/day"
            sub={`${capacityKpis.purif} plant${capacityKpis.purif === 1 ? "" : "s"}`} />
        </div>
      )}
      {costKpis && (
        <div className="ppl-kpis">
          <Kpi icon={CircleCheck} tone="ok" label="Plants priced" value={costKpis.priced} unit={`/ ${costKpis.total}`}
            sub={`${costKpis.fromEconomics} from approved Economics entries`} />
          <Kpi icon={Coins} label="Avg Variable O&M" value={rate(costKpis.avg)} unit="SAR/m³"
            sub={costKpis.min == null ? "No prices on file" : `Range ${rate(costKpis.min)} – ${rate(costKpis.max)}`} />
          <Kpi icon={TriangleAlert} tone={costKpis.missing ? "warn" : "ok"} label="Missing Variable O&M" value={costKpis.missing}
            sub={costKpis.missing ? "Dispatch uses a default rate" : "Every plant is priced"} />
          <Kpi icon={Banknote} label="Total CAPEX" value={compact(costKpis.capex)} unit="SAR" sub="Current entries, operational plants" />
        </div>
      )}
      <div className="ppl__panel">
        <header className="ppl__toolbar-row">
          <label className="ppl__search-wrap">
            <Search size={14} />
            <input
              className="ppl__search"
              aria-label={`Search ${assetLabel}`}
              placeholder="Search location, asset ID, name, entity…"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          <span className="ppl__result-count">
            {filtered.length} of {operational.length} operational {assetLabel}{isEconomics ? " · cheapest first" : ""}
          </span>
          <div className="ppl__viewtoggle" role="group" aria-label="View mode">
            <button type="button" className={view === "list" ? "is-active" : ""} onClick={() => setView("list")}><List size={13} /> List</button>
            <button type="button" className={view === "map" ? "is-active" : ""} onClick={() => setView("map")}><MapIcon size={13} /> Map</button>
          </div>
          <button type="button" className="ppl__toolbar-btn" onClick={exportRows}><Download size={13} /> Export CSV</button>
        </header>

        {loading && <div className="ppl__state">Loading {assetLabel}...</div>}
        {error && <div className="ppl__state ppl__state--err">Failed to load {assetLabel}: {error}</div>}

        {!loading && !error && view === "map" && (
          <div className="ppl__map"><AssetMapView assets={filtered} onView={openPlant} onEdit={openPlant} /></div>
        )}

        {!loading && !error && view === "list" && (
          <div className="ppl__table-wrap">
            <table className="ppl__table">
              <thead>
                <tr>
                  <th>Asset ID</th>
                  <th>{nameLabel}</th>
                  <th>
                    <select className={`ppl__head-select${plantType ? " is-set" : ""}`} aria-label={typeLabel} value={plantType} onChange={(e) => setPlantType(e.target.value)}>
                      <option value="">{typeLabel}: All</option>
                      {filterOptions.plantTypes.map((type) => <option key={type} value={type}>{type}</option>)}
                    </select>
                  </th>
                  {!isEconomics && <th>
                    <select className={`ppl__head-select${entity ? " is-set" : ""}`} aria-label="Entity" value={entity} onChange={(e) => setEntity(e.target.value)}>
                      <option value="">Entity: All</option>
                      {filterOptions.entities.map((item) => <option key={item} value={item}>{item}</option>)}
                    </select>
                  </th>}
                  <th>
                    <select className={`ppl__head-select${region ? " is-set" : ""}`} aria-label="Region" value={region} onChange={(e) => setRegion(e.target.value)}>
                      <option value="">Region: All</option>
                      {filterOptions.regions.map((item) => <option key={item} value={item}>{item}</option>)}
                    </select>
                  </th>
                  {isEconomics ? (
                    <>
                      <th className="ta-r">Variable O&amp;M (SAR/m³)</th>
                      <th className="ta-r">Fixed O&amp;M (SAR/mo)</th>
                      <th className="ta-r">CCR (SAR/mo)</th>
                      <th className="ta-r">CAPEX (SAR)</th>
                      <th>Cost source</th>
                    </>
                  ) : (
                    <>
                      <th>Status</th>
                      <th className="ta-r">Contracted (m³/day)</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {filtered.map((plant) => (
                  <tr key={plant.id} role="link" tabIndex={0} onClick={() => openPlant(plant)} onKeyDown={(event) => { if (event.key === "Enter") openPlant(plant); }}>
                    <td data-label="Asset ID" className="mono muted">{plant.external_id}</td>
                    <td data-label={nameLabel} className="ppl__identity-cell"><div className="ppl__name">{plant.name}</div><div className="ppl__city">{plant.city || "-"}</div></td>
                    <td data-label="Type"><span className={`ppl__badge ppl__badge--type ${typeBadgeClass(plant.asset_type)}`}>{plant.asset_type || "N/A"}</span></td>
                    {!isEconomics && <td data-label="Entity" className="muted">{plant.entity || "-"}</td>}
                    <td data-label="Region" className="muted">{plant.region || "-"}</td>
                    {isEconomics ? (
                      <>
                        <td data-label="Variable O&M" className="ta-r"><CostCell value={plant.cost?.variableOm} max={maxVariableOm} /></td>
                        <td data-label="Fixed O&M" className="ta-r mono">{money(plant.cost?.fixedOm)}</td>
                        <td data-label="CCR" className="ta-r mono">{money(plant.cost?.ccr)}</td>
                        <td data-label="CAPEX" className="ta-r mono">{money(plant.cost?.capex)}</td>
                        <td data-label="Cost source">
                          <span className={`ppl__badge ${(COST_SOURCE[plant.cost?.source] || COST_SOURCE.missing).cls}`}
                            title={plant.cost?.effectiveFrom ? `Effective from ${plant.cost.effectiveFrom}` : undefined}>
                            {(COST_SOURCE[plant.cost?.source] || COST_SOURCE.missing).label}
                          </span>
                        </td>
                      </>
                    ) : (
                      <>
                        <td data-label="Status"><StatusBadge status={plant.status} /></td>
                        <td data-label="Contracted" className="ta-r mono">{plant.specifications?.contracted_capacity?.toLocaleString() || "N/A"}</td>
                      </>
                    )}
                  </tr>
                ))}
                {filtered.length === 0 && <tr><td colSpan={isEconomics ? 9 : 7} className="ppl__empty">No {assetLabel} found matching your criteria.</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  );
}
