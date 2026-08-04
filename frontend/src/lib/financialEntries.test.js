import { test } from "node:test";
import assert from "node:assert/strict";
import { currentFinancials, isEffectiveOn, changedLabels, financialEntriesToCsv } from "./financialEntries.js";

const entry = (over = {}) => ({
  status: "approved", effectiveFrom: "2026-01-01", effectiveTo: null,
  ccr: 100, fixedOm: 200, variableOm: 3, capex: 400, ...over,
});

test("currentFinancials: picks the newest effective entry", () => {
  const rows = [entry({ effectiveFrom: "2026-06-01", ccr: 999 }), entry()];
  assert.equal(currentFinancials(rows, "2026-08-01").ccr, 999);
  assert.equal(currentFinancials(rows, "2026-03-01").ccr, 100);
});

test("currentFinancials: counts entries of any submission status", () => {
  const rows = [entry({ effectiveFrom: "2026-06-01", ccr: 999, status: "submitted" }), entry()];
  assert.equal(currentFinancials(rows, "2026-08-01").ccr, 999);
  assert.equal(currentFinancials([entry({ status: "draft", ccr: 5 })], "2026-08-01").ccr, 5);
});

test("currentFinancials: a null field falls back to the previous entry", () => {
  const rows = [entry({ effectiveFrom: "2026-06-01", ccr: 999, capex: null }), entry()];
  const current = currentFinancials(rows, "2026-08-01");
  assert.equal(current.ccr, 999);
  assert.equal(current.capex, 400);
});

test("currentFinancials: no effective entry yields nulls", () => {
  const current = currentFinancials([entry({ effectiveFrom: "2027-01-01" })], "2026-08-01");
  assert.deepEqual(current, { effectiveFrom: null, ccr: null, fixedOm: null, variableOm: null, capex: null });
});

test("isEffectiveOn: respects a closed effective window", () => {
  const row = entry({ effectiveTo: "2026-05-31" });
  assert.equal(isEffectiveOn(row, "2026-05-31"), true);
  assert.equal(isEffectiveOn(row, "2026-06-01"), false);
});

test("financialEntriesToCsv: writes the table's columns with raw numbers", () => {
  const csv = financialEntriesToCsv([
    entry({ effectiveFrom: "2026-08-04", lifetime: 29, ccr: 6060060, changedFields: ["ccr", "fixed_om"], status: "submitted" }),
  ]);
  const [header, row] = csv.split("\n");
  assert.equal(header, "Effective From,Changed,CCR,Fixed O&M,Variable O&M,CAPEX,Lifetime (yrs),Status");
  assert.equal(row, "2026-08-04,CCR | Fixed O&M,6060060,200,3,400,29,submitted");
});

test("financialEntriesToCsv: an entry with no changed fields reads as Baseline", () => {
  const csv = financialEntriesToCsv([entry({ changedFields: [] })]);
  assert.match(csv.split("\n")[1], /^2026-01-01,Baseline,/);
});

test("financialEntriesToCsv: missing values export as empty cells", () => {
  const csv = financialEntriesToCsv([entry({ effectiveFrom: null, ccr: null, lifetime: null })]);
  assert.equal(csv.split("\n")[1], ",Baseline,,200,3,400,,approved");
});

test("changedLabels: maps stored field names to display labels", () => {
  assert.deepEqual(changedLabels(["ccr", "fixed_om", "variable_om", "capex"]), ["CCR", "Fixed O&M", "Variable O&M", "CAPEX"]);
});
