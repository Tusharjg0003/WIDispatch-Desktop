import { test } from "node:test";
import assert from "node:assert/strict";
import { maintenanceDurationHours, buildMaintenanceRows, filterMaintenanceByStatus, computeMaintenanceStats, maintenanceRowsToCsv } from "./maintenanceRecords.js";

const recs = [
  { plant_id: "P1", description: "Pump swap", start_datetime: "2026-03-02T00:00:00Z", end_datetime: "2026-03-02T06:00:00Z", expected_impact_m3: 1000, actual_impact_m3: 900, submission_status: "approved", submitted_by: "u1" },
  { plant_id: "P1", description: "Valve check", start_datetime: "2026-03-01T00:00:00Z", end_datetime: "2026-03-01T02:00:00Z", expected_impact_m3: 500, submission_status: "submitted", submitted_by: "u1" },
  { plant_id: "P2", description: "x", start_datetime: "2026-03-01T00:00:00Z", end_datetime: "2026-03-01T01:00:00Z", expected_impact_m3: 10, submission_status: "approved" },
];

test("maintenanceDurationHours: whole hours", () => {
  assert.equal(maintenanceDurationHours("2026-03-02T00:00:00Z", "2026-03-02T06:00:00Z"), 6);
  assert.equal(maintenanceDurationHours("bad", "worse"), 0);
});

test("buildMaintenanceRows: plant filter + newest-first", () => {
  const rows = buildMaintenanceRows(recs, "P1");
  assert.equal(rows.length, 2);
  assert.equal(rows[0].description, "Pump swap");
});

test("filterMaintenanceByStatus", () => {
  const rows = buildMaintenanceRows(recs, "P1");
  assert.equal(filterMaintenanceByStatus(rows, "approved").length, 1);
  assert.equal(filterMaintenanceByStatus(rows, "all").length, 2);
});

test("computeMaintenanceStats", () => {
  const s = computeMaintenanceStats(buildMaintenanceRows(recs, "P1"));
  assert.equal(s.total, 2);
  assert.equal(s.pending, 1);
  assert.equal(s.approved, 1);
  assert.equal(s.totalImpact, 1500);
});

test("maintenanceRowsToCsv: header + duration + user", () => {
  const csv = maintenanceRowsToCsv(buildMaintenanceRows(recs, "P1"), (r) => (r === "u1" ? "Alice" : "N/A"));
  assert.match(csv.split("\n")[0], /^Description,Start Date & Time,/);
  assert.match(csv, /Alice/);
  assert.match(csv, /Pump swap/);
});

test("maintenanceRowsToCsv: pump station columns match maintenance approval columns", () => {
  const csv = maintenanceRowsToCsv([
    {
      plant_id: "PS1",
      description: "Pump station check",
      start_datetime: "2026-03-02T00:00:00Z",
      end_datetime: "2026-03-02T06:00:00Z",
      expected_impact_m3: 1000,
      actual_impact_m3: 900,
      submission_status: "approved",
      approved_at: "2026-03-03T00:30:00Z",
      desktop_approval_status: "approved",
      desktop_approved_at: "2026-03-03T01:00:00Z",
      submitted_by: "u1",
    },
  ], (r) => (r === "u1" ? "Alice" : "N/A"));
  assert.equal(csv.split("\n")[0], "Description,Start Date & Time,End Date & Time,Duration (hours),Expected Loss (m³),Actual Impact (m³),Status,Responsible User,Submitted At,Website Approved At,Desktop Approval,Desktop Approved At");
  assert.match(csv, /approved/);
  assert.match(csv, /Alice/);
});
