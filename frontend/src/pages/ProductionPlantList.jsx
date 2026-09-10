import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowDownAZ, Download, Search, X } from "lucide-react";
import { fetchProductionPlants } from "../api/production";
import { ColumnChooser, StatusBadge } from "../components/ui/WorkspacePrimitives";
import { downloadCsv } from "../lib/exportCsv";
import { formatStatus } from "../lib/status";
import { hiddenColumnsParam, parseHiddenColumns, recordsToCsv, toggleHiddenColumn } from "../lib/operatorTables";
import "./ProductionPlantList.css";

const uniqSorted = (values) => [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b));

const PRODUCTION_COLUMNS = [
  { key: "id", label: "Asset ID", get: (plant) => plant.external_id || "" },
  { key: "name", label: "Plant", get: (plant) => plant.name || "" },
  { key: "type", label: "Type", get: (plant) => plant.asset_type || "" },
  { key: "entity", label: "Entity", get: (plant) => plant.entity || "" },
  { key: "region", label: "Region", get: (plant) => plant.region || "" },
  { key: "status", label: "Status", get: (plant) => formatStatus(plant.status) },
  { key: "capacity", label: "Contracted (m3/day)", get: (plant) => plant.specifications?.contracted_capacity ?? "" },
  { key: "data", label: "Data readiness", get: (plant) => plant.hasData ? `Reporting${plant.latestDataDate ? ` - ${plant.latestDataDate}` : ""}` : "Pending" },
];
const PRODUCTION_COLUMN_KEYS = PRODUCTION_COLUMNS.map((column) => column.key);

const typeBadgeClass = (type) => {
  const normalized = String(type || "").toLowerCase();
  if (normalized.includes("desalination")) return "ppl__badge--type-desalination";
  if (normalized.includes("purification")) return "ppl__badge--type-purification";
  return "ppl__badge--type-other";
};

export default function ProductionPlantList({ basePath = "/production", onOpenPlant }) {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [plants, setPlants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [sort, setSort] = useState({ key: "name", direction: "asc" });
  const query = params.get("q") || "";
  const plantType = params.get("type") || "";
  const entity = params.get("entity") || "";
  const region = params.get("region") || "";
  const hiddenColumns = useMemo(() => parseHiddenColumns(params.get("hidden"), PRODUCTION_COLUMN_KEYS), [params]);
  const isVisible = (key) => !hiddenColumns.has(key);

  useEffect(() => {
    let alive = true;
    fetchProductionPlants()
      .then((data) => { if (alive) { setPlants(data); setLoading(false); } })
      .catch((requestError) => { if (alive) { setError(requestError.message); setLoading(false); } });
    return () => { alive = false; };
  }, []);

  const filterOptions = useMemo(() => ({
    plantTypes: uniqSorted(plants.map((plant) => plant.asset_type)),
    entities: uniqSorted(plants.map((plant) => plant.entity)),
    regions: uniqSorted(plants.map((plant) => plant.region)),
  }), [plants]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return plants.filter((plant) => {
      if (plantType && plant.asset_type !== plantType) return false;
      if (entity && plant.entity !== entity) return false;
      if (region && plant.region !== region) return false;
      if (!q) return true;
      return [plant.name, plant.external_id, plant.city, plant.region, plant.entity, plant.asset_type]
        .filter(Boolean)
        .some((field) => String(field).toLowerCase().includes(q));
    }).sort((a, b) => {
      const value = (plant) => sort.key === "capacity"
        ? Number(plant.specifications?.contracted_capacity || 0)
        : String(plant[sort.key] || "").toLowerCase();
      const left = value(a);
      const right = value(b);
      const direction = sort.direction === "asc" ? 1 : -1;
      return (typeof left === "number" ? left - right : left.localeCompare(right)) * direction;
    });
  }, [plants, query, plantType, entity, region, sort]);

  const updateFilter = (key, value) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value); else next.delete(key);
    setParams(next, { replace: true });
  };
  const clearFilters = () => {
    const next = new URLSearchParams(params);
    ["q", "type", "entity", "region"].forEach((key) => next.delete(key));
    setParams(next, { replace: true });
  };
  const toggleColumn = (key) => {
    const hidden = toggleHiddenColumn(hiddenColumns, key, PRODUCTION_COLUMN_KEYS);
    const next = new URLSearchParams(params);
    const value = hiddenColumnsParam(hidden, PRODUCTION_COLUMN_KEYS);
    if (value) next.set("hidden", value); else next.delete("hidden");
    setParams(next, { replace: true });
  };
  const exportRows = () => downloadCsv("widispatch-production-plants.csv", recordsToCsv(filtered, PRODUCTION_COLUMNS.filter((column) => isVisible(column.key))));
  const changeSort = (key) => setSort((current) => ({
    key,
    direction: current.key === key && current.direction === "asc" ? "desc" : "asc",
  }));
  const activeFilters = [query, plantType, entity, region].filter(Boolean).length;

  const openPlant = (plant) => {
    if (onOpenPlant) {
      onOpenPlant(plant);
      return;
    }
    navigate(`${basePath}/${encodeURIComponent(plant.id)}`);
  };

  return (
    <main className="ppl ppl--compact">
      <header className="ppl__head">
        <label className="ppl__search-wrap"><Search size={14} /><input className="ppl__search" aria-label="Search production plants" placeholder="Search name, ID, city, region, entity..." value={query} onChange={(event) => updateFilter("q", event.target.value)} /></label>
        <select className="ppl__filter" aria-label="Plant type" value={plantType} onChange={(event) => updateFilter("type", event.target.value)}>
          <option value="">All plant types</option>
          {filterOptions.plantTypes.map((type) => <option key={type} value={type}>{type}</option>)}
        </select>
        <select className="ppl__filter" aria-label="Entity" value={entity} onChange={(event) => updateFilter("entity", event.target.value)}>
          <option value="">All entities</option>
          {filterOptions.entities.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
        <select className="ppl__filter" aria-label="Region" value={region} onChange={(event) => updateFilter("region", event.target.value)}>
          <option value="">All regions</option>
          {filterOptions.regions.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
        <span className="ppl__result-count">{filtered.length} of {plants.length} plants</span>
        {activeFilters > 0 && <button type="button" className="ppl__toolbar-btn" onClick={clearFilters}><X size={13} /> Clear {activeFilters}</button>}
        <ColumnChooser columns={PRODUCTION_COLUMNS} hiddenColumns={hiddenColumns} onToggle={toggleColumn} label="Production columns" />
        <button type="button" className="ppl__toolbar-btn" onClick={exportRows}><Download size={13} /> Export CSV</button>
      </header>

      {loading && <div className="ppl__state">Loading plants...</div>}
      {error && <div className="ppl__state ppl__state--err">Failed to load plants: {error}</div>}

      {!loading && !error && (
        <div className="ppl__table-wrap">
          <table className="ppl__table">
            <thead>
              <tr>
                {isVisible("id") && <th>Asset ID</th>}
                {isVisible("name") && <th><button type="button" onClick={() => changeSort("name")}>Plant name <ArrowDownAZ size={11} /></button></th>}
                {isVisible("type") && <th>Type</th>}
                {isVisible("entity") && <th>Entity</th>}
                {isVisible("region") && <th><button type="button" onClick={() => changeSort("region")}>Region <ArrowDownAZ size={11} /></button></th>}
                {isVisible("status") && <th><button type="button" onClick={() => changeSort("status")}>Status <ArrowDownAZ size={11} /></button></th>}
                {isVisible("capacity") && <th className="ta-r"><button type="button" onClick={() => changeSort("capacity")}>Contracted (m3/day) <ArrowDownAZ size={11} /></button></th>}
                {isVisible("data") && <th>Data</th>}
              </tr>
            </thead>
            <tbody>
              {filtered.map((plant) => (
                <tr key={plant.id} role="link" tabIndex={0} onClick={() => openPlant(plant)} onKeyDown={(event) => { if (event.key === "Enter") openPlant(plant); }}>
                  {isVisible("id") && <td data-label="Asset ID" className="mono muted">{plant.external_id}</td>}
                  {isVisible("name") && <td data-label="Plant" className="ppl__identity-cell"><div className="ppl__name">{plant.name}</div><div className="ppl__city">{plant.city || "-"}</div></td>}
                  {isVisible("type") && <td data-label="Type"><span className={`ppl__badge ppl__badge--type ${typeBadgeClass(plant.asset_type)}`}>{plant.asset_type || "N/A"}</span></td>}
                  {isVisible("entity") && <td data-label="Entity" className="muted">{plant.entity || "-"}</td>}
                  {isVisible("region") && <td data-label="Region" className="muted">{plant.region || "-"}</td>}
                  {isVisible("status") && <td data-label="Status"><StatusBadge status={plant.status} /></td>}
                  {isVisible("capacity") && <td data-label="Contracted" className="ta-r mono">{plant.specifications?.contracted_capacity?.toLocaleString() || "N/A"}</td>}
                  {isVisible("data") && <td data-label="Data">{plant.hasData
                    ? <StatusBadge tone="success">Reporting{plant.latestDataDate ? ` - ${plant.latestDataDate}` : ""}</StatusBadge>
                    : <StatusBadge tone="warning">Pending</StatusBadge>}</td>}
                </tr>
              ))}
              {filtered.length === 0 && <tr><td colSpan={PRODUCTION_COLUMN_KEYS.length - hiddenColumns.size} className="ppl__empty">No plants match your filters.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
