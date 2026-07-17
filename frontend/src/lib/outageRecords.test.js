import { test } from "node:test";
import assert from "node:assert/strict";
import { outageDurationHours, outageLossM3, buildOutageRows, computeOutageStats, outageRowsToCsv } from "./outageRecords.js";

const recs = [
  { plant_id: "P1", failure_type: "Electrical", outage_scope: "partial", description: "Breaker trip", start_datetime: "2026-03-02T00:00:00Z", end_datetime: "2026-03-02T04:00:00Z", actual_loss_m3: 1200, submitted_by: "u1" },
  { plant_id: "P1", outage_type: "Mechanical", outage_scope: "full", description: "Pump failure", start_datetime: "2026-03-01T00:00:00Z", duration_hours: 2, estimated_loss_m3: 800, is_emergency: true, submitted_by: "u1" },
  { plant_id: "P2", failure_type: "x", start_datetime: "2026-03-01T00:00:00Z", actual_loss_m3: 10 },
];

test("outageDurationHours: duration field or start/end", () => {
  assert.equal(outageDurationHours(recs[0]), 4);
  assert.equal(outageDurationHours(recs[1]), 2);
  assert.equal(outageDurationHours({ start_datetime: "bad", end_datetime: "worse" }), 0);
});

test("outageLossM3: actual, estimated, daily loss fallback", () => {
  assert.equal(outageLossM3(recs[0]), 1200);
  assert.equal(outageLossM3(recs[1]), 800);
  assert.equal(outageLossM3({ daily_losses: [{ loss_m3: 10 }, { loss_m3: "5" }] }), 15);
});

test("buildOutageRows: plant filter + newest-first", () => {
  const rows = buildOutageRows(recs, "P1");
  assert.equal(rows.length, 2);
  assert.equal(rows[0].description, "Breaker trip");
});

test("computeOutageStats", () => {
  const s = computeOutageStats(buildOutageRows(recs, "P1"));
  assert.equal(s.total, 2);
  assert.equal(s.totalLoss, 2000);
  assert.equal(s.emergency, 1);
  assert.equal(s.fullScope, 1);
});

test("outageRowsToCsv: header + user", () => {
  const csv = outageRowsToCsv(buildOutageRows(recs, "P1"), (r) => (r === "u1" ? "Alice" : "N/A"));
  assert.match(csv.split("\n")[0], /^outage_type,outage_scope,failure_type,description,/);
  assert.match(csv, /Alice/);
  assert.match(csv, /Breaker trip/);
});

test("outageRowsToCsv: keeps outage type, scope, and failure type separate", () => {
  const rows = buildOutageRows([
    { plant_id: "PS1", failure_type: "Complete Outage", outage_type: "Pump outage", description: "Station down", start_datetime: "2026-03-02T00:00:00Z", submitted_by: "u1" },
  ], "PS1");
  const csv = outageRowsToCsv(rows, (r) => (r === "u1" ? "Alice" : "N/A"));
  assert.match(csv.split("\n")[0], /^outage_type,outage_scope,failure_type,description,/);
  assert.match(csv, /Pump outage,full,Complete Outage,Station down/);
});
