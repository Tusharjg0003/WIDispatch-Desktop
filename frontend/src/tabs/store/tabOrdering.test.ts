import test from "node:test";
import assert from "node:assert/strict";

import {
  clampReorder,
  neighbourAfterClose,
  permanentCount,
  pinnedCount,
  regionBounds,
} from "./tabOrdering.ts";
import type { TabLookup } from "./tabOrdering.ts";

/** Builds an order + lookup from a compact spec: "!" permanent, "*" pinned. */
const build = (spec: string[]): { order: string[]; tabs: TabLookup } => {
  const tabs: TabLookup = {};
  const order = spec.map((entry) => {
    const id = entry.replace(/[!*]/g, "");
    tabs[id] = { permanent: entry.includes("!"), pinned: entry.includes("*") };
    return id;
  });
  return { order, tabs };
};

test("counts the leading permanent region", () => {
  const { order, tabs } = build(["list!", "a*", "b"]);
  assert.equal(permanentCount(order, tabs), 1);
});

test("pinnedCount spans permanent and pinned, so it is the re-seat index", () => {
  const { order, tabs } = build(["list!", "a*", "b*", "c"]);
  assert.equal(pinnedCount(order, tabs), 3);
});

test("pinnedCount keeps its original meaning when nothing is permanent", () => {
  const { order, tabs } = build(["a*", "b", "c"]);
  assert.equal(pinnedCount(order, tabs), 1);
});

test("each tab is bounded by its own region", () => {
  const { order, tabs } = build(["list!", "a*", "b", "c"]);
  assert.deepEqual(regionBounds(order, tabs, "list"), [0, 0]);
  assert.deepEqual(regionBounds(order, tabs, "a"), [1, 1]);
  assert.deepEqual(regionBounds(order, tabs, "b"), [2, 3]);
});

test("an unpinned tab cannot be dragged ahead of a pinned or permanent one", () => {
  const { order, tabs } = build(["list!", "a*", "b", "c"]);
  // Drag c (index 3) to the very front.
  assert.equal(clampReorder(order, tabs, 3, 0), 2);
});

test("a permanent tab cannot be dragged out of first position", () => {
  const { order, tabs } = build(["list!", "a", "b"]);
  assert.equal(clampReorder(order, tabs, 0, 2), 0);
});

test("clampReorder rejects an out-of-range source", () => {
  const { order, tabs } = build(["a", "b"]);
  assert.equal(clampReorder(order, tabs, 5, 0), null);
});

test("closing picks the right neighbour, else the left", () => {
  const { order } = build(["a", "b", "c"]);
  assert.equal(neighbourAfterClose(order, "b"), "c");
  assert.equal(neighbourAfterClose(order, "c"), "b");
  assert.equal(neighbourAfterClose(order, "a"), "b");
});

test("closing the only tab leaves no successor", () => {
  const { order } = build(["only"]);
  assert.equal(neighbourAfterClose(order, "only"), null);
  assert.equal(neighbourAfterClose(order, "missing"), null);
});
