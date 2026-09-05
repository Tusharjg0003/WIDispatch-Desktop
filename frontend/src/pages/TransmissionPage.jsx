import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import cytoscape from "cytoscape";
import {
  fetchTransmissionPumpStations,
  fetchTransmissionSystems,
  fetchTransmissionLines,
  deleteTransmissionLine,
} from "../api/metrics";
import { fetchNetwork, fetchNetworks } from "../api/networks";
import { buildCyStyle } from "../cytoscape/buildCyStyle";
import { applyEntitySymbol } from "../cytoscape/entitySymbol";
import { activeFunctionalPumps, backupPumps, totalDesignCapacity } from "../lib/pumpStation";
import { lineDisplayName, lineSystemId } from "../lib/transmissionLines";
import TransmissionTabs from "../transmission/tabs/TransmissionTabs";
import TabStripBoundary from "../tabs/components/TabStripBoundary";
import { useTransmissionTabStore } from "../transmission/tabs/transmissionTabStore";
import { transmissionTabController } from "../transmission/tabs/transmissionTabControllerInstance";
import { useTabShortcuts } from "../tabs/hooks/useTabShortcuts";
import TransmissionPumpStationDetail from "./TransmissionPumpStationDetail";
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
const snapshotFallbackPosition = (index) => ({
  x: (index % 3) * 220,
  y: Math.floor(index / 3) * 84,
});

const cloneData = (value) => {
  if (!value || typeof value !== "object") return value;
  return JSON.parse(JSON.stringify(value));
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

function TransmissionSystemSnapshot({ system }) {
  const containerRef = useRef(null);
  const cyRef = useRef(null);
  const graph = useMemo(() => {
    const rawNodes = Array.from(system?.snapshotNodes?.values?.() || []);
    const rawEdges = asArray(system?.snapshotEdges).filter((edge) => edge.source && edge.target);
    if (!rawNodes.length || !rawEdges.length) return { nodes: [], edges: [], usedSavedPositions: false };

    const nodeIds = new Set(rawNodes.map((node) => node.id));
    const edges = rawEdges.filter((edge) => nodeIds.has(edge.source) && nodeIds.has(edge.target));
    const allNodesHaveSavedPositions = rawNodes.every((node) => {
      const x = Number(node.position?.x);
      const y = Number(node.position?.y);
      return Number.isFinite(x) && Number.isFinite(y);
    });
    const positioned = rawNodes.map((node, index) => {
      const x = Number(node.position?.x);
      const y = Number(node.position?.y);
      if (allNodesHaveSavedPositions) return { ...node, x, y };
      const fallback = snapshotFallbackPosition(index);
      return { ...node, ...fallback };
    });
    const nodes = positioned.map((node) => ({ ...node, data: cloneData(node.data || {}) }));
    const nodeById = new Map(nodes.map((node) => [node.id, node]));

    return {
      nodes,
      edges: edges.filter((edge) => nodeById.has(edge.source) && nodeById.has(edge.target)),
      usedSavedPositions: allNodesHaveSavedPositions,
    };
  }, [system]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !graph.nodes.length || !graph.edges.length) return undefined;

    const cy = cytoscape({
      container,
      style: buildCyStyle(),
      layout: { name: "preset" },
      minZoom: 0.05,
      maxZoom: 3,
      boxSelectionEnabled: false,
      autoungrabify: true,
      autounselectify: true,
      userPanningEnabled: false,
      userZoomingEnabled: false,
      wheelSensitivity: 0.2,
    });
    cyRef.current = cy;

    cy.batch(() => {
      graph.nodes.forEach((node) => {
        const data = {
          ...node.data,
          id: node.id,
          label: node.label,
          displayLabel: node.data?.displayLabel || node.data?.label || node.label,
          type: node.data?.type || node.type || node.data?.category || "node",
          category: node.data?.category || node.data?.type || node.type || "node",
        };
        const cyNode = cy.add({
          group: "nodes",
          data,
          position: { x: node.x, y: node.y },
        });
        applyEntitySymbol(cyNode);
      });
      graph.edges.forEach((edge) => {
        cy.add({
          group: "edges",
          data: {
            ...edge.data,
            id: edge.id,
            source: edge.source,
            target: edge.target,
            kind: edge.data?.kind || "pipe",
            label: edge.data?.label || edge.label || "",
            displayLabel: edge.data?.displayLabel || edge.data?.label || edge.label || "",
          },
        });
      });
    });

    const fit = () => {
      cy.resize();
      if (cy.elements().length) cy.fit(cy.elements(), 26);
    };
    requestAnimationFrame(fit);

    return () => {
      cy.destroy();
      if (cyRef.current === cy) cyRef.current = null;
    };
  }, [graph]);

  if (!graph.nodes.length || !graph.edges.length) {
    return <div className="transmission-system-detail__empty">No saved topology snapshot yet.</div>;
  }

  return (
    <div className="transmission-snapshot">
      <div className="transmission-snapshot__canvas" ref={containerRef} aria-label="Transmission system network snapshot" />
      <div className="transmission-snapshot__meta">
        <span>{graph.nodes.length} saved nodes</span>
        <span>{graph.edges.length} pipe segments</span>
        <span>{graph.usedSavedPositions ? "saved positions" : "import layout preview"}</span>
      </div>
    </div>
  );
}

export default function TransmissionPage({ mode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { pumpStationId } = useParams();
  const [searchParams] = useSearchParams();
  const systemsView = mode === "systems" || location.pathname.startsWith("/transmission/systems");

  const activeTabId = useTransmissionTabStore((state) => state.activeTabId);
  const activeTab = useTransmissionTabStore((state) =>
    state.activeTabId ? state.tabs[state.activeTabId] ?? null : null
  );

  useEffect(() => {
    transmissionTabController.registerNavigator({
      replace: (path) => navigate(path, { replace: true }),
    });
    return () => transmissionTabController.detach();
  }, [navigate]);

  useEffect(() => {
    transmissionTabController.restoreSessionOnce(
      pumpStationId ?? null,
      searchParams.get("tab")
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useTabShortcuts(transmissionTabController);

  const openPumpStation = useCallback((station) => {
    transmissionTabController.openPumpStation(station.id, station.name || station.id);
  }, []);

  const changeSubTab = useCallback(
    (next) => {
      if (activeTabId) transmissionTabController.setSubTab(activeTabId, next);
    },
    [activeTabId]
  );

  const adoptTitle = useCallback(
    (station) => {
      if (activeTabId && station?.name) {
        transmissionTabController.adoptTitle(activeTabId, station.name);
      }
    },
    [activeTabId]
  );

  const [stations, setStations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [entity, setEntity] = useState("");
  const [region, setRegion] = useState("");
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
        snapshotNodes: new Map(),
        snapshotEdges: [],
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
          snapshotNodes: new Map(),
          snapshotEdges: [],
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
        const id = data.id || node.id;
        return [id, {
          id,
          label: data.label || data.displayLabel || data.assetId || id,
          type: data.type || data.category || "",
          data: cloneData(data),
          position: node.position || null,
        }];
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
            snapshotNodes: new Map(),
            snapshotEdges: [],
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
        [data.source, data.target].filter(Boolean).forEach((nodeId) => {
          const key = `${network.id}:${nodeId}`;
          const node = nodesById.get(nodeId);
          if (!node || bucket.snapshotNodes.has(key)) return;
          bucket.snapshotNodes.set(key, {
            ...node,
            id: key,
            sourceNodeId: nodeId,
            networkId: network.id,
          });
        });
        if (data.source && data.target) {
          bucket.snapshotEdges.push({
            id: `${network.id}:${data.id || edge.id}`,
            source: `${network.id}:${data.source}`,
            target: `${network.id}:${data.target}`,
            label: data.label || data.displayLabel || data.id || edge.id,
            data: cloneData(data),
            networkId: network.id,
          });
        }
        bucket.pipes.push({
          id: data.id || edge.id,
          name: data.label || data.displayLabel || data.id || edge.id,
          source: nodesById.get(data.source)?.label || data.source || "-",
          target: nodesById.get(data.target)?.label || data.target || "-",
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

  const selectedLineGroups = useMemo(() => {
    if (!selectedSystem) return { mainLines: [], orphanBranches: [], systemPipes: [] };
    const selectedIds = Array.from(selectedSystem.lineIds);
    const selectedIdSet = new Set(selectedIds);
    const lineById = new Map(lines.map((line) => [line.id, line]));
    const lineItems = selectedIds.map((lineId) => lineById.get(lineId) || { id: lineId, name: lineId });
    const branchesByParentId = new Map();
    const pipesByLineId = new Map();
    const systemPipes = [];
    const mainLines = [];
    const orphanBranches = [];

    asArray(selectedSystem.pipes).forEach((pipe) => {
      const pipeLineIds = asArray(pipe.lines).map((line) => line.id).filter(Boolean);
      if (!pipeLineIds.length) {
        systemPipes.push(pipe);
        return;
      }
      pipeLineIds.forEach((lineId) => {
        const pipes = pipesByLineId.get(lineId) || [];
        pipes.push(pipe);
        pipesByLineId.set(lineId, pipes);
      });
    });

    lineItems.forEach((line) => {
      const isBranch = !!line.isBranch || !!line.parentLineId;
      if (!isBranch) {
        mainLines.push(line);
        return;
      }
      if (line.parentLineId && selectedIdSet.has(line.parentLineId)) {
        const branches = branchesByParentId.get(line.parentLineId) || [];
        branches.push(line);
        branchesByParentId.set(line.parentLineId, branches);
        return;
      }
      orphanBranches.push(line);
    });

    const byName = (a, b) => lineDisplayName(a).localeCompare(lineDisplayName(b));
    mainLines.sort(byName);
    orphanBranches.sort(byName);
    branchesByParentId.forEach((branches) => branches.sort(byName));

    return {
      mainLines: mainLines.map((line) => ({
        line,
        pipes: pipesByLineId.get(line.id) || [],
        branches: (branchesByParentId.get(line.id) || []).map((branch) => ({
          line: branch,
          pipes: pipesByLineId.get(branch.id) || [],
        })),
      })),
      orphanBranches: orphanBranches.map((line) => ({
        line,
        pipes: pipesByLineId.get(line.id) || [],
      })),
      systemPipes,
    };
  }, [selectedSystem, lines]);

  const handleDeleteSystemLine = async (line) => {
    if (!line?.id || deletingLineId) return;
    const label = lineDisplayName(line);
    if (!window.confirm(`Delete "${label}"? This removes it from canvas segments too.`)) return;

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

      {systemsView ? (
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
                      <th className="ta-r">Registered Lines</th>
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
                        </tr>
                      );
                    })}
                    {filteredSystems.length === 0 && (
                      <tr>
                        <td colSpan={4} className="ppl__empty">No transmission systems found.</td>
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
                      <div><strong>{selectedSystem.lineIds.size}</strong><span>Registered Lines</span></div>
                      <div><strong>{selectedSystem.totalLength.toLocaleString(undefined, { maximumFractionDigits: 2 })}</strong><span>km</span></div>
                    </div>

                    {selectedSystem.lineIds.size > 0 && selectedSystem.pipes.length === 0 && (
                      <div className="transmission-system-detail__notice">
                        This system has registered lines, but no canvas segments yet.
                      </div>
                    )}

                    <section className="transmission-system-detail__section">
                      <h3>Network Snapshot</h3>
                      <TransmissionSystemSnapshot system={selectedSystem} />
                    </section>

                    <section className="transmission-system-detail__section">
                      <h3>System Structure</h3>
                      {selectedSystem.lineIds.size === 0 && selectedSystem.pipes.length === 0 ? (
                        <div className="transmission-system-detail__empty">No registered lines or canvas segments for this transmission system.</div>
                      ) : (
                        <div className="transmission-line-tree">
                          <div className="transmission-structure-row transmission-structure-row--system">
                            <span className="transmission-line-kind transmission-line-kind--system">System</span>
                            <div className="transmission-line-row__copy">
                              <strong>{selectedSystem.system.name || selectedSystem.system.id}</strong>
                              <small>{selectedSystem.lineIds.size} registered lines, {selectedSystem.pipes.length} canvas segment{selectedSystem.pipes.length === 1 ? "" : "s"}</small>
                            </div>
                          </div>
                          {selectedLineGroups.systemPipes.map((pipe) => (
                            <div className="transmission-structure-row transmission-structure-row--segment transmission-structure-row--system-segment" key={`system-pipe-${pipe.networkId}-${pipe.id}`}>
                              <span className="transmission-structure-branch-mark">-</span>
                              <span className="transmission-line-kind transmission-line-kind--pipe">Pipe</span>
                              <div className="transmission-line-row__copy">
                                <strong>{pipe.name}</strong>
                                <small>{pipe.source} to {pipe.target}</small>
                              </div>
                            </div>
                          ))}
                          {selectedLineGroups.mainLines.map(({ line, pipes, branches }) => {
                            const savedLine = lines.find((item) => item.id === line.id);
                            const segmentCount = pipes.length + branches.reduce((sum, branch) => sum + branch.pipes.length, 0);
                            return (
                              <div className="transmission-line-group" key={line.id}>
                                <div className="transmission-structure-row transmission-structure-row--line">
                                  <span className="transmission-line-kind">Line</span>
                                  <div className="transmission-line-row__copy">
                                    <strong>{lineDisplayName(line)}</strong>
                                    <small>{branches.length} branch{branches.length === 1 ? "" : "es"}, {segmentCount} segment{segmentCount === 1 ? "" : "s"}</small>
                                  </div>
                                  {savedLine && (
                                    <button
                                      type="button"
                                      className="transmission-line-chip__delete"
                                      onClick={() => handleDeleteSystemLine(savedLine)}
                                      disabled={deletingLineId === line.id}
                                      title={`Delete ${lineDisplayName(line)}`}
                                    >
                                      {deletingLineId === line.id ? "Deleting" : "Delete"}
                                    </button>
                                  )}
                                </div>
                                <div className="transmission-structure-children">
                                  {pipes.map((pipe) => (
                                    <div className="transmission-structure-row transmission-structure-row--segment" key={`${line.id}-${pipe.networkId}-${pipe.id}`}>
                                      <span className="transmission-structure-branch-mark">-</span>
                                      <span className="transmission-line-kind transmission-line-kind--pipe">Pipe</span>
                                      <div className="transmission-line-row__copy">
                                        <strong>{pipe.name}</strong>
                                        <small>{pipe.source} to {pipe.target}</small>
                                      </div>
                                    </div>
                                  ))}
                                  {branches.map(({ line: branch, pipes: branchPipes }) => {
                                    const savedBranch = lines.find((item) => item.id === branch.id);
                                    return (
                                      <div className="transmission-line-group transmission-line-group--branch" key={branch.id}>
                                        <div className="transmission-structure-row transmission-structure-row--branch">
                                          <span className="transmission-line-kind transmission-line-kind--branch">Branch</span>
                                          <div className="transmission-line-row__copy">
                                            <strong>{lineDisplayName(branch)}</strong>
                                            <small>Branch of {lineDisplayName(line)} - {branchPipes.length} segment{branchPipes.length === 1 ? "" : "s"}</small>
                                          </div>
                                          {savedBranch && (
                                            <button
                                              type="button"
                                              className="transmission-line-chip__delete"
                                              onClick={() => handleDeleteSystemLine(savedBranch)}
                                              disabled={deletingLineId === branch.id}
                                              title={`Delete ${lineDisplayName(branch)}`}
                                            >
                                              {deletingLineId === branch.id ? "Deleting" : "Delete"}
                                            </button>
                                          )}
                                        </div>
                                        <div className="transmission-structure-children transmission-structure-children--branch">
                                          {branchPipes.map((pipe) => (
                                            <div className="transmission-structure-row transmission-structure-row--segment" key={`${branch.id}-${pipe.networkId}-${pipe.id}`}>
                                              <span className="transmission-structure-branch-mark">-</span>
                                              <span className="transmission-line-kind transmission-line-kind--pipe">Pipe</span>
                                              <div className="transmission-line-row__copy">
                                                <strong>{pipe.name}</strong>
                                                <small>{pipe.source} to {pipe.target}</small>
                                              </div>
                                            </div>
                                          ))}
                                          {branchPipes.length === 0 && (
                                            <div className="transmission-structure-empty">No canvas segments under this branch.</div>
                                          )}
                                        </div>
                                      </div>
                                    );
                                  })}
                                  {pipes.length === 0 && branches.length === 0 && (
                                    <div className="transmission-structure-empty">No canvas segments under this line.</div>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                          {selectedLineGroups.orphanBranches.map(({ line, pipes }) => {
                            const savedLine = lines.find((item) => item.id === line.id);
                            const parentLine = lines.find((item) => item.id === line.parentLineId);
                            return (
                              <div className="transmission-line-group transmission-line-group--branch" key={line.id}>
                                <div className="transmission-structure-row transmission-structure-row--branch transmission-structure-row--orphan">
                                  <span className="transmission-line-kind transmission-line-kind--branch">Branch</span>
                                  <div className="transmission-line-row__copy">
                                    <strong>{lineDisplayName(line)}</strong>
                                    <small>{line.parentLineId ? `Branch of ${lineDisplayName(parentLine || { id: line.parentLineId, name: line.parentLineId })}` : "Branch parent not selected"} - {pipes.length} segment{pipes.length === 1 ? "" : "s"}</small>
                                  </div>
                                  {savedLine && (
                                    <button
                                      type="button"
                                      className="transmission-line-chip__delete"
                                      onClick={() => handleDeleteSystemLine(savedLine)}
                                      disabled={deletingLineId === line.id}
                                      title={`Delete ${lineDisplayName(line)}`}
                                    >
                                      {deletingLineId === line.id ? "Deleting" : "Delete"}
                                    </button>
                                  )}
                                </div>
                                <div className="transmission-structure-children transmission-structure-children--branch">
                                  {pipes.map((pipe) => (
                                    <div className="transmission-structure-row transmission-structure-row--segment" key={`${line.id}-${pipe.networkId}-${pipe.id}`}>
                                      <span className="transmission-structure-branch-mark">-</span>
                                      <span className="transmission-line-kind transmission-line-kind--pipe">Pipe</span>
                                      <div className="transmission-line-row__copy">
                                        <strong>{pipe.name}</strong>
                                        <small>{pipe.source} to {pipe.target}</small>
                                      </div>
                                    </div>
                                  ))}
                                  {pipes.length === 0 && (
                                    <div className="transmission-structure-empty">No canvas segments under this branch.</div>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                      {lineDeleteError && <div className="transmission-system-detail__error">{lineDeleteError}</div>}
                    </section>
                  </>
                )}
              </aside>
            </div>
          )}
        </>
      ) : (
        <>
          <TabStripBoundary>
            <TransmissionTabs />
          </TabStripBoundary>

          {activeTab?.key ? (
            <TransmissionPumpStationDetail
              key={activeTab.id}
              pumpStationId={activeTab.key}
              subTab={activeTab.state.subTab}
              onSubTabChange={changeSubTab}
              onPumpStationLoaded={adoptTitle}
            />
          ) : (
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
                        <tr key={station.id} onClick={() => openPumpStation(station)}>
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
        </>
      )}
    </div>
  );
}
