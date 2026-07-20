import { test } from "node:test";
import assert from "node:assert/strict";
import { buildDemandRows, filterDemandByStatus, computeDemandTotals, demandRowsToCsv } from "./demandRows.js";

const inputs = [
  { plant_id: "G1", date: "2026-03-01", required_m3: 60000, data_source: "SCADA", comments: "", submission_status: "approved", submitted_by: "u1", approved_by: "u2" },
  { plant_id: "G1", date: "2026-03-03", required_m3: 80000, data_source: "Manual", comments: "peak", submission_status: "approved", submitted_by: "u1", approved_by: "u2" },
  { plant_id: "G2", date: "2026-03-02", required_m3: 5000, submission_status: "approved" },
  { plant_id: "G1", date: "2026-03-02", required_m3: null, submission_status: "approved" },
];

test("buildDemandRows: filters by plant, drops null required, sorts newest-first", () => {
  const rows = buildDemandRows(inputs, "G1", {});
  assert.deepEqual(rows.map((r) => r.date), ["2026-03-03", "2026-03-01"]);
  assert.equal(rows[0].requiredM3, 80000);
  assert.equal(rows[0].dataSource, "Manual");
});

test("buildDemandRows: date range is inclusive", () => {
  const rows = buildDemandRows(inputs, "G1", { startDate: new Date("2026-03-02"), endDate: new Date("2026-03-31") });
  assert.deepEqual(rows.map((r) => r.date), ["2026-03-03"]);
});

test("computeDemandTotals: total, avg, peak, days", () => {
  const totals = computeDemandTotals(buildDemandRows(inputs, "G1", {}));
  assert.equal(totals.days, 2);
  assert.equal(totals.totalM3, 140000);
  assert.equal(totals.peakM3, 80000);
  assert.equal(totals.avgDailyM3, 70000);
});

test("filterDemandByStatus: 'all' passes through", () => {
  const rows = buildDemandRows(inputs, "G1", {});
  assert.equal(filterDemandByStatus(rows, "all").length, 2);
  assert.equal(filterDemandByStatus(rows, "approved").length, 2);
});

test("demandRowsToCsv: header + resolved user names", () => {
  const rows = buildDemandRows(inputs, "G1", {});
  const csv = demandRowsToCsv(rows, (ref) => (ref === "u1" ? "Alice" : ref === "u2" ? "Bob" : ref));
  const lines = csv.split("\n");
  assert.equal(lines[0], "Date,Required (m³),Data Source,Comments,Status,Submitted By,Approved By");
  assert.match(lines[1], /2026-03-03,80000,Manual,peak,approved,Alice,Bob/);
});
