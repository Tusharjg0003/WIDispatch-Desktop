import test from "node:test";
import assert from "node:assert/strict";

import { bendPointsToPairs, planPipeSplit, splitPipeSpecs } from "./pipeSplit.js";
import { bendPairsToPoints } from "./canvasGeometry.js";

const src = { x: 0, y: 0 };
const tgt = { x: 200, y: 0 };

test("planPipeSplit: straight pipe splits where it was clicked", () => {
  const plan = planPipeSplit({ srcPos: src, tgtPos: tgt, clickPos: { x: 50, y: 7 } });
  assert.equal(plan.ratio, 0.25);
  assert.deepEqual(plan.point, { x: 50, y: 0 });
  assert.deepEqual(plan.firstBends, []);
  assert.deepEqual(plan.secondBends, []);
});

test("planPipeSplit: no click falls back to the midpoint", () => {
  const plan = planPipeSplit({ srcPos: src, tgtPos: tgt });
  assert.equal(plan.ratio, 0.5);
  assert.deepEqual(plan.point, { x: 100, y: 0 });
});

test("planPipeSplit: ratio is clamped away from the endpoints", () => {
  assert.equal(planPipeSplit({ srcPos: src, tgtPos: tgt, clickPos: { x: 1, y: 0 } }).ratio, 0.05);
  assert.equal(planPipeSplit({ srcPos: src, tgtPos: tgt, clickPos: { x: 199, y: 0 } }).ratio, 0.95);
});

test("planPipeSplit: bends stay with the half they belong to", () => {
  // One bend at (100, 100): the pipe goes down-right then up-right.
  const { weights, distances } = bendPointsToPairs(src, tgt, [{ x: 100, y: 100 }]);
  const before = planPipeSplit({ srcPos: src, tgtPos: tgt, weights, distances, clickPos: { x: 50, y: 50 } });
  assert.equal(before.firstBends.length, 0);
  assert.equal(before.secondBends.length, 1);
  const after = planPipeSplit({ srcPos: src, tgtPos: tgt, weights, distances, clickPos: { x: 150, y: 50 } });
  assert.equal(after.firstBends.length, 1);
  assert.equal(after.secondBends.length, 0);
  assert.equal(before.ratio, 0.25);
});

test("bendPointsToPairs round-trips through bendPairsToPoints", () => {
  const points = [{ x: 40, y: 30 }, { x: 120, y: -20 }];
  const { weights, distances } = bendPointsToPairs(src, tgt, points);
  const back = bendPairsToPoints(src, tgt, weights, distances);
  back.forEach((p, i) => {
    assert.ok(Math.abs(p.x - points[i].x) < 1e-9);
    assert.ok(Math.abs(p.y - points[i].y) < 1e-9);
  });
});

test("splitPipeSpecs: splits the length proportionally, copies the rest", () => {
  const [a, b] = splitPipeSpecs({ pipelineLength: 12, capacity: 500 }, 0.25);
  assert.equal(a.pipelineLength, 3);
  assert.equal(b.pipelineLength, 9);
  assert.equal(a.capacity, 500);
  assert.equal(b.capacity, 500);
  const [c, d] = splitPipeSpecs({ capacity: 1 }, 0.5);
  assert.equal(c.pipelineLength, undefined);
  assert.equal(d.capacity, 1);
});
