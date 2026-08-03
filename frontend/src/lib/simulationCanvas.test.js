import { test } from "node:test";
import assert from "node:assert/strict";
import { edgeState, edgeWidth, gateState, plantState, pumpState } from "./simulationCanvas.js";

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
