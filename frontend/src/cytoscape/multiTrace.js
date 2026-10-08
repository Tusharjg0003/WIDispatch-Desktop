// Multi-root trace (SWIIMS buildTraceInfos / applyTraceRoots / toggleTraceNode
// and utils/networkTrace.js aggregateTraceMembership).
//
// Several roots can be traced at once. Each root walks the direction its type
// implies — a delivery point looks upstream to its supply, a plant looks
// downstream to what it serves, a tank does both — and the per-root results
// are merged: an element reached by more than one root, or in both
// directions, is "shared".
//
// computeTrace (./trace.js) still does the walking; everything here is pure.

import { computeTrace, isBidirectionalPipe, nodeName } from "./trace.js";

export const DELIVERY_TRACE_TYPES = new Set([
  "handover_point",
  "point",
  "filling_station",
  "filling-station",
  "distribution_point",
  "distribution-point",
]);
export const SOURCE_TRACE_TYPES = new Set(["plant", "stp"]);
export const TRACE_ROOT_TYPES = new Set([...DELIVERY_TRACE_TYPES, ...SOURCE_TRACE_TYPES, "tank"]);

export const MULTI_TRACE_CLASSES = "trace-root trace-up trace-down trace-shared trace-up-edge trace-down-edge trace-shared-edge trace-dim";

/** "upstream" | "downstream" | "both" for a root of the given type. */
export function traceDirectionForType(type) {
  if (DELIVERY_TRACE_TYPES.has(type)) return "upstream";
  if (SOURCE_TRACE_TYPES.has(type)) return "downstream";
  return "both";
}

/** Add or remove a root (SWIIMS toggleTraceRoot). */
export function toggleTraceRoot(roots = [], rootId) {
  return roots.includes(rootId) ? roots.filter((id) => id !== rootId) : [...roots, rootId];
}

const addMembership = (membership, ids, rootId, direction) => {
  ids.forEach((id) => {
    const entry = membership.get(id) || { roots: new Set(), directions: new Set() };
    entry.roots.add(rootId);
    entry.directions.add(direction);
    membership.set(id, entry);
  });
};

const classify = (membership, rootIds) => {
  const upstream = new Set();
  const downstream = new Set();
  const shared = new Set();
  membership.forEach((entry, id) => {
    if (rootIds.has(id)) return;
    if (entry.roots.size > 1 || entry.directions.size > 1) shared.add(id);
    else if (entry.directions.has("upstream")) upstream.add(id);
    else downstream.add(id);
  });
  return { upstream, downstream, shared };
};

/**
 * Merge per-root traces into canvas membership.
 * traces: [{ rootId, direction, up: { nodes, edges }, down: { nodes, edges } }]
 */
export function aggregateTraceMembership(traces = []) {
  const rootIds = new Set();
  const nodeMembership = new Map();
  const edgeMembership = new Map();
  traces.forEach((trace) => {
    if (!trace?.rootId) return;
    rootIds.add(trace.rootId);
    const dir = trace.direction || "both";
    if (dir !== "downstream") {
      addMembership(nodeMembership, trace.up?.nodes || [], trace.rootId, "upstream");
      addMembership(edgeMembership, trace.up?.edges || [], trace.rootId, "upstream");
    }
    if (dir !== "upstream") {
      addMembership(nodeMembership, trace.down?.nodes || [], trace.rootId, "downstream");
      addMembership(edgeMembership, trace.down?.edges || [], trace.rootId, "downstream");
    }
  });
  const nodes = classify(nodeMembership, rootIds);
  const edges = classify(edgeMembership, new Set());
  return {
    rootIds,
    upNodeIds: nodes.upstream,
    downNodeIds: nodes.downstream,
    sharedNodeIds: nodes.shared,
    upEdgeIds: edges.upstream,
    downEdgeIds: edges.downstream,
    sharedEdgeIds: edges.shared,
  };
}

/** Endpoint lists a root's summary shows (SWIIMS traceEndpointSectionsForRoot). */
export function traceEndpointSections({ rootType, terminalSources = [], terminalDestinations = [] }) {
  if (SOURCE_TRACE_TYPES.has(rootType)) {
    return [{ key: "destinations", label: "Delivery points served", direction: "downstream", rows: terminalDestinations }];
  }
  if (DELIVERY_TRACE_TYPES.has(rootType)) {
    return [{ key: "sources", label: "Supplying plants", direction: "upstream", rows: terminalSources }];
  }
  return [
    { key: "sources", label: "Supply sources", direction: "upstream", rows: terminalSources },
    { key: "destinations", label: "Delivery points", direction: "downstream", rows: terminalDestinations },
  ];
}

// ── Cytoscape-facing helpers ─────────────────────────────────────────────

/** Paint merged membership onto the canvas. */
export function paintMultiTrace(cy, membership) {
  cy.batch(() => {
    cy.elements().removeClass(MULTI_TRACE_CLASSES);
    if (!membership.rootIds.size) return;
    cy.nodes().forEach((node) => {
      const id = node.id();
      if (membership.rootIds.has(id)) node.addClass("trace-root");
      else if (membership.sharedNodeIds.has(id)) node.addClass("trace-shared");
      else if (membership.downNodeIds.has(id)) node.addClass("trace-down");
      else if (membership.upNodeIds.has(id)) node.addClass("trace-up");
      else node.addClass("trace-dim");
    });
    cy.edges().forEach((edge) => {
      const id = edge.id();
      if (membership.sharedEdgeIds.has(id)) edge.addClass("trace-shared-edge");
      else if (membership.downEdgeIds.has(id)) edge.addClass("trace-down-edge");
      else if (membership.upEdgeIds.has(id)) edge.addClass("trace-up-edge");
      else edge.addClass("trace-dim");
    });
  });
}

const endpointRows = (cy, ids, predicate) =>
  [...ids]
    .map((id) => cy.getElementById(id))
    .filter((n) => n?.length && predicate(n.data("type")))
    .map((n) => ({ id: n.id(), name: nodeName(cy, n.id()), type: n.data("type") }))
    .sort((a, b) => a.name.localeCompare(b.name));

/** Trace one root and describe it for the trace panel and the exports. */
export function buildTraceInfo(cy, rootId, { flowByEdge = {}, mode = "reachable" } = {}) {
  const node = cy.getElementById(rootId);
  if (!node.length) return null;
  const rootType = node.data("type") || node.data("category") || "";
  const direction = traceDirectionForType(rootType);
  const trace = computeTrace(cy, rootId, { flowByEdge, mode });
  const neighbours = { sources: [], dests: [] };
  node.connectedEdges().forEach((edge) => {
    const flow = trace.flowAmount(edge);
    if (trace.mode === "delivered" && flow <= 1e-5) return;
    const s = edge.source().id();
    const t = edge.target().id();
    const bidi = isBidirectionalPipe(edge);
    if (t === rootId || (bidi && s === rootId)) neighbours.sources.push({ id: t === rootId ? s : t, name: nodeName(cy, t === rootId ? s : t), flow });
    if (s === rootId || (bidi && t === rootId)) neighbours.dests.push({ id: s === rootId ? t : s, name: nodeName(cy, s === rootId ? t : s), flow });
  });
  const byFlowThenName = (a, b) => b.flow - a.flow || a.name.localeCompare(b.name);
  return {
    rootId,
    rootName: nodeName(cy, rootId),
    rootType,
    direction,
    trace: { ...trace, direction },
    upCount: direction === "downstream" ? 0 : trace.up.nodes.size,
    downCount: direction === "upstream" ? 0 : trace.down.nodes.size,
    sources: direction === "downstream" ? [] : neighbours.sources.sort(byFlowThenName),
    dests: direction === "upstream" ? [] : neighbours.dests.sort(byFlowThenName),
    terminalSources: direction === "downstream" ? [] : endpointRows(cy, trace.up.nodes, (t) => SOURCE_TRACE_TYPES.has(t)),
    terminalDestinations: direction === "upstream" ? [] : endpointRows(cy, trace.down.nodes, (t) => DELIVERY_TRACE_TYPES.has(t)),
    hasFlow: trace.hasFlow,
    mode: trace.mode,
    requestedMode: trace.requestedMode,
  };
}
