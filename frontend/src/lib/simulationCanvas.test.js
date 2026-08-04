import { test } from "node:test";
import assert from "node:assert/strict";
import {
  edgeState,
  edgeWidth,
  gateState,
  plantState,
  pumpState,
  dayOverlay,
  canvasStaleness,
  edgeDetail,
  edgeInsight,
  nodeDetail,
  nodeInsight,
  daySummaries,
} from "./simulationCanvas.js";

test("edgeState: no flow is idle regardless of capacity", () => {
  assert.equal(edgeState({ flow: 0, capacity: 1000 }), "idle");
  assert.equal(edgeState({ flow: 0, capacity: null, unconstrained: true }), "idle");
});

test("edgeState: utilisation buckets sit on the documented boundaries", () => {
  assert.equal(edgeState({ flow: 699, capacity: 1000 }), "low");
  assert.equal(edgeState({ flow: 700, capacity: 1000 }), "medium");
  assert.equal(edgeState({ flow: 899, capacity: 1000 }), "medium");
  assert.equal(edgeState({ flow: 900, capacity: 1000 }), "high");
  assert.equal(edgeState({ flow: 1000, capacity: 1000 }), "high");
});

// The SWIIMS reference computes `capacity || 1`, so any flow at all on a pipe
// with no capacity on record reads as >=90% critical. It must not.
test("edgeState: an unconstrained pipe is never high or bottleneck", () => {
  assert.equal(edgeState({ flow: 5_000_000, capacity: null, unconstrained: true }), "unconstrained");
  assert.equal(edgeState({ flow: 42, capacity: 0 }), "unconstrained");
});

test("edgeState: a binding constraint outranks its utilisation bucket", () => {
  assert.equal(edgeState({ flow: 100, capacity: 1000, isBottleneck: true }), "bottleneck");
});

test("edgeWidth: scales with utilisation and stays inside 2..6", () => {
  assert.equal(edgeWidth("idle", null), 2);
  assert.equal(edgeWidth("unconstrained", null), 3);
  assert.equal(edgeWidth("low", 0.25), 3);
  assert.equal(edgeWidth("high", 1), 6);
  assert.equal(edgeWidth("high", 5), 6, "utilisation over 100% must still clamp at 6");
});

test("plantState: a plant with no capacity on record is distinct from an idle one", () => {
  assert.equal(plantState({ noCapacity: true, available: 0 }, 0), "no-capacity");
  assert.equal(plantState({ noCapacity: false, available: 1000 }, 0), "idle");
});

test("plantState: running at the day's available capacity reads as at-capacity", () => {
  assert.equal(plantState({ available: 1000 }, 1000), "at-capacity");
  assert.equal(plantState({ available: 1000 }, 400), "partial");
});

test("plantState: a binding plant supply constraint outranks the capacity bucket", () => {
  assert.equal(plantState({ available: 1000 }, 1000, true), "binding");
});

test("gateState: reflects delivery against the request", () => {
  assert.equal(gateState({ required: 0, delivered: 0, shortage: 0 }), "no-demand");
  assert.equal(gateState({ required: 500, delivered: 500, shortage: 0 }), "met");
  assert.equal(gateState({ required: 500, delivered: 200, shortage: 300 }), "adjusted");
  assert.equal(gateState({ required: 500, delivered: 0, shortage: 500 }), "shortfall");
});

test("pumpState: binding outranks everything else", () => {
  assert.equal(pumpState({ fullOutage: true, unconstrained: false }, true), "binding");
  assert.equal(pumpState({ fullOutage: true }, false), "offline");
  assert.equal(pumpState({ unconstrained: true }, false), "unconstrained");
  assert.equal(pumpState({}, false), "normal");
});

// A two-day plan: day 0 is served, day 1 has a pipe bottleneck starving a gate.
const PLAN = {
  network: { id: "net1", name: "Test network" },
  from: "2026-08-04",
  to: "2026-08-05",
  pipes: [
    { id: "p1", label: "P1", capacity: 1000, unconstrained: false, peakFlow: 1000, avgFlow: 750, peakUtilisationPct: 100 },
    { id: "p2", label: "P2", capacity: null, unconstrained: true, peakFlow: 200, avgFlow: 150, peakUtilisationPct: null },
  ],
  days: [
    {
      date: "2026-08-04",
      plants: [{ nodeId: "n_plant", assetId: "PL1", name: "Plant 1", base: 2000, maintenanceLoss: 0, outageLoss: 0, available: 2000, noCapacity: false, variableOm: 2.1, variableOmSource: "economics", overridden: false }],
      pumps: [{ nodeId: "n_pump", assetId: "PU1", name: "Pump 1", base: 900, maintenanceLoss: 0, outageLoss: 0, available: 900, limit: 900, unconstrained: false, overridden: false }],
      gates: [{ nodeId: "n_gate", assetId: "HP1", name: "Gate 1", required: 500, delivered: 500, shortage: 0, cause: null, intakeLimited: false, overridden: false }],
      plantOutputs: { n_plant: 500 },
      pipeFlows: { p1: 500, p2: 100 },
      totalRequired: 500, totalDelivered: 500, totalShortage: 0, variableOmCost: 1050, satisfactionPct: 100,
      bindingConstraints: [],
    },
    {
      date: "2026-08-05",
      plants: [{ nodeId: "n_plant", assetId: "PL1", name: "Plant 1", base: 2000, maintenanceLoss: 0, outageLoss: 0, available: 2000, noCapacity: false, variableOm: 2.1, variableOmSource: "economics", overridden: false }],
      pumps: [{ nodeId: "n_pump", assetId: "PU1", name: "Pump 1", base: 900, maintenanceLoss: 0, outageLoss: 0, available: 900, limit: 900, unconstrained: false, overridden: false }],
      gates: [{ nodeId: "n_gate", assetId: "HP1", name: "Gate 1", required: 1500, delivered: 1000, shortage: 500, cause: "transmission_bottleneck", intakeLimited: false, overridden: false }],
      plantOutputs: { n_plant: 1000 },
      pipeFlows: { p1: 1000, p2: 0 },
      totalRequired: 1500, totalDelivered: 1000, totalShortage: 500, variableOmCost: 2100, satisfactionPct: 66.67,
      bindingConstraints: [{ kind: "pipe", label: "P1", id: "p1", assetId: null, flow: 1000, capacity: 1000 }],
    },
  ],
};

test("dayOverlay: indexes the requested day, not the first", () => {
  const overlay = dayOverlay(PLAN, 1);
  assert.equal(overlay.date, "2026-08-05");
  assert.equal(overlay.flowByEdge.p1, 1000);
  assert.equal(overlay.totals.shortage, 500);
});

test("dayOverlay: an out-of-range day index yields null", () => {
  assert.equal(dayOverlay(PLAN, 9), null);
  assert.equal(dayOverlay(null, 0), null);
});

test("dayOverlay: classifies pipes from that day's flows and constraints", () => {
  const quiet = dayOverlay(PLAN, 0);
  assert.equal(quiet.edgeStates.p1, "low", "500 of 1000 is 50%");
  assert.equal(quiet.edgeStates.p2, "unconstrained");

  const short = dayOverlay(PLAN, 1);
  assert.equal(short.edgeStates.p1, "bottleneck");
  assert.equal(short.edgeStates.p2, "idle", "no flow on day 1");
  assert.deepEqual(short.bottleneckEdgeIds, ["p1"]);
});

test("dayOverlay: a pipe with no entry in pipeFlows is idle, not missing", () => {
  const plan = { ...PLAN, days: [{ ...PLAN.days[0], pipeFlows: {} }] };
  const overlay = dayOverlay(plan, 0);
  assert.equal(overlay.edgeStates.p1, "idle");
  assert.equal(overlay.flowByEdge.p1, 0);
});

test("dayOverlay: classifies every canvas node it has a row for", () => {
  const overlay = dayOverlay(PLAN, 1);
  assert.equal(overlay.nodeStates.n_plant, "partial");
  assert.equal(overlay.nodeStates.n_gate, "adjusted");
  assert.equal(overlay.nodeStates.n_pump, "normal");
});

test("dayOverlay: a pump named in bindingConstraints is marked binding", () => {
  const plan = {
    ...PLAN,
    days: [{ ...PLAN.days[1], bindingConstraints: [{ kind: "pump", label: "Pump 1", id: "n_pump", flow: 900, capacity: 900 }] }],
  };
  const overlay = dayOverlay(plan, 0);
  assert.equal(overlay.nodeStates.n_pump, "binding");
  assert.deepEqual(overlay.bottleneckNodeIds, ["n_pump"]);
});

test("dayOverlay: plant supply binding does not turn low-utilisation pipes into bottlenecks", () => {
  const plan = {
    ...PLAN,
    days: [{
      ...PLAN.days[0],
      plantOutputs: { n_plant: 500 },
      pipeFlows: { p1: 220 },
      bindingConstraints: [{ kind: "plant_supply", label: "Plant 1", id: "n_plant", flow: 500, capacity: 500 }],
    }],
  };
  const overlay = dayOverlay(plan, 0);
  assert.equal(overlay.nodeStates.n_plant, "binding");
  assert.equal(overlay.edgeStates.p1, "low");
});

const TOPOLOGY = {
  nodes: [
    { data: { id: "n_plant", category: "plant" } },
    { data: { id: "n_pump", category: "pump" } },
    { data: { id: "n_gate", category: "handover_point" } },
    { data: { id: "n_junction", category: "node" } },
  ],
  edges: [
    { data: { id: "p1", source: "n_plant", target: "n_gate" } },
    { data: { id: "p2", source: "n_plant", target: "n_pump" } },
  ],
};

test("canvasStaleness: a canvas matching its run is clean", () => {
  const stale = canvasStaleness(TOPOLOGY, PLAN);
  assert.deepEqual(stale.unknownToRun, []);
  assert.deepEqual(stale.missingFromCanvas, []);
});

test("canvasStaleness: junctions are never reported as unknown", () => {
  // Junctions carry no per-day row by design, so they must not be mistaken for
  // assets added after the run.
  const stale = canvasStaleness(TOPOLOGY, PLAN);
  assert.ok(!stale.unknownToRun.includes("n_junction"));
});

test("canvasStaleness: reports assets and pipes added since the run", () => {
  const topology = {
    nodes: [...TOPOLOGY.nodes, { data: { id: "n_new", category: "plant" } }],
    edges: [...TOPOLOGY.edges, { data: { id: "p_new" } }],
  };
  const stale = canvasStaleness(topology, PLAN);
  assert.deepEqual(stale.unknownToRun.sort(), ["n_new", "p_new"]);
});

test("canvasStaleness: reports elements the run used that the canvas has lost", () => {
  const topology = { nodes: TOPOLOGY.nodes.filter((n) => n.data.id !== "n_gate"), edges: TOPOLOGY.edges };
  const stale = canvasStaleness(topology, PLAN);
  assert.deepEqual(stale.missingFromCanvas, ["n_gate"]);
});

test("edgeDetail: joins the day's flow with the horizon metadata", () => {
  const detail = edgeDetail(PLAN, 1, "p1");
  assert.equal(detail.flow, 1000);
  assert.equal(detail.capacity, 1000);
  assert.equal(detail.utilisationPct, 100);
  assert.equal(detail.isBottleneck, true);
  assert.equal(detail.peakUtilisationPct, 100);
  assert.equal(detail.inRun, true);
});

test("edgeDetail: an unconstrained pipe reports no utilisation rather than a fake one", () => {
  const detail = edgeDetail(PLAN, 0, "p2");
  assert.equal(detail.capacity, null);
  assert.equal(detail.unconstrained, true);
  assert.equal(detail.utilisationPct, null);
});

test("edgeDetail: an edge the run never saw is flagged, not fabricated", () => {
  const detail = edgeDetail(PLAN, 0, "p_unknown");
  assert.equal(detail.inRun, false);
});

test("edgeInsight: pipe series uses flow against capacity", () => {
  const insight = edgeInsight(PLAN, 1, "p1");
  assert.equal(insight.kind, "pipe");
  assert.equal(insight.metricLabel, "Flow");
  assert.equal(insight.referenceLabel, "Capacity");
  assert.equal(insight.currentValue, 1000);
  assert.equal(insight.referenceValue, 1000);
  assert.equal(insight.noteLabel, "Binding");
  assert.equal(insight.noteValueText, "Now");
  assert.equal(insight.tone, "bad");
  assert.deepEqual(insight.series.map((point) => point.value), [500, 1000]);
  assert.deepEqual(insight.series.map((point) => point.reference), [1000, 1000]);
  assert.equal(insight.series[1].alert, true);
});

test("edgeInsight: unconstrained pipes graph flow without a fake capacity", () => {
  const insight = edgeInsight(PLAN, 0, "p2");
  assert.equal(insight.referenceValue, null);
  assert.deepEqual(insight.series.map((point) => point.reference), [null, null]);
  assert.equal(insight.noteValueText, "No limit");
});

test("edgeInsight: unknown pipes have no popover data", () => {
  assert.equal(edgeInsight(PLAN, 0, "p_unknown"), null);
});

test("nodeDetail: a gate carries prose for its shortage cause", () => {
  const detail = nodeDetail(PLAN, 1, "n_gate");
  assert.equal(detail.kind, "gate");
  assert.equal(detail.shortage, 500);
  assert.equal(detail.causeLabel, "Transmission bottleneck");
});

test("nodeDetail: a plant carries its allocation, provenance and day cost", () => {
  const detail = nodeDetail(PLAN, 1, "n_plant");
  assert.equal(detail.kind, "plant");
  assert.equal(detail.allocated, 1000);
  assert.equal(detail.variableOmSource, "economics");
  assert.equal(detail.costSar, 2100);
});

test("nodeDetail: a node the run never saw is flagged", () => {
  assert.equal(nodeDetail(PLAN, 0, "n_junction").inRun, false);
});

test("nodeInsight: plant series uses dispatched output against available supply", () => {
  const insight = nodeInsight(PLAN, 1, "n_plant");
  assert.equal(insight.kind, "plant");
  assert.equal(insight.metricLabel, "Allocated");
  assert.equal(insight.currentValue, 1000);
  assert.equal(insight.referenceValue, 2000);
  assert.equal(insight.series.length, 2);
  assert.deepEqual(insight.series.map((point) => point.value), [500, 1000]);
});

test("nodeInsight: gate series surfaces shortage as an alert", () => {
  const insight = nodeInsight(PLAN, 1, "n_gate");
  assert.equal(insight.kind, "gate");
  assert.equal(insight.tone, "bad");
  assert.equal(insight.noteLabel, "Short");
  assert.equal(insight.noteValue, 500);
  assert.equal(insight.series[1].alert, true);
  assert.equal(insight.series[1].extra, 500);
});

test("nodeInsight: series alert follows each day's node binding state", () => {
  const plan = {
    ...PLAN,
    days: [{
      ...PLAN.days[0],
      bindingConstraints: [{ kind: "plant_supply", label: "Plant 1", id: "n_plant", flow: 500, capacity: 500 }],
    }, PLAN.days[1]],
  };
  const insight = nodeInsight(plan, 1, "n_plant");
  assert.equal(insight.series[0].alert, true);
  assert.equal(insight.series[1].alert, false);
});

test("nodeInsight: unknown or untracked nodes have no popover data", () => {
  assert.equal(nodeInsight(PLAN, 0, "n_junction"), null);
});

test("daySummaries: one entry per day, in horizon order", () => {
  const summaries = daySummaries(PLAN);
  assert.equal(summaries.length, 2);
  assert.deepEqual(summaries[0], { dayIdx: 0, date: "2026-08-04", required: 500, delivered: 500, shortage: 0, satisfactionPct: 100 });
  assert.equal(summaries[1].shortage, 500);
});

test("dayOverlay: collects the nodes carrying a per-run override", () => {
  const plan = {
    ...PLAN,
    days: [{ ...PLAN.days[0], gates: [{ ...PLAN.days[0].gates[0], overridden: true }] }],
  };
  assert.deepEqual(dayOverlay(plan, 0).overriddenIds, ["n_gate"]);
  assert.deepEqual(dayOverlay(PLAN, 0).overriddenIds, []);
});
