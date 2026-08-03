// Trace: walking the canvas graph upstream and downstream from a root node.
//
// Shared by the Network Builder (topology reachability) and the Simulation
// Canvas tab (delivery paths over a solved day's flows). `computeTrace` has
// always supported a flow-aware "delivered" mode; the builder feeds it edge
// data that is in practice always empty, so only the Canvas tab exercises it
// with real numbers.

export const TRACE_CLASSES = "trace-root trace-up trace-down trace-up-edge trace-down-edge trace-dim";

export const edgeSpec = (edge) => edge.data("meta")?.specifications || {};

export const isBidirectionalPipe = (edge) => {
  const spec = edgeSpec(edge);
  return (
    edge.data("bidirectional") === true ||
    edge.data("bidirectional") === "true" ||
    spec.bidirectional === true ||
    spec.bidirectional === "true"
  );
};

export const computeTrace = (cy, rootId, opts = {}) => {
  const flowByEdge = opts.flowByEdge || {};
  const requestedMode = opts.mode === "delivered" ? "delivered" : "reachable";
  const hasFlow = Object.keys(flowByEdge).length > 0;
  const delivered = requestedMode === "delivered" && hasFlow;
  const flowAmount = (edge) => Number(flowByEdge[edge.id()] ?? 0);
  const passable = (edge) => !delivered || flowAmount(edge) > 1e-5;

  const walk = (dir) => {
    const nodes = new Set();
    const edges = new Set();
    const seen = new Set([rootId]);
    const queue = [rootId];

    while (queue.length) {
      const current = queue.shift();
      cy.getElementById(current).connectedEdges().forEach((edge) => {
        if (!passable(edge)) return;
        const source = edge.source().id();
        const target = edge.target().id();
        let next = null;

        if (dir > 0) {
          if (source === current) next = target;
          else if (isBidirectionalPipe(edge) && target === current) next = source;
        } else {
          if (target === current) next = source;
          else if (isBidirectionalPipe(edge) && source === current) next = target;
        }

        if (!next) return;
        edges.add(edge.id());
        if (!seen.has(next)) {
          seen.add(next);
          nodes.add(next);
          queue.push(next);
        }
      });
    }

    return { nodes, edges };
  };

  return {
    rootId,
    down: walk(1),
    up: walk(-1),
    hasFlow,
    requestedMode,
    mode: delivered ? "delivered" : "reachable",
    flowAmount,
  };
};

export const paintTrace = (cy, trace) => {
  cy.batch(() => {
    cy.elements().removeClass(TRACE_CLASSES);
    cy.nodes().forEach((node) => {
      const id = node.id();
      if (id === trace.rootId) node.addClass("trace-root");
      else if (trace.down.nodes.has(id)) node.addClass("trace-down");
      else if (trace.up.nodes.has(id)) node.addClass("trace-up");
      else node.addClass("trace-dim");
    });
    cy.edges().forEach((edge) => {
      const id = edge.id();
      if (trace.down.edges.has(id)) edge.addClass("trace-down-edge");
      else if (trace.up.edges.has(id)) edge.addClass("trace-up-edge");
      else edge.addClass("trace-dim");
    });
  });
};

export const clearTraceClasses = (cy) => cy?.elements().removeClass(TRACE_CLASSES);

export const nodeName = (cy, id) => {
  const node = cy.getElementById(id);
  return node?.length ? node.data("label") || node.data("displayLabel") || node.data("name") || id : id;
};

export const traceNeighbours = (cy, trace) => {
  const sources = [];
  const dests = [];
  cy.getElementById(trace.rootId).connectedEdges().forEach((edge) => {
    const flow = trace.flowAmount(edge);
    if (trace.mode === "delivered" && flow <= 1e-5) return;
    const source = edge.source().id();
    const target = edge.target().id();
    if (target === trace.rootId) sources.push({ id: source, name: nodeName(cy, source), flow });
    if (source === trace.rootId) dests.push({ id: target, name: nodeName(cy, target), flow });
    if (isBidirectionalPipe(edge) && source === trace.rootId) sources.push({ id: target, name: nodeName(cy, target), flow });
    if (isBidirectionalPipe(edge) && target === trace.rootId) dests.push({ id: source, name: nodeName(cy, source), flow });
  });
  const byFlowThenName = (a, b) => b.flow - a.flow || a.name.localeCompare(b.name);
  return { sources: sources.sort(byFlowThenName), dests: dests.sort(byFlowThenName) };
};
