import test from "node:test";
import assert from "node:assert/strict";

import { applyKmzOverrides, buildKmzReviewRows } from "./kmzReview.js";

const points = [
  { name: "Riyadh Desal Plant", folder: "Plants", lat: 1, lng: 1 },
  { name: "North Plant", folder: "Plants", lat: 1, lng: 2 },
  { name: "J-12", folder: "Misc", lat: 2, lng: 2 },
  { name: "Thing", lat: 3, lng: 3 },
];

test("buildKmzReviewRows groups by folder with counts and a detected type", () => {
  const rows = buildKmzReviewRows(points);
  const plants = rows.find((r) => r.label === "Plants");
  assert.equal(plants.count, 2);
  assert.equal(plants.detectedType, "plant");
  assert.equal(plants.fromFolder, true);
  const none = rows.find((r) => !r.fromFolder);
  assert.equal(none.label, "No folder");
  assert.equal(none.count, 1);
});

test("applyKmzOverrides forces the type of every point in an overridden group", () => {
  const rows = buildKmzReviewRows(points).map((r) => (r.label === "Misc" ? { ...r, overrideType: "tank" } : r));
  const out = applyKmzOverrides(points, rows);
  assert.equal(out.find((p) => p.name === "J-12").forcedType, "tank");
  assert.equal(out.find((p) => p.name === "North Plant").forcedType, undefined);
  assert.equal(applyKmzOverrides(points, buildKmzReviewRows(points)), points);
});
