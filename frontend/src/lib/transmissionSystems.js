// Transmission systems: what each system contains across the saved networks.
//
// A system is defined by its registered lines (transmissionLines, each with a
// system id) and by the canvas pipes tagged with its id
// (meta.specifications.transmissionSystemId / lineGroupIds). The assets "in" a
// system are the canvas nodes those pipes connect; registry records (by the
// node's assetId) supply their details.

import { lineDisplayName, lineSystemId } from "./transmissionLines.js";
import { totalDesignCapacity } from "./pumpStation.js";

export const asArray = (value) => (Array.isArray(value) ? value : []);
export const finiteNumber = (value) => {
  if (value === "" || value == null) return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
};
const cloneData = (value) => (value && typeof value === "object" ? JSON.parse(JSON.stringify(value)) : value);
const clean = (v) => (v == null || v === "" || v === "NULL" ? null : v);

const emptyBucket = (system) => ({
  system,
  pipes: [],
  snapshotNodes: new Map(),
  snapshotEdges: [],
  lineIds: new Set(),
  networkIds: new Set(),
  totalLength: 0,
  totalCapacity: 0,
});

/**
 * Per-system breakdown across every saved network.
 * @returns {Map<string, ReturnType<typeof emptyBucket>>}
 */
export function buildSystemBreakdowns({ systems = [], lines = [], networks = [] }) {
  const lineById = new Map(lines.map((line) => [line.id, line]));
  const map = new Map(systems.map((system) => [system.id, emptyBucket(system)]));
  const ensure = (systemId) => {
    if (!map.has(systemId)) map.set(systemId, emptyBucket({ id: systemId, name: systemId }));
    return map.get(systemId);
  };

  lines.forEach((line) => {
    const systemId = lineSystemId(line);
    if (systemId) ensure(systemId).lineIds.add(line.id);
  });

  networks.forEach((network) => {
    const nodesById = new Map(asArray(network.nodes).map((node) => {
      const data = node.data || node;
      const id = data.id || node.id;
      // Junctions usually have no label; name them by the tail of their id.
      const isJunction = !data.label && !data.displayLabel && !data.assetId
        && String(data.category || data.type || "").toLowerCase() === "node";
      return [id, {
        id,
        label: data.label || data.displayLabel || data.assetId || (isJunction ? `Junction · ${String(id).slice(-5)}` : id),
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
      const bucket = ensure(systemId);
      const length = finiteNumber(spec.pipelineLength ?? spec.length_km);
      const capacity = finiteNumber(spec.capacity ?? spec.designCapacity ?? spec.maximumCapacity);
      const lineIds = asArray(spec.lineGroupIds);
      lineIds.forEach((lineId) => {
        const lineSystem = lineSystemId(lineById.get(lineId));
        if (!lineSystem || lineSystem === systemId) bucket.lineIds.add(lineId);
      });
      bucket.networkIds.add(network.id);
      if (length != null) bucket.totalLength += length;
      if (capacity != null) bucket.totalCapacity += capacity;
      [data.source, data.target].filter(Boolean).forEach((nodeId) => {
        const key = `${network.id}:${nodeId}`;
        const node = nodesById.get(nodeId);
        if (!node || bucket.snapshotNodes.has(key)) return;
        bucket.snapshotNodes.set(key, { ...node, id: key, sourceNodeId: nodeId, networkId: network.id });
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
        sourceNodeId: data.source || null,
        targetNodeId: data.target || null,
        networkId: network.id,
        networkName: network.name || network.id,
        length,
        capacity,
        designCapacity: finiteNumber(spec.designCapacity),
        maximumCapacity: finiteNumber(spec.maximumCapacity),
        diameter: finiteNumber(spec.pipelineDiameter),
        material: clean(spec.pipelineMaterial),
        bidirectional: Boolean(spec.bidirectional),
        status: clean(data.status),
        active: data.active !== false,
        commissioning: clean(data.commissioningDate),
        decommissioning: clean(data.decommissioningDate),
        lines: lineIds.map((lineId) => lineById.get(lineId) || { id: lineId, name: lineId }),
      });
    });
  });

  return map;
}

/** Group a system's lines into main lines (with branches), orphan branches and unassigned pipes. */
export function groupSystemLines(breakdown, lines = []) {
  if (!breakdown) return { mainLines: [], orphanBranches: [], systemPipes: [] };
  const selectedIds = Array.from(breakdown.lineIds);
  const selectedIdSet = new Set(selectedIds);
  const lineById = new Map(lines.map((line) => [line.id, line]));
  const lineItems = selectedIds.map((lineId) => lineById.get(lineId) || { id: lineId, name: lineId });
  const branchesByParentId = new Map();
  const pipesByLineId = new Map();
  const systemPipes = [];
  const mainLines = [];
  const orphanBranches = [];

  asArray(breakdown.pipes).forEach((pipe) => {
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
    orphanBranches: orphanBranches.map((line) => ({ line, pipes: pipesByLineId.get(line.id) || [] })),
    systemPipes,
  };
}

/** Totals for a set of segments: count, length, and the tightest capacity (the bottleneck). */
export function segmentStats(pipes = []) {
  const lengths = pipes.map((p) => p.length).filter((v) => v != null);
  const capacities = pipes.map((p) => p.capacity).filter((v) => v != null);
  return {
    count: pipes.length,
    length: lengths.reduce((s, v) => s + v, 0),
    hasLength: lengths.length > 0,
    minCapacity: capacities.length ? Math.min(...capacities) : null,
    unconstrained: pipes.filter((p) => p.capacity == null).length,
  };
}

const CATEGORY_OF = (data) => {
  const raw = String(data?.category || data?.type || "").toLowerCase();
  if (raw === "plant" || raw === "stp") return "plant";
  if (raw === "pump") return "pump";
  if (raw === "tank") return "tank";
  if (raw === "handover_point" || raw === "city_gate" || raw === "gate") return "handover_point";
  return "node";
};

/**
 * The assets a system connects, by category, with registry details where the
 * canvas node is linked to a registry record (node.assetId).
 */
export function systemAssets(breakdown, registryById = new Map()) {
  const result = { plant: [], handover_point: [], tank: [], pump: [], junctions: 0 };
  if (!breakdown) return result;

  // How many of the system's segments touch each node (per network).
  const degree = new Map();
  asArray(breakdown.pipes).forEach((pipe) => {
    [pipe.sourceNodeId, pipe.targetNodeId].filter(Boolean).forEach((nodeId) => {
      const key = `${pipe.networkId}:${nodeId}`;
      degree.set(key, (degree.get(key) || 0) + 1);
    });
  });

  // One row per asset: the same asset can sit on several networks.
  const byAsset = new Map();
  breakdown.snapshotNodes.forEach((node, key) => {
    const data = node.data || {};
    const category = CATEGORY_OF(data);
    if (category === "node") {
      result.junctions += 1;
      return;
    }
    const assetId = data.assetId || null;
    const rowKey = assetId ? `${category}:${assetId}` : key;
    const record = assetId ? registryById.get(assetId) : null;
    const meta = data.meta || {};
    const spec = record?.specifications || meta.specifications || {};
    const existing = byAsset.get(rowKey);
    if (existing) {
      existing.networkIds.add(node.networkId);
      existing.segments += degree.get(key) || 0;
      return;
    }
    byAsset.set(rowKey, {
      key: rowKey,
      category,
      recordId: assetId,
      inRegistry: Boolean(record),
      id: clean(record?.external_id) || assetId || data.id,
      name: clean(record?.name) || data.label || data.displayLabel || assetId || data.id,
      type: clean(record?.asset_type) || clean(meta.asset_type),
      region: clean(record?.region) || clean(meta.region),
      governorate: clean(record?.governorate) || clean(meta.governorate),
      city: clean(record?.city) || clean(meta.city),
      entity: clean(record?.entity) || clean(meta.entity),
      status: clean(record?.status) || clean(data.status),
      commissioning: clean(record?.commissioning_date) || clean(meta.commissioning_date),
      decommissioning: clean(record?.decommissioning_date) || clean(meta.decommissioning_date),
      design: finiteNumber(category === "pump" ? totalDesignCapacity(spec) || spec.design_capacity : spec.design_capacity),
      contracted: finiteNumber(spec.contracted_capacity),
      maximum: finiteNumber(spec.maximum_capacity),
      storage: finiteNumber(spec.total_capacity_m3),
      networkIds: new Set([node.networkId]),
      segments: degree.get(key) || 0,
    });
  });

  byAsset.forEach((row) => result[row.category].push(row));
  Object.keys(result).forEach((k) => {
    if (Array.isArray(result[k])) result[k].sort((a, b) => String(a.name).localeCompare(String(b.name)));
  });
  return result;
}

/** Remove a deleted line from every canvas pipe that referenced it. */
function removeLineFromEdge(edge, lineId) {
  const data = edge?.data || edge;
  const meta = data?.meta || {};
  const specs = meta.specifications || {};
  if (!Array.isArray(specs.lineGroupIds) || !specs.lineGroupIds.includes(lineId)) return edge;

  const nextIds = specs.lineGroupIds.filter((id) => id !== lineId);
  const nextSpecs = { ...specs };
  if (nextIds.length) nextSpecs.lineGroupIds = nextIds;
  else delete nextSpecs.lineGroupIds;

  if (edge?.data) return { ...edge, data: { ...data, meta: { ...meta, specifications: nextSpecs } } };
  return { ...edge, meta: { ...meta, specifications: nextSpecs } };
}

export const removeLineFromNetworks = (networks, lineId) => networks.map((network) => ({
  ...network,
  edges: asArray(network.edges).map((edge) => removeLineFromEdge(edge, lineId)),
}));
