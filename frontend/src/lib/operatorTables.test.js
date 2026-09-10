import test from "node:test";
import assert from "node:assert/strict";
import { hiddenColumnsParam, parseHiddenColumns, recordsToCsv, toggleHiddenColumn } from "./operatorTables.js";

test("column preferences ignore unknown keys and retain configured order", () => {
  const allowed = ["name", "region", "status"];
  const hidden = parseHiddenColumns("status,unknown,region", allowed);
  assert.deepEqual([...hidden].sort(), ["region", "status"]);
  assert.equal(hiddenColumnsParam(hidden, allowed), "region,status");
});

test("column toggling never hides the final visible column", () => {
  const allowed = ["name", "status"];
  const oneVisible = new Set(["status"]);
  assert.deepEqual([...toggleHiddenColumn(oneVisible, "name", allowed)], ["status"]);
  assert.deepEqual([...toggleHiddenColumn(oneVisible, "status", allowed)], []);
});

test("recordsToCsv exports only requested columns and escapes formulas", () => {
  const rows = [{ name: "=Plant", region: "East, Coast" }];
  const csv = recordsToCsv(rows, [
    { label: "Plant", get: (row) => row.name },
    { label: "Region", get: (row) => row.region },
  ]);
  assert.equal(csv, "Plant,Region\n'=Plant,\"East, Coast\"");
});
