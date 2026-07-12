import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Factory } from "lucide-react";
import { fetchProductionPlants } from "../api/production";
import "./ProductionPlantList.css";

export default function ProductionPlantList() {
  const navigate = useNavigate();
  const [plants, setPlants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    let alive = true;
    fetchProductionPlants()
      .then((data) => { if (alive) { setPlants(data); setLoading(false); } })
      .catch((e) => { if (alive) { setError(e.message); setLoading(false); } });
    return () => { alive = false; };
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return plants;
    return plants.filter((p) =>
      [p.name, p.external_id, p.city, p.region, p.entity].filter(Boolean).some((f) => f.toLowerCase().includes(q)),
    );
  }, [plants, query]);

  return (
    <div className="ppl">
      <header className="ppl__head">
        <div className="ppl__title"><Factory size={18} /><h1>Production — Plants</h1></div>
        <input className="ppl__search" placeholder="Search name, ID, city, region, entity…" value={query} onChange={(e) => setQuery(e.target.value)} />
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
              {filtered.length === 0 && <tr><td colSpan={8} className="ppl__empty">No plants match your search.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
