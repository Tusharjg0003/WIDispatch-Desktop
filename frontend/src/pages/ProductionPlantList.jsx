import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { fetchProductionPlants } from "../api/production";
import "./ProductionPlantList.css";

const uniqSorted = (values) => [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b));

export default function ProductionPlantList() {
  const navigate = useNavigate();
  const [plants, setPlants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [query, setQuery] = useState("");
  const [plantType, setPlantType] = useState("");
  const [entity, setEntity] = useState("");
  const [region, setRegion] = useState("");

  useEffect(() => {
    let alive = true;
    fetchProductionPlants()
      .then((data) => { if (alive) { setPlants(data); setLoading(false); } })
      .catch((e) => { if (alive) { setError(e.message); setLoading(false); } });
    return () => { alive = false; };
  }, []);

  const filterOptions = useMemo(() => ({
    plantTypes: uniqSorted(plants.map((p) => p.asset_type)),
    entities: uniqSorted(plants.map((p) => p.entity)),
    regions: uniqSorted(plants.map((p) => p.region)),
  }), [plants]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return plants.filter((p) => {
      if (plantType && p.asset_type !== plantType) return false;
      if (entity && p.entity !== entity) return false;
      if (region && p.region !== region) return false;
      if (!q) return true;
      return [p.name, p.external_id, p.city, p.region, p.entity, p.asset_type]
        .filter(Boolean)
        .some((f) => f.toLowerCase().includes(q));
    });
  }, [plants, query, plantType, entity, region]);

  return (
    <div className="ppl">
      <header className="ppl__head">
        <input className="ppl__search" placeholder="Search name, ID, city, region, entity…" value={query} onChange={(e) => setQuery(e.target.value)} />
        <select className="ppl__filter" aria-label="Plant type" value={plantType} onChange={(e) => setPlantType(e.target.value)}>
          <option value="">All Plant Types</option>
          {filterOptions.plantTypes.map((type) => <option key={type} value={type}>{type}</option>)}
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

      {loading && <div className="ppl__state">Loading plants…</div>}
      {error && <div className="ppl__state ppl__state--err">Failed to load plants: {error}</div>}

      {!loading && !error && (
        <div className="ppl__table-wrap">
          <table className="ppl__table">
            <thead>
              <tr>
                <th>Asset ID</th><th>Plant Name</th><th>Type</th><th>Entity</th><th>Region</th>
                <th>Status</th><th className="ta-r">Contracted (m³/day)</th><th>Data</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => (
                <tr key={p.id} onClick={() => navigate(`/production/${encodeURIComponent(p.id)}`)}>
                  <td className="mono muted">{p.external_id}</td>
                  <td><div className="ppl__name">{p.name}</div><div className="ppl__city">{p.city}</div></td>
                  <td><span className="ppl__badge ppl__badge--type">{p.asset_type || "N/A"}</span></td>
                  <td className="muted">{p.entity}</td>
                  <td className="muted">{p.region}</td>
                  <td>{p.status}</td>
                  <td className="ta-r mono">{p.specifications?.contracted_capacity?.toLocaleString() || "N/A"}</td>
                  <td>
                    {p.hasData
                      ? <span className="ppl__badge ppl__badge--data">Reporting{p.latestDataDate ? ` · ${p.latestDataDate}` : ""}</span>
                      : <span className="ppl__badge ppl__badge--pending">Pending</span>}
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && <tr><td colSpan={8} className="ppl__empty">No plants match your filters.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
