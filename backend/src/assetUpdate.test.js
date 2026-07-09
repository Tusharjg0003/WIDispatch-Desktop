import { test } from "node:test";
import assert from "node:assert/strict";
import { buildAssetUpdate } from "./assetRegistry.js";

test("buildAssetUpdate: keeps allowed top-level fields, ignores id/category", () => {
  const out = buildAssetUpdate({ name: "New Name", region: "Makkah", id: "X", category: "pump" });
  assert.equal(out.name, "New Name");
  assert.equal(out.region, "Makkah");
  assert.equal("id" in out, false);
  assert.equal("category" in out, false);
});

test("buildAssetUpdate: coerces coordinates, blank -> null", () => {
  assert.equal(buildAssetUpdate({ latitude: "24.5" }).latitude, 24.5);
  assert.equal(buildAssetUpdate({ longitude: "" }).longitude, null);
});

test("buildAssetUpdate: coerces numeric-by-name spec keys, keeps others as-is, drops blanks", () => {
  const out = buildAssetUpdate({
    specifications: { design_capacity: "1000", plant_kind: "RO", note: "" },
  });
  assert.deepEqual(out.specifications, { design_capacity: 1000, plant_kind: "RO" });
});

test("buildAssetUpdate: always stamps updated_at", () => {
  assert.equal(typeof buildAssetUpdate({}).updated_at, "string");
});
