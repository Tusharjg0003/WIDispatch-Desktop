import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { AlertTriangle, ArrowRight, Calculator, CircleDollarSign, Database, Download, Search } from "lucide-react";
import { fetchEconomics } from "../api/metrics";
import { formatStatus } from "../lib/status";
import { ColumnChooser, Notice, PageHeader, SkeletonGrid, StatCard, StatusBadge } from "../components/ui/WorkspacePrimitives";
import { downloadCsv } from "../lib/exportCsv";
import { hiddenColumnsParam, parseHiddenColumns, recordsToCsv, toggleHiddenColumn } from "../lib/operatorTables";
import "./EconomicsPage.css";

const nf = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });
const uniq = (values) => [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b));
const ECONOMICS_COLUMNS = [
  { key: "name", label: "Plant", get: (plant) => plant.name || "" },
  { key: "region", label: "Region", get: (plant) => plant.region || "" },
  { key: "status", label: "Status", get: (plant) => formatStatus(plant.status) },
  { key: "source", label: "Cost source", get: (plant) => plant.source === "economics" ? "Economics" : plant.source === "plant_spec" ? "Plant specification" : "Missing" },
  { key: "effective", label: "Effective from", get: (plant) => plant.effectiveFrom || "" },
  { key: "cost", label: "Variable O&M (SAR/m³)", get: (plant) => plant.variableOm ?? "" },
  { key: "relative", label: "Relative cost", get: (plant) => plant.variableOm ?? "" },
];
const ECONOMICS_COLUMN_KEYS = ECONOMICS_COLUMNS.map((column) => column.key);

export default function EconomicsPage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const query = params.get("q") || "";
  const source = params.get("source") || "";
  const region = params.get("region") || "";
  const hiddenColumns = useMemo(() => parseHiddenColumns(params.get("hidden"), ECONOMICS_COLUMN_KEYS), [params]);
  const isVisible = (key) => !hiddenColumns.has(key);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetchEconomics()
      .then((result) => alive && setData(result))
      .catch((requestError) => alive && setError(requestError.message || "Could not load economics data"))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, []);

  const plants = data?.plants || [];
  const regions = useMemo(() => uniq(plants.map((plant) => plant.region)), [plants]);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return plants.filter((plant) => {
      if (source && plant.source !== source) return false;
      if (region && plant.region !== region) return false;
      if (!q) return true;
      return [plant.name, plant.externalId, plant.entity, plant.region].filter(Boolean).some((value) => String(value).toLowerCase().includes(q));
    }).sort((a, b) => (a.variableOm ?? Number.POSITIVE_INFINITY) - (b.variableOm ?? Number.POSITIVE_INFINITY));
  }, [plants, query, source, region]);

  const updateParam = (key, value) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value); else next.delete(key);
    setParams(next, { replace: true });
  };
  const clear = () => {
    const next = new URLSearchParams(params);
    ["q", "source", "region"].forEach((key) => next.delete(key));
    setParams(next, { replace: true });
  };
  const toggleColumn = (key) => {
    const hidden = toggleHiddenColumn(hiddenColumns, key, ECONOMICS_COLUMN_KEYS);
    const next = new URLSearchParams(params);
    const value = hiddenColumnsParam(hidden, ECONOMICS_COLUMN_KEYS);
    if (value) next.set("hidden", value); else next.delete("hidden");
    setParams(next, { replace: true });
  };
  const exportRows = () => downloadCsv("widispatch-economics-readiness.csv", recordsToCsv(filtered, ECONOMICS_COLUMNS.filter((column) => isVisible(column.key))));
  const kpis = data?.kpis || {};
  const maxCost = Math.max(...plants.map((plant) => plant.variableOm || 0), 1);

  return (
    <main className="economics-page page-transition">

      {error && <Notice tone="critical" title="Economics unavailable">{error}</Notice>}
      {loading && <SkeletonGrid cards={4} />}
      {!loading && data && (
        <>

          <section className="economics-workspace">
            <header className="economics-filters">
              <label className="economics-filters__search"><Search size={14} /><input value={query} onChange={(event) => updateParam("q", event.target.value)} placeholder="Search plant, ID, entity, or region…" aria-label="Search economics plants" /></label>
              <select value={source} onChange={(event) => updateParam("source", event.target.value)} aria-label="Cost source">
                <option value="">All cost sources</option>
                <option value="economics">Economics</option>
                <option value="plant_spec">Plant specification</option>
                <option value="missing">Missing</option>
              </select>
              <select value={region} onChange={(event) => updateParam("region", event.target.value)} aria-label="Region">
                <option value="">All regions</option>
                {regions.map((item) => <option value={item} key={item}>{item}</option>)}
              </select>
              <span className="economics-filters__count">{filtered.length} of {plants.length} plants</span>
              {(query || source || region) && <button type="button" onClick={clear}>Clear filters</button>}
              <ColumnChooser columns={ECONOMICS_COLUMNS} hiddenColumns={hiddenColumns} onToggle={toggleColumn} label="Economics columns" />
              <button type="button" onClick={exportRows}><Download size={13} /> Export CSV</button>
            </header>

            <div className="economics-table-wrap">
              <table className="economics-table">
                <thead><tr>
                  {isVisible("name") && <th>Plant</th>}
                  {isVisible("region") && <th>Region</th>}
                  {isVisible("status") && <th>Status</th>}
                  {isVisible("source") && <th>Cost source</th>}
                  {isVisible("effective") && <th>Effective from</th>}
                  {isVisible("cost") && <th className="num">Variable O&M</th>}
                  {isVisible("relative") && <th>Relative cost</th>}
                  <th aria-label="Open" />
                </tr></thead>
                <tbody>
                  {filtered.map((plant) => (
                    <tr key={plant.id} role="link" tabIndex={0} onClick={() => navigate(`/economics/${encodeURIComponent(plant.id)}`)} onKeyDown={(event) => { if (event.key === "Enter") navigate(`/economics/${encodeURIComponent(plant.id)}`); }}>
                      {isVisible("name") && <td data-label="Plant" className="economics-table__identity"><strong>{plant.name}</strong><small>{plant.externalId || plant.id} · {plant.entity || "Entity not recorded"}</small></td>}
                      {isVisible("region") && <td data-label="Region">{plant.region || "—"}</td>}
                      {isVisible("status") && <td data-label="Status"><StatusBadge status={plant.status} /></td>}
                      {isVisible("source") && <td data-label="Cost source"><StatusBadge tone={plant.source === "economics" ? "success" : plant.source === "missing" ? "critical" : "warning"}>{plant.source === "economics" ? "Economics" : plant.source === "plant_spec" ? "Plant specification" : "Missing"}</StatusBadge></td>}
                      {isVisible("effective") && <td data-label="Effective" className="mono">{plant.effectiveFrom || "—"}</td>}
                      {isVisible("cost") && <td data-label="Variable O&M" className="num mono">{plant.variableOm == null ? "—" : `${nf.format(plant.variableOm)} SAR/m³`}</td>}
                      {isVisible("relative") && <td data-label="Relative cost"><div className="economics-cost-bar" title={plant.variableOm == null ? "No cost recorded" : `${plant.variableOm} SAR/m³`}><i style={{ width: `${plant.variableOm == null ? 0 : Math.max(4, (plant.variableOm / maxCost) * 100)}%` }} /></div></td>}
                      <td aria-label="Open plant financial detail"><ArrowRight size={14} /></td>
                    </tr>
                  ))}
                  {filtered.length === 0 && <tr><td colSpan={ECONOMICS_COLUMN_KEYS.length - hiddenColumns.size + 1} className="economics-table__empty">No plants match the active filters.</td></tr>}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </main>
  );
}
