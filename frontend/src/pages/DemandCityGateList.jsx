import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Download, Search, X } from "lucide-react";
import { fetchCityGates } from "../api/demand";
import { ColumnChooser, StatusBadge } from "../components/ui/WorkspacePrimitives";
import { downloadCsv } from "../lib/exportCsv";
import { hiddenColumnsParam, parseHiddenColumns, recordsToCsv, toggleHiddenColumn } from "../lib/operatorTables";
import { formatStatus } from "../lib/status";
import "./ProductionPlantList.css";
import "./DemandCityGateList.css";

const uniqSorted = (values) => [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b));
const DEMAND_COLUMNS = [
  { key: "id", label: "Asset ID", get: (gate) => gate.external_id || "" },
  { key: "name", label: "City gate", get: (gate) => gate.name || "" },
  { key: "type", label: "Type", get: (gate) => gate.asset_type || "" },
  { key: "entity", label: "Entity", get: (gate) => gate.entity || "" },
  { key: "region", label: "Region", get: (gate) => gate.region || "" },
  { key: "status", label: "Status", get: (gate) => formatStatus(gate.status) },
  { key: "capacity", label: "Contracted (m3/day)", get: (gate) => gate.specifications?.contracted_capacity ?? "" },
  { key: "data", label: "Data readiness", get: (gate) => gate.hasData ? `Reporting${gate.latestDataDate ? ` - ${gate.latestDataDate}` : ""}` : "Pending" },
];
const DEMAND_COLUMN_KEYS = DEMAND_COLUMNS.map((column) => column.key);

export default function DemandCityGateList({ basePath = "/demand", onOpenGate }) {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [gates, setGates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const query = params.get("q") || "";
  const gateType = params.get("type") || "";
  const entity = params.get("entity") || "";
  const region = params.get("region") || "";
  const status = params.get("status") || "";
  const hiddenColumns = useMemo(() => parseHiddenColumns(params.get("hidden"), DEMAND_COLUMN_KEYS), [params]);
  const isVisible = (key) => !hiddenColumns.has(key);

  useEffect(() => {
    let alive = true;
    fetchCityGates()
      .then((data) => { if (alive) { setGates(data); setLoading(false); } })
      .catch((requestError) => { if (alive) { setError(requestError.message); setLoading(false); } });
    return () => { alive = false; };
  }, []);

  const filterOptions = useMemo(() => ({
    gateTypes: uniqSorted(gates.map((gate) => gate.asset_type)),
    entities: uniqSorted(gates.map((gate) => gate.entity)),
    regions: uniqSorted(gates.map((gate) => gate.region)),
    statuses: uniqSorted(gates.map((gate) => gate.status)),
  }), [gates]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return gates.filter((gate) => {
      if (gateType && gate.asset_type !== gateType) return false;
      if (entity && gate.entity !== entity) return false;
      if (region && gate.region !== region) return false;
      if (status && gate.status !== status) return false;
      if (!q) return true;
      return [gate.name, gate.external_id, gate.city, gate.region, gate.entity, gate.asset_type]
        .filter(Boolean)
        .some((field) => String(field).toLowerCase().includes(q));
    });
  }, [gates, query, gateType, entity, region, status]);

  const hasFilters = query || gateType || entity || region || status;
  const updateFilter = (key, value) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value); else next.delete(key);
    setParams(next, { replace: true });
  };
  const clearFilters = () => {
    const next = new URLSearchParams(params);
    ["q", "type", "entity", "region", "status"].forEach((key) => next.delete(key));
    setParams(next, { replace: true });
  };
  const toggleColumn = (key) => {
    const hidden = toggleHiddenColumn(hiddenColumns, key, DEMAND_COLUMN_KEYS);
    const next = new URLSearchParams(params);
    const value = hiddenColumnsParam(hidden, DEMAND_COLUMN_KEYS);
    if (value) next.set("hidden", value); else next.delete("hidden");
    setParams(next, { replace: true });
  };
  const exportRows = () => downloadCsv("widispatch-city-gates.csv", recordsToCsv(filtered, DEMAND_COLUMNS.filter((column) => isVisible(column.key))));

  const openGate = (gate) => {
    if (onOpenGate) {
      onOpenGate(gate);
      return;
    }
    navigate(`${basePath}/${encodeURIComponent(gate.id)}`);
  };

  return (
    <main className="ppl demand-city-gates">
      <header className="ppl__head">
        <label className="ppl__search-wrap"><Search size={14} /><input className="ppl__search" aria-label="Search city gates" placeholder="Search city gates by name, ID, city, region, entity..." value={query} onChange={(event) => updateFilter("q", event.target.value)} /></label>
        <select className="ppl__filter" aria-label="Gate type" value={gateType} onChange={(event) => updateFilter("type", event.target.value)}>
          <option value="">All gate types</option>
          {filterOptions.gateTypes.map((type) => <option key={type} value={type}>{type}</option>)}
        </select>
        <select className="ppl__filter" aria-label="Entity" value={entity} onChange={(event) => updateFilter("entity", event.target.value)}>
          <option value="">All entities</option>
          {filterOptions.entities.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
        <select className="ppl__filter" aria-label="Region" value={region} onChange={(event) => updateFilter("region", event.target.value)}>
          <option value="">All regions</option>
          {filterOptions.regions.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
        <select className="ppl__filter" aria-label="Status" value={status} onChange={(event) => updateFilter("status", event.target.value)}>
          <option value="">All statuses</option>
          {filterOptions.statuses.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
        <span className="ppl__result-count">{filtered.length} of {gates.length} gates</span>
        {hasFilters && <button type="button" className="ppl__toolbar-btn" onClick={clearFilters}><X size={13} /> Clear filters</button>}
        <ColumnChooser columns={DEMAND_COLUMNS} hiddenColumns={hiddenColumns} onToggle={toggleColumn} label="Demand columns" />
        <button type="button" className="ppl__toolbar-btn" onClick={exportRows}><Download size={13} /> Export CSV</button>
      </header>

      {loading && <div className="ppl__state">Loading city gates...</div>}
      {error && <div className="ppl__state ppl__state--err">Failed to load city gates: {error}</div>}

      {!loading && !error && (
        <div className="ppl__table-wrap">
          <table className="ppl__table">
            <thead><tr>
              {isVisible("id") && <th>Asset ID</th>}
              {isVisible("name") && <th>City gate name</th>}
              {isVisible("type") && <th>Type</th>}
              {isVisible("entity") && <th>Entity</th>}
              {isVisible("region") && <th>Region</th>}
              {isVisible("status") && <th>Status</th>}
              {isVisible("capacity") && <th className="ta-r">Contracted (m3/day)</th>}
              {isVisible("data") && <th>Data</th>}
            </tr></thead>
            <tbody>
              {filtered.map((gate) => (
                <tr key={gate.id} role="link" tabIndex={0} onClick={() => openGate(gate)} onKeyDown={(event) => { if (event.key === "Enter") openGate(gate); }}>
                  {isVisible("id") && <td data-label="Asset ID" className="mono muted">{gate.external_id}</td>}
                  {isVisible("name") && <td data-label="City gate" className="ppl__identity-cell"><div className="ppl__name">{gate.name}</div><div className="ppl__city">{gate.city || "-"}</div></td>}
                  {isVisible("type") && <td data-label="Type"><span className="ppl__badge">{gate.asset_type || "N/A"}</span></td>}
                  {isVisible("entity") && <td data-label="Entity" className="muted">{gate.entity || "-"}</td>}
                  {isVisible("region") && <td data-label="Region" className="muted">{gate.region || "-"}</td>}
                  {isVisible("status") && <td data-label="Status"><StatusBadge status={gate.status} /></td>}
                  {isVisible("capacity") && <td data-label="Contracted" className="ta-r mono">{gate.specifications?.contracted_capacity?.toLocaleString() || "N/A"}</td>}
                  {isVisible("data") && <td data-label="Data">{gate.hasData
                    ? <StatusBadge tone="success">Reporting{gate.latestDataDate ? ` - ${gate.latestDataDate}` : ""}</StatusBadge>
                    : <StatusBadge tone="warning">Pending</StatusBadge>}</td>}
                </tr>
              ))}
              {filtered.length === 0 && <tr><td colSpan={DEMAND_COLUMN_KEYS.length - hiddenColumns.size} className="ppl__empty">No city gates match your filters.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
