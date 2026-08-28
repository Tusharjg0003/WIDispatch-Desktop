import test from "node:test";
import assert from "node:assert/strict";
import cytoscape from "cytoscape";

import {
  ASSET_CATEGORIES,
  canvasAssets,
  capacityByYear,
  horizonYears,
  isActiveInYear,
  largestByCapacity,
  nameOf,
  FILTER_HIDDEN_CLASS,
  applyCategoryFilter,
  capacityOf,
  categoryKeyOf,
  formatCapacity,
  summarizeCategories,
} from "./assetFilter.js";

const node = (id, type, spec) => ({
  group: "nodes",
  data: { id, type, category: type, meta: { specifications: spec || {} } },
  position: { x: 0, y: 0 },
});

const makeCy = () =>
  cytoscape({
    headless: true,
    layout: { name: "preset" },
    elements: [
      node("p1", "plant", { design_capacity: 40000 }),
      node("p2", "plant", { contracted_capacity: 60000 }),
      node("t1", "tank", { total_capacity_m3: 5000 }),
      node("g1", "handover_point", { contracted_capacity: 12000 }),
      node("j1", "node"),
      { group: "nodes", data: { id: "note1", type: "note" }, position: { x: 0, y: 0 } },
      { group: "edges", data: { id: "pp", source: "p1", target: "t1", capacity: 30000 } },
      { group: "edges", data: { id: "tg", source: "t1", target: "g1", capacity: 20000 } },
      { group: "edges", data: { id: "gj", source: "g1", target: "j1" } },
    ],
  });

const hidden = (cy) => cy.elements(`.${FILTER_HIDDEN_CLASS}`).map((el) => el.id()).sort();

test("categoryKeyOf: edges are pipelines, annotations are exempt", () => {
  const cy = makeCy();
  assert.equal(categoryKeyOf(cy.getElementById("p1")), "plant");
  assert.equal(categoryKeyOf(cy.getElementById("j1")), "node");
  assert.equal(categoryKeyOf(cy.getElementById("pp")), "pipeline");
  assert.equal(categoryKeyOf(cy.getElementById("note1")), null);
  assert.equal(categoryKeyOf(null), null);
});

test("capacityOf reads whichever field the element carries, contracted first", () => {
  const cy = makeCy();
  const dataOf = (id) => cy.getElementById(id).data();
  assert.equal(capacityOf(dataOf("p1")), 40000);
  assert.equal(capacityOf(dataOf("p2")), 60000);
  assert.equal(capacityOf(dataOf("t1")), 5000);
  assert.equal(capacityOf(dataOf("pp")), 30000);
  assert.equal(capacityOf(dataOf("j1")), 0);
  assert.equal(capacityOf({ contractedCapacity: 10, capacity: 20, designCapacity: 30 }), 10);
  assert.equal(capacityOf({ designCapacity: 30, maximumCapacity: 40 }), 30);
  assert.equal(capacityOf(), 0);
});

test("summarizeCategories counts what is on the canvas, ignoring annotations", () => {
  const summary = summarizeCategories(canvasAssets(makeCy()));
  assert.deepEqual(summary.plant, { count: 2, capacity: 100000 });
  assert.deepEqual(summary.tank, { count: 1, capacity: 5000 });
  assert.deepEqual(summary.pipeline, { count: 3, capacity: 50000 });
  assert.deepEqual(summary.node, { count: 1, capacity: 0 });
  assert.equal(summary.note, undefined);
  assert.equal(summary.stp, undefined);
});

test("hiding a category hides its nodes and the pipes attached to them", () => {
  const cy = makeCy();
  applyCategoryFilter(cy, new Set(["plant"]));
  // pp runs from the hidden plant, so it goes too; tg and gj stay.
  assert.deepEqual(hidden(cy), ["p1", "p2", "pp"]);
});

test("hiding pipelines leaves the assets in place", () => {
  const cy = makeCy();
  applyCategoryFilter(cy, new Set(["pipeline"]));
  assert.deepEqual(hidden(cy), ["gj", "pp", "tg"]);
});

test("annotations are never hidden", () => {
  const cy = makeCy();
  applyCategoryFilter(cy, new Set(ASSET_CATEGORIES.map((c) => c.key)));
  assert.ok(!hidden(cy).includes("note1"));
});

test("clearing the filter restores everything", () => {
  const cy = makeCy();
  applyCategoryFilter(cy, new Set(["plant", "pipeline"]));
  applyCategoryFilter(cy, new Set());
  assert.deepEqual(hidden(cy), []);
});

test("applyCategoryFilter accepts a plain array and a missing graph", () => {
  const cy = makeCy();
  applyCategoryFilter(cy, ["tank"]);
  assert.deepEqual(hidden(cy), ["pp", "t1", "tg"]);
  assert.doesNotThrow(() => applyCategoryFilter(null, ["tank"]));
});

test("formatCapacity keeps the sidebar column narrow", () => {
  assert.equal(formatCapacity(900), "900");
  assert.equal(formatCapacity(1500), "1.5k");
  assert.equal(formatCapacity(44000), "44k");
  assert.equal(formatCapacity(1_200_000), "1.2M");
  assert.equal(formatCapacity(12_000_000), "12M");
  assert.equal(formatCapacity(0), "—");
  assert.equal(formatCapacity(undefined), "—");
});

test("canvasAssets turns the graph into plain records", () => {
  const assets = canvasAssets(makeCy());

  assert.equal(assets.length, 8); // 5 assets + 3 pipes, note excluded
  const plant = assets.find((a) => a.id === "p1");
  assert.equal(plant.category, "plant");
  assert.equal(plant.isEdge, false);
  assert.equal(plant.data.meta.specifications.design_capacity, 40000);
  assert.equal(assets.find((a) => a.id === "pp").isEdge, true);
  assert.deepEqual(canvasAssets(null), []);
});

test("nameOf prefers a label, then a name, then the id", () => {
  assert.equal(nameOf({ label: "Plant A", name: "other" }), "Plant A");
  assert.equal(nameOf({ name: "Plant B" }), "Plant B");
  assert.equal(nameOf({}, "n1"), "n1");
});

test("horizonYears is inclusive, ordered and capped", () => {
  assert.deepEqual(horizonYears(2026, 2029), [2026, 2027, 2028, 2029]);
  assert.deepEqual(horizonYears(2026, 2026), [2026]);
  assert.deepEqual(horizonYears(2030, 2026), []);
  assert.deepEqual(horizonYears("", 2030), []);
  assert.equal(horizonYears(2000, 9999).length, 201);
});

test("isActiveInYear respects commissioning and decommissioning dates", () => {
  const asset = { meta: { commissioning_date: "2028-06-01", decommissioning_date: "2032-01-01" } };
  assert.equal(isActiveInYear(asset, 2027), false);
  assert.equal(isActiveInYear(asset, 2028), true);
  assert.equal(isActiveInYear(asset, 2032), true);
  assert.equal(isActiveInYear(asset, 2033), false);
  // Pipes carry the same dates in camelCase.
  assert.equal(isActiveInYear({ commissioningDate: "2030-01-01" }, 2029), false);
  // No dates on record reads as already in service.
  assert.equal(isActiveInYear({}, 2026), true);
});

test("capacityByYear stacks in-service capacity per category", () => {
  const assets = [
    { category: "plant", data: { capacity: 100, meta: { commissioning_date: "2028-01-01" } } },
    { category: "plant", data: { capacity: 50 } },
    { category: "tank", data: { capacity: 20, meta: { decommissioning_date: "2027-01-01" } } },
  ];

  const rows = capacityByYear(assets, horizonYears(2026, 2028));

  assert.deepEqual(rows, [
    { year: "2026", plant: 50, tank: 20 },
    { year: "2027", plant: 50, tank: 20 },
    { year: "2028", plant: 150 },
  ]);
});

test("largestByCapacity ranks visible assets and skips the ones with none", () => {
  const assets = canvasAssets(makeCy());

  const top = largestByCapacity(assets, { limit: 3 });
  assert.deepEqual(top.map((a) => a.id), ["p2", "p1", "pp"]);

  // A hidden category drops out of the ranking with the rest of its row.
  const withoutPlants = largestByCapacity(assets, { hidden: new Set(["plant"]), limit: 3 });
  assert.deepEqual(withoutPlants.map((a) => a.id), ["pp", "tg", "g1"]);

  // Junctions have no capacity, so they never appear.
  assert.ok(!largestByCapacity(assets, { limit: 20 }).some((a) => a.id === "j1"));
});
