import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { fetchTransmissionPumpStations } from "../api/metrics";
import { activeFunctionalPumps, backupPumps, totalDesignCapacity } from "../lib/pumpStation";
import "./ProductionPlantList.css";
import "./TransmissionPage.css";

const uniqSorted = (values) => [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b));

const fmtDate = (value) => {
  if (!value || value === "NULL") return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "—"
    : date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "2-digit" });
};

export default function TransmissionPage() {
  const navigate = useNavigate();
  const [stations, setStations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [entity, setEntity] = useState("");
  const [region, setRegion] = useState("");

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    fetchTransmissionPumpStations()
      .then((data) => {
        if (alive) {
          setStations(data);
          setLoading(false);
        }
      })
      .catch((e) => {
        if (alive) {
          setError(e.message);
          setLoading(false);
        }
      });
    return () => { alive = false; };
  }, []);

  const filterOptions = useMemo(() => ({
    statuses: uniqSorted(stations.map((station) => station.status)),
    entities: uniqSorted(stations.map((station) => station.entity)),
    regions: uniqSorted(stations.map((station) => station.region)),
  }), [stations]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return stations.filter((station) => {
      if (status && station.status !== status) return false;
      if (entity && station.entity !== entity) return false;
      if (region && station.region !== region) return false;
      if (!q) return true;
      return [station.name, station.external_id, station.city, station.region, station.entity, station.asset_type]
        .filter(Boolean)
        .some((field) => field.toLowerCase().includes(q));
    });
  }, [stations, query, status, entity, region]);

  return (
    <div className="ppl transmission-stations">
      <div className="ppl__titlebar">
        <div>
          <h1 className="ppl__title">Pump Stations</h1>
          <p className="ppl__subtitle">Transmission assets · view only</p>
        </div>
      </div>

      <header className="ppl__head">
        <input
          className="ppl__search"
          placeholder="Search pump stations by name, ID, city, region, entity…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <select className="ppl__filter" aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All Statuses</option>
          {filterOptions.statuses.map((item) => <option key={item} value={item}>{item}</option>)}
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

      {loading && <div className="ppl__state">Loading pump stations…</div>}
      {error && <div className="ppl__state ppl__state--err">Failed to load pump stations: {error}</div>}

      {!loading && !error && (
        <div className="ppl__table-wrap">
          <table className="ppl__table">
            <thead>
              <tr>
                <th>Asset ID</th>
                <th>Pump Station Name</th>
                <th>Entity</th>
                <th>Region</th>
                <th>Status</th>
                <th>Commissioning Date</th>
                <th>Decommissioning Date</th>
                <th className="ta-r">Functional Pumps</th>
                <th className="ta-r">Backup Pumps</th>
                <th className="ta-r">Design Capacity (m³/day)</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((station) => (
                <tr key={station.id} onClick={() => navigate(`/transmission/${encodeURIComponent(station.id)}`)}>
                  <td className="mono muted">{station.external_id}</td>
                  <td>
                    <div className="ppl__name">{station.name}</div>
                    <div className="ppl__city">{station.city || "—"}</div>
                  </td>
                  <td className="muted">{station.entity || "—"}</td>
                  <td className="muted">{station.region || "—"}</td>
                  <td><span className="ppl__badge">{station.status || "N/A"}</span></td>
                  <td className="muted">{fmtDate(station.commissioning_date)}</td>
                  <td className="muted">{fmtDate(station.decommissioning_date)}</td>
                  <td className="ta-r mono">{activeFunctionalPumps(station.specifications).length}</td>
                  <td className="ta-r mono">{backupPumps(station.specifications).length}</td>
                  <td className="ta-r mono">{totalDesignCapacity(station.specifications).toLocaleString()}</td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={10} className="ppl__empty">No pump stations match your filters.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
