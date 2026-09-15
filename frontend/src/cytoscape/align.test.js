import test from "node:test";
import assert from "node:assert/strict";

import { alignPositions, distributePositions } from "./align.js";

const byId = (rows) => new Map(rows.map((r) => [r.id, r]));

test("alignPositions needs at least two nodes", () => {
  assert.deepEqual(alignPositions([{ id: "a", x: 0, y: 0, w: 10, h: 10 }], "left"), []);
  assert.deepEqual(alignPositions([], "left"), []);
});

test("alignPositions ignores an unknown mode", () => {
  const nodes = [
    { id: "a", x: 0, y: 0, w: 10, h: 10 },
    { id: "b", x: 5, y: 5, w: 10, h: 10 },
  ];
  assert.deepEqual(alignPositions(nodes, "diagonal"), []);
});

test("align left lines up left edges, respecting node size", () => {
  const nodes = [
    { id: "a", x: 100, y: 0, w: 40, h: 20 }, // left edge 80
    { id: "b", x: 200, y: 50, w: 20, h: 20 }, // left edge 190
  ];
  const out = byId(alignPositions(nodes, "left"));
  // leftmost edge is 80 → each centre = 80 + halfWidth
  assert.equal(out.get("a").x, 100);
  assert.equal(out.get("b").x, 90);
  // y is untouched by a horizontal alignment
  assert.equal(out.get("a").y, 0);
  assert.equal(out.get("b").y, 50);
});

test("align right lines up right edges", () => {
  const nodes = [
    { id: "a", x: 100, y: 0, w: 40, h: 20 }, // right edge 120
    { id: "b", x: 200, y: 0, w: 20, h: 20 }, // right edge 210
  ];
  const out = byId(alignPositions(nodes, "right"));
  // rightmost edge is 210 → centre = 210 - halfWidth
  assert.equal(out.get("a").x, 190);
  assert.equal(out.get("b").x, 200);
});

test("align centerH moves every node to the mean x", () => {
  const nodes = [
    { id: "a", x: 0, y: 0, w: 10, h: 10 },
    { id: "b", x: 100, y: 0, w: 10, h: 10 },
    { id: "c", x: 200, y: 0, w: 10, h: 10 },
  ];
  const out = byId(alignPositions(nodes, "centerH"));
  for (const id of ["a", "b", "c"]) assert.equal(out.get(id).x, 100);
});

test("align top/bottom/middleV act on the y axis only", () => {
  const nodes = [
    { id: "a", x: 0, y: 100, w: 10, h: 40 }, // top edge 80, bottom 120
    { id: "b", x: 0, y: 200, w: 10, h: 20 }, // top edge 190, bottom 210
  ];
  const top = byId(alignPositions(nodes, "top"));
  assert.equal(top.get("a").y, 100); // topmost edge 80 → 80+20
  assert.equal(top.get("b").y, 90);

  const bottom = byId(alignPositions(nodes, "bottom"));
  assert.equal(bottom.get("a").y, 190); // bottom-most edge 210 → 210-20
  assert.equal(bottom.get("b").y, 200);

  const middle = byId(alignPositions(nodes, "middleV"));
  assert.equal(middle.get("a").y, 150);
  assert.equal(middle.get("b").y, 150);
  // x untouched
  assert.equal(middle.get("a").x, 0);
});

test("distributePositions needs at least three nodes", () => {
  const two = [
    { id: "a", x: 0, y: 0 },
    { id: "b", x: 10, y: 0 },
  ];
  assert.deepEqual(distributePositions(two, "h"), []);
});

test("distribute horizontally makes equal gaps and keeps the ends fixed", () => {
  const nodes = [
    { id: "a", x: 0, y: 5 },
    { id: "b", x: 10, y: 7 }, // off-centre, should move to 50
    { id: "c", x: 100, y: 9 },
  ];
  const out = byId(distributePositions(nodes, "h"));
  assert.equal(out.get("a").x, 0);
  assert.equal(out.get("b").x, 50);
  assert.equal(out.get("c").x, 100);
  // y preserved
  assert.equal(out.get("b").y, 7);
});

test("distribute vertically sorts by y before stepping", () => {
  const nodes = [
    { id: "a", x: 1, y: 100 },
    { id: "b", x: 2, y: 0 },
    { id: "c", x: 3, y: 40 },
  ];
  const out = byId(distributePositions(nodes, "v"));
  assert.equal(out.get("b").y, 0);
  assert.equal(out.get("c").y, 50);
  assert.equal(out.get("a").y, 100);
  // x preserved
  assert.equal(out.get("c").x, 3);
});
