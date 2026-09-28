import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Download, List, Map as MapIcon, Search } from "lucide-react";
import { fetchProductionPlants } from "../api/production";
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

// Production plant list — matches the WIDispatch-Production web app: a single
// panel with a search + count + List/Map toggle toolbar, inline Type/Entity/Region
// filters in the header cells, and an operational-only pre-filter.
export default function ProductionPlantList({
  basePath = "/production", onOpenPlant,
  assetLabel = "plants", assetLabelSingular = "plant",
  nameLabel = "Plant name", typeLabel = "Plant Type",
}) {
  const navigate = useNavigate();
  const [plants, setPlants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [view, setView] = useState("list");
  const [query, setQuery] = useState("");
  const [plantType, setPlantType] = useState("");
  const [entity, setEntity] = useState("");
  const [region, setRegion] = useState("");

  useEffect(() => {
    let alive = true;
    fetchProductionPlants()
      .then((data) => { if (alive) { setPlants(data); setLoading(false); } })
      .catch((requestError) => { if (alive) { setError(requestError.message); setLoading(false); } });
    return () => { alive = false; };
  }, []);

  const operational = useMemo(() => plants.filter(isOperational), [plants]);
  const filterOptions = useMemo(() => ({
    plantTypes: uniqSorted(operational.map((plant) => plant.asset_type)),
    entities: uniqSorted(operational.map((plant) => plant.entity)),
    regions: uniqSorted(operational.map((plant) => plant.region)),
  }), [operational]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return operational.filter((plant) => {
      if (plantType && plant.asset_type !== plantType) return false;
      if (entity && plant.entity !== entity) return false;
      if (region && plant.region !== region) return false;
      if (!q) return true;
      return [plant.name, plant.external_id, plant.city, plant.region, plant.entity, plant.asset_type]
        .filter(Boolean)
        .some((field) => String(field).toLowerCase().includes(q));
    });
  }, [operational, query, plantType, entity, region]);

  const openPlant = (plant) => {
    if (onOpenPlant) { onOpenPlant(plant); return; }
    navigate(`${basePath}/${encodeURIComponent(plant.id)}`);
  };
  const exportRows = () => downloadCsv(`widispatch-${assetLabel}.csv`, recordsToCsv(filtered, EXPORT_COLUMNS));

  return (
    <main className="ppl ppl--compact">
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
          <span className="ppl__result-count">{filtered.length} of {operational.length} operational {assetLabel}</span>
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
                    <select className="ppl__head-select" aria-label={typeLabel} value={plantType} onChange={(e) => setPlantType(e.target.value)}>
                      <option value="">{typeLabel}: All</option>
                      {filterOptions.plantTypes.map((type) => <option key={type} value={type}>{type}</option>)}
                    </select>
                  </th>
                  <th>
                    <select className="ppl__head-select" aria-label="Entity" value={entity} onChange={(e) => setEntity(e.target.value)}>
                      <option value="">Entity: All</option>
                      {filterOptions.entities.map((item) => <option key={item} value={item}>{item}</option>)}
                    </select>
                  </th>
                  <th>
                    <select className="ppl__head-select" aria-label="Region" value={region} onChange={(e) => setRegion(e.target.value)}>
                      <option value="">Region: All</option>
                      {filterOptions.regions.map((item) => <option key={item} value={item}>{item}</option>)}
                    </select>
                  </th>
                  <th>Status</th>
                  <th className="ta-r">Contracted (m³/day)</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((plant) => (
                  <tr key={plant.id} role="link" tabIndex={0} onClick={() => openPlant(plant)} onKeyDown={(event) => { if (event.key === "Enter") openPlant(plant); }}>
                    <td data-label="Asset ID" className="mono muted">{plant.external_id}</td>
                    <td data-label={nameLabel} className="ppl__identity-cell"><div className="ppl__name">{plant.name}</div><div className="ppl__city">{plant.city || "-"}</div></td>
                    <td data-label="Type"><span className={`ppl__badge ppl__badge--type ${typeBadgeClass(plant.asset_type)}`}>{plant.asset_type || "N/A"}</span></td>
                    <td data-label="Entity" className="muted">{plant.entity || "-"}</td>
                    <td data-label="Region" className="muted">{plant.region || "-"}</td>
                    <td data-label="Status"><StatusBadge status={plant.status} /></td>
                    <td data-label="Contracted" className="ta-r mono">{plant.specifications?.contracted_capacity?.toLocaleString() || "N/A"}</td>
                  </tr>
                ))}
                {filtered.length === 0 && <tr><td colSpan={7} className="ppl__empty">No {assetLabel} found matching your criteria.</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  );
}
