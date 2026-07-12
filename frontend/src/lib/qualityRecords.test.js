import { test } from "node:test";
import assert from "node:assert/strict";
import { buildQualityRows, filterQualityByCompliance, computeQualityStats, qualityRowsToCsv } from "./qualityRecords.js";

const recs = [
  { plant_id: "P1", sampling_datetime: "2026-03-02T08:00:00Z", ph: 7.1, compliance_flag: "within_spec", submitted_by: "u1" },
  { plant_id: "P1", sampling_datetime: "2026-03-01T08:00:00Z", ph: 9.9, compliance_flag: "out_of_spec", submitted_by: "u1" },
  { plant_id: "P2", sampling_datetime: "2026-03-01T08:00:00Z", ph: 7.0, compliance_flag: "within_spec" },
];

test("buildQualityRows: filters by plant and sorts newest-first", () => {
  const rows = buildQualityRows(recs, "P1");
  assert.equal(rows.length, 2);
  assert.equal(rows[0].sampling_datetime, "2026-03-02T08:00:00Z");
});

test("buildQualityRows: applies date window", () => {
  const rows = buildQualityRows(recs, "P1", { startDate: new Date("2026-03-02T00:00:00Z") });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].ph, 7.1);
});

test("filterQualityByCompliance: filters flag", () => {
  const rows = buildQualityRows(recs, "P1");
  assert.equal(filterQualityByCompliance(rows, "out_of_spec").length, 1);
  assert.equal(filterQualityByCompliance(rows, "all").length, 2);
});

test("computeQualityStats: totals + rate", () => {
  const s = computeQualityStats(buildQualityRows(recs, "P1"));
  assert.equal(s.total, 2);
  assert.equal(s.within, 1);
  assert.equal(s.out, 1);
  assert.equal(Math.round(s.complianceRate), 50);
});

test("qualityRowsToCsv: header + resolved user + compliance label", () => {
  const csv = qualityRowsToCsv(buildQualityRows(recs, "P1"), (r) => (r === "u1" ? "Alice" : "N/A"));
  const lines = csv.split("\n");
  assert.match(lines[0], /^Date & Time,PH,/);
  assert.match(csv, /Alice/);
  assert.match(csv, /Out of Spec/);
});
