import { test } from "node:test";
import assert from "node:assert/strict";
import { deriveFilterOptions, applyAssetFilters, computeCategoryKpis } from "./assetFilters.js";

const SAMPLE = [
  { category: "plant", id: "P1", name: "Alpha Plant", activity: "Water production", asset_type: "Seawater desalination", region: "Riyadh", governorate: "Riyadh City", status: "operational" },
  { category: "plant", id: "P2", name: "Beta Plant", activity: "Water production", asset_type: "Water Purification", region: "Makkah", governorate: "Jeddah", status: "planned" },
  { category: "pump", id: "PS1", name: "Pump One", activity: "Water transmission", asset_type: "Transmission pipeline", region: "Riyadh", governorate: "NULL", status: "operational" },
  { category: "handover_point", id: "H1", name: "Gate One", activity: "Water distribution", asset_type: "Handover point / city gate", region: "Riyadh", governorate: "Diriyah", status: "under_construction" },
];

test("deriveFilterOptions: activities are distinct and sorted", () => {
  const { activities } = deriveFilterOptions(SAMPLE, {});
  assert.deepEqual(activities, ["Water distribution", "Water production", "Water transmission"]);
});

test("deriveFilterOptions: assetTypes narrow to selected activity", () => {
  const { assetTypes } = deriveFilterOptions(SAMPLE, { activity: "Water production" });
  assert.deepEqual(assetTypes, ["Seawater desalination", "Water Purification"]);
});

test("deriveFilterOptions: regions narrow to activity + assetType", () => {
  const { regions } = deriveFilterOptions(SAMPLE, { activity: "Water production", assetType: "Water Purification" });
  assert.deepEqual(regions, ["Makkah"]);
});

test("deriveFilterOptions: governorates empty until region chosen, excludes NULL", () => {
  assert.deepEqual(deriveFilterOptions(SAMPLE, {}).governorates, []);
  const withRegion = deriveFilterOptions(SAMPLE, { region: "Riyadh" }).governorates;
  assert.deepEqual(withRegion, ["Diriyah", "Riyadh City"]);
});

test("applyAssetFilters: activity exact match", () => {
  const out = applyAssetFilters(SAMPLE, { activity: "Water production" });
  assert.deepEqual(out.map(a => a.id), ["P1", "P2"]);
});

test("applyAssetFilters: search matches name, id, or region case-insensitively", () => {
  assert.deepEqual(applyAssetFilters(SAMPLE, { q: "beta" }).map(a => a.id), ["P2"]);
  assert.deepEqual(applyAssetFilters(SAMPLE, { q: "ps1" }).map(a => a.id), ["PS1"]);
  assert.deepEqual(applyAssetFilters(SAMPLE, { q: "makkah" }).map(a => a.id), ["P2"]);
});

test("applyAssetFilters: governorate substring match", () => {
  assert.deepEqual(applyAssetFilters(SAMPLE, { governorate: "jed" }).map(a => a.id), ["P2"]);
});

test("computeCategoryKpis: per-category counts, status breakdown, and totals", () => {
  const k = computeCategoryKpis(SAMPLE);
  assert.deepEqual(k.byCategory, { plant: 2, pump: 1, handover_point: 1 });
  assert.equal(k.total, 4);
  assert.deepEqual(k.statusByCategory.plant, { operational: 1, planned: 1 });
  assert.deepEqual(k.totalStatus, { operational: 2, planned: 1, under_construction: 1 });
});
