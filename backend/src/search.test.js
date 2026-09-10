import test from "node:test";
import assert from "node:assert/strict";
import { filterSearchResults } from "./search.js";

const items = [
  { type: "module", id: "production", title: "Production", subtitle: "Plants", path: "/production" },
  { type: "asset", id: "p-1", title: "North Plant", subtitle: "Riyadh", status: "operational", path: "/asset-registry/view/p-1" },
  { type: "network", id: "n-1", title: "North Network", subtitle: "4 nodes", path: "/network-builder/n-1" },
];

test("filterSearchResults ranks title prefixes and respects type filters", () => {
  assert.deepEqual(filterSearchResults(items, "north", { types: ["network"] }).map((row) => row.id), ["n-1"]);
  assert.deepEqual(filterSearchResults(items, "prod").map((row) => row.id), ["production"]);
});

test("filterSearchResults clamps the result limit", () => {
  assert.equal(filterSearchResults(items, "", { limit: 1 }).length, 1);
});

