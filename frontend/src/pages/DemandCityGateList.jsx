import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { fetchCityGates } from "../api/demand";
import "./ProductionPlantList.css";
import "./DemandCityGateList.css";

const uniqSorted = (values) => [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b));

export default function DemandCityGateList() {
  const navigate = useNavigate();
  const [gates, setGates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [query, setQuery] = useState("");
  const [gateType, setGateType] = useState("");
  const [entity, setEntity] = useState("");
  const [region, setRegion] = useState("");

  useEffect(() => {
    let alive = true;
    fetchCityGates()
      .then((data) => { if (alive) { setGates(data); setLoading(false); } })
      .catch((e) => { if (alive) { setError(e.message); setLoading(false); } });
    return () => { alive = false; };
  }, []);

  const filterOptions = useMemo(() => ({
    gateTypes: uniqSorted(gates.map((g) => g.asset_type)),
    entities: uniqSorted(gates.map((g) => g.entity)),
    regions: uniqSorted(gates.map((g) => g.region)),
  }), [gates]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return gates.filter((g) => {
      if (gateType && g.asset_type !== gateType) return false;
      if (entity && g.entity !== entity) return false;
      if (region && g.region !== region) return false;
      if (!q) return true;
      return [g.name, g.external_id, g.city, g.region, g.entity, g.asset_type]
        .filter(Boolean)
        .some((f) => f.toLowerCase().includes(q));
    });
  }, [gates, query, gateType, entity, region]);

  return (
    <div className="ppl demand-city-gates">
      <div className="ppl__titlebar">
        <div>
          <h1 className="ppl__title">City Gates</h1>
          <p className="ppl__subtitle">Demand delivery points · view only</p>
        </div>
      </div>

      <header className="ppl__head">
        <input className="ppl__search" placeholder="Search city gates by name, ID, city, region, entity…" value={query} onChange={(e) => setQuery(e.target.value)} />
        <select className="ppl__filter" aria-label="Gate type" value={gateType} onChange={(e) => setGateType(e.target.value)}>
          <option value="">All Gate Types</option>
          {filterOptions.gateTypes.map((type) => <option key={type} value={type}>{type}</option>)}
        </select>
        <select className="ppl__filter" aria-label="Entity" value={entity} onChange={(e) => setEntity(e.target.value)}>
          <option value="">All Entities</option>
          {filterOptions.entities.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
        <select className="ppl__filter" aria-label="Region" value={region} onChange={(e) => setRegion(e.target.value)}>
          <option value="">All Regions</option>
          {filterOptions.regions.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
      </header>

      {loading && <div className="ppl__state">Loading city gates…</div>}
      {error && <div className="ppl__state ppl__state--err">Failed to load city gates: {error}</div>}

      {!loading && !error && (
        <div className="ppl__table-wrap">
          <table className="ppl__table">
            <thead>
              <tr>
                <th>Asset ID</th><th>City Gate Name</th><th>Type</th><th>Entity</th><th>Region</th>
                <th>Status</th><th className="ta-r">Contracted (m³/day)</th><th>Data</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((g) => (
                <tr key={g.id} onClick={() => navigate(`/demand/${encodeURIComponent(g.id)}`)}>
                  <td className="mono muted">{g.external_id}</td>
                  <td><div className="ppl__name">{g.name}</div><div className="ppl__city">{g.city || "—"}</div></td>
                  <td><span className="ppl__badge">{g.asset_type || "N/A"}</span></td>
                  <td className="muted">{g.entity || "—"}</td>
                  <td className="muted">{g.region || "—"}</td>
                  <td>{g.status || "N/A"}</td>
                  <td className="ta-r mono">{g.specifications?.contracted_capacity?.toLocaleString() || "N/A"}</td>
                  <td>
                    {g.hasData
                      ? <span className="ppl__badge ppl__badge--data">Reporting{g.latestDataDate ? ` · ${g.latestDataDate}` : ""}</span>
                      : <span className="ppl__badge ppl__badge--pending">Pending</span>}
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && <tr><td colSpan={8} className="ppl__empty">No city gates match your filters.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
