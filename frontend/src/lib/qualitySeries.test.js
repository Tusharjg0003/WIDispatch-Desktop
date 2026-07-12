import { test } from "node:test";
import assert from "node:assert/strict";
import { buildQualitySeries, outOfRange, QUALITY_PARAMS } from "./qualitySeries.js";

test("QUALITY_PARAMS: has the 7 expected keys", () => {
  assert.deepEqual(QUALITY_PARAMS.map((p) => p.key),
    ["ph", "alkalinity", "turbidity", "temperature", "residual_chlorine", "conductivity", "tds"]);
});

test("buildQualitySeries: filters by plant and sorts by time", () => {
  const recs = [
    { plant_id: "P1", sampling_datetime: "2026-03-02T08:00:00Z", ph: 7.1 },
    { plant_id: "P1", sampling_datetime: "2026-03-01T08:00:00Z", ph: 7.0 },
    { plant_id: "P2", sampling_datetime: "2026-03-01T08:00:00Z", ph: 9.9 },
  ];
  const series = buildQualitySeries(recs, "P1");
  assert.equal(series.length, 2);
  assert.deepEqual(series.map((s) => s.ph), [7.0, 7.1]);
});

test("outOfRange: respects min and max", () => {
  assert.equal(outOfRange(5, { min: 6, max: 8 }), true);
  assert.equal(outOfRange(9, { min: 6, max: 8 }), true);
  assert.equal(outOfRange(7, { min: 6, max: 8 }), false);
  assert.equal(outOfRange(null, { min: 6, max: 8 }), false);
});
