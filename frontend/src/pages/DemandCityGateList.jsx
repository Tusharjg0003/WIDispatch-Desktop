import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Download, List, Map as MapIcon, Search } from "lucide-react";
import { fetchCityGates } from "../api/demand";
import { StatusBadge } from "../components/ui/WorkspacePrimitives";
import AssetMapView from "../components/AssetMapView";
import { downloadCsv } from "../lib/exportCsv";
import { recordsToCsv } from "../lib/operatorTables";
import "./ProductionPlantList.css";
import "./DemandCityGateList.css";

const uniqSorted = (values) => [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b));
const EXPORT_COLUMNS = [
  { key: "id", label: "Asset ID", get: (gate) => gate.external_id || "" },
  { key: "name", label: "City gate", get: (gate) => gate.name || "" },
  { key: "type", label: "Type", get: (gate) => gate.asset_type || "" },
  { key: "entity", label: "Entity", get: (gate) => gate.entity || "" },
  { key: "region", label: "Region", get: (gate) => gate.region || "" },
  { key: "status", label: "Status", get: (gate) => gate.status || "" },
  { key: "capacity", label: "Contracted (m3/day)", get: (gate) => gate.specifications?.contracted_capacity ?? "" },
];
const isOperational = (gate) => String(gate.status || "").toLowerCase() === "operational";

// City-gate list — matches the WIDispatch-Demand web app (Plants components
// relabelled "City Gate"): panel + search/count/List·Map toolbar, inline header
// filters, operational-only.
export default function DemandCityGateList({ basePath = "/demand", onOpenGate }) {
  const navigate = useNavigate();
  const [gates, setGates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [view, setView] = useState("list");
  const [query, setQuery] = useState("");
  const [gateType, setGateType] = useState("");
  const [entity, setEntity] = useState("");
  const [region, setRegion] = useState("");

  useEffect(() => {
    let alive = true;
    fetchCityGates()
      .then((data) => { if (alive) { setGates(data); setLoading(false); } })
      .catch((requestError) => { if (alive) { setError(requestError.message); setLoading(false); } });
    return () => { alive = false; };
  }, []);

  const operational = useMemo(() => gates.filter(isOperational), [gates]);
  const filterOptions = useMemo(() => ({
    gateTypes: uniqSorted(operational.map((gate) => gate.asset_type)),
    entities: uniqSorted(operational.map((gate) => gate.entity)),
    regions: uniqSorted(operational.map((gate) => gate.region)),
  }), [operational]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return operational.filter((gate) => {
      if (gateType && gate.asset_type !== gateType) return false;
      if (entity && gate.entity !== entity) return false;
      if (region && gate.region !== region) return false;
      if (!q) return true;
      return [gate.name, gate.external_id, gate.city, gate.region, gate.entity, gate.asset_type]
        .filter(Boolean)
        .some((field) => String(field).toLowerCase().includes(q));
    });
  }, [operational, query, gateType, entity, region]);

  const openGate = (gate) => {
    if (onOpenGate) { onOpenGate(gate); return; }
    navigate(`${basePath}/${encodeURIComponent(gate.id)}`);
  };
  const exportRows = () => downloadCsv("widispatch-city-gates.csv", recordsToCsv(filtered, EXPORT_COLUMNS));

  return (
    <main className="ppl ppl--compact demand-city-gates">
      <div className="ppl__panel">
        <header className="ppl__toolbar-row">
          <label className="ppl__search-wrap">
            <Search size={14} />
            <input className="ppl__search" aria-label="Search city gates" placeholder="Search location, asset ID, name, entity…" value={query} onChange={(event) => setQuery(event.target.value)} />
          </label>
          <span className="ppl__result-count">{filtered.length} of {operational.length} operational city gates</span>
          <div className="ppl__viewtoggle" role="group" aria-label="View mode">
            <button type="button" className={view === "list" ? "is-active" : ""} onClick={() => setView("list")}><List size={13} /> List</button>
            <button type="button" className={view === "map" ? "is-active" : ""} onClick={() => setView("map")}><MapIcon size={13} /> Map</button>
          </div>
          <button type="button" className="ppl__toolbar-btn" onClick={exportRows}><Download size={13} /> Export CSV</button>
        </header>

        {loading && <div className="ppl__state">Loading city gates...</div>}
        {error && <div className="ppl__state ppl__state--err">Failed to load city gates: {error}</div>}

        {!loading && !error && view === "map" && (
          <div className="ppl__map"><AssetMapView assets={filtered} onView={openGate} onEdit={openGate} /></div>
        )}

        {!loading && !error && view === "list" && (
          <div className="ppl__table-wrap">
            <table className="ppl__table">
              <thead><tr>
                <th>Asset ID</th>
                <th>City Gate Name</th>
                <th><select className="ppl__head-select" aria-label="City gate type" value={gateType} onChange={(e) => setGateType(e.target.value)}><option value="">City Gate Type: All</option>{filterOptions.gateTypes.map((t) => <option key={t} value={t}>{t}</option>)}</select></th>
                <th><select className="ppl__head-select" aria-label="Entity" value={entity} onChange={(e) => setEntity(e.target.value)}><option value="">Entity: All</option>{filterOptions.entities.map((t) => <option key={t} value={t}>{t}</option>)}</select></th>
                <th><select className="ppl__head-select" aria-label="Region" value={region} onChange={(e) => setRegion(e.target.value)}><option value="">Region: All</option>{filterOptions.regions.map((t) => <option key={t} value={t}>{t}</option>)}</select></th>
                <th>Status</th>
                <th className="ta-r">Contracted (m³/day)</th>
              </tr></thead>
              <tbody>
                {filtered.map((gate) => (
                  <tr key={gate.id} role="link" tabIndex={0} onClick={() => openGate(gate)} onKeyDown={(event) => { if (event.key === "Enter") openGate(gate); }}>
                    <td data-label="Asset ID" className="mono muted">{gate.external_id}</td>
                    <td data-label="City Gate" className="ppl__identity-cell"><div className="ppl__name">{gate.name}</div><div className="ppl__city">{gate.city || "-"}</div></td>
                    <td data-label="Type"><span className="ppl__badge">{gate.asset_type || "N/A"}</span></td>
                    <td data-label="Entity" className="muted">{gate.entity || "-"}</td>
                    <td data-label="Region" className="muted">{gate.region || "-"}</td>
                    <td data-label="Status"><StatusBadge status={gate.status} /></td>
                    <td data-label="Contracted" className="ta-r mono">{gate.specifications?.contracted_capacity?.toLocaleString() || "N/A"}</td>
                  </tr>
                ))}
                {filtered.length === 0 && <tr><td colSpan={7} className="ppl__empty">No city gates found matching your criteria.</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  );
}
