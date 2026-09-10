import test from "node:test";
import assert from "node:assert/strict";
import { buildOverviewSnapshot, summarizePlan } from "./operations.js";

test("summarizePlan exposes navigation-safe run data", () => {
  assert.deepEqual(summarizePlan({
    id: "plan-1", configId: "cfg-1", configName: "Morning run", status: "draft", runAt: "2026-08-05T06:00:00Z",
    kpis: { totalRequiredM3: 100, totalDeliveredM3: 80, totalShortageM3: 20 },
  }), {
    id: "plan-1", configId: "cfg-1", name: "Morning run", status: "draft", runAt: "2026-08-05T06:00:00Z",
    from: null, to: null, requiredM3: 100, deliveredM3: 80, shortageM3: 20, hasShortage: true,
  });
});

test("buildOverviewSnapshot tolerates partial data and reports pending work", () => {
  const overview = buildOverviewSnapshot({
    production: { kpis: { totalM3: 90, headroomM3: 10, latestDate: "2026-08-05", plantsReporting: 2, plantsOperationalTotal: 3 } },
    demand: { kpis: { totalM3: 100, latestDate: "2026-08-05", plantsReporting: 1 } },
    pending: { maintenance: 2, demand: 3, draftPlans: 1 },
    warnings: [{ source: "transmission", message: "Unavailable" }],
    generatedAt: "2026-08-05T07:00:00Z",
  });
  assert.equal(overview.demand.shortageM3, 10);
  assert.equal(overview.pending.total, 6);
  assert.equal(overview.warnings.length, 1);
  assert.equal(overview.exceptions[0].id, "supply-shortage");
});

