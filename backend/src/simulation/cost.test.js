import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_VARIABLE_OM, indexFinancialEntries, variableOmForDay } from "./cost.js";

const plant = { id: "P1", specifications: { variable_om: 2.75 } };
const day = "2026-08-10";

const entry = (over) => ({
  scope_type: "plant",
  scope_id: "P1",
  submission_status: "approved",
  variable_om: 1.5,
  effective_start: "2026-01-01",
  ...over,
});

test("variableOmForDay: an effective Economics entry wins over the plant spec", () => {
  const index = indexFinancialEntries([entry({})]);
  assert.deepEqual(variableOmForDay("P1", day, index, plant), { value: 1.5, source: "economics" });
});

test("variableOmForDay: entries outside their effective window are skipped", () => {
  const notYet = indexFinancialEntries([entry({ effective_start: "2026-09-01" })]);
  assert.deepEqual(variableOmForDay("P1", day, notYet, plant), { value: 2.75, source: "plant_spec" });

  const expired = indexFinancialEntries([entry({ effective_end: "2026-07-31" })]);
  assert.deepEqual(variableOmForDay("P1", day, expired, plant), { value: 2.75, source: "plant_spec" });
});

test("variableOmForDay: the newest applicable entry wins", () => {
  const index = indexFinancialEntries([
    entry({ effective_start: "2026-01-01", variable_om: 1.5 }),
    entry({ effective_start: "2026-08-01", variable_om: 1.9 }),
  ]);
  assert.equal(variableOmForDay("P1", day, index, plant).value, 1.9);
});

test("indexFinancialEntries: unapproved and non-plant-scoped rows are ignored", () => {
  const index = indexFinancialEntries([
    entry({ submission_status: "submitted", variable_om: 0.1 }),
    entry({ scope_type: "system", variable_om: 0.2 }),
    entry({ scope_id: undefined, variable_om: 0.3 }),
  ]);
  assert.deepEqual(variableOmForDay("P1", day, index, plant), { value: 2.75, source: "plant_spec" });
});

test("variableOmForDay: falls back to the default so a run is never blocked", () => {
  const index = indexFinancialEntries([]);
  assert.deepEqual(variableOmForDay("P1", day, index, { specifications: {} }), {
    value: DEFAULT_VARIABLE_OM,
    source: "default",
  });
});
