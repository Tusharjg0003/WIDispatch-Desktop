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

test("decideMaintenance: a clear window elsewhere in the horizon is offered as a postponement", () => {
  const record = maintenanceRecord({ expected_loss_m3: 900 });
  // Demand sits exactly at total capacity, so only the maintenance day is
  // short — 2026-08-10 is a clear one-day slot the work could move to.
  const inputs = makeInputs({ demand: 2000, maintenance: [record] });
  const [verdict] = decideMaintenance(inputs, solveDays(inputs, inputs.dates));

  assert.equal(verdict.status, "postponed");
  assert.deepEqual(verdict.suggestedWindow, { from: "2026-08-10", to: "2026-08-10" });
  assert.match(verdict.reason, /clear 1-day window starts 2026-08-10/);
});

test("decideMaintenance: with no clear day anywhere in the horizon the work is rejected outright", () => {
  const record = maintenanceRecord({ expected_loss_m3: 900 });
  // Demand exceeds capacity every day, so there is nowhere to move the work to.
  const inputs = makeInputs({ demand: 2500, maintenance: [record] });
  const [verdict] = decideMaintenance(inputs, solveDays(inputs, inputs.dates));

  assert.equal(verdict.status, "rejected");
  assert.equal(verdict.shortageCaused, 900);
  assert.equal(verdict.suggestedWindow, null);
  assert.match(verdict.reason, /at 1 city gate\(s\)/);
});

test("decideMaintenance: a shortage that exists either way still approves the work", () => {
  // The network is short on every day regardless, so this record is not the
  // cause and blocking it would achieve nothing.
  const record = maintenanceRecord({ expected_loss_m3: 0, expected_impact_m3: 0 });
  const inputs = makeInputs({ demand: 5000, maintenance: [record] });
  const days = solveDays(inputs, inputs.dates);
  const [verdict] = decideMaintenance(inputs, days);

  assert.equal(verdict.status, "approved");
  assert.match(verdict.reason, /with or without this work/);
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
