import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  fetchTransmissionPumpStations,
  fetchTransmissionSystems,
  fetchTransmissionLines,
  deleteTransmissionLine,
} from "../api/metrics";
import { fetchNetwork, fetchNetworks } from "../api/networks";
import { activeFunctionalPumps, backupPumps, totalDesignCapacity } from "../lib/pumpStation";
import { lineDisplayName, lineSystemId } from "../lib/transmissionLines";
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
const asArray = (value) => (Array.isArray(value) ? value : []);
const finiteNumber = (value) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
};

function removeLineFromEdge(edge, lineId) {
  const data = edge?.data || edge;
  const meta = data?.meta || {};
  const specs = meta.specifications || {};
  if (!Array.isArray(specs.lineGroupIds) || !specs.lineGroupIds.includes(lineId)) return edge;

  const nextIds = specs.lineGroupIds.filter((id) => id !== lineId);
  const nextSpecs = { ...specs };
  if (nextIds.length) nextSpecs.lineGroupIds = nextIds;
  else delete nextSpecs.lineGroupIds;

  if (edge?.data) {
    return {
      ...edge,
      data: {
        ...data,
        meta: {
          ...meta,
          specifications: nextSpecs,
        },
      },
    };
  }

  return {
    ...edge,
    meta: {
      ...meta,
      specifications: nextSpecs,
    },
  };
}

const removeLineFromNetworks = (networks, lineId) => networks.map((network) => ({
  ...network,
  edges: asArray(network.edges).map((edge) => removeLineFromEdge(edge, lineId)),
}));

export default function TransmissionPage() {
  const navigate = useNavigate();
  const [stations, setStations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [entity, setEntity] = useState("");
  const [region, setRegion] = useState("");
  const [activeTab, setActiveTab] = useState("pump-stations");
  const [systems, setSystems] = useState([]);
  const [systemsLoading, setSystemsLoading] = useState(true);
  const [systemsError, setSystemsError] = useState(null);
  const [systemsQuery, setSystemsQuery] = useState("");
  const [lines, setLines] = useState([]);
  const [networks, setNetworks] = useState([]);
  const [networksLoading, setNetworksLoading] = useState(true);
  const [networksError, setNetworksError] = useState(null);
  const [selectedSystemId, setSelectedSystemId] = useState(null);
  const [deletingLineId, setDeletingLineId] = useState(null);
  const [lineDeleteError, setLineDeleteError] = useState(null);

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

  useEffect(() => {
    let alive = true;
    setSystemsLoading(true);
    setSystemsError(null);
    fetchTransmissionSystems()
      .then((data) => {
        if (alive) {
          setSystems(data.systems || []);
          setSystemsLoading(false);
        }
      })
      .catch((e) => {
        if (alive) {
          setSystemsError(e.message);
          setSystemsLoading(false);
        }
      });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    let alive = true;
    fetchTransmissionLines()
      .then((data) => { if (alive) setLines(data.lines || []); })
      .catch(() => { if (alive) setLines([]); });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    let alive = true;
    setNetworksLoading(true);
    setNetworksError(null);
    fetchNetworks()
      .then(async (data) => {
        const summaries = data.networks || [];
        const details = await Promise.all(summaries.map((network) => fetchNetwork(network.id)));
        if (alive) {
          setNetworks(details);
          setNetworksLoading(false);
        }
      })
      .catch((e) => {
        if (alive) {
          setNetworksError(e.message);
          setNetworksLoading(false);
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

  const filteredSystems = useMemo(() => {
    const q = systemsQuery.trim().toLowerCase();
    if (!q) return systems;
    return systems.filter((system) =>
      [system.name, system.id].filter(Boolean).some((field) => String(field).toLowerCase().includes(q))
    );
  }, [systems, systemsQuery]);

  const systemBreakdowns = useMemo(() => {
    const lineById = new Map(lines.map((line) => [line.id, line]));
    const map = new Map(systems.map((system) => [
      system.id,
      {
        system,
        pipes: [],
        lineIds: new Set(),
        networkIds: new Set(),
        totalLength: 0,
        totalCapacity: 0,
      },
    ]));

    lines.forEach((line) => {
      const systemId = lineSystemId(line);
      if (!systemId) return;
      if (!map.has(systemId)) {
        map.set(systemId, {
          system: { id: systemId, name: systemId },
          pipes: [],
          lineIds: new Set(),
          networkIds: new Set(),
          totalLength: 0,
          totalCapacity: 0,
        });
      }
      map.get(systemId).lineIds.add(line.id);
    });

    networks.forEach((network) => {
      const nodesById = new Map(asArray(network.nodes).map((node) => {
        const data = node.data || node;
        return [data.id || node.id, data.label || data.displayLabel || data.assetId || data.id || node.id];
      }));

      asArray(network.edges).forEach((edge) => {
        const data = edge.data || edge;
        const spec = data.meta?.specifications || {};
        const systemId = spec.transmissionSystemId;
        if (!systemId) return;
        if (!map.has(systemId)) {
          map.set(systemId, {
            system: { id: systemId, name: systemId },
            pipes: [],
            lineIds: new Set(),
            networkIds: new Set(),
            totalLength: 0,
            totalCapacity: 0,
          });
        }
        const bucket = map.get(systemId);
        const length = finiteNumber(spec.pipelineLength ?? spec.length_km);
        const capacity = finiteNumber(spec.capacity ?? spec.designCapacity ?? spec.maximumCapacity);
        const lineIds = asArray(spec.lineGroupIds);
        lineIds.forEach((lineId) => {
          const line = lineById.get(lineId);
          const lineSystem = lineSystemId(line);
          if (!lineSystem || lineSystem === systemId) bucket.lineIds.add(lineId);
        });
        bucket.networkIds.add(network.id);
        if (length != null) bucket.totalLength += length;
        if (capacity != null) bucket.totalCapacity += capacity;
        bucket.pipes.push({
          id: data.id || edge.id,
          name: data.label || data.displayLabel || data.id || edge.id,
          source: nodesById.get(data.source) || data.source || "-",
          target: nodesById.get(data.target) || data.target || "-",
          networkId: network.id,
          networkName: network.name || network.id,
          length,
          capacity,
          lines: lineIds.map((lineId) => lineById.get(lineId) || { id: lineId, name: lineId }),
        });
      });
    });

    return map;
  }, [systems, lines, networks]);

  const selectedSystem = selectedSystemId
    ? systemBreakdowns.get(selectedSystemId) || null
    : null;

  const handleDeleteSystemLine = async (line) => {
    if (!line?.id || deletingLineId) return;
    const label = lineDisplayName(line);
    if (!window.confirm(`Delete "${label}"? This removes it from saved network pipes too.`)) return;

    setDeletingLineId(line.id);
    setLineDeleteError(null);
    try {
      await deleteTransmissionLine(line.id);
      setLines((prev) => prev
        .filter((item) => item.id !== line.id)
        .map((item) => (item.parentLineId === line.id ? { ...item, parentLineId: null } : item)));
      setNetworks((prev) => removeLineFromNetworks(prev, line.id));
    } catch (err) {
      setLineDeleteError(err.message || "Failed to delete transmission line");
    } finally {
      setDeletingLineId(null);
    }
  };

  return (
    <div className="ppl transmission-stations">
      <div className="ppl__titlebar">
        <div>
          <h1 className="ppl__title">Transmission</h1>
          <p className="ppl__subtitle">Transmission assets · view only</p>
        </div>
      </div>

      <div className="transmission-tabs" role="tablist" aria-label="Transmission sections">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "pump-stations"}
          className={`transmission-tab${activeTab === "pump-stations" ? " transmission-tab--active" : ""}`}
          onClick={() => setActiveTab("pump-stations")}
        >
          Pump Stations <span>{stations.length}</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "systems"}
          className={`transmission-tab${activeTab === "systems" ? " transmission-tab--active" : ""}`}
          onClick={() => setActiveTab("systems")}
        >
          Transmission Systems <span>{systems.length}</span>
        </button>
      </div>

      {activeTab === "pump-stations" && (
        <>
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
        </>
      )}

      {activeTab === "systems" && (
        <>
          <header className="ppl__head">
            <input
              className="ppl__search"
              placeholder="Search transmission systems by name or ID..."
              value={systemsQuery}
              onChange={(e) => setSystemsQuery(e.target.value)}
            />
          </header>

          {systemsLoading && <div className="ppl__state">Loading transmission systems...</div>}
          {systemsError && <div className="ppl__state ppl__state--err">Failed to load transmission systems: {systemsError}</div>}

          {networksLoading && <div className="ppl__state">Loading system breakdowns...</div>}
          {networksError && <div className="ppl__state ppl__state--err">Failed to load network breakdowns: {networksError}</div>}

          {!systemsLoading && !systemsError && (
            <div className="transmission-systems-layout">
              <div className="ppl__table-wrap">
                <table className="ppl__table transmission-systems-table">
                  <thead>
                    <tr>
                      <th>System ID</th>
                      <th>Transmission System</th>
                      <th className="ta-r">Networks</th>
                      <th className="ta-r">Lines</th>
                      <th className="ta-r">Pipes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredSystems.map((system) => {
                      const breakdown = systemBreakdowns.get(system.id);
                      return (
                        <tr
                          key={system.id}
                          className={selectedSystemId === system.id ? "transmission-systems-table__row--active" : ""}
                          onClick={() => setSelectedSystemId(system.id)}
                        >
                          <td className="mono muted">{system.id}</td>
                          <td>
                            <div className="ppl__name">{system.name || "Unnamed system"}</div>
                          </td>
                          <td className="ta-r mono">{breakdown?.networkIds.size || 0}</td>
                          <td className="ta-r mono">{breakdown?.lineIds.size || 0}</td>
                          <td className="ta-r mono">{breakdown?.pipes.length || 0}</td>
                        </tr>
                      );
                    })}
                    {filteredSystems.length === 0 && (
                      <tr>
                        <td colSpan={5} className="ppl__empty">No transmission systems found.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              <aside className="transmission-system-detail">
                {!selectedSystem ? (
                  <div className="transmission-system-detail__empty">Select a transmission system to view its pipes, lines, and networks.</div>
                ) : (
                  <>
                    <header className="transmission-system-detail__head">
                      <span>Transmission System</span>
                      <h2>{selectedSystem.system.name || selectedSystem.system.id}</h2>
                      <p className="mono">{selectedSystem.system.id}</p>
                    </header>

                    <div className="transmission-system-kpis">
                      <div><strong>{selectedSystem.networkIds.size}</strong><span>Networks</span></div>
                      <div><strong>{selectedSystem.lineIds.size}</strong><span>Lines</span></div>
                      <div><strong>{selectedSystem.pipes.length}</strong><span>Pipes</span></div>
                      <div><strong>{selectedSystem.totalLength.toLocaleString(undefined, { maximumFractionDigits: 2 })}</strong><span>km</span></div>
                    </div>

                    <section className="transmission-system-detail__section">
                      <h3>Lines / Branches</h3>
                      {selectedSystem.lineIds.size === 0 ? (
                        <div className="transmission-system-detail__empty">No lines assigned in saved network pipes.</div>
                      ) : (
                        <div className="transmission-line-chip-list">
                          {Array.from(selectedSystem.lineIds).map((lineId) => {
                            const savedLine = lines.find((item) => item.id === lineId);
                            const line = savedLine || { id: lineId, name: lineId };
                            return (
                              <span className="transmission-line-chip" key={lineId}>
                                <span>{line.isBranch ? "Branch" : "Line"}: {lineDisplayName(line)}</span>
                                {savedLine && (
                                  <button
                                    type="button"
                                    className="transmission-line-chip__delete"
                                    onClick={() => handleDeleteSystemLine(savedLine)}
                                    disabled={deletingLineId === lineId}
                                    title={`Delete ${lineDisplayName(line)}`}
                                  >
                                    {deletingLineId === lineId ? "Deleting" : "Delete"}
                                  </button>
                                )}
                              </span>
                            );
                          })}
                        </div>
                      )}
                      {lineDeleteError && <div className="transmission-system-detail__error">{lineDeleteError}</div>}
                    </section>

                    <section className="transmission-system-detail__section">
                      <h3>Pipes</h3>
                      {selectedSystem.pipes.length === 0 ? (
                        <div className="transmission-system-detail__empty">No saved network pipes reference this system yet.</div>
                      ) : (
                        <div className="transmission-pipe-list">
                          {selectedSystem.pipes.map((pipe) => (
                            <div className="transmission-pipe-card" key={`${pipe.networkId}-${pipe.id}`}>
                              <strong>{pipe.name}</strong>
                              <small>{pipe.source} to {pipe.target}</small>
                              <dl>
                                <div><dt>Network</dt><dd>{pipe.networkName}</dd></div>
                                <div><dt>Length</dt><dd>{pipe.length == null ? "-" : `${pipe.length.toLocaleString()} km`}</dd></div>
                                <div><dt>Capacity</dt><dd>{pipe.capacity == null ? "-" : `${pipe.capacity.toLocaleString()} m3/day`}</dd></div>
                              </dl>
                            </div>
                          ))}
                        </div>
                      )}
                    </section>
                  </>
                )}
              </aside>
            </div>
          )}
        </>
      )}
    </div>
  );
}
