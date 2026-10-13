import test from "node:test";
import assert from "node:assert/strict";

import { sanitizeCanvasArea } from "./networkCanvasArea.js";

test("sanitizeCanvasArea keeps a valid area and drops anything else", () => {
  assert.deepEqual(
    sanitizeCanvasArea({ width: "100", height: 70, unit: "m", resolution: 50, origin: { x: -40, y: "80" }, extra: 1 }),
    { width: 100, height: 70, unit: "m", resolution: 50, origin: { x: -40, y: 80 } }
  );
  assert.equal(sanitizeCanvasArea({ width: 100, height: -1, resolution: 1 }), null);
  assert.equal(sanitizeCanvasArea("big"), null);
  assert.equal(sanitizeCanvasArea({ width: 1, height: 1, resolution: 1, unit: "ft" }).unit, "km");
});
