import { test } from "node:test";
import assert from "node:assert/strict";
import { getContractedCapacityForDate, dayLoss } from "./productionCapacity.js";

const plant = { id: "P1", specifications: { contracted_capacity: 100000, design_capacity: 120000 } };

test("getContractedCapacityForDate: falls back to plant spec when no rows", () => {
  assert.equal(getContractedCapacityForDate(plant, "2026-03-01", undefined), 100000);
});

test("getContractedCapacityForDate: picks latest effective row on/before date", () => {
  const rows = [
    { value_m3: 90000, effective_from: "2026-02-01" },
    { value_m3: 80000, effective_from: "2026-01-01" },
  ];
  assert.equal(getContractedCapacityForDate(plant, "2026-02-15", rows), 90000);
  assert.equal(getContractedCapacityForDate(plant, "2026-01-15", rows), 80000);
});

test("dayLoss: full outage removes whole contracted capacity", () => {
  assert.equal(dayLoss({ outage_scope: "full" }, "2026-03-01", 100000), 100000);
});

test("dayLoss: uses daily_losses entry for the date", () => {
  const rec = { daily_losses: [{ date: "2026-03-01", loss_m3: 2500 }] };
  assert.equal(dayLoss(rec, "2026-03-01", 100000), 2500);
  assert.equal(dayLoss(rec, "2026-03-02", 100000), 0);
});

test("dayLoss: legacy record falls back to total loss field", () => {
  assert.equal(dayLoss({ expected_loss_m3: 1500 }, "2026-03-01", 100000), 1500);
});
