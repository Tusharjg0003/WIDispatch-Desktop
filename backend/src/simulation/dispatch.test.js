import { test } from "node:test";
import assert from "node:assert/strict";
import { decideDemand, decideMaintenance, solveDay, solveDays } from "./dispatch.js";
import { indexFinancialEntries } from "./cost.js";
import { eachDay } from "./capacity.js";

// A hand-built `inputs` object, exactly the shape loadDispatchInputs returns —
// so everything below the database boundary is exercised without Mongo.
//
//   cheap plant (1.0 SAR/m³) ─┐
//                             ├─ pump station ── gate
//   expensive plant (3.0) ────┘
function makeInputs({
  cheapCapacity = 1000,
  expensiveCapacity = 1000,
  demand = 1200,
  pipeCapacity = 100000,
  pumpCapacity = 100000,
  maintenance = [],
  from = "2026-08-10",
  to = "2026-08-12",
} = {}) {
  const nodes = [
    { id: "n_cheap", assetId: "PL_CHEAP", category: "plant", label: "Cheap Plant", status: "operational", meta: {} },
    { id: "n_exp", assetId: "PL_EXP", category: "plant", label: "Expensive Plant", status: "operational", meta: {} },
    { id: "n_pump", assetId: "PS_1", category: "pump", label: "Pump Station 1", status: "operational", meta: {} },
    { id: "n_gate", assetId: "CG_1", category: "handover_point", label: "City Gate 1", status: "operational", meta: {} },
  ];

  const pipe = (id, source, target) => ({
    id,
    source,
    target,
    label: id,
    active: true,
    status: "operational",
    commissioningDate: null,
    decommissioningDate: null,
    bidirectional: false,
    specs: { capacity: pipeCapacity },
  });

  const byCategory = { plant: [], pump: [], handover_point: [], node: [] };
  for (const node of nodes) byCategory[node.category].push(node);

  const dates = eachDay(from, to);

  return {
    network: { id: "net_test", name: "Test network" },
    topology: {
      nodes,
      edges: [
        pipe("e_cheap", "n_cheap", "n_pump"),
        pipe("e_exp", "n_exp", "n_pump"),
        pipe("e_gate", "n_pump", "n_gate"),
      ],
    },
    byCategory,
    dates,
    from,
    to,
    assetById: new Map([
      ["PL_CHEAP", { kind: "plant", asset: { id: "PL_CHEAP", name: "Cheap Plant", specifications: { contracted_capacity: cheapCapacity, variable_om: 1.0 } } }],
      ["PL_EXP", { kind: "plant", asset: { id: "PL_EXP", name: "Expensive Plant", specifications: { contracted_capacity: expensiveCapacity, variable_om: 3.0 } } }],
      ["PS_1", { kind: "pump", asset: { id: "PS_1", name: "Pump Station 1", specifications: { design_capacity: pumpCapacity } } }],
      ["CG_1", { kind: "handover_point", asset: { id: "CG_1", name: "City Gate 1", specifications: {} } }],
    ]),
    maintenanceByAsset: maintenance.reduce((map, record) => {
      if (!map.has(record.plant_id)) map.set(record.plant_id, []);
      map.get(record.plant_id).push(record);
      return map;
    }, new Map()),
    outagesByAsset: new Map(),
    capacitiesByAsset: new Map(),
    demandByGate: new Map([
      ["CG_1", dates.map((date) => ({ id: `d_${date}`, plant_id: "CG_1", date, required_m3: demand, submission_status: "approved" }))],
    ]),
    financialIndex: indexFinancialEntries([]),
    maintenance,
  };
}

const maintenanceRecord = (over = {}) => ({
  id: "m1",
  plant_id: "PL_CHEAP",
  maintenance_type: "preventive",
  submission_status: "approved",
  approved_at: "2026-08-01T00:00:00Z",
  start_datetime: "2026-08-11T00:00:00Z",
  end_datetime: "2026-08-11T23:59:59Z",
  expected_loss_m3: 800,
  ...over,
});

test("solveDay: meets demand and dispatches the cheap plant first", () => {
  const day = solveDay(makeInputs(), "2026-08-10");

  assert.equal(day.totalRequired, 1200);
  assert.equal(day.totalDelivered, 1200);
  assert.equal(day.totalShortage, 0);
  assert.equal(day.plantOutputs.n_cheap, 1000);
  assert.equal(day.plantOutputs.n_exp, 200);
  assert.equal(day.variableOmCost, 1000 * 1.0 + 200 * 3.0);
  assert.equal(day.satisfactionPct, 100);
});

test("solveDay: full delivery never reports saturated arcs as bottlenecks", () => {
  const day = solveDay(makeInputs({ demand: 400, pipeCapacity: 400 }), "2026-08-10");
  assert.equal(day.totalShortage, 0);
  assert.deepEqual(day.bindingConstraints, []);
});

test("solveDay: reads Variable O&M provenance from the plant spec", () => {
  const day = solveDay(makeInputs(), "2026-08-10");
  const cheap = day.plants.find((p) => p.nodeId === "n_cheap");
  assert.equal(cheap.variableOm, 1.0);
  assert.equal(cheap.variableOmSource, "plant_spec");
});

test("solveDay: production shortfall is classified as insufficient capacity", () => {
  const day = solveDay(makeInputs({ demand: 2500 }), "2026-08-10");
  const gate = day.gates[0];

  assert.equal(day.totalDelivered, 2000);
  assert.equal(gate.shortage, 500);
  assert.equal(gate.cause, "insufficient_capacity");
  assert.ok(day.bindingConstraints.every((c) => c.kind === "plant_supply"));
});

test("solveDay: a saturated delivery pipe is reported as a transmission bottleneck", () => {
  const day = solveDay(makeInputs({ demand: 1200, pipeCapacity: 400 }), "2026-08-10");
  const gate = day.gates[0];

  assert.equal(day.totalDelivered, 400);
  assert.equal(gate.cause, "transmission_bottleneck");
  assert.deepEqual(day.bindingConstraints.map((c) => c.id), ["e_gate"]);
});

test("solveDay: a pump station throughput limit binds like a pipe", () => {
  const day = solveDay(makeInputs({ demand: 1200, pumpCapacity: 500 }), "2026-08-10");

  assert.equal(day.totalDelivered, 500);
  assert.deepEqual(day.bindingConstraints.map((c) => c.kind), ["pump"]);
});

test("solveDay: an override replaces the portal value for that run only", () => {
  const inputs = makeInputs();
  const overrides = { n_cheap: { available: 200 } };
  const day = solveDay(inputs, "2026-08-10", { overrides });

  assert.equal(day.plantOutputs.n_cheap, 200);
  assert.equal(day.plantOutputs.n_exp, 1000);
  assert.equal(day.plants.find((p) => p.nodeId === "n_cheap").overridden, true);

  // The unmodified run is unaffected — overrides are not persisted anywhere.
  assert.equal(solveDay(inputs, "2026-08-10").plantOutputs.n_cheap, 1000);
});

test("solveDay: a plant with no capacity on record is flagged, not silently zeroed", () => {
  const inputs = makeInputs({ demand: 1200 });
  inputs.assetById.set("PL_EXP", {
    kind: "plant",
    asset: { id: "PL_EXP", name: "Expensive Plant", specifications: { variable_om: 3.0 } },
  });
  const day = solveDay(inputs, "2026-08-10");
  const exp = day.plants.find((p) => p.nodeId === "n_exp");

  assert.equal(exp.noCapacity, true);
  assert.equal(exp.available, 0);
  assert.equal(day.plantOutputs.n_exp, 0);
  // The shortfall is real and reported rather than papered over.
  assert.equal(day.totalShortage, 200);
  // A plant that does have capacity is not flagged.
  assert.equal(day.plants.find((p) => p.nodeId === "n_cheap").noCapacity, false);
});

test("solveDay: a capacity override clears the no-capacity flag", () => {
  const inputs = makeInputs({ demand: 1200 });
  inputs.assetById.set("PL_EXP", {
    kind: "plant",
    asset: { id: "PL_EXP", name: "Expensive Plant", specifications: { variable_om: 3.0 } },
  });
  const day = solveDay(inputs, "2026-08-10", { overrides: { n_exp: { available: 500 } } });
  const exp = day.plants.find((p) => p.nodeId === "n_exp");

  assert.equal(exp.noCapacity, false);
  assert.equal(day.plantOutputs.n_exp, 200);
  assert.equal(day.totalShortage, 0);
});

test("solveDay: a fully derated plant still has capacity on record", () => {
  const record = maintenanceRecord({ plant_id: "PL_CHEAP", expected_loss_m3: 1000 });
  const inputs = makeInputs({ demand: 1200, maintenance: [record] });
  const day = solveDay(inputs, "2026-08-11"); // the maintenance day

  const cheap = day.plants.find((p) => p.nodeId === "n_cheap");
  assert.equal(cheap.available, 0);
  assert.equal(cheap.noCapacity, false); // derated to nothing, but not missing data
});

test("solveDay: a disabled plant contributes nothing", () => {
  const day = solveDay(makeInputs(), "2026-08-10", { overrides: { n_exp: { active: false } } });
  assert.equal(day.plantOutputs.n_exp, 0);
  assert.equal(day.totalShortage, 200);
});

test("decideMaintenance: work that fits within spare capacity is approved without a counterfactual", () => {
  const record = maintenanceRecord();
  const inputs = makeInputs({ demand: 800, maintenance: [record] });
  const days = solveDays(inputs, inputs.dates);
  const [verdict] = decideMaintenance(inputs, days);

  assert.equal(days.every((d) => d.totalShortage === 0), true);
  assert.equal(verdict.status, "approved");
  assert.equal(verdict.shortageCaused, 0);
  assert.match(verdict.reason, /All demand is met/);
});

test("decideMaintenance: work that causes a shortage quantifies it and names the gate", () => {
  const record = maintenanceRecord({ expected_loss_m3: 900 });
  // Demand needs both plants at full tilt, so losing 900 m³ bites.
  const inputs = makeInputs({ demand: 2000, maintenance: [record] });
  const days = solveDays(inputs, inputs.dates);
  const [verdict] = decideMaintenance(inputs, days);

  assert.equal(verdict.shortageCaused, 900);
  assert.deepEqual(verdict.windowDays, ["2026-08-11"]);
  assert.deepEqual(verdict.affectedGates.map((g) => g.assetId), ["CG_1"]);
  assert.equal(verdict.affectedGates[0].m3, 900);
  assert.match(verdict.reason, /900 m³ shortage/);
});

test("decideMaintenance: a clear window is advisory but the decision remains a cross", () => {
  const record = maintenanceRecord({ expected_loss_m3: 900 });
  // Demand is lower on August 10, leaving enough headroom for the shifted loss.
  // The original August 11 maintenance still creates a shortage.
  const inputs = makeInputs({ demand: 2000, maintenance: [record] });
  inputs.demandByGate.set("CG_1", inputs.dates.map((date) => ({
    plant_id: "CG_1", date, required_m3: date === "2026-08-10" ? 1000 : 2000,
  })));
  const [verdict] = decideMaintenance(inputs, solveDays(inputs, inputs.dates));

  assert.equal(verdict.status, "rejected");
  assert.equal(verdict.decision, false);
  assert.deepEqual(verdict.suggestedWindow, { from: "2026-08-10", to: "2026-08-10" });
  assert.match(verdict.reason, /clear 1-day window starts 2026-08-10/);
});

test("decideMaintenance: a baseline-clear day is rejected when shifted work makes it short", () => {
  const record = maintenanceRecord({ expected_loss_m3: 900 });
  const inputs = makeInputs({ demand: 2000, maintenance: [record] });
  const [verdict] = decideMaintenance(inputs, solveDays(inputs, inputs.dates));

  // August 10 has no shortage in the original run, but moving the same loss
  // there creates one. Baseline clearance alone is not a valid alternative.
  assert.equal(verdict.suggestedWindow, null);
});

test("decideMaintenance: a shifted window accounts for an outage on the candidate day", () => {
  const record = maintenanceRecord({ expected_loss_m3: 900 });
  const inputs = makeInputs({ demand: 2000, maintenance: [record] });
  inputs.demandByGate.set("CG_1", inputs.dates.map((date) => ({
    plant_id: "CG_1", date, required_m3: date === "2026-08-10" ? 900 : 2000,
  })));
  inputs.outagesByAsset.set("PL_EXP", [{
    id: "o1", plant_id: "PL_EXP", submission_status: "approved", outage_scope: "full",
    start_datetime: "2026-08-10T00:00:00Z", end_datetime: "2026-08-10T23:59:59Z",
  }]);
  const [verdict] = decideMaintenance(inputs, solveDays(inputs, inputs.dates));

  assert.equal(verdict.suggestedWindow, null);
});

test("decideMaintenance: shifting preserves partial-day duration and daily loss offsets", () => {
  const record = maintenanceRecord({
    start_datetime: "2026-08-11T06:30:00Z",
    end_datetime: "2026-08-12T18:45:00Z",
    daily_losses: [
      { date: "2026-08-11", loss_m3: 600 },
      { date: "2026-08-12", loss_m3: 300 },
    ],
    expected_loss_m3: 900,
  });
  const inputs = makeInputs({ demand: 2000, maintenance: [record] });
  inputs.demandByGate.set("CG_1", inputs.dates.map((date) => ({
    plant_id: "CG_1", date, required_m3: date === "2026-08-12" ? 2000 : 1200,
  })));
  const [verdict] = decideMaintenance(inputs, solveDays(inputs, inputs.dates));

  assert.deepEqual(verdict.suggestedWindow, { from: "2026-08-10", to: "2026-08-11" });
});

test("decideMaintenance: work longer than the run horizon has no replacement window", () => {
  const record = maintenanceRecord({
    start_datetime: "2026-08-09T00:00:00Z",
    end_datetime: "2026-08-13T23:59:59Z",
    expected_loss_m3: 4500,
  });
  const inputs = makeInputs({ demand: 2000, maintenance: [record] });
  const [verdict] = decideMaintenance(inputs, solveDays(inputs, inputs.dates));
  assert.equal(verdict.suggestedWindow, null);
});

test("decideMaintenance: with no clear day anywhere in the horizon the work is rejected outright", () => {
  const record = maintenanceRecord({ expected_loss_m3: 900 });
  // Demand exceeds capacity every day, so there is nowhere to move the work to.
  const inputs = makeInputs({ demand: 2500, maintenance: [record] });
  const [verdict] = decideMaintenance(inputs, solveDays(inputs, inputs.dates));

  assert.equal(verdict.status, "rejected");
  assert.equal(verdict.shortageCaused, 1400);
  assert.equal(verdict.suggestedWindow, null);
  assert.match(verdict.reason, /at 1 city gate\(s\)/);
});

test("decideMaintenance: a shortage that exists either way still receives a cross", () => {
  const record = maintenanceRecord({ expected_loss_m3: 0, expected_impact_m3: 0 });
  const inputs = makeInputs({ demand: 5000, maintenance: [record] });
  const days = solveDays(inputs, inputs.dates);
  const [verdict] = decideMaintenance(inputs, days);

  assert.equal(verdict.status, "rejected");
  assert.equal(verdict.recommendedStatus, "rejected");
  assert.equal(verdict.decision, false);
});

test("decideMaintenance: records the desktop already decided are skipped", () => {
  const record = maintenanceRecord({ desktop_approval_status: "approved" });
  const inputs = makeInputs({ demand: 2000, maintenance: [record] });
  assert.deepEqual(decideMaintenance(inputs, solveDays(inputs, inputs.dates)), []);
});

test("decideMaintenance: records the website has not approved are skipped", () => {
  const record = maintenanceRecord({ approved_at: undefined, submission_status: "submitted" });
  const inputs = makeInputs({ demand: 2000, maintenance: [record] });
  assert.deepEqual(decideMaintenance(inputs, solveDays(inputs, inputs.dates)), []);
});

test("decideDemand: full delivery approves, partial revises, none is a shortfall", () => {
  const full = makeInputs({ demand: 800 });
  assert.equal(decideDemand(full, solveDays(full, full.dates))[0].status, "approved");

  const partial = makeInputs({ demand: 2500 });
  const partialVerdict = decideDemand(partial, solveDays(partial, partial.dates))[0];
  assert.equal(partialVerdict.status, "adjusted");
  assert.equal(partialVerdict.approved, 2000);
  assert.match(partialVerdict.reason, /Revised to 2,000 m³/);

  const none = makeInputs({ demand: 1200, pipeCapacity: 0.0000001 });
  const noneVerdict = decideDemand(none, solveDays(none, none.dates))[0];
  assert.equal(noneVerdict.status, "shortfall");
  assert.equal(noneVerdict.approved, 0);
});

test("decideDemand: emits one verdict per gate per day", () => {
  const inputs = makeInputs({ demand: 800 });
  const verdicts = decideDemand(inputs, solveDays(inputs, inputs.dates));
  assert.equal(verdicts.length, 3);
  assert.deepEqual(verdicts.map((v) => v.date), ["2026-08-10", "2026-08-11", "2026-08-12"]);
});

function makeTankInputs({ plantCapacity = 0, tankCapacity = 100, demand = 50, pipeCapacity = 100, strategic = false } = {}) {
  const nodes = [
    { id: "plant", assetId: "PL", category: "plant", label: "Plant", status: "operational", meta: {} },
    { id: "tank", assetId: "TK", category: "tank", label: "Tank", status: "operational", meta: {} },
    { id: "gate", assetId: "CG", category: "handover_point", label: "Gate", status: "operational", meta: {} },
  ];
  const edge = (id, source, target) => ({ id, source, target, label: id, active: true, status: "operational", bidirectional: false,
    commissioningDate: null, decommissioningDate: null, specs: { capacity: pipeCapacity } });
  const dates = eachDay("2026-08-10", "2026-08-11");
  return {
    network: { id: "tank-net", name: "Tank network" },
    topology: { nodes, edges: [edge("in", "plant", "tank"), edge("out", "tank", "gate")] },
    byCategory: { plant: [nodes[0]], pump: [], tank: [nodes[1]], handover_point: [nodes[2]], node: [] },
    dates, from: dates[0], to: dates[1],
    assetById: new Map([
      ["PL", { kind: "plant", asset: { id: "PL", name: "Plant", specifications: { contracted_capacity: plantCapacity, variable_om: 1 } } }],
      ["TK", { kind: "tank", asset: { id: "TK", name: "Tank", activity: strategic ? "Strategic storage" : "Water transmission", specifications: { total_capacity_m3: tankCapacity } } }],
      ["CG", { kind: "handover_point", asset: { id: "CG", name: "Gate", specifications: {} } }],
    ]),
    maintenanceByAsset: new Map(), outagesByAsset: new Map(), capacitiesByAsset: new Map(),
    demandByGate: new Map([["CG", dates.map((date) => ({ plant_id: "CG", date, required_m3: demand }))]]),
    financialIndex: indexFinancialEntries([]), maintenance: [],
  };
}

function makeMaintenanceTankDemoInputs() {
  const dates = eachDay("2026-08-10", "2026-08-15");
  const plants = ["A", "B", "C"].map((id) => ({
    id: `plant_${id}`, assetId: `PL_${id}`, category: "plant", label: `Plant ${id}`, status: "operational", meta: {},
  }));
  const tank = { id: "tank", assetId: "TK", category: "tank", label: "Tank", status: "operational", meta: {} };
  const gate = { id: "gate", assetId: "CG", category: "handover_point", label: "Gate", status: "operational", meta: {} };
  const edge = (id, source, target, capacity) => ({ id, source, target, label: id, active: true, status: "operational",
    bidirectional: false, commissioningDate: null, decommissioningDate: null, specs: { capacity } });
  const maintenance = {
    id: "demo_maintenance", plant_id: "PL_B", maintenance_type: "preventive", submission_status: "approved",
    approved_at: "2026-08-01T00:00:00Z", start_datetime: "2026-08-13T00:00:00Z", end_datetime: "2026-08-15T20:59:00Z",
    daily_losses: ["2026-08-13", "2026-08-14", "2026-08-15"].map((date) => ({ date, loss_m3: 120000 })),
    expected_loss_m3: 360000,
  };
  return {
    network: { id: "demo", name: "Maintenance tank demo" },
    topology: { nodes: [...plants, tank, gate], edges: [
      ...plants.map((plant) => edge(`${plant.id}_tank`, plant.id, tank.id, 120000)),
      edge("tank_gate", tank.id, gate.id, 300000),
    ] },
    byCategory: { plant: plants, pump: [], tank: [tank], handover_point: [gate], node: [] },
    dates, from: dates[0], to: dates.at(-1),
    assetById: new Map([
      ...plants.map((plant) => [plant.assetId, { kind: "plant", asset: { id: plant.assetId, name: plant.label,
        specifications: { contracted_capacity: 120000, variable_om: 1 } } }]),
      ["TK", { kind: "tank", asset: { id: "TK", name: "Tank", activity: "Operational storage",
        specifications: { total_capacity_m3: 120000, min_level_pct: 0 } } }],
      ["CG", { kind: "handover_point", asset: { id: "CG", name: "Gate", specifications: {} } }],
    ]),
    maintenanceByAsset: new Map([["PL_B", [maintenance]]]),
    outagesByAsset: new Map([["PL_A", [{
      id: "demo_outage", plant_id: "PL_A", submission_status: "approved", outage_scope: "full",
      start_datetime: "2026-08-10T00:00:00Z", end_datetime: "2026-08-10T23:59:59Z",
    }]]]),
    capacitiesByAsset: new Map(),
    demandByGate: new Map([["CG", dates.map((date) => ({ plant_id: "CG", date, required_m3: 300000 }))]]),
    financialIndex: indexFinancialEntries([]), maintenance: [maintenance],
  };
}

test("decideMaintenance: replacement search carries tank state through the demo outage", () => {
  const inputs = makeMaintenanceTankDemoInputs();
  const options = { overrides: { tank: { initialLevelPct: 100, minLevelPct: 0, maxLevelPct: 100, reserveRule: "ignore" } } };
  const days = solveDays(inputs, inputs.dates, options);
  const [verdict] = decideMaintenance(inputs, days, options);

  assert.deepEqual(days.map((day) => day.totalShortage), [0, 0, 0, 0, 0, 60000]);
  assert.deepEqual(days.map((day) => day.tanks[0].endLevel), [60000, 120000, 120000, 60000, 0, 0]);
  assert.equal(verdict.suggestedWindow, null);
});

test("solveDays: tank inventory carries over and never crosses its minimum", () => {
  const inputs = makeTankInputs({ strategic: true });
  const days = solveDays(inputs, inputs.dates, { strategicStorageMinPct: 20 });
  assert.deepEqual(days.map((day) => day.tanks[0].endLevel), [50, 20]);
  assert.deepEqual(days.map((day) => day.totalShortage), [0, 20]);
  assert.ok(days.every((day) => Math.abs(day.massBalance.difference) < 1e-6));
});

test("solveDay: emergency drawdown can release strategic reserve", () => {
  const inputs = makeTankInputs({ strategic: true, demand: 100 });
  const day = solveDay(inputs, inputs.dates[0], {
    strategicStorageMinPct: 70,
    tankState: new Map(),
    overrides: { tank: { reserveRule: "emergency-drawdown" } },
  });
  assert.equal(day.tanks[0].endLevel, 0);
  assert.equal(day.totalShortage, 0);
});

test("solveDay: per-tank initial, minimum and maximum overrides are enforced", () => {
  const inputs = makeTankInputs({ demand: 100 });
  const day = solveDay(inputs, inputs.dates[0], { tankState: new Map(), overrides: {
    tank: { initialLevelPct: 50, minLevelPct: 20, maxLevelPct: 60 },
  } });
  assert.equal(day.tanks[0].startLevel, 50);
  assert.equal(day.tanks[0].minStorage, 20);
  assert.equal(day.tanks[0].maxStorage, 60);
  assert.equal(day.tanks[0].endLevel, 20);
});

test("solveDay: remaining plant production charges storage and is allocated", () => {
  const inputs = makeTankInputs({ plantCapacity: 100, demand: 0 });
  const day = solveDay(inputs, inputs.dates[0], {
    tankState: new Map([["tank", 0]]),
  });
  assert.equal(day.tanks[0].inflow, 100);
  assert.equal(day.tanks[0].endLevel, 100);
  assert.equal(day.plantOutputs.plant, 100);
  assert.equal(day.massBalance.difference, 0);
});

test("solveDay: tank release respects the remaining pipe capacity", () => {
  const inputs = makeTankInputs({ demand: 50, pipeCapacity: 30 });
  const day = solveDay(inputs, inputs.dates[0], { tankState: new Map() });
  assert.equal(day.tanks[0].outflow, 30);
  assert.equal(day.totalShortage, 20);
  assert.equal(day.bindingConstraints.some((row) => row.kind === "pipe"), true);
});

test("solveDay: operational storage can transfer into strategic storage", () => {
  const inputs = makeTankInputs({ demand: 0 });
  const reserve = { id: "reserve", assetId: "RS", category: "tank", label: "Strategic Reserve", status: "operational", meta: {} };
  inputs.topology.nodes.push(reserve);
  inputs.byCategory.tank.push(reserve);
  inputs.assetById.set("RS", { kind: "tank", asset: { id: "RS", name: "Strategic Reserve", activity: "Strategic storage", specifications: { total_capacity_m3: 100 } } });
  inputs.topology.edges.push({ id: "transfer", source: "tank", target: "reserve", label: "transfer", active: true,
    status: "operational", bidirectional: false, commissioningDate: null, decommissioningDate: null, specs: { capacity: 100 } });
  const day = solveDay(inputs, inputs.dates[0], { tankState: new Map([["tank", 100], ["reserve", 0]]) });
  assert.equal(day.tanks.find((tank) => tank.nodeId === "tank").endLevel, 0);
  assert.equal(day.tanks.find((tank) => tank.nodeId === "reserve").endLevel, 100);
  assert.equal(day.massBalance.difference, 0);
});
