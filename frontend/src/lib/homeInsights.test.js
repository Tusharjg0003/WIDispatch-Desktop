import test from "node:test";
import assert from "node:assert/strict";

import {
  buildActivity,
  buildDailySeries,
  buildEntityTable,
  buildKpis,
  buildRegionBreakdown,
  dataBounds,
  dayDetail,
  movingAverage,
  normalizeRegion,
  resolvePeriod,
  sortRows,
} from "./homeInsights.js";

const rows = (start, values) =>
  values.map((v, i) => ({ date: new Date(Date.parse(`${start}T00:00:00Z`) + i * 86400000).toISOString().slice(0, 10), valueM3: v }));

const production = [
  { plantId: "p1", plantName: "Plant 1", region: "Riyadh", designCapacityM3: 100, rows: rows("2026-08-01", [80, 90, 100, 70]) },
  { plantId: "p2", plantName: "Plant 2", region: "Makkah", designCapacityM3: 200, rows: rows("2026-08-03", [100, 150]) },
];
const demand = [
  { plantId: "g1", plantName: "Gate 1", region: "Central", rows: rows("2026-08-02", [100, 300, 200]) },
];

test("regions from provinces and broad names fold together", () => {
  assert.equal(normalizeRegion("Eastern Province"), "Eastern");
  assert.equal(normalizeRegion("Riyadh"), "Central");
  assert.equal(normalizeRegion("Tabuk"), "Northern");
  assert.equal(normalizeRegion(null, "Southern"), "Southern");
  assert.equal(normalizeRegion("Mars"), "Other");
});

test("presets count back from the latest data and carry a previous period", () => {
  const bounds = dataBounds(production, demand);
  assert.deepEqual(bounds, { first: "2026-08-01", last: "2026-08-04" });
  const p = resolvePeriod({ key: "7d" }, bounds);
  assert.deepEqual(p, { from: "2026-07-29", to: "2026-08-04", days: 7, prevFrom: "2026-07-22", prevTo: "2026-07-28" });
  const all = resolvePeriod({ key: "all" }, bounds);
  assert.equal(all.from, "2026-08-01");
  const custom = resolvePeriod({ key: "custom", from: "2026-08-03", to: "2026-08-02" }, bounds);
  assert.deepEqual([custom.from, custom.to], ["2026-08-02", "2026-08-03"]);
});

test("daily series keeps unreported days empty and gaps only where both reported", () => {
  const s = buildDailySeries(production, demand, "2026-08-01", "2026-08-05");
  assert.deepEqual(s.map((p) => p.production), [80, 90, 200, 220, null]);
  assert.deepEqual(s.map((p) => p.demand), [null, 100, 300, 200, null]);
  assert.deepEqual(s.map((p) => p.gap), [null, -10, -100, 20, null]);
  assert.equal(s[0].capacity, 300);
  assert.deepEqual(movingAverage(s, "production", 2).slice(0, 3), [80, 85, 145]);
});

test("KPIs: coverage over days both reported, utilization against design capacity", () => {
  const period = { from: "2026-08-01", to: "2026-08-04", prevFrom: "2026-07-28", prevTo: "2026-07-31" };
  const k = buildKpis(production, demand, period);
  assert.equal(k.production.total, 590);
  assert.equal(k.coverage.days, 3);
  assert.equal(k.coverage.deficitDays, 2);
  assert.equal(Math.round(k.coverage.pct), Math.round((510 / 600) * 100));
  assert.equal(Math.round(k.utilization.pct), Math.round((590 / 800) * 100));
  assert.equal(k.production.change, null); // nothing before
});

test("entity table, sorting, regions, day detail", () => {
  const period = { from: "2026-08-01", to: "2026-08-04", prevFrom: "2026-07-28", prevTo: "2026-07-31" };
  const table = buildEntityTable(production, period);
  assert.equal(table[0].avg, 85);
  assert.equal(table[0].utilization, 85);
  assert.equal(table[1].region, "Western");
  assert.deepEqual(sortRows(table, "avg").map((r) => r.id), ["p2", "p1"]);
  assert.deepEqual(sortRows(table, "name", "asc").map((r) => r.id), ["p1", "p2"]);

  const regions = buildRegionBreakdown(production, demand, period);
  assert.deepEqual(regions.map((r) => r.region), ["Central", "Western"]);
  assert.equal(regions[0].balance, 85 - 200);

  const day = dayDetail(production, demand, "2026-08-04");
  assert.deepEqual(day.plants.map((p) => p.id), ["p2", "p1"]);
  assert.equal(day.gates[0].value, 200);
});

test("activity: newest first across outages, runs and approvals", () => {
  const items = buildActivity({
    outages: [{ id: "o1", scope: "full", assetName: "Plant 1", plantId: "p1", submittedAt: "2026-08-04T10:00:00Z" }],
    runs: [{ id: "r1", name: "Run", status: "published", runAt: "2026-08-05T10:00:00Z", configId: "c1" }],
    production: [{ plantId: "p1", plantName: "Plant 1", rows: [{ date: "2026-08-01", approvedAt: "2026-08-02T09:00:00Z", approvedBy: "Ali" }] }],
  });
  assert.deepEqual(items.map((i) => i.kind), ["published", "outage", "approval"]);
  assert.equal(items[2].path, "/production/p1");
});
