import { test } from "node:test";
import assert from "node:assert/strict";
import { deriveDataStatus } from "./production.js";

test("deriveDataStatus: marks plant with data and latest date", () => {
  const map = new Map([["P1", "2026-03-05"]]);
  const out = deriveDataStatus({ id: "P1", name: "Alpha" }, map);
  assert.equal(out.hasData, true);
  assert.equal(out.latestDataDate, "2026-03-05");
  assert.equal(out.name, "Alpha");
});

test("deriveDataStatus: plant absent from map is pending", () => {
  const out = deriveDataStatus({ id: "P2" }, new Map());
  assert.equal(out.hasData, false);
  assert.equal(out.latestDataDate, null);
});

test("deriveDataStatus: plant present with null date is pending", () => {
  const out = deriveDataStatus({ id: "P3" }, new Map([["P3", null]]));
  assert.equal(out.hasData, false);
  assert.equal(out.latestDataDate, null);
});
