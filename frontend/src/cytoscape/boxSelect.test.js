import test from "node:test";
import assert from "node:assert/strict";
import cytoscape from "cytoscape";

import { elementsInBox, normalizeBox, selectInBox } from "./boxSelect.js";

// a — b sit inside the box below; c is outside it.
const makeCy = () =>
  cytoscape({
    headless: true,
    layout: { name: "preset" },
    elements: [
      { group: "nodes", data: { id: "a" }, position: { x: 100, y: 100 } },
      { group: "nodes", data: { id: "b" }, position: { x: 200, y: 150 } },
      { group: "nodes", data: { id: "c" }, position: { x: 900, y: 900 } },
      { group: "edges", data: { id: "ab", source: "a", target: "b" } },
      { group: "edges", data: { id: "bc", source: "b", target: "c" } },
    ],
  });

const BOX = { x1: 50, y1: 50, x2: 300, y2: 300 };

test("normalizeBox orders the corners whichever way the drag went", () => {
  assert.deepEqual(normalizeBox({ x: 300, y: 300 }, { x: 50, y: 50 }), BOX);
  assert.deepEqual(normalizeBox({ x: 50, y: 300 }, { x: 300, y: 50 }), BOX);
});

test("a pipe is caught only when both of its ends are inside", () => {
  const { nodes, edges } = elementsInBox(makeCy(), BOX);
  assert.deepEqual(nodes.map((n) => n.id()).sort(), ["a", "b"]);
  assert.deepEqual(edges.map((e) => e.id()), ["ab"]);
});

test("nodes exactly on the boundary count as inside", () => {
  const cy = makeCy();
  cy.getElementById("a").position({ x: 50, y: 50 });
  const { nodes } = elementsInBox(cy, BOX);
  assert.ok(nodes.map((n) => n.id()).includes("a"));
});

test("selectInBox replaces the selection by default", () => {
  const cy = makeCy();
  cy.getElementById("c").select();

  const counts = selectInBox(cy, BOX);

  assert.deepEqual(counts, { nodes: 2, edges: 1 });
  assert.deepEqual(cy.$(":selected").map((el) => el.id()).sort(), ["a", "ab", "b"]);
});

test("selectInBox adds to the selection when the drag was additive", () => {
  const cy = makeCy();
  cy.getElementById("c").select();

  selectInBox(cy, BOX, { additive: true });

  assert.deepEqual(cy.$(":selected").map((el) => el.id()).sort(), ["a", "ab", "b", "c"]);
});

test("an empty box selects nothing and still clears", () => {
  const cy = makeCy();
  cy.getElementById("c").select();

  const counts = selectInBox(cy, { x1: -500, y1: -500, x2: -400, y2: -400 });

  assert.deepEqual(counts, { nodes: 0, edges: 0 });
  assert.equal(cy.$(":selected").length, 0);
});
