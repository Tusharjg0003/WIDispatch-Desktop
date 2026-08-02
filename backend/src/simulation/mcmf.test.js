import { test } from "node:test";
import assert from "node:assert/strict";
import { FlowNetwork, minCostMaxFlow, minCutArcs } from "./mcmf.js";

// SRC -> cheap(1.0/m³) and expensive(3.0/m³), both -> gate -> SNK.
function twoPlantNetwork({ cheapCap = 100, expCap = 100, demand = 120, cheapPipe = 1000, expPipe = 1000 }) {
  const net = new FlowNetwork();
  const arcs = {
    cheapSupply: net.addArc("SRC", "cheap", cheapCap, 1.0, { kind: "plant_supply", label: "Cheap" }),
    expSupply: net.addArc("SRC", "exp", expCap, 3.0, { kind: "plant_supply", label: "Expensive" }),
    cheapPipe: net.addArc("cheap", "gate", cheapPipe, 0, { kind: "pipe", label: "Cheap main" }),
    expPipe: net.addArc("exp", "gate", expPipe, 0, { kind: "pipe", label: "Expensive main" }),
    intake: net.addArc("gate", "SNK", demand, 0, { kind: "gate_intake", label: "Gate" }),
  };
  return { net, arcs };
}

test("minCostMaxFlow: exhausts the cheap plant before touching the expensive one", () => {
  const { net, arcs } = twoPlantNetwork({ demand: 120 });
  const { flow, cost } = minCostMaxFlow(net, "SRC", "SNK");

  assert.equal(flow, 120);
  assert.equal(net.flowOn(arcs.cheapSupply), 100);
  assert.equal(net.flowOn(arcs.expSupply), 20);
  assert.equal(cost, 100 * 1.0 + 20 * 3.0);
});

test("minCostMaxFlow: a saturated pipe forces the expensive plant to carry more", () => {
  const { net, arcs } = twoPlantNetwork({ demand: 120, cheapPipe: 50 });
  const { flow, cost } = minCostMaxFlow(net, "SRC", "SNK");

  assert.equal(flow, 120);
  assert.equal(net.flowOn(arcs.cheapSupply), 50);
  assert.equal(net.flowOn(arcs.expSupply), 70);
  assert.equal(cost, 50 * 1.0 + 70 * 3.0);
});

test("minCostMaxFlow: demand above total supply is met as far as capacity allows", () => {
  const { net } = twoPlantNetwork({ demand: 250 });
  const { flow } = minCostMaxFlow(net, "SRC", "SNK");
  assert.equal(flow, 200);
});

test("minCutArcs: production shortfall cuts only the plant supply arcs", () => {
  const { net } = twoPlantNetwork({ demand: 250 });
  const { reachable } = minCostMaxFlow(net, "SRC", "SNK");
  const cut = minCutArcs(net, reachable);

  assert.equal(cut.length, 2);
  assert.ok(cut.every((c) => c.kind === "plant_supply"));
});

test("minCutArcs: a transmission bottleneck names the saturated pipes", () => {
  const { net } = twoPlantNetwork({ demand: 150, cheapPipe: 50, expPipe: 50 });
  const { flow, reachable } = minCostMaxFlow(net, "SRC", "SNK");
  const cut = minCutArcs(net, reachable);

  assert.equal(flow, 100);
  assert.deepEqual(
    cut.map((c) => c.label).sort(),
    ["Cheap main", "Expensive main"],
  );
  assert.ok(cut.every((c) => c.kind === "pipe"));
});

test("minCostMaxFlow: reroutes rather than stranding flow on a first-come path", () => {
  // The greedy forward-only allocator this replaces would send the cheap
  // plant down the shared trunk first, saturate it, and then be unable to
  // serve gate B at all. An augmenting-path solver undoes that choice.
  const net = new FlowNetwork();
  net.addArc("SRC", "cheap", 100, 1.0);
  net.addArc("SRC", "exp", 100, 2.0);
  net.addArc("cheap", "trunk", 100, 0);
  net.addArc("exp", "trunk", 100, 0);
  net.addArc("trunk", "gateA", 100, 0); // only the cheap plant's route reaches A
  net.addArc("cheap", "gateB", 100, 0); // ...and a direct line to B
  net.addArc("gateA", "SNK", 100, 0);
  net.addArc("gateB", "SNK", 100, 0);

  const { flow } = minCostMaxFlow(net, "SRC", "SNK");
  assert.equal(flow, 200);
});

test("FlowNetwork: capacityOf reports the original capacity after augmentation", () => {
  const { net, arcs } = twoPlantNetwork({ demand: 120 });
  minCostMaxFlow(net, "SRC", "SNK");
  assert.equal(net.capacityOf(arcs.cheapSupply), 100);
});
