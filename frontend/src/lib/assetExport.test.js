import test from "node:test";
import assert from "node:assert/strict";

import {
  ASSET_COLUMNS,
  COLUMN_PRESETS,
  assetRows,
  assetsCsv,
  assetValues,
  columnsForCategories,
  describeFilters,
  displayValue,
  filterAssets,
  filterOptions,
  groupByCategory,
  orderColumns,
  pdfColumnWidths,
  pdfPageFor,
  sortAssets,
} from "./assetExport.js";

const ASSETS = [
  {
    id: "p1", name: "Zulfi Plant", category: "plant", status: "operational", region: "Riyadh", entity: "NWC",
    asset_type: "Seawater desalination", commissioning_date: "2005-08-04", latitude: 24.5, longitude: 46.7,
    specifications: { design_capacity: 48000, technology: "RO", maintenance_schedules: [{}, {}], daily_capacities: [{}] },
  },
  {
    id: "g1", name: "Abha Gate", category: "handover_point", status: "planned", region: "Asir", entity: "Marafiq",
    asset_type: "Handover point/city gate", governorate: "NULL",
    specifications: { design_capacity: 9000, transmission_system_name: "South" },
  },
  {
    id: "s1", name: "Alpha Pumps", category: "pump", status: "maintenance", region: "Riyadh", entity: "NWC",
    asset_type: "Pumping station",
    specifications: {
      design_capacity: 99999, // stale station figure: the pumps win
      pumps: [
        { id: "p1", role: "functional", active: true, capacity_m3_day: 5000 },
        { id: "p2", role: "functional", active: true, capacity_m3_day: 7000 },
        { id: "p3", role: "functional", active: false, capacity_m3_day: 7000 },
        { id: "p4", role: "backup", active: true, capacity_m3_day: 7000 },
      ],
    },
  },
  {
    id: "t1", name: "Big Tank", category: "tank", status: "operational", region: "Makkah", entity: "NWC",
    asset_type: "Storage tank", specifications: { total_capacity_m3: 50000, number_tanks: 2 },
  },
];

test("column ids are unique and every preset names real columns", () => {
  const ids = ASSET_COLUMNS.map((c) => c.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const [name, preset] of Object.entries(COLUMN_PRESETS)) {
    assert.equal(orderColumns(preset).length, preset.length, name);
  }
});

test("filterAssets combines filters; an empty filter means any", () => {
  assert.equal(filterAssets(ASSETS, {}).length, 4);
  assert.deepEqual(filterAssets(ASSETS, { regions: ["Riyadh"] }).map((a) => a.id), ["p1", "s1"]);
  assert.deepEqual(filterAssets(ASSETS, { regions: ["Riyadh"], statuses: ["operational"] }).map((a) => a.id), ["p1"]);
  assert.deepEqual(filterAssets(ASSETS, { categories: ["tank", "handover_point"] }).map((a) => a.id), ["g1", "t1"]);
  assert.deepEqual(filterAssets(ASSETS, { query: "marafiq" }).map((a) => a.id), ["g1"]);
  assert.deepEqual(filterAssets(ASSETS, { entities: ["NWC"], query: "tank" }).map((a) => a.id), ["t1"]);
});

test("filterOptions lists the values present, categories in registry order", () => {
  const o = filterOptions(ASSETS);
  assert.deepEqual(o.categories, ["plant", "handover_point", "pump", "tank"]);
  assert.deepEqual(o.regions, ["Asir", "Makkah", "Riyadh"]);
  assert.deepEqual(o.entities, ["Marafiq", "NWC"]);
});

test("details only fill in for the categories that have them", () => {
  // Columns come out in their defined order, whatever order they were picked in.
  const cols = orderColumns(["pumps_total", "maintenance_count", "id", "tank_capacity", "governorate", "design_capacity"]);
  assert.deepEqual(cols.map((c) => c.id), ["id", "governorate", "design_capacity", "tank_capacity", "maintenance_count", "pumps_total"]);
  assert.deepEqual(assetValues(ASSETS[0], cols), ["p1", null, 48000, null, 2, null]);
  // "NULL" placeholders read as blank.
  assert.deepEqual(assetValues(ASSETS[1], cols), ["g1", null, 9000, null, null, null]);
  assert.deepEqual(assetValues(ASSETS[2], cols), ["s1", null, 12000, null, null, 4]);
  assert.deepEqual(assetValues(ASSETS[3], cols), ["t1", null, null, 50000, null, null]);
});

test("assetRows keys values by column label, numbers stay numbers", () => {
  const rows = assetRows([ASSETS[0]], orderColumns(["name", "status", "design_capacity", "category"]));
  assert.deepEqual(rows, [{ Name: "Zulfi Plant", Category: "Plant", Status: "Operational", "Design capacity (m³/day)": 48000 }]);
});

test("sortAssets / groupByCategory follow the registry's category order", () => {
  const shuffled = [ASSETS[3], ASSETS[1], ASSETS[2], ASSETS[0]];
  assert.deepEqual(sortAssets(shuffled).map((a) => a.id), ["p1", "g1", "s1", "t1"]);
  assert.deepEqual(groupByCategory(shuffled).map(([c, l]) => [c, l.length]), [["plant", 1], ["handover_point", 1], ["pump", 1], ["tank", 1]]);
});

test("columnsForCategories drops details no chosen category has", () => {
  const ids = columnsForCategories(["tank"]).map((c) => c.id);
  assert.ok(ids.includes("name") && ids.includes("tank_capacity") && ids.includes("reserve_rule"));
  assert.ok(!ids.includes("technology") && !ids.includes("pumps_total"));
});

test("describeFilters / displayValue read naturally", () => {
  assert.equal(describeFilters({}), "");
  assert.equal(
    describeFilters({ categories: ["plant", "tank"], statuses: ["under_construction"], query: " abha " }),
    "Search: “abha” · Category: Plants, Tanks · Status: Under construction"
  );
  const one = (id) => orderColumns([id])[0];
  assert.equal(displayValue(48000, one("design_capacity")), "48,000");
  assert.equal(displayValue("2005-08-04", one("commissioning_date")), "04 Aug 2005");
  assert.equal(displayValue(24.5, one("latitude")), "24.50000");
  assert.equal(displayValue(null, one("design_capacity")), "");
});

test("pdfColumnWidths fills the page and keeps every column readable", () => {
  const cols = orderColumns(["id", "name", "status", "design_capacity"]);
  const rows = [["p1", "A very long plant name that goes on and on", "Operational", "48,000"]];
  const widths = pdfColumnWidths(cols, rows, 500);
  assert.equal(Math.round(widths.reduce((s, w) => s + w, 0)), 500);
  assert.ok(widths[1] > widths[0], "the name column gets more room");
  // Squeezed: still fills exactly, nothing under the minimum.
  const many = orderColumns(COLUMN_PRESETS.all);
  const tight = pdfColumnWidths(many, [], 700, { min: 12 });
  assert.equal(Math.round(tight.reduce((s, w) => s + w, 0)), 700);
  assert.ok(tight.every((w) => w >= 12 - 1e-6));
  // A narrow column still fits its longest word when the table is squeezed.
  const cityCols = orderColumns(["id", "name", "city"]);
  const cityRows = [["x".repeat(40), "y".repeat(60), "Dammam"], ["x".repeat(40), "y".repeat(60), "Abha"]];
  const squeezed = pdfColumnWidths(cityCols, cityRows, 300, { charW: 4.4 });
  assert.ok(squeezed[2] >= 6 * 4.4 + 10 - 1e-6, `city column ${squeezed[2]}`);
  assert.equal(Math.round(squeezed.reduce((s, w) => s + w, 0)), 300);
});

test("pdfPageFor widens the page with the column count", () => {
  assert.deepEqual(pdfPageFor(5), { format: "a4", orientation: "portrait" });
  assert.deepEqual(pdfPageFor(9), { format: "a4", orientation: "landscape" });
  assert.deepEqual(pdfPageFor(20), { format: "a3", orientation: "landscape" });
});

test("assetsCsv writes labels then rows, numbers unquoted", async () => {
  const { escapeCell } = await import("./csvCell.js");
  const csv = assetsCsv([{ ...ASSETS[0], name: "Plant, North", longitude: -5.25 }], ["name", "longitude", "design_capacity"], escapeCell);
  assert.equal(csv, 'Name,Longitude,Design capacity (m³/day)\n"Plant, North",-5.25,48000');
});

test("each page's presets only name columns in that page's catalogue", async () => {
  const m = await import("./assetExport.js");
  const pages = [
    [m.PLANT_COLUMNS, m.PLANT_PRESETS],
    [m.ECONOMICS_COLUMNS, m.ECONOMICS_PRESETS],
    [m.CITY_GATE_COLUMNS, m.CITY_GATE_PRESETS],
  ];
  for (const [catalog, presets] of pages) {
    for (const [name, ids] of Object.entries(presets)) {
      assert.equal(orderColumns(ids, catalog).length, ids.length, name);
    }
  }
  // Plants never offer pump or tank details; city gates never offer plant ones.
  assert.ok(!m.PLANT_COLUMNS.some((c) => c.id === "pumps_total" || c.id === "tank_capacity"));
  assert.ok(!m.CITY_GATE_COLUMNS.some((c) => c.id === "technology"));
  assert.ok(m.CITY_GATE_COLUMNS.some((c) => c.id === "transmission_system"));
});

test("economics: cost columns read the attached costs; merit order sorts cheapest first", async () => {
  const m = await import("./assetExport.js");
  const plants = [
    { id: "b", name: "B", category: "plant", cost: { variableOm: 2.5, capex: 1e9, source: "economics", effectiveFrom: "2026-01-01" } },
    { id: "c", name: "C", category: "plant", cost: null },
    { id: "a", name: "A", category: "plant", cost: { variableOm: 1.2, source: "plant_spec" } },
  ];
  const cols = orderColumns(["name", "cost_variable_om", "cost_capex", "cost_source"], m.ECONOMICS_COLUMNS);
  assert.deepEqual(m.sortByVariableOm(plants).map((p) => p.id), ["a", "b", "c"]);
  assert.deepEqual(assetValues(plants[0], cols), ["B", 2.5, 1e9, "Economics"]);
  assert.deepEqual(assetValues(plants[1], cols), ["C", null, null, null]);
  assert.deepEqual(assetValues(plants[2], cols), ["A", 1.2, null, "Asset record"]);
});

test("pump stations: counts and capacity follow the Transmission page", async () => {
  const m = await import("./assetExport.js");
  const cols = orderColumns(["pumps_total", "pumps_active", "pumps_standby", "design_capacity"], m.PUMP_STATION_COLUMNS);
  // 4 pumps; 2 active duty pumps (one functional pump is switched off); 1 standby;
  // capacity (first: columns keep catalogue order) is the active duty pumps' total,
  // not the stale station figure.
  assert.deepEqual(assetValues(ASSETS[2], cols), [12000, 4, 2, 1]);
  // Pumps listed only as active / standby lists still count.
  const legacy = { category: "pump", specifications: { active_pumps: [{ role: "active", capacity_m3_day: 300 }], standby_pumps: [{ role: "standby" }] } };
  assert.deepEqual(assetValues(legacy, cols), [300, 2, 1, 1]);
  for (const [name, ids] of Object.entries(m.PUMP_STATION_PRESETS)) {
    assert.equal(orderColumns(ids, m.PUMP_STATION_COLUMNS).length, ids.length, name);
  }
});

test("exportFileName slugs the report title and dates it", async () => {
  const { exportFileName } = await import("./assetExport.js");
  assert.match(exportFileName("Plant economics"), /^plant-economics-\d{4}-\d{2}-\d{2}$/);
  assert.match(exportFileName("Asset Registry"), /^asset-registry-\d{4}-\d{2}-\d{2}$/);
});

test("page-defined tag filters and search text", () => {
  const rows = [
    { id: "s1", name: "North", tags: { network: ["Net A", "Net B"] }, search_text: "Net A Net B" },
    { id: "s2", name: "South", tags: { network: ["Net B"] }, search_text: "Net B" },
    { id: "s3", name: "East", tags: { network: [] }, search_text: "" },
  ];
  assert.deepEqual(filterAssets(rows, { tags: { network: ["Net A"] } }).map((r) => r.id), ["s1"]);
  assert.deepEqual(filterAssets(rows, { tags: { network: ["Net A", "Net B"] } }).map((r) => r.id), ["s1", "s2"]);
  assert.deepEqual(filterAssets(rows, { tags: { network: [] } }).length, 3);
  assert.deepEqual(filterAssets(rows, { query: "net a" }).map((r) => r.id), ["s1"]);
  assert.deepEqual(filterOptions(rows, ["network"]).tags, { network: ["Net A", "Net B"] });
  assert.equal(describeFilters({ tags: { network: ["Net B"] } }, { network: "Network" }), "Network: Net B");
});

test("systems: counts, names and presets", async () => {
  const m = await import("./assetExport.js");
  const row = { id: "TS-1", name: "Western", networks: ["Net A"], lines: 3, segments: 12, length: 41.5, plants: ["P1", "P2"], gates: [], pumps: ["PS"], tanks: [], junctions: 4 };
  const cols = orderColumns(["id", "networks", "length", "plant_count", "gate_count", "plant_names", "gate_names"], m.SYSTEM_COLUMNS);
  assert.deepEqual(assetValues(row, cols), ["TS-1", "Net A", 41.5, 2, 0, "P1; P2", null]);
  for (const [name, ids] of Object.entries(m.SYSTEM_PRESETS)) {
    assert.equal(orderColumns(ids, m.SYSTEM_COLUMNS).length, ids.length, name);
  }
  assert.deepEqual(m.sortByName([{ name: "b" }, { name: "A" }]).map((r) => r.name), ["A", "b"]);
});
