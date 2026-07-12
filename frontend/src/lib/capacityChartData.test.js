import { test } from "node:test";
import assert from "node:assert/strict";
import { format } from "date-fns";
import { buildCapacityChartData } from "./capacityChartData.js";

test("buildCapacityChartData: spans 61 days centered on today", () => {
  const data = buildCapacityChartData({
    plantId: "P1", productionInputs: [], qualityRecords: [], outages: [], maintenanceRecords: [],
    contractedCapacity: 100000,
  });
  assert.equal(data.length, 61);
});

test("buildCapacityChartData: today's delivered comes from a matching input", () => {
  const today = format(new Date(), "yyyy-MM-dd");
  const data = buildCapacityChartData({
    plantId: "P1",
    productionInputs: [{ plant_id: "P1", date: today, actual_m3: 88000, required_m3: 90000, submission_status: "approved" }],
    qualityRecords: [], outages: [], maintenanceRecords: [], contractedCapacity: 100000,
  });
  const row = data.find((d) => d.isoDate === today);
  assert.equal(row.actual, 88000);
  assert.equal(row.required, 90000);
  assert.equal(row.effectiveCapacity, 100000);
});

test("buildCapacityChartData: out-of-spec quality sets a marker", () => {
  const today = format(new Date(), "yyyy-MM-dd");
  const data = buildCapacityChartData({
    plantId: "P1",
    productionInputs: [{ plant_id: "P1", date: today, actual_m3: 88000, submission_status: "approved" }],
    qualityRecords: [{ plant_id: "P1", compliance_flag: "out_of_spec", sampling_datetime: `${today}T08:00:00Z` }],
    outages: [], maintenanceRecords: [], contractedCapacity: 100000,
  });
  const row = data.find((d) => d.isoDate === today);
  assert.equal(row.qualityMarker, 88000);
});
