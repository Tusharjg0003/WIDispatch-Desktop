import { test } from "node:test";
import assert from "node:assert/strict";
import { buildCyStyle } from "./buildCyStyle.js";

// Cytoscape resolves competing rules by stylesheet order — last match wins
// per property. Every simulation bucket rule must sit before node:selected,
// edge:selected and the trace block, or a selected/traced element on the
// Canvas tab loses that styling to the sim overlay underneath it.
function simulationSelectorIndexes(stylesheet) {
  return stylesheet
    .map((rule, i) => ({ rule, i }))
    .filter(({ rule }) => /\bsim-(edge|plant|gate|pump)--|edge\[simWidth\]|node\.sim-overridden/.test(rule.selector))
    .map(({ i }) => i);
}

function indexOfSelector(stylesheet, needle) {
  return stylesheet.findIndex((rule) => rule.selector.includes(needle));
}

function exactSelectorIndex(stylesheet, selector) {
  return stylesheet.findIndex((rule) => rule.selector === selector);
}

test("buildCyStyle: simulation edge colours follow the base edge rule", () => {
  const stylesheet = buildCyStyle();
  const simIndexes = simulationSelectorIndexes(stylesheet).filter((i) => stylesheet[i].selector.includes("sim-edge"));
  const baseEdgeIdx = exactSelectorIndex(stylesheet, "edge");
  assert.ok(baseEdgeIdx >= 0, "expected to find base edge rule");
  assert.ok(simIndexes.length > 0, "expected to find simulation edge selectors");
  for (const i of simIndexes) {
    assert.ok(i > baseEdgeIdx, `simulation edge rule at index ${i} (${stylesheet[i].selector}) must follow base edge (index ${baseEdgeIdx})`);
  }
});

test("buildCyStyle: simulation overlay rules precede node:selected", () => {
  const stylesheet = buildCyStyle();
  const simIndexes = simulationSelectorIndexes(stylesheet);
  const selectedIdx = indexOfSelector(stylesheet, "node:selected");
  assert.ok(simIndexes.length > 0, "expected to find simulation selectors");
  assert.ok(selectedIdx >= 0, "expected to find node:selected rule");
  for (const i of simIndexes) {
    assert.ok(i < selectedIdx, `simulation rule at index ${i} (${stylesheet[i].selector}) must precede node:selected (index ${selectedIdx})`);
  }
});

test("buildCyStyle: simulation overlay rules precede edge:selected", () => {
  const stylesheet = buildCyStyle();
  const simIndexes = simulationSelectorIndexes(stylesheet);
  const selectedIdx = indexOfSelector(stylesheet, "edge:selected");
  assert.ok(selectedIdx >= 0, "expected to find edge:selected rule");
  for (const i of simIndexes) {
    assert.ok(i < selectedIdx, `simulation rule at index ${i} (${stylesheet[i].selector}) must precede edge:selected (index ${selectedIdx})`);
  }
});

test("buildCyStyle: simulation overlay rules precede the trace block", () => {
  const stylesheet = buildCyStyle();
  const simIndexes = simulationSelectorIndexes(stylesheet);
  const traceRootIdx = indexOfSelector(stylesheet, "node.trace-root");
  assert.ok(traceRootIdx >= 0, "expected to find node.trace-root rule");
  for (const i of simIndexes) {
    assert.ok(i < traceRootIdx, `simulation rule at index ${i} (${stylesheet[i].selector}) must precede node.trace-root (index ${traceRootIdx})`);
  }
});

// Bucket lists mirror what the pure layer in ../lib/simulationCanvas.js can
// return (edgeState, plantState, gateState, pumpState) — hard-coded here
// since those are functions, not enumerable constants.
const EDGE_BUCKETS = ["idle", "low", "medium", "high", "unconstrained", "bottleneck"];
const PLANT_BUCKETS = ["idle", "partial", "at-capacity", "no-capacity"];
const GATE_BUCKETS = ["no-demand", "met", "adjusted", "shortfall"];
const PUMP_BUCKETS = ["normal", "unconstrained", "offline", "binding"];

function assertBucketsCovered(stylesheet, prefix, buckets) {
  for (const bucket of buckets) {
    const className = `${prefix}--${bucket}`;
    const found = stylesheet.some((rule) => rule.selector.includes(className));
    assert.ok(found, `expected a selector containing .${className}`);
  }
}

test("buildCyStyle: every edge/plant/gate/pump bucket has a matching selector", () => {
  const stylesheet = buildCyStyle();
  assertBucketsCovered(stylesheet, "sim-edge", EDGE_BUCKETS);
  assertBucketsCovered(stylesheet, "sim-plant", PLANT_BUCKETS);
  assertBucketsCovered(stylesheet, "sim-gate", GATE_BUCKETS);
  assertBucketsCovered(stylesheet, "sim-pump", PUMP_BUCKETS);
});

test("buildCyStyle: sim-edge--unconstrained is not styled identically to sim-edge--low", () => {
  const stylesheet = buildCyStyle();
  const lowRule = stylesheet.find((rule) => rule.selector.includes("sim-edge--low"));
  const unconstrainedRule = stylesheet.find((rule) => rule.selector.includes("sim-edge--unconstrained"));
  assert.ok(lowRule, "expected a sim-edge--low rule");
  assert.ok(unconstrainedRule, "expected a sim-edge--unconstrained rule");
  assert.notDeepEqual(
    unconstrainedRule.style,
    lowRule.style,
    "sim-edge--unconstrained must not resolve to the same styling as sim-edge--low — the legend draws them as distinct dash patterns",
  );
});

test("buildCyStyle: the bend rule follows the base edge rule", () => {
  const stylesheet = buildCyStyle();
  const bendIdx = indexOfSelector(stylesheet, "edgebendediting-hasbendpoints");
  const baseEdgeIdx = exactSelectorIndex(stylesheet, "edge");
  assert.ok(bendIdx >= 0, "expected a bend-point rule");
  assert.ok(
    bendIdx > baseEdgeIdx,
    "curve-style: segments must override the base edge's bezier, so it has to come later",
  );
  const bendRule = stylesheet[bendIdx];
  assert.equal(bendRule.style["curve-style"], "segments");
  assert.equal(bendRule.style["segment-weights"], "data(cyedgebendeditingWeights)");
  assert.equal(bendRule.style["segment-distances"], "data(cyedgebendeditingDistances)");
  // Weights/distances are relative to node centres, not to the border
  // intersections Cytoscape measures from by default.
  assert.equal(bendRule.style["edge-distances"], "node-position");
});

test("buildCyStyle: level-of-detail rules sit between the base node rule and selection", () => {
  const stylesheet = buildCyStyle();
  const baseNodeIdx = exactSelectorIndex(stylesheet, "node");
  const selectedIdx = indexOfSelector(stylesheet, "node:selected");
  for (const cls of ["node.lod-mid", "node.lod-far"]) {
    const idx = exactSelectorIndex(stylesheet, cls);
    assert.ok(idx >= 0, `expected a ${cls} rule`);
    assert.ok(idx > baseNodeIdx, `${cls} must override the base node card geometry`);
    assert.ok(idx < selectedIdx, `${cls} must not outrank selection styling`);
  }
});

test("buildCyStyle: the far zoom band drops labels", () => {
  const stylesheet = buildCyStyle();
  const far = stylesheet[exactSelectorIndex(stylesheet, "node.lod-far")];
  assert.equal(far.style.label, "");
});
