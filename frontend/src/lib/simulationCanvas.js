// Turning a solved dispatch day into canvas paint.
//
// Everything here is pure so it can be tested under `node --test`; the
// Cytoscape side lives in cytoscape/simulationOverlay.js. Follows the
// simulationRows.js precedent: the page fetches, these functions shape, the
// components only render.

import { causeLabel } from "./simulationRows.js";

export const EPS = 1e-6;

/**
 * Which visual bucket a pipe falls into on one day.
 *
 * Order matters. A pipe named in the day's bindingConstraints is the reason
 * demand could not be met, so it outranks its own utilisation. A pipe with no
 * capacity on record is reported as unconstrained rather than divided by a
 * stand-in denominator — the reference implementation used `capacity || 1`,
 * which made every uncapacitated pipe carrying any flow read as critical.
 */
export function edgeState({ flow = 0, capacity = null, unconstrained = false, isBottleneck = false } = {}) {
  if (!(flow > EPS)) return "idle";
  if (isBottleneck) return "bottleneck";
  if (unconstrained || !(capacity > 0)) return "unconstrained";

  const util = flow / capacity;
  if (util >= 0.9) return "high";
  if (util >= 0.7) return "medium";
  return "low";
}

/** Line width in px: thicker the harder the pipe is worked. */
export function edgeWidth(state, util) {
  if (state === "idle") return 2;
  if (state === "unconstrained") return 3;
  return Math.max(2, Math.min(6, 2 + (util || 0) * 4));
}

/**
 * A plant with no capacity anywhere on record could not be dispatched at all,
 * which is a different fact from a plant the solver chose not to run. The
 * config screen already warns about these; the canvas must not hide them among
 * the idle ones.
 */
export function plantState(plant = {}, allocated = 0) {
  if (plant.noCapacity) return "no-capacity";
  if (!(allocated > EPS)) return "idle";
  if (plant.available > 0 && allocated >= plant.available - EPS) return "at-capacity";
  return "partial";
}

export function gateState(gate = {}) {
  if (!(gate.required > EPS)) return "no-demand";
  if (gate.shortage <= EPS) return "met";
  return gate.delivered > EPS ? "adjusted" : "shortfall";
}

export function pumpState(pump = {}, isBinding = false) {
  if (isBinding) return "binding";
  if (pump.fullOutage) return "offline";
  if (pump.unconstrained) return "unconstrained";
  return "normal";
}

const round = (x) => Math.round(x * 100) / 100;

// Canvas categories that the engine produces a per-day row for. Junctions and
// annotations legitimately have none, so they must never be mistaken for
// elements added to the canvas after the run.
const TRACKED_CATEGORIES = new Set(["plant", "pump", "handover_point"]);

const elData = (el) => el?.data || el || {};

/** Split a day's binding constraints into edge ids and node ids. */
function bottleneckIds(day) {
  const edges = new Set();
  const nodes = new Set();
  for (const c of day.bindingConstraints || []) {
    if (!c.id) continue;
    if (c.kind === "pipe") edges.add(c.id);
    else nodes.add(c.id);
  }
  return { edges, nodes };
}

/**
 * Everything the canvas needs to paint one day. Returns null for a day index
 * outside the horizon so the caller can render an empty state rather than
 * guessing.
 */
export function dayOverlay(plan, dayIdx = 0) {
  const day = plan?.days?.[dayIdx];
  if (!day) return null;

  const { edges: bnEdges, nodes: bnNodes } = bottleneckIds(day);

  const flowByEdge = {};
  const utilByEdge = {};
  const edgeStates = {};
  const edgeWidths = {};
  for (const pipe of plan.pipes || []) {
    const flow = day.pipeFlows?.[pipe.id] || 0;
    const util = pipe.capacity > 0 ? flow / pipe.capacity : null;
    const state = edgeState({
      flow,
      capacity: pipe.capacity,
      unconstrained: pipe.unconstrained,
      isBottleneck: bnEdges.has(pipe.id),
    });
    flowByEdge[pipe.id] = flow;
    utilByEdge[pipe.id] = util;
    edgeStates[pipe.id] = state;
    edgeWidths[pipe.id] = edgeWidth(state, util);
  }

  const nodeStates = {};
  // An override is operator input rather than portal data, so it is surfaced
  // wherever it applies. It lives on the plan row, not on the saved canvas, so
  // it has to be collected here rather than read off the Cytoscape node.
  const overriddenIds = [];
  for (const plant of day.plants || []) {
    nodeStates[plant.nodeId] = plantState(plant, day.plantOutputs?.[plant.nodeId] || 0);
    if (plant.overridden) overriddenIds.push(plant.nodeId);
  }
  for (const pump of day.pumps || []) {
    nodeStates[pump.nodeId] = pumpState(pump, bnNodes.has(pump.nodeId));
    if (pump.overridden) overriddenIds.push(pump.nodeId);
  }
  for (const gate of day.gates || []) {
    nodeStates[gate.nodeId] = gateState(gate);
    if (gate.overridden) overriddenIds.push(gate.nodeId);
  }

  return {
    date: day.date,
    dayIdx,
    flowByEdge,
    utilByEdge,
    edgeStates,
    edgeWidths,
    nodeStates,
    overriddenIds,
    bottleneckEdgeIds: [...bnEdges],
    bottleneckNodeIds: [...bnNodes],
    totals: {
      required: day.totalRequired,
      delivered: day.totalDelivered,
      shortage: day.totalShortage,
      cost: day.variableOmCost,
    },
  };
}

/** Every canvas element id the run produced a result for. */
function planElementIds(plan) {
  const nodes = new Set();
  const edges = new Set((plan?.pipes || []).map((p) => p.id));
  for (const day of plan?.days || []) {
    for (const key of ["plants", "pumps", "gates"]) {
      for (const row of day[key] || []) nodes.add(row.nodeId);
    }
  }
  return { nodes, edges };
}

/**
 * How far the saved canvas has drifted from the run being displayed.
 *
 * A network can be edited after a plan is produced, so the canvas is not
 * guaranteed to match. Rather than paint stale elements with someone else's
 * numbers, name them in both directions and let the UI say so.
 */
export function canvasStaleness(topology, plan) {
  const { nodes: planNodes, edges: planEdges } = planElementIds(plan);

  const canvasNodes = (topology?.nodes || []).map(elData);
  const canvasEdges = (topology?.edges || []).map(elData);

  const unknownToRun = [
    ...canvasNodes
      .filter((n) => TRACKED_CATEGORIES.has(n.category || n.type) && !planNodes.has(n.id))
      .map((n) => n.id),
    ...canvasEdges.filter((e) => !planEdges.has(e.id)).map((e) => e.id),
  ];

  const canvasIds = new Set([...canvasNodes.map((n) => n.id), ...canvasEdges.map((e) => e.id)]);
  const missingFromCanvas = [...planNodes, ...planEdges].filter((id) => !canvasIds.has(id));

  return { unknownToRun, missingFromCanvas };
}

export function edgeDetail(plan, dayIdx, edgeId) {
  const day = plan?.days?.[dayIdx];
  if (!day) return null;

  const pipe = (plan.pipes || []).find((p) => p.id === edgeId);
  if (!pipe) return { id: edgeId, inRun: false };

  const flow = day.pipeFlows?.[edgeId] || 0;
  const { edges: bnEdges } = bottleneckIds(day);
  const util = pipe.capacity > 0 ? flow / pipe.capacity : null;

  return {
    id: edgeId,
    inRun: true,
    label: pipe.label,
    source: pipe.source,
    target: pipe.target,
    bidirectional: pipe.bidirectional,
    flow: round(flow),
    capacity: pipe.capacity,
    unconstrained: pipe.unconstrained,
    utilisationPct: util == null ? null : round(util * 100),
    isBottleneck: bnEdges.has(edgeId),
    peakFlow: pipe.peakFlow,
    avgFlow: pipe.avgFlow,
    peakUtilisationPct: pipe.peakUtilisationPct,
  };
}

export function nodeDetail(plan, dayIdx, nodeId) {
  const day = plan?.days?.[dayIdx];
  if (!day) return null;

  const { nodes: bnNodes } = bottleneckIds(day);
  const isBinding = bnNodes.has(nodeId);

  const plant = (day.plants || []).find((p) => p.nodeId === nodeId);
  if (plant) {
    const allocated = day.plantOutputs?.[nodeId] || 0;
    return {
      kind: "plant",
      inRun: true,
      isBinding,
      ...plant,
      allocated: round(allocated),
      costSar: round(allocated * plant.variableOm),
      state: plantState(plant, allocated),
    };
  }

  const pump = (day.pumps || []).find((p) => p.nodeId === nodeId);
  if (pump) {
    return { kind: "pump", inRun: true, isBinding, ...pump, state: pumpState(pump, isBinding) };
  }

  const gate = (day.gates || []).find((g) => g.nodeId === nodeId);
  if (gate) {
    return {
      kind: "gate",
      inRun: true,
      isBinding,
      ...gate,
      causeLabel: causeLabel(gate.cause),
      state: gateState(gate),
    };
  }

  return { kind: null, inRun: false, id: nodeId };
}

/** One row per day for the scrubber's shortage strip. */
export function daySummaries(plan) {
  return (plan?.days || []).map((day, dayIdx) => ({
    dayIdx,
    date: day.date,
    required: day.totalRequired,
    delivered: day.totalDelivered,
    shortage: day.totalShortage,
    satisfactionPct: day.satisfactionPct,
  }));
}
