import { test } from "node:test";
import assert from "node:assert/strict";
import { computeTrace } from "./trace.js";

// Minimal cy stand-in: computeTrace only calls getElementById(id).connectedEdges()
// and, on each edge, id() / source() / target() / data().
function fakeCy(edges) {
  const made = edges.map((e) => ({
    id: () => e.id,
    source: () => ({ id: () => e.source }),
    target: () => ({ id: () => e.target }),
    data: (key) => (key === "bidirectional" ? !!e.bidirectional : { bidirectional: !!e.bidirectional }),
  }));
  return {
    getElementById: (id) => ({
      connectedEdges: () => ({
        forEach: (fn) => made.filter((m) => m.source().id() === id || m.target().id() === id).forEach(fn),
      }),
    }),
  };
}

test("computeTrace: walks downstream along edge direction", () => {
  const cy = fakeCy([
    { id: "e1", source: "plant", target: "j1" },
    { id: "e2", source: "j1", target: "gate" },
  ]);
  const trace = computeTrace(cy, "plant");
  assert.deepEqual([...trace.down.nodes].sort(), ["gate", "j1"]);
  assert.equal(trace.up.nodes.size, 0);
});

test("computeTrace: a bidirectional pipe is walkable in both directions", () => {
  const cy = fakeCy([{ id: "e1", source: "a", target: "b", bidirectional: true }]);
  const trace = computeTrace(cy, "b");
  assert.ok(trace.down.nodes.has("a"), "bidirectional edge should extend downstream");
});

test("computeTrace: delivered mode skips edges with no flow", () => {
  const cy = fakeCy([
    { id: "e1", source: "plant", target: "j1" },
    { id: "e2", source: "j1", target: "gate" },
  ]);
  const trace = computeTrace(cy, "plant", { flowByEdge: { e1: 500, e2: 0 }, mode: "delivered" });
  assert.equal(trace.mode, "delivered");
  assert.ok(trace.down.nodes.has("j1"));
  assert.ok(!trace.down.nodes.has("gate"), "zero-flow edge must not be traversed");
});

test("computeTrace: delivered mode falls back to reachable when no flow is supplied", () => {
  const cy = fakeCy([{ id: "e1", source: "a", target: "b" }]);
  const trace = computeTrace(cy, "a", { flowByEdge: {}, mode: "delivered" });
  assert.equal(trace.requestedMode, "delivered");
  assert.equal(trace.mode, "reachable");
  assert.ok(trace.down.nodes.has("b"));
});
