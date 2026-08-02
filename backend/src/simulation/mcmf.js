// Min-cost max-flow: successive shortest path with Johnson potentials.
//
// Why this and not a port of SWIIMS' flow.py: running SSP until no augmenting
// path remains yields, in this order, (1) the maximum total flow and (2) the
// minimum cost among all maximum flows. That is exactly the dispatch objective
// — serve as much demand as physically possible, and among the plans that do,
// pick the cheapest in Variable O&M. SWIIMS' greedy allocator pushes along
// forward residual capacity only (no back-arcs), so it can strand flow and
// report a shortage that a better routing would have avoided.
//
// All arc costs here are ≥ 0 (Variable O&M in SAR/m³, plus a per-hop epsilon),
// so Dijkstra with potentials is valid from the first iteration — no
// Bellman-Ford warm-up needed.

const EPS = 1e-6;

/**
 * Adjacency-list flow network. Arcs are stored in pairs (arc, its residual
 * twin) so `arc ^ 1` is the reverse — the standard trick that lets an
 * augmentation be undone later, which is what makes the result optimal.
 */
export class FlowNetwork {
  constructor() {
    this.head = [];      // arc -> destination node
    this.cap = [];       // arc -> remaining capacity
    this.cost = [];      // arc -> cost per unit
    this.graph = [];     // node -> arc indices
    this.arcMeta = [];   // arc -> caller-supplied label (edges only, not twins)
    this.nodeCount = 0;
    this.nodeIds = new Map(); // string id -> node index
    this.nodeNames = [];
  }

  node(id) {
    let index = this.nodeIds.get(id);
    if (index === undefined) {
      index = this.nodeCount++;
      this.nodeIds.set(id, index);
      this.nodeNames.push(id);
      this.graph.push([]);
    }
    return index;
  }

  /** Add a directed arc. Returns its index so the caller can read flow back off it. */
  addArc(fromId, toId, capacity, cost, meta = null) {
    const from = this.node(fromId);
    const to = this.node(toId);
    const arc = this.head.length;

    this.head.push(to, from);
    this.cap.push(capacity, 0);
    this.cost.push(cost, -cost);
    this.arcMeta.push(meta, null);
    this.graph[from].push(arc);
    this.graph[to].push(arc + 1);
    return arc;
  }

  /** Flow pushed through an arc = whatever ended up on its residual twin. */
  flowOn(arc) {
    return this.cap[arc + 1];
  }

  /** Original capacity of an arc = remaining + pushed. */
  capacityOf(arc) {
    return this.cap[arc] + this.cap[arc + 1];
  }
}

/**
 * Solve min-cost max-flow from `sourceId` to `sinkId`.
 *
 * @returns {{ flow:number, cost:number, reachable:Set<number> }}
 *   `reachable` is the set of nodes still reachable from the source in the
 *   final residual graph — the source side of a minimum cut. Arcs crossing out
 *   of it are exactly the constraints that bound the answer, which is what
 *   distinguishes a production shortfall from a transmission bottleneck.
 */
export function minCostMaxFlow(network, sourceId, sinkId) {
  const source = network.node(sourceId);
  const sink = network.node(sinkId);
  const n = network.nodeCount;

  const potential = new Float64Array(n);
  const dist = new Float64Array(n);
  const prevArc = new Int32Array(n);
  const visited = new Uint8Array(n);

  let totalFlow = 0;
  let totalCost = 0;

  for (;;) {
    dist.fill(Infinity);
    prevArc.fill(-1);
    visited.fill(0);
    dist[source] = 0;

    // Dense Dijkstra. Node counts here are in the hundreds (one saved canvas,
    // one day), so a binary heap would cost more in allocation than it saves.
    for (;;) {
      let u = -1;
      let best = Infinity;
      for (let i = 0; i < n; i += 1) {
        if (!visited[i] && dist[i] < best) {
          best = dist[i];
          u = i;
        }
      }
      if (u === -1) break;
      visited[u] = 1;

      for (const arc of network.graph[u]) {
        if (network.cap[arc] <= EPS) continue;
        const v = network.head[arc];
        if (visited[v]) continue;
        const reduced = network.cost[arc] + potential[u] - potential[v];
        const next = dist[u] + reduced;
        if (next < dist[v] - EPS) {
          dist[v] = next;
          prevArc[v] = arc;
        }
      }
    }

    if (dist[sink] === Infinity) break; // no augmenting path — flow is maximal

    for (let i = 0; i < n; i += 1) {
      if (dist[i] < Infinity) potential[i] += dist[i];
    }

    // Bottleneck along the path we just found.
    let push = Infinity;
    for (let v = sink; v !== source; v = network.head[prevArc[v] ^ 1]) {
      push = Math.min(push, network.cap[prevArc[v]]);
    }
    if (push <= EPS) break;

    for (let v = sink; v !== source; v = network.head[prevArc[v] ^ 1]) {
      const arc = prevArc[v];
      network.cap[arc] -= push;
      network.cap[arc ^ 1] += push;
      totalCost += push * network.cost[arc];
    }
    totalFlow += push;
  }

  return { flow: totalFlow, cost: totalCost, reachable: residualReachable(network, source) };
}

/** Nodes reachable from `start` over arcs with residual capacity left. */
export function residualReachable(network, start) {
  const seen = new Set([start]);
  const stack = [start];
  while (stack.length) {
    const u = stack.pop();
    for (const arc of network.graph[u]) {
      if (network.cap[arc] <= EPS) continue;
      const v = network.head[arc];
      if (!seen.has(v)) {
        seen.add(v);
        stack.push(v);
      }
    }
  }
  return seen;
}

/**
 * The arcs of a minimum cut: saturated arcs leaving the source side. These are
 * the binding constraints — report them to the operator as the reason a gate
 * could not be served in full.
 */
export function minCutArcs(network, reachable) {
  const cut = [];
  for (let arc = 0; arc < network.head.length; arc += 2) {
    const from = network.head[arc + 1];
    const to = network.head[arc];
    if (reachable.has(from) && !reachable.has(to) && network.arcMeta[arc]) {
      cut.push({ ...network.arcMeta[arc], flow: network.flowOn(arc), capacity: network.capacityOf(arc) });
    }
  }
  return cut;
}

export { EPS };
