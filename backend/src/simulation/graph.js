// Builds the single-day flow network the solver runs on.
//
// Topology comes from a saved Network Builder canvas (the `networks`
// collection). Canvas node categories are only plant | pump | handover_point |
// node — there are no tanks, STPs or filling stations here, so this is far
// simpler than SWIIMS' equivalent.
//
// Every canvas node is split into an in/out pair. That is what lets a pump
// station carry a throughput limit: the limit lives on the arc between its two
// halves, so flow arriving from any pipe and leaving on any pipe shares one
// capacity. Plants and gates use the same shape purely for uniformity.

import { inServiceOn } from "./capacity.js";

export const SUPER_SRC = "__src__";
export const SUPER_SNK = "__snk__";

// Effectively unlimited, but small enough that summing a few thousand of them
// cannot reach Number.MAX_SAFE_INTEGER.
export const UNLIMITED = 1e12;

// A hop costs a sliver so that among equally cheap plans the shorter route
// wins. SWIIMS got this tiebreak from the operator's manual table ordering.
const HOP_COST = 1e-9;

const IN = (id) => `${id}#in`;
const OUT = (id) => `${id}#out`;

const INACTIVE_STATUSES = new Set(["decommissioned", "inactive"]);

const num = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const nodeData = (n) => n?.data || n || {};
const edgeData = (e) => e?.data || e || {};

/**
 * Effective capacity of a pipe, after its capacity-limitation rule.
 *
 * A pipe with no capacity recorded is treated as unconstrained rather than as
 * zero — most canvases are drawn before the pipe specs are filled in, and
 * zeroing them would silently report a total network failure. The config
 * screen surfaces these as a warning instead.
 */
export function pipeCapacity(specs = {}) {
  const base = num(specs.capacity) ?? num(specs.designCapacity) ?? num(specs.maximumCapacity);
  if (base == null || base <= 0) return { capacity: UNLIMITED, unconstrained: true };

  const limitValue = num(specs.capacityLimitationValue);
  if (specs.capacityLimitationType === "percentage" && limitValue != null) {
    return { capacity: base * (Math.min(Math.max(limitValue, 0), 100) / 100), unconstrained: false };
  }
  if (specs.capacityLimitationType === "absolute" && limitValue != null) {
    return { capacity: Math.min(base, Math.max(limitValue, 0)), unconstrained: false };
  }
  return { capacity: base, unconstrained: false };
}

/** Split a saved network doc into the pieces the engine cares about. */
export function readNetwork(network) {
  const nodes = [];
  for (const raw of network?.nodes || []) {
    const d = nodeData(raw);
    if (!d.id || d.category === "note" || d.type === "note") continue;
    nodes.push({
      id: d.id,
      assetId: d.assetId || null,
      category: d.category || d.type || "node",
      label: d.label || d.displayLabel || d.assetId || d.id,
      status: d.status || "",
      meta: d.meta || {},
    });
  }

  const edges = [];
  for (const raw of network?.edges || []) {
    const d = edgeData(raw);
    if (!d.id || !d.source || !d.target) continue;
    const specs = d.meta?.specifications || {};
    edges.push({
      id: d.id,
      source: d.source,
      target: d.target,
      label: d.label || d.displayLabel || d.id,
      active: d.active !== false,
      status: d.status || "",
      commissioningDate: d.commissioningDate || specs.commissioningDate || null,
      decommissioningDate: d.decommissioningDate || specs.decommissioningDate || null,
      bidirectional: !!specs.bidirectional,
      specs,
    });
  }

  return { nodes, edges };
}

/**
 * Build the day's flow network.
 *
 * @param {object} args
 * @param {{nodes:object[],edges:object[]}} args.topology  from readNetwork()
 * @param {Map<string,{available:number,cost:number}>} args.supply   canvas nodeId -> plant supply
 * @param {Map<string,number>} args.throughput                       canvas nodeId -> pump limit (null = unlimited)
 * @param {Map<string,number>} args.demand                           canvas nodeId -> gate intake cap
 * @param {string} args.dateIso
 * @param {FlowNetwork} args.network                                 an empty FlowNetwork to populate
 * @returns {{ supplyArcs:Map, demandArcs:Map, pipeArcs:Map, activeNodeIds:Set<string> }}
 */
export function buildDayNetwork({ topology, supply, throughput, demand, dateIso, network }) {
  const supplyArcs = new Map();
  const demandArcs = new Map();
  const pipeArcs = new Map();
  const activeNodeIds = new Set();

  for (const node of topology.nodes) {
    if (INACTIVE_STATUSES.has(node.status)) continue;
    const meta = node.meta || {};
    if (!inServiceOn(meta.commissioning_date, meta.decommissioning_date, dateIso)) continue;
    activeNodeIds.add(node.id);

    // Internal arc. Only pump stations constrain throughput; everything else
    // passes water through freely.
    const limit = node.category === "pump" ? throughput.get(node.id) : null;
    network.addArc(
      IN(node.id),
      OUT(node.id),
      limit == null ? UNLIMITED : limit,
      0,
      node.category === "pump"
        ? { kind: "pump", nodeId: node.id, assetId: node.assetId, label: node.label }
        : null,
    );

    if (node.category === "plant") {
      const s = supply.get(node.id);
      if (s && s.available > 0) {
        const arc = network.addArc(SUPER_SRC, OUT(node.id), s.available, s.cost, {
          kind: "plant_supply",
          nodeId: node.id,
          assetId: node.assetId,
          label: node.label,
        });
        supplyArcs.set(node.id, arc);
      }
    }

    if (node.category === "handover_point") {
      const required = demand.get(node.id);
      if (required > 0) {
        const arc = network.addArc(OUT(node.id), SUPER_SNK, required, 0, {
          kind: "gate_intake",
          nodeId: node.id,
          assetId: node.assetId,
          label: node.label,
        });
        demandArcs.set(node.id, arc);
      }
    }
  }

  for (const edge of topology.edges) {
    if (!edge.active || INACTIVE_STATUSES.has(edge.status)) continue;
    if (!activeNodeIds.has(edge.source) || !activeNodeIds.has(edge.target)) continue;
    if (!inServiceOn(edge.commissioningDate, edge.decommissioningDate, dateIso)) continue;

    const { capacity, unconstrained } = pipeCapacity(edge.specs);
    if (capacity <= 0) continue;

    const meta = { kind: "pipe", edgeId: edge.id, label: edge.label, unconstrained };
    const forward = network.addArc(OUT(edge.source), IN(edge.target), capacity, HOP_COST, meta);
    const arcs = [forward];

    if (edge.bidirectional) {
      // A separate arc rather than relying on the residual twin: the reverse
      // direction has its own capacity, it is not a refund of forward flow.
      arcs.push(network.addArc(OUT(edge.target), IN(edge.source), capacity, HOP_COST, { ...meta, reverse: true }));
    }
    pipeArcs.set(edge.id, arcs);
  }

  return { supplyArcs, demandArcs, pipeArcs, activeNodeIds };
}

export { HOP_COST, IN, OUT };
