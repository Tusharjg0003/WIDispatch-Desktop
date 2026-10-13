import test from "node:test";
import assert from "node:assert/strict";

import { sanitizeCanvasArea } from "./networkCanvasArea.js";

test("sanitizeCanvasArea keeps a valid area and drops anything else", () => {
  assert.deepEqual(
    sanitizeCanvasArea({ width: "2000", height: 1400, grid: 25, origin: { x: -40, y: "80" }, extra: 1 }),
    { width: 2000, height: 1400, grid: 25, origin: { x: -40, y: 80 } }
  );
  assert.equal(sanitizeCanvasArea({ width: 100, height: -1, grid: 40 }), null);
  assert.equal(sanitizeCanvasArea("big"), null);
  assert.equal(sanitizeCanvasArea({ width: 100, height: 100 }).grid, 40);
  assert.equal(sanitizeCanvasArea({ width: 100, height: 100, grid: 2 }).grid, 5);
});

test("sanitizeCanvasArea converts an older km/m area to pixels", () => {
  assert.deepEqual(
    sanitizeCanvasArea({ width: 100, height: 70, unit: "km", resolution: 1, origin: { x: 0, y: 0 } }),
    { width: 4000, height: 2800, grid: 40, origin: { x: 0, y: 0 } }
  );
  assert.equal(sanitizeCanvasArea({ width: 100, height: 70, unit: "m", resolution: 50 }).width, 80);
});
