import test from "node:test";
import assert from "node:assert/strict";
import cytoscape from "cytoscape";

import {
  BEND_CLASS,
  MULTI_BEND_CLASS,
  addBendPoint,
  edgeBendPoints,
  edgePolyline,
  removeAllBendPoints,
  removeNearestBendPoint,
  restoreBendClasses,
} from "./bendEditing.js";

// A horizontal pipe from (0,0) to (400,0) keeps the arithmetic readable:
// weight is x/400 and the perpendicular distance is y.
const makeCy = (edgeData = {}) =>
  cytoscape({
    headless: true,
    // Positions are explicit here (as they are on the real canvas), so the
    // default grid layout must not get a say.
    layout: { name: "preset" },
    elements: [
      { group: "nodes", data: { id: "a" }, position: { x: 0, y: 0 } },
      { group: "nodes", data: { id: "b" }, position: { x: 400, y: 0 } },
      { group: "edges", data: { id: "e", source: "a", target: "b", ...edgeData } },
    ],
  });

const edgeOf = (cy) => cy.getElementById("e");

test("addBendPoint stores a weight/distance pair and marks the edge bent", () => {
  const cy = makeCy();
  const edge = edgeOf(cy);

  assert.equal(addBendPoint(edge, { x: 200, y: -60 }), true);

  assert.deepEqual(edge.data("cyedgebendeditingWeights"), [0.5]);
  assert.deepEqual(edge.data("cyedgebendeditingDistances"), [-60]);
  assert.ok(edge.hasClass(BEND_CLASS));
  assert.ok(!edge.hasClass(MULTI_BEND_CLASS));
});

test("addBendPoint keeps bends ordered source→target however they are added", () => {
  const cy = makeCy();
  const edge = edgeOf(cy);

  addBendPoint(edge, { x: 300, y: -40 });
  addBendPoint(edge, { x: 100, y: 40 });

  assert.deepEqual(edge.data("cyedgebendeditingWeights"), [0.25, 0.75]);
  assert.ok(edge.hasClass(MULTI_BEND_CLASS));
  assert.deepEqual(
    edgeBendPoints(edge).map((p) => p.x),
    [100, 300]
  );
});

test("addBendPoint pushes a bend off the centreline when minOffset is set", () => {
  const cy = makeCy();
  const edge = edgeOf(cy);

  // A right-click lands on the line — without the offset the bend is invisible.
  addBendPoint(edge, { x: 200, y: 0 }, { minOffset: 40 });

  assert.equal(Math.abs(edge.data("cyedgebendeditingDistances")[0]), 40);
});

test("addBendPoint clamps a bend away from the endpoints", () => {
  const cy = makeCy();
  const edge = edgeOf(cy);

  addBendPoint(edge, { x: -200, y: -20 });

  assert.equal(edge.data("cyedgebendeditingWeights")[0], 0.05);
});

test("addBendPoint refuses a zero-length edge", () => {
  const cy = makeCy();
  cy.getElementById("b").position({ x: 0, y: 0 });

  assert.equal(addBendPoint(edgeOf(cy), { x: 10, y: 10 }), false);
  assert.equal(edgeOf(cy).hasClass(BEND_CLASS), false);
});

test("removeNearestBendPoint drops only the closest bend", () => {
  const cy = makeCy();
  const edge = edgeOf(cy);
  addBendPoint(edge, { x: 100, y: -40 });
  addBendPoint(edge, { x: 300, y: -40 });

  removeNearestBendPoint(edge, { x: 290, y: -30 });

  assert.deepEqual(
    edgeBendPoints(edge).map((p) => p.x),
    [100]
  );
  assert.ok(edge.hasClass(BEND_CLASS));
  assert.ok(!edge.hasClass(MULTI_BEND_CLASS));
});

test("removing the last bend clears the marker classes and the arrays", () => {
  const cy = makeCy();
  const edge = edgeOf(cy);
  addBendPoint(edge, { x: 200, y: -40 });

  removeNearestBendPoint(edge, { x: 200, y: -40 });

  assert.equal(edge.hasClass(BEND_CLASS), false);
  assert.deepEqual(edge.data("cyedgebendeditingWeights"), []);
  assert.deepEqual(edge.data("cyedgebendeditingDistances"), []);
});

test("removeAllBendPoints straightens a pipe in one go", () => {
  const cy = makeCy();
  const edge = edgeOf(cy);
  addBendPoint(edge, { x: 100, y: -40 });
  addBendPoint(edge, { x: 300, y: 40 });

  removeAllBendPoints(edge);

  assert.equal(edge.hasClass(BEND_CLASS), false);
  assert.deepEqual(edgeBendPoints(edge), []);
});

test("bendPointPositions is never left behind for the plugin to resurrect", () => {
  const cy = makeCy({ bendPointPositions: [{ x: 200, y: -40 }] });
  const edge = edgeOf(cy);

  addBendPoint(edge, { x: 200, y: -40 });

  assert.equal(edge.data("bendPointPositions"), undefined);
});

test("edgePolyline runs source → bends → target", () => {
  const cy = makeCy();
  const edge = edgeOf(cy);
  addBendPoint(edge, { x: 200, y: -60 });

  assert.deepEqual(edgePolyline(edge), [
    { x: 0, y: 0 },
    { x: 200, y: -60 },
    { x: 400, y: 0 },
  ]);
});

test("restoreBendClasses re-marks pipes hydrated from a saved canvas", () => {
  // Saved documents carry the arrays but not the class that draws them.
  const cy = makeCy({
    cyedgebendeditingWeights: [0.25, 0.75],
    cyedgebendeditingDistances: [40, -40],
  });

  restoreBendClasses(cy);

  const edge = edgeOf(cy);
  assert.ok(edge.hasClass(BEND_CLASS));
  assert.ok(edge.hasClass(MULTI_BEND_CLASS));
});

test("restoreBendClasses leaves straight pipes untouched", () => {
  const cy = makeCy();
  restoreBendClasses(cy);
  assert.equal(edgeOf(cy).hasClass(BEND_CLASS), false);
});

test("addBendPoint refuses to stack a bend on top of an existing one", () => {
  const cy = makeCy();
  const edge = edgeOf(cy);
  addBendPoint(edge, { x: 200, y: -40 });

  // A double-click near a midpoint handle fires twice in the same tick.
  assert.equal(addBendPoint(edge, { x: 203, y: -42 }, { minSeparation: 8 }), false);
  assert.equal(edgeBendPoints(edge).length, 1);

  // Far enough away is still a new bend.
  assert.equal(addBendPoint(edge, { x: 300, y: -40 }, { minSeparation: 8 }), true);
  assert.equal(edgeBendPoints(edge).length, 2);
});

test("restoreBendClasses repairs a bent pipe whose marker class was dropped", () => {
  // The editing plugin can strip the class mid-gesture; the bends themselves
  // are still on record, so the pipe must go back to drawing them.
  const cy = makeCy({
    cyedgebendeditingWeights: [0.5],
    cyedgebendeditingDistances: [-40],
  });
  const edge = edgeOf(cy);
  edge.addClass(BEND_CLASS);
  edge.removeClass(BEND_CLASS);

  restoreBendClasses(cy);

  assert.ok(edge.hasClass(BEND_CLASS));
  assert.equal(edgeBendPoints(edge).length, 1);
});

test("restoreBendClasses clears stale absolute bend positions", () => {
  const cy = makeCy({
    cyedgebendeditingWeights: [0.5],
    cyedgebendeditingDistances: [-40],
    // Left over from an earlier node position — never a source of truth.
    bendPointPositions: [{ x: 200, y: -40 }],
  });

  restoreBendClasses(cy);

  assert.equal(edgeOf(cy).data("bendPointPositions"), undefined);
});
