import test from "node:test";
import assert from "node:assert/strict";

import {
  aggregateTraceMembership,
  toggleTraceRoot,
  traceDirectionForType,
  traceEndpointSections,
} from "./multiTrace.js";

const set = (...ids) => new Set(ids);

test("traceDirectionForType: delivery up, plants down, tanks both", () => {
  assert.equal(traceDirectionForType("handover_point"), "upstream");
  assert.equal(traceDirectionForType("filling_station"), "upstream");
  assert.equal(traceDirectionForType("plant"), "downstream");
  assert.equal(traceDirectionForType("tank"), "both");
  assert.equal(traceDirectionForType("node"), "both");
});

test("toggleTraceRoot adds and removes", () => {
  assert.deepEqual(toggleTraceRoot([], "a"), ["a"]);
  assert.deepEqual(toggleTraceRoot(["a", "b"], "a"), ["b"]);
});

test("aggregateTraceMembership: shared when reached by two roots", () => {
  const traces = [
    { rootId: "hp1", direction: "upstream", up: { nodes: set("j", "p"), edges: set("e1", "e2") }, down: { nodes: set("x"), edges: set("ex") } },
    { rootId: "hp2", direction: "upstream", up: { nodes: set("j2", "p"), edges: set("e3", "e2") }, down: { nodes: set(), edges: set() } },
  ];
  const m = aggregateTraceMembership(traces);
  assert.deepEqual([...m.rootIds], ["hp1", "hp2"]);
  assert.ok(m.sharedNodeIds.has("p"));
  assert.ok(m.upNodeIds.has("j"));
  assert.ok(m.upNodeIds.has("j2"));
  assert.ok(m.sharedEdgeIds.has("e2"));
  // Downstream of an upstream-only root is ignored.
  assert.ok(!m.downNodeIds.has("x"));
});

test("aggregateTraceMembership: tank reaching a node both ways marks it shared, roots excluded", () => {
  const m = aggregateTraceMembership([
    { rootId: "t", direction: "both", up: { nodes: set("a", "t2"), edges: set() }, down: { nodes: set("a", "b"), edges: set() } },
    { rootId: "t2", direction: "both", up: { nodes: set(), edges: set() }, down: { nodes: set("t"), edges: set() } },
  ]);
  assert.ok(m.sharedNodeIds.has("a"));
  assert.ok(m.downNodeIds.has("b"));
  assert.ok(!m.sharedNodeIds.has("t") && !m.upNodeIds.has("t2"));
});

test("traceEndpointSections per root type", () => {
  assert.equal(traceEndpointSections({ rootType: "plant" })[0].key, "destinations");
  assert.equal(traceEndpointSections({ rootType: "handover_point" })[0].key, "sources");
  assert.equal(traceEndpointSections({ rootType: "tank" }).length, 2);
});
