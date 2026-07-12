import { test } from "node:test";
import assert from "node:assert/strict";
import { buildProductionRows, filterRows, computeTotals } from "./productionRows.js";

const plant = { id: "P1", specifications: { contracted_capacity: 100000 } };

test("buildProductionRows: one day, delivered value from matching input", () => {
  const rows = buildProductionRows({
    plant, plantId: "P1",
    productionInputs: [{ plant_id: "P1", date: "2026-03-01", actual_m3: 90000, required_m3: 95000, submission_status: "approved", created_at: "2026-03-01T00:00:00Z" }],
    maintenanceRecords: [], outages: [], contractedCapacities: [],
    startDate: new Date("2026-03-01T00:00:00"), endDate: new Date("2026-03-01T00:00:00"),
  });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].contracted, 100000);
  assert.equal(rows[0].delivered, 90000);
  assert.equal(rows[0].requested, 95000);
  assert.equal(rows[0].available, 100000);
  assert.equal(rows[0].deliveredStatus, "approved");
});

test("buildProductionRows: most recent day first", () => {
  const rows = buildProductionRows({
    plant, plantId: "P1", productionInputs: [], maintenanceRecords: [], outages: [], contractedCapacities: [],
    startDate: new Date("2026-03-01T00:00:00"), endDate: new Date("2026-03-03T00:00:00"),
  });
  assert.deepEqual(rows.map((r) => r.iso), ["2026-03-03", "2026-03-02", "2026-03-01"]);
});

test("computeTotals: sums and availability percent", () => {
  const rows = [
    { contracted: 100000, available: 80000, delivered: 70000, maintenanceLoss: 10000, outageLoss: 10000 },
    { contracted: 100000, available: 100000, delivered: 90000, maintenanceLoss: 0, outageLoss: 0 },
  ];
  const t = computeTotals(rows);
  assert.equal(t.contracted, 200000);
  assert.equal(t.available, 180000);
  assert.equal(t.delivered, 160000);
  assert.equal(t.loss, 20000);
  assert.equal(Math.round(t.availabilityPct), 90);
});

test("filterRows: delivered status filter", () => {
  const rows = [{ deliveredStatus: "approved", requestedStatus: "allocated" }, { deliveredStatus: null, requestedStatus: "pending" }];
  assert.equal(filterRows(rows, { deliveredStatus: "approved", requestedStatus: "all" }).length, 1);
  assert.equal(filterRows(rows, { deliveredStatus: "all", requestedStatus: "pending" }).length, 1);
});
