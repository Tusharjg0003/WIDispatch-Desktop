import test from "node:test";
import assert from "node:assert/strict";

import { buildAssetRows, buildPipeRows, inServiceInYear, summariseByCategory, yearOptions } from "./canvasTable.js";

test("inServiceInYear: commissioning and decommissioning bound the year", () => {
  assert.equal(inServiceInYear("2020-01-01", null, 2019), false);
  assert.equal(inServiceInYear("2020-01-01", null, 2020), true);
  assert.equal(inServiceInYear("2020-01-01", "2025-06-01", 2025), false);
  assert.equal(inServiceInYear("2020-01-01", "2025-06-01", 2024), true);
  assert.equal(inServiceInYear(null, null, 2030), true);
  assert.equal(inServiceInYear("2020", null, null), true);
});

test("buildAssetRows skips annotations and reads capacity from any spec field", () => {
  const rows = buildAssetRows([
    { id: "a", type: "plant", label: "P", meta: { specifications: { design_capacity: "500" }, commissioning_date: "2021-03-01" } },
    { id: "n", type: "note", label: "x" },
    { id: "t", type: "tank", label: "T", status: "inactive", meta: { specifications: { total_capacity_m3: 90 } } },
  ], 2020);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].capacity, 500);
  assert.equal(rows[0].inService, false);
  assert.equal(rows[1].active, false);
});

test("buildPipeRows labels endpoints", () => {
  const [row] = buildPipeRows([{ id: "e", source: "a", target: "b", label: "Main", meta: { specifications: { capacity: 10, pipelineLength: 3 } } }], { a: "A", b: "B" });
  assert.deepEqual([row.from, row.to, row.capacity, row.length], ["A", "B", 10, 3]);
});

test("summariseByCategory counts only active in-service capacity", () => {
  const rows = buildAssetRows([
    { id: "1", type: "plant", label: "a", meta: { specifications: { capacity: 100 } } },
    { id: "2", type: "plant", label: "b", status: "inactive", meta: { specifications: { capacity: 50 } } },
    { id: "3", type: "node" },
  ]);
  const [plants] = summariseByCategory(rows);
  assert.deepEqual([plants.count, plants.inService, plants.capacity], [2, 1, 100]);
});

test("yearOptions collects lifecycle years plus the current one", () => {
  assert.deepEqual(yearOptions([{ commissioning: "2019-01-01", decommissioning: "2030-01-01" }], 2026), [2019, 2026, 2030]);
});
