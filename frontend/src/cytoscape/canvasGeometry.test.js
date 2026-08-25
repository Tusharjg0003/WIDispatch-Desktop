import test from "node:test";
import assert from "node:assert/strict";

import {
  CANVAS_GRID_PITCH,
  bendPairsToPoints,
  computeGridPitch,
  pointToBendPair,
  snapPosition,
  snapValue,
  wrapOffset,
} from "./canvasGeometry.js";

test("computeGridPitch keeps the on-screen minor pitch inside the readable band", () => {
  for (const zoom of [0.05, 0.2, 0.5, 1, 2, 4]) {
    const { screenMinor } = computeGridPitch(zoom);
    assert.ok(screenMinor >= 24 && screenMinor <= 96, `zoom ${zoom} → ${screenMinor}px`);
  }
});

test("computeGridPitch leaves the base pitch alone at 1:1 and majors every 5", () => {
  const { minor, major, minorAlpha } = computeGridPitch(1);
  assert.equal(minor, CANVAS_GRID_PITCH);
  assert.equal(major, CANVAS_GRID_PITCH * 5);
  assert.equal(minorAlpha, 1);
});

test("computeGridPitch fades minor lines out as the pitch approaches the floor", () => {
  // 24px on screen is the floor → fully transparent; 34px and up → fully opaque.
  assert.equal(computeGridPitch(24 / CANVAS_GRID_PITCH).minorAlpha, 0);
  assert.equal(computeGridPitch(34 / CANVAS_GRID_PITCH).minorAlpha, 1);
  const mid = computeGridPitch(29 / CANVAS_GRID_PITCH).minorAlpha;
  assert.ok(mid > 0 && mid < 1);
});

test("computeGridPitch tolerates a missing or nonsense zoom", () => {
  assert.equal(computeGridPitch(0).minor, CANVAS_GRID_PITCH);
  assert.equal(computeGridPitch(Number.NaN).minor, CANVAS_GRID_PITCH);
  assert.equal(computeGridPitch(-2).minor, CANVAS_GRID_PITCH);
});

test("wrapOffset stays inside one tile for negative pans", () => {
  assert.equal(wrapOffset(-10, 40), 30);
  assert.equal(wrapOffset(50, 40), 10);
  assert.equal(wrapOffset(40, 40), 0);
  assert.equal(wrapOffset(10, 0), 0);
});

test("snapValue rounds to the nearest pitch and passes non-numbers through", () => {
  assert.equal(snapValue(59, 40), 40);
  assert.equal(snapValue(61, 40), 80);
  assert.equal(snapValue(-59, 40), -40);
  assert.equal(snapValue(Number.NaN, 40), Number.NaN);
  assert.equal(snapValue(37, 0), 37);
});

test("snapPosition snaps both axes", () => {
  assert.deepEqual(snapPosition({ x: 61, y: -12 }, 40), { x: 80, y: -0 });
  assert.equal(snapPosition(null), null);
});

test("bend pairs round-trip through absolute points", () => {
  const src = { x: 100, y: 100 };
  const tgt = { x: 400, y: 260 };
  const point = { x: 220, y: 60 };

  const pair = pointToBendPair(src, tgt, point);
  const [back] = bendPairsToPoints(src, tgt, [pair.weight], [pair.distance]);

  assert.ok(Math.abs(back.x - point.x) < 1e-9);
  assert.ok(Math.abs(back.y - point.y) < 1e-9);
});

test("a bend on the centreline has zero perpendicular distance", () => {
  const src = { x: 0, y: 0 };
  const tgt = { x: 200, y: 0 };
  const pair = pointToBendPair(src, tgt, { x: 100, y: 0 });
  assert.equal(pair.weight, 0.5);
  assert.equal(pair.distance, 0);
});

test("degenerate edges yield no bend geometry", () => {
  const p = { x: 10, y: 10 };
  assert.deepEqual(bendPairsToPoints(p, p, [0.5], [10]), []);
  assert.equal(pointToBendPair(p, p, { x: 0, y: 0 }), null);
});

test("bendPairsToPoints ignores unpaired or non-finite entries", () => {
  const src = { x: 0, y: 0 };
  const tgt = { x: 100, y: 0 };
  assert.equal(bendPairsToPoints(src, tgt, [0.5, 0.7], [10]).length, 1);
  assert.equal(bendPairsToPoints(src, tgt, [Number.NaN], [10]).length, 0);
});
