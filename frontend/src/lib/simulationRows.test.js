import { test } from "node:test";
import assert from "node:assert/strict";
import {
  allocationGrid,
  allocationsToCsv,
  chartSeries,
  countOverrides,
  groupDemandVerdicts,
  summariseGates,
  summarisePlants,
  summarisePumps,
  validateConfig,
} from "./simulationRows.js";

const plant = (over) => ({
  nodeId: "n_cheap",
  assetId: "PL_CHEAP",
  name: "Cheap Plant",
  base: 1000,
  maintenanceLoss: 0,
  outageLoss: 0,
  available: 1000,
  variableOm: 1,
  variableOmSource: "economics",
  overridden: false,
  ...over,
});

const gate = (over) => ({
  nodeId: "n_gate",
  assetId: "CG_1",
  name: "City Gate 1",
  required: 1000,
  delivered: 1000,
  shortage: 0,
  cause: null,
  overridden: false,
  ...over,
});

const day = (date, over = {}) => ({
  date,
  plants: [plant()],
  pumps: [],
  gates: [gate()],
  plantOutputs: { n_cheap: 1000 },
  totalRequired: 1000,
  totalDelivered: 1000,
  totalShortage: 0,
  variableOmCost: 1000,
  ...over,
});

test("summarisePlants: keeps a per-day series instead of averaging the loss", () => {
  const days = [
    day("2026-08-10"),
    day("2026-08-11", {
      plants: [plant({ maintenanceLoss: 400, available: 600 })],
      plantOutputs: { n_cheap: 600 },
    }),
  ];
  const [row] = summarisePlants(days);

  // The real per-day figures survive — averaging them to 200 would describe a
  // day that never happened and match nothing on the Production tab.
  assert.deepEqual(row.days.map((d) => d.maintenanceLoss), [0, 400]);
  assert.deepEqual(row.days.map((d) => d.available), [1000, 600]);
  assert.deepEqual(row.days.map((d) => d.date), ["2026-08-10", "2026-08-11"]);
  assert.deepEqual(row.days.map((d) => d.allocated), [1000, 600]);

  assert.equal(row.contracted, 1000);
  assert.equal(row.minAvailable, 600); // the day that binds
  assert.equal(row.peakMaintenanceLoss, 400);
  assert.equal(row.maintenanceDays, 1);
  assert.equal(row.totalDays, 2);

  assert.equal(row.allocatedM3, 1600); // totals stay totals
  assert.equal(row.costSar, 1600);
  assert.equal(row.utilisationPct, 100);
});

test("summarisePlants: a spiky derate is not smoothed away", () => {
  // 150,000 lost on 2 of 14 days — the case that rendered as 21,429.
  const days = Array.from({ length: 14 }, (_, i) => {
    const date = `2026-08-${String(i + 2).padStart(2, "0")}`;
    const derated = i < 2;
    return day(date, {
      plants: [plant(derated ? { maintenanceLoss: 150000, available: 0, base: 150000 } : { base: 150000, available: 150000 })],
      plantOutputs: { n_cheap: 0 },
    });
  });
  const [row] = summarisePlants(days);

  assert.equal(row.peakMaintenanceLoss, 150000);
  assert.equal(row.maintenanceDays, 2);
  assert.equal(row.totalDays, 14);
  assert.equal(row.minAvailable, 0);
  assert.equal(row.days[0].maintenanceLoss, 150000);
  assert.equal(row.days[2].maintenanceLoss, 0);
  assert.equal(row.maintenanceLoss, undefined); // the averaged scalar is gone
});

test("summarisePlants: utilisation is measured against available, not contracted", () => {
  const days = [day("2026-08-10", {
    plants: [plant({ maintenanceLoss: 500, available: 500 })],
    plantOutputs: { n_cheap: 500 },
  })];
  // 500 of 500 available is full use, even though contracted is 1000.
  assert.equal(summarisePlants(days)[0].utilisationPct, 100);
});

test("summarisePlants: cheapest plant sorts first, matching the merit order", () => {
  const days = [day("2026-08-10", {
    plants: [
      plant({ nodeId: "n_exp", assetId: "PL_EXP", name: "Expensive", variableOm: 3 }),
      plant({ variableOm: 1 }),
    ],
    plantOutputs: { n_cheap: 1000, n_exp: 0 },
  })];
  assert.deepEqual(summarisePlants(days).map((p) => p.name), ["Cheap Plant", "Expensive"]);
});

test("summarisePlants: an override on any day flags the row", () => {
  const days = [day("2026-08-10"), day("2026-08-11", { plants: [plant({ overridden: true })] })];
  assert.equal(summarisePlants(days)[0].overridden, true);
});

test("summarisePlants: noCapacity only when the plant lacks capacity on every day", () => {
  const missing = [day("2026-08-10", { plants: [plant({ base: 0, available: 0, noCapacity: true })] })];
  assert.equal(summarisePlants(missing)[0].noCapacity, true);

  // Derated to nothing on one day is not the same as having no capacity on record.
  const derated = [
    day("2026-08-10", { plants: [plant({ noCapacity: false })] }),
    day("2026-08-11", { plants: [plant({ base: 1000, available: 0, noCapacity: false })] }),
  ];
  assert.equal(summarisePlants(derated)[0].noCapacity, false);
});

test("summarisePumps: flags a station left unconstrained on every day", () => {
  const pump = { nodeId: "n_pump", assetId: "PS_1", name: "PS1", base: 0, maintenanceLoss: 0, outageLoss: 0, available: 0, unconstrained: true, overridden: false };
  const [row] = summarisePumps([day("2026-08-10", { pumps: [pump] })]);
  assert.equal(row.unconstrained, true);
  assert.equal(row.name, "PS1");
});

test("summarisePumps: carries the station's per-day loss, not an average", () => {
  const pump = (over) => ({
    nodeId: "n_pump", assetId: "PS_1", name: "PS1",
    base: 100000, maintenanceLoss: 0, outageLoss: 0, available: 100000,
    unconstrained: false, overridden: false, ...over,
  });
  const days = [
    day("2026-08-02", { pumps: [pump({ maintenanceLoss: 50000, available: 50000 })] }),
    day("2026-08-03", { pumps: [pump({ maintenanceLoss: 50000, available: 50000 })] }),
    day("2026-08-04", { pumps: [pump()] }),
  ];
  const [row] = summarisePumps(days);

  assert.equal(row.design, 100000);
  assert.deepEqual(row.days.map((d) => d.maintenanceLoss), [50000, 50000, 0]);
  assert.equal(row.peakMaintenanceLoss, 50000);
  assert.equal(row.maintenanceDays, 2);
  assert.equal(row.minAvailable, 50000);
  assert.equal(row.maintenanceLoss, undefined);
});

test("summariseGates: totals demand, counts short days and keeps the worst", () => {
  const days = [
    day("2026-08-10"),
    day("2026-08-11", { gates: [gate({ delivered: 400, shortage: 600, cause: "insufficient_capacity" })] }),
    day("2026-08-12", { gates: [gate({ delivered: 900, shortage: 100, cause: "transmission_bottleneck" })] }),
  ];
  const [row] = summariseGates(days);

  assert.equal(row.requiredM3, 3000);
  assert.equal(row.deliveredM3, 2300);
  assert.equal(row.shortageM3, 700);
  assert.equal(row.shortDays, 2);
  assert.deepEqual(row.worstDay, { date: "2026-08-11", shortage: 600, cause: "insufficient_capacity" });
  assert.equal(row.satisfactionPct, 76.67);
});

test("summariseGates: a fully served gate has no worst day", () => {
  assert.equal(summariseGates([day("2026-08-10")])[0].worstDay, null);
});

test("summariseGates: gates with the largest shortage sort first", () => {
  const days = [day("2026-08-10", {
    gates: [
      gate({ nodeId: "n_a", assetId: "CG_A", name: "Gate A" }),
      gate({ nodeId: "n_b", assetId: "CG_B", name: "Gate B", delivered: 0, shortage: 1000 }),
    ],
  })];
  assert.deepEqual(summariseGates(days).map((g) => g.name), ["Gate B", "Gate A"]);
});

test("allocationGrid: pivots allocations into plant × date with column totals", () => {
  const plan = {
    days: [{ date: "2026-08-10" }, { date: "2026-08-11" }],
    plantAllocations: [
      { assetId: "PL_A", plantName: "Alpha", date: "2026-08-10", allocatedM3: 500, costSar: 500 },
      { assetId: "PL_A", plantName: "Alpha", date: "2026-08-11", allocatedM3: 300, costSar: 300 },
      { assetId: "PL_B", plantName: "Beta", date: "2026-08-10", allocatedM3: 100, costSar: 300 },
    ],
  };
  const grid = allocationGrid(plan);

  assert.deepEqual(grid.dates, ["2026-08-10", "2026-08-11"]);
  assert.deepEqual(grid.rows.map((r) => r.name), ["Alpha", "Beta"]);
  assert.equal(grid.rows[0].totalM3, 800);
  assert.equal(grid.rows[1].costSar, 300);
  assert.deepEqual(grid.totalsByDate, { "2026-08-10": 600, "2026-08-11": 300 });
});

test("allocationsToCsv: one column per day plus totals", () => {
  const grid = {
    dates: ["2026-08-10"],
    rows: [{ assetId: "PL_A", name: "Alpha", byDate: { "2026-08-10": 500 }, totalM3: 500, costSar: 500 }],
    totalsByDate: {},
  };
  const lines = allocationsToCsv(grid).split("\n");

  assert.equal(lines[0], "Plant,Asset ID,2026-08-10,Total (m³),Variable O&M cost (SAR)");
  assert.equal(lines[1], "Alpha,PL_A,500,500,500.00");
});

test("allocationsToCsv: a missing day renders as zero, not blank", () => {
  const grid = {
    dates: ["2026-08-10", "2026-08-11"],
    rows: [{ assetId: "PL_A", name: "Alpha", byDate: { "2026-08-10": 500 }, totalM3: 500, costSar: 500 }],
    totalsByDate: {},
  };
  assert.equal(allocationsToCsv(grid).split("\n")[1], "Alpha,PL_A,500,0,500,500.00");
});

test("groupDemandVerdicts: a gate's status is its worst day, not an average", () => {
  const verdicts = [
    { assetId: "CG_1", gateName: "Gate 1", date: "2026-08-10", required: 1000, approved: 1000, status: "approved", cause: null },
    { assetId: "CG_1", gateName: "Gate 1", date: "2026-08-11", required: 1000, approved: 400, status: "adjusted", cause: "insufficient_capacity" },
  ];
  const [row] = groupDemandVerdicts(verdicts);

  assert.equal(row.status, "adjusted");
  assert.equal(row.requiredM3, 2000);
  assert.equal(row.approvedM3, 1400);
  assert.equal(row.revisedDays, 1);
  assert.deepEqual(row.causes, ["insufficient_capacity"]);
});

test("groupDemandVerdicts: worst-affected gates sort to the top", () => {
  const verdicts = [
    { assetId: "CG_1", gateName: "Gate 1", date: "2026-08-10", required: 10, approved: 10, status: "approved" },
    { assetId: "CG_2", gateName: "Gate 2", date: "2026-08-10", required: 10, approved: 0, status: "shortfall" },
    { assetId: "CG_3", gateName: "Gate 3", date: "2026-08-10", required: 10, approved: 5, status: "adjusted" },
  ];
  assert.deepEqual(groupDemandVerdicts(verdicts).map((g) => g.gateName), ["Gate 2", "Gate 3", "Gate 1"]);
});

test("chartSeries: one point per day with an MM-DD label", () => {
  const series = chartSeries([day("2026-08-10")]);
  assert.deepEqual(series, [{ date: "2026-08-10", label: "08-10", required: 1000, delivered: 1000, shortage: 0, cost: 1000 }]);
});

test("validateConfig: a missing network or name blocks the run", () => {
  assert.deepEqual(validateConfig({ name: "", networkId: null, from: "2026-08-10", to: "2026-08-12" }).blockers, [
    "Give the configuration a name.",
    "Select a saved network to dispatch over.",
  ]);
});

test("validateConfig: an inverted date range blocks the run", () => {
  const { blockers, canRun } = validateConfig({ name: "Run", networkId: "net_1", from: "2026-08-12", to: "2026-08-10" });
  assert.equal(canRun, false);
  assert.match(blockers[0], /must not be after/);
});

test("validateConfig: a complete config can run", () => {
  const result = validateConfig({ name: "Run", networkId: "net_1", from: "2026-08-10", to: "2026-08-12" });
  assert.deepEqual(result.blockers, []);
  assert.equal(result.canRun, true);
});

test("validateConfig: a defaulted Variable O&M warns but does not block", () => {
  const plan = {
    days: [day("2026-08-10", { plants: [plant({ variableOmSource: "default" })] })],
    kpis: { totalRequiredM3: 1000 },
  };
  const result = validateConfig({ name: "Run", networkId: "net_1", from: "2026-08-10", to: "2026-08-10" }, { plan });

  assert.equal(result.canRun, true);
  assert.match(result.warnings[0], /no Variable O&M/);
});

test("validateConfig: plants with no capacity on record warn but do not block", () => {
  const plan = {
    days: [day("2026-08-10", {
      plants: [
        plant({ base: 0, available: 0, noCapacity: true }),
        plant({ nodeId: "n_two", assetId: "PL_TWO", name: "Two", base: 0, available: 0, noCapacity: true }),
      ],
    })],
    kpis: { totalRequiredM3: 1000 },
  };
  const result = validateConfig({ name: "Run", networkId: "net_1", from: "2026-08-10", to: "2026-08-10" }, { plan });

  assert.equal(result.canRun, true);
  assert.match(result.warnings[0], /^2 plant\(s\) have no contracted or design capacity/);
  assert.match(result.warnings[0], /override it below/);
});

test("validateConfig: no approved demand names the gates that are missing it", () => {
  const plan = {
    days: [day("2026-08-10", { gates: [gate({ required: 0, delivered: 0 })] })],
    kpis: { totalRequiredM3: 0 },
  };
  const result = validateConfig({ name: "Run", networkId: "net_1", from: "2026-08-10", to: "2026-08-12" }, { plan });
  const warning = result.warnings.find((w) => /approved demand/.test(w));

  assert.match(warning, /None of the 1 city gate\(s\)/);
  assert.match(warning, /City Gate 1/);
  assert.match(warning, /between 2026-08-10 and 2026-08-12/);
});

test("validateConfig: a network with no city gates says so instead", () => {
  const plan = { days: [day("2026-08-10", { gates: [] })], kpis: { totalRequiredM3: 0 } };
  const result = validateConfig({ name: "Run", networkId: "net_1", from: "2026-08-10", to: "2026-08-10" }, { plan });
  assert.ok(result.warnings.some((w) => /no city gates on it/.test(w)));
});

test("countOverrides: empty override objects do not count", () => {
  assert.equal(countOverrides({ a: { available: 5 }, b: {}, c: null, d: { active: false } }), 2);
  assert.equal(countOverrides(), 0);
});
