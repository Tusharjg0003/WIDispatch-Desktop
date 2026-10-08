import test from "node:test";
import assert from "node:assert/strict";

import { routeToLegs } from "./useDrawRoute.js";

test("routeToLegs: no points is one straight leg", () => {
  assert.deepEqual(routeToLegs([]), [{ from: "source", to: "target", bends: [] }]);
});

test("routeToLegs: junctions split legs, bends stay in their leg", () => {
  const legs = routeToLegs([
    { kind: "bend", x: 1, y: 1 },
    { kind: "junction", x: 2, y: 2 },
    { kind: "bend", x: 3, y: 3 },
    { kind: "bend", x: 4, y: 4 },
    { kind: "junction", x: 5, y: 5 },
  ]);
  assert.deepEqual(legs, [
    { from: "source", to: 0, bends: [{ x: 1, y: 1 }] },
    { from: 0, to: 1, bends: [{ x: 3, y: 3 }, { x: 4, y: 4 }] },
    { from: 1, to: "target", bends: [] },
  ]);
});
