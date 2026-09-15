import test from "node:test";
import assert from "node:assert/strict";

import { classifyKmzPoint, normalizeTypeKey } from "./kmzEntityClassifier.js";

test("normalizeTypeKey folds SWIIMS/legacy spellings onto WIDispatch keys", () => {
  assert.equal(normalizeTypeKey("point"), "handover_point");
  assert.equal(normalizeTypeKey("filling-station"), "filling_station");
  assert.equal(normalizeTypeKey("pump-station"), "pump");
  assert.equal(normalizeTypeKey("Plant"), "plant");
});

test("a round-tripped export classifies by its own assetType", () => {
  assert.deepEqual(classifyKmzPoint({ assetType: "handover_point", name: "x" }), {
    type: "handover_point",
    source: "assetType",
  });
  // A SWIIMS-spelled export still resolves.
  assert.equal(classifyKmzPoint({ assetType: "point" }).type, "handover_point");
});

test("generic KMZ falls back through folder → name → default", () => {
  assert.equal(classifyKmzPoint({ folder: "Desalination Plants" }).type, "plant");
  assert.equal(classifyKmzPoint({ name: "Jeddah Pumping Station 3" }).type, "pump");
  assert.equal(classifyKmzPoint({ name: "City Gate 12" }).type, "handover_point");
  assert.equal(classifyKmzPoint({ name: "STP North" }).type, "stp");
  assert.equal(classifyKmzPoint({ name: "Nowhere" }).type, "node");
});

test("stp wins over plant when both keywords are present", () => {
  assert.equal(classifyKmzPoint({ name: "Sewage Treatment Plant" }).type, "stp");
});
