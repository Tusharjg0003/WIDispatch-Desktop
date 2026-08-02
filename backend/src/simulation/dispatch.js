// The dispatch engine: loads the portals' approved data, solves each day, and
// turns the solved flows into the three decisions the desktop owes the portals
// — a per-plant/per-day production allocation, a verdict on each maintenance
// request, and a verdict on each city-gate demand request.

import { getDb } from "../db.js";
import { availableForDay, eachDay, overlapsDay } from "./capacity.js";
import { indexFinancialEntries, variableOmForDay } from "./cost.js";
import { buildDayNetwork, pipeCapacity, readNetwork, SUPER_SNK, SUPER_SRC, UNLIMITED } from "./graph.js";
import { FlowNetwork, minCostMaxFlow, minCutArcs, EPS } from "./mcmf.js";

const round = (x) => Math.round(x * 1000) / 1000;
const num = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

function notFound(message) {
  const err = new Error(message);
  err.statusCode = 404;
  return err;
}

function badRequest(message) {
  const err = new Error(message);
  err.statusCode = 400;
  return err;
}

const groupBy = (rows, key) => {
  const map = new Map();
  for (const row of rows) {
    const k = row[key];
    if (!k) continue;
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(row);
  }
  return map;
};

// ── Input loading ───────────────────────────────────────────────────────────

/**
 * Load everything one run needs, in as few round-trips as the shape allows.
 * Every portal read is gated on `submission_status: "approved"` where the
 * portal owns the approval, consistent with the rest of this backend.
 */
export async function loadDispatchInputs({ networkId, from, to }) {
  if (!networkId) throw badRequest("A saved network must be selected");
  if (!from || !to) throw badRequest("A from and to date are required");
  if (from > to) throw badRequest("The from date must not be after the to date");

  const db = await getDb();
  const network = await db.collection("networks").findOne({ id: networkId }, { projection: { _id: 0 } });
  if (!network) throw notFound("Network not found");

  const topology = readNetwork(network);
  const byCategory = { plant: [], pump: [], handover_point: [], node: [] };
  for (const node of topology.nodes) {
    (byCategory[node.category] ||= []).push(node);
  }

  const assetIdsFor = (category) => byCategory[category].map((n) => n.assetId).filter(Boolean);
  const plantIds = assetIdsFor("plant");
  const pumpIds = assetIdsFor("pump");
  const gateIds = assetIdsFor("handover_point");
  const allAssetIds = [...new Set([...plantIds, ...pumpIds, ...gateIds])];

  const [plants, pumps, cityGates, maintenanceRows, outageRows, capacityRows, demandRows, financialRows] =
    await Promise.all([
      db.collection("plants").find({ id: { $in: plantIds } }, { projection: { _id: 0 } }).toArray(),
      db.collection("pumps").find({ id: { $in: pumpIds } }, { projection: { _id: 0 } }).toArray(),
      db.collection("cityGates").find({ id: { $in: gateIds } }, { projection: { _id: 0 } }).toArray(),
      db.collection("maintenanceRecords").find({ plant_id: { $in: allAssetIds } }).toArray(),
      db.collection("outages").find({ plant_id: { $in: allAssetIds } }, { projection: { _id: 0 } }).toArray(),
      db
        .collection("contractedCapacity")
        .find({ plant_id: { $in: allAssetIds } }, { projection: { _id: 0 } })
        .sort({ effective_from: -1 })
        .toArray(),
      db
        .collection("demandInputs")
        .find({ plant_id: { $in: gateIds }, submission_status: "approved", date: { $lte: to } }, { projection: { _id: 0 } })
        .toArray(),
      db.collection("financialEntries").find({}, { projection: { _id: 0 } }).toArray(),
    ]);

  // maintenanceRecords are addressed by their Mongo _id elsewhere in this
  // backend (see production.js), so keep the same promoted `id`.
  const maintenance = maintenanceRows.map(({ _id, ...row }) => ({ id: String(_id), ...row }));

  const assetById = new Map();
  for (const p of plants) assetById.set(p.id, { asset: p, kind: "plant" });
  for (const p of pumps) assetById.set(p.id, { asset: p, kind: "pump" });
  for (const g of cityGates) assetById.set(g.id, { asset: g, kind: "handover_point" });

  return {
    network: { id: network.id, name: network.name },
    topology,
    byCategory,
    dates: eachDay(from, to),
    from,
    to,
    assetById,
    maintenanceByAsset: groupBy(maintenance, "plant_id"),
    outagesByAsset: groupBy(outageRows, "plant_id"),
    capacitiesByAsset: groupBy(capacityRows, "plant_id"),
    demandByGate: groupBy(
      demandRows.filter((r) => String(r.end_date || r.date) >= from),
      "plant_id",
    ),
    financialIndex: indexFinancialEntries(financialRows),
    maintenance,
  };
}

// ── Per-day inputs ──────────────────────────────────────────────────────────

/** Required demand at a gate on a day: approved records, ranges spread across their span. */
function requiredForGate(demandRecords = [], dateIso) {
  let total = 0;
  for (const record of demandRecords) {
    const start = record.date;
    const end = record.end_date && record.end_date > start ? record.end_date : start;
    if (dateIso < start || dateIso > end) continue;
    total += num(record.required_m3) ?? 0;
  }
  return total;
}

/**
 * Resolve the day's supply / throughput / demand for every canvas node,
 * applying per-run overrides last so an operator what-if always wins.
 */
export function resolveDayInputs(inputs, dateIso, { overrides = {}, excludeMaintenanceIds } = {}) {
  const supply = new Map();
  const throughput = new Map();
  const demand = new Map();
  const detail = { plants: [], pumps: [], gates: [] };

  const ctxFor = (assetId) => ({
    maintenanceRecords: inputs.maintenanceByAsset.get(assetId) || [],
    outages: inputs.outagesByAsset.get(assetId) || [],
    contractedCapacities: inputs.capacitiesByAsset.get(assetId) || [],
    excludeMaintenanceIds,
  });

  for (const node of inputs.byCategory.plant || []) {
    const override = overrides[node.id] || {};
    const entry = inputs.assetById.get(node.assetId);
    const capacity = entry
      ? availableForDay(entry.asset, "plant", dateIso, ctxFor(node.assetId))
      : { base: 0, maintenanceLoss: 0, outageLoss: 0, available: 0, fullOutage: false };

    const om = variableOmForDay(node.assetId, dateIso, inputs.financialIndex, entry?.asset);
    const available = override.active === false ? 0 : num(override.available) ?? capacity.available;
    const cost = num(override.variableOm) ?? om.value;

    supply.set(node.id, { available, cost });
    detail.plants.push({
      nodeId: node.id,
      assetId: node.assetId,
      name: node.label,
      ...capacity,
      available,
      // Unlike a pipe or a pump station, a plant with no capacity anywhere on
      // record is treated as zero rather than unlimited: capacity is the
      // plant's defining number, and inventing one would hand Production an
      // allocation it would reject. Flagged so a resulting shortage is never
      // a mystery.
      noCapacity: capacity.base <= 0 && override.available == null,
      variableOm: cost,
      variableOmSource: override.variableOm != null ? "override" : om.source,
      overridden: override.active === false || override.available != null || override.variableOm != null,
    });
  }

  for (const node of inputs.byCategory.pump || []) {
    const override = overrides[node.id] || {};
    const entry = inputs.assetById.get(node.assetId);
    const capacity = entry
      ? availableForDay(entry.asset, "pump", dateIso, ctxFor(node.assetId))
      : { base: 0, maintenanceLoss: 0, outageLoss: 0, available: 0, fullOutage: false };

    // A station with no capacity recorded anywhere is a pass-through, not a
    // wall — same reasoning as an uncapacitated pipe.
    let limit = override.active === false ? 0 : num(override.capacity) ?? capacity.available;
    if (override.active !== false && capacity.base <= 0 && override.capacity == null) limit = null;

    throughput.set(node.id, limit);
    detail.pumps.push({
      nodeId: node.id,
      assetId: node.assetId,
      name: node.label,
      ...capacity,
      limit,
      unconstrained: limit == null,
      overridden: override.active === false || override.capacity != null,
    });
  }

  for (const node of inputs.byCategory.handover_point || []) {
    const override = overrides[node.id] || {};
    const entry = inputs.assetById.get(node.assetId);
    const records = inputs.demandByGate.get(node.assetId) || [];
    const required = override.active === false ? 0 : num(override.demand) ?? requiredForGate(records, dateIso);

    // A gate's own maintenance/outage caps what it can physically take. Gates
    // with no capacity on record impose no intake limit.
    const intake = entry ? availableForDay(entry.asset, "handover_point", dateIso, ctxFor(node.assetId)) : null;
    const intakeCap = intake && intake.base > 0 ? Math.min(required, intake.available) : required;

    demand.set(node.id, intakeCap);
    detail.gates.push({
      nodeId: node.id,
      assetId: node.assetId,
      name: node.label,
      required,
      intakeCap,
      intakeLimited: intakeCap < required,
      overridden: override.active === false || override.demand != null,
    });
  }

  return { supply, throughput, demand, detail };
}

// ── The day solve ───────────────────────────────────────────────────────────

/** Which nodes can be reached from a supplying plant at all, ignoring capacity. */
function reachableFromSupply(topology, activeNodeIds, supply) {
  const adjacency = new Map();
  const link = (from, to) => {
    if (!adjacency.has(from)) adjacency.set(from, []);
    adjacency.get(from).push(to);
  };
  for (const edge of topology.edges) {
    if (!edge.active) continue;
    if (!activeNodeIds.has(edge.source) || !activeNodeIds.has(edge.target)) continue;
    link(edge.source, edge.target);
    if (edge.bidirectional) link(edge.target, edge.source);
  }

  const seen = new Set();
  const stack = [];
  for (const [nodeId, s] of supply) {
    if (s.available > EPS && activeNodeIds.has(nodeId) && !seen.has(nodeId)) {
      seen.add(nodeId);
      stack.push(nodeId);
    }
  }
  while (stack.length) {
    const u = stack.pop();
    for (const v of adjacency.get(u) || []) {
      if (!seen.has(v)) {
        seen.add(v);
        stack.push(v);
      }
    }
  }
  return seen;
}

/** Solve one day and report flows, shortages and their binding constraints. */
export function solveDay(inputs, dateIso, options = {}) {
  const { supply, throughput, demand, detail } = resolveDayInputs(inputs, dateIso, options);

  const network = new FlowNetwork();
  const { supplyArcs, demandArcs, pipeArcs, activeNodeIds } = buildDayNetwork({
    topology: inputs.topology,
    supply,
    throughput,
    demand,
    dateIso,
    network,
  });

  // A day with no demand still needs a well-formed (empty) result.
  const totalRequired = detail.gates.reduce((sum, g) => sum + g.required, 0);
  if (!demandArcs.size || !supplyArcs.size) {
    return emptyDay(dateIso, detail, totalRequired, supplyArcs.size ? "no_demand" : "no_supply");
  }

  const { flow, cost, reachable } = minCostMaxFlow(network, SUPER_SRC, SUPER_SNK);
  const cut = minCutArcs(network, reachable);
  const reachableNodes = reachableFromSupply(inputs.topology, activeNodeIds, supply);
  const cutHasTransmission = cut.some((c) => c.kind === "pipe" || c.kind === "pump");

  const plantOutputs = {};
  for (const p of detail.plants) {
    const arc = supplyArcs.get(p.nodeId);
    plantOutputs[p.nodeId] = round(arc == null ? 0 : network.flowOn(arc));
  }

  const pipeFlows = {};
  for (const [edgeId, arcs] of pipeArcs) {
    pipeFlows[edgeId] = round(arcs.reduce((sum, arc) => sum + network.flowOn(arc), 0));
  }

  const gates = detail.gates.map((gate) => {
    const arc = demandArcs.get(gate.nodeId);
    const delivered = arc == null ? 0 : network.flowOn(arc);
    const shortage = Math.max(0, gate.required - delivered);

    let cause = null;
    if (shortage > EPS) {
      if (!reachableNodes.has(gate.nodeId)) cause = "isolated";
      else if (gate.intakeLimited && gate.intakeCap <= delivered + EPS) cause = "intake_limited";
      else cause = cutHasTransmission ? "transmission_bottleneck" : "insufficient_capacity";
    }

    return { ...gate, delivered: round(delivered), shortage: round(shortage), cause };
  });

  const totalDelivered = round(flow);
  return {
    date: dateIso,
    plants: detail.plants,
    pumps: detail.pumps,
    gates,
    plantOutputs,
    pipeFlows,
    totalRequired: round(totalRequired),
    totalDelivered,
    totalShortage: round(Math.max(0, totalRequired - totalDelivered)),
    variableOmCost: round(cost),
    satisfactionPct: totalRequired > 0 ? round((totalDelivered / totalRequired) * 100) : null,
    bindingConstraints: cut.map((c) => ({
      kind: c.kind,
      label: c.label,
      id: c.edgeId || c.nodeId,
      assetId: c.assetId ?? null,
      flow: round(c.flow),
      capacity: c.capacity >= UNLIMITED ? null : round(c.capacity),
    })),
  };
}

function emptyDay(dateIso, detail, totalRequired, reason) {
  return {
    date: dateIso,
    plants: detail.plants,
    pumps: detail.pumps,
    gates: detail.gates.map((g) => ({
      ...g,
      delivered: 0,
      shortage: round(g.required),
      cause: g.required > 0 ? (reason === "no_supply" ? "isolated" : null) : null,
    })),
    plantOutputs: Object.fromEntries(detail.plants.map((p) => [p.nodeId, 0])),
    pipeFlows: {},
    totalRequired: round(totalRequired),
    totalDelivered: 0,
    totalShortage: round(totalRequired),
    variableOmCost: 0,
    satisfactionPct: totalRequired > 0 ? 0 : null,
    bindingConstraints: [],
  };
}

/** Solve a list of days. */
export function solveDays(inputs, dates, options = {}) {
  return dates.map((date) => solveDay(inputs, date, options));
}

// ── Verdicts ────────────────────────────────────────────────────────────────

const ACTIVE_MAINTENANCE = ["submitted", "under_revision", "revised", "approved"];

/** Days in the horizon that a maintenance record actually touches. */
function windowDays(record, dates) {
  return dates.filter((date) => overlapsDay(record, date));
}

const shortageOn = (days, dateSet) =>
  days.reduce((sum, day) => (dateSet.has(day.date) ? sum + day.totalShortage : sum), 0);

/**
 * Decide each pending maintenance request.
 *
 * The cheap path is the common one: if the baseline already serves all demand
 * across the record's window, the work cannot be what causes a shortage, so it
 * is approved without a second solve. Only records overlapping a shortfall get
 * a counterfactual run — and that run only needs the record's own window,
 * since removing a derate cannot change any day outside it.
 */
export function decideMaintenance(inputs, baselineDays, options = {}) {
  const dates = inputs.dates;
  const byDate = new Map(baselineDays.map((d) => [d.date, d]));
  const canvasAssetIds = new Set(
    [...(inputs.byCategory.plant || []), ...(inputs.byCategory.pump || [])].map((n) => n.assetId).filter(Boolean),
  );

  const candidates = inputs.maintenance.filter(
    (r) =>
      canvasAssetIds.has(r.plant_id) &&
      ACTIVE_MAINTENANCE.includes(r.submission_status) &&
      r.approved_at && // website-approved, matching the desktop's existing rule
      !r.desktop_approval_status &&
      windowDays(r, dates).length > 0,
  );

  const verdicts = [];
  for (const record of candidates) {
    const window = windowDays(record, dates);
    const windowSet = new Set(window);
    const baselineShortage = shortageOn(baselineDays, windowSet);
    const assetName = inputs.assetById.get(record.plant_id)?.asset?.name || record.plant_id;

    if (baselineShortage <= EPS) {
      verdicts.push({
        recordId: record.id,
        assetId: record.plant_id,
        assetName,
        maintenanceType: record.maintenance_type ?? null,
        start: record.start_datetime ?? null,
        end: record.end_datetime ?? null,
        windowDays: window,
        status: "approved",
        shortageCaused: 0,
        affectedGates: [],
        reason: "All demand is met across the maintenance window.",
      });
      continue;
    }

    const without = solveDays(inputs, window, {
      ...options,
      excludeMaintenanceIds: new Set([String(record.id)]),
    });
    const counterfactualShortage = without.reduce((sum, d) => sum + d.totalShortage, 0);
    const delta = round(baselineShortage - counterfactualShortage);

    if (delta <= EPS) {
      verdicts.push({
        recordId: record.id,
        assetId: record.plant_id,
        assetName,
        maintenanceType: record.maintenance_type ?? null,
        start: record.start_datetime ?? null,
        end: record.end_datetime ?? null,
        windowDays: window,
        status: "approved",
        shortageCaused: 0,
        affectedGates: [],
        reason: "The shortage in this window occurs with or without this work.",
      });
      continue;
    }

    // Name the gates that this record specifically makes worse.
    const withoutByDate = new Map(without.map((d) => [d.date, d]));
    const affected = new Map();
    for (const date of window) {
      const base = byDate.get(date);
      const alt = withoutByDate.get(date);
      for (const gate of base?.gates || []) {
        const altGate = alt?.gates.find((g) => g.nodeId === gate.nodeId);
        const diff = round(gate.shortage - (altGate?.shortage ?? 0));
        if (diff > EPS) {
          const prev = affected.get(gate.assetId || gate.nodeId) || { name: gate.name, assetId: gate.assetId, m3: 0 };
          prev.m3 = round(prev.m3 + diff);
          affected.set(gate.assetId || gate.nodeId, prev);
        }
      }
    }
    const affectedGates = [...affected.values()].sort((a, b) => b.m3 - a.m3);

    const reschedule = findRescheduleWindow(record, baselineDays, window.length);
    verdicts.push({
      recordId: record.id,
      assetId: record.plant_id,
      assetName,
      maintenanceType: record.maintenance_type ?? null,
      start: record.start_datetime ?? null,
      end: record.end_datetime ?? null,
      windowDays: window,
      status: reschedule ? "postponed" : "rejected",
      shortageCaused: delta,
      affectedGates,
      suggestedWindow: reschedule,
      reason: reschedule
        ? `Would cause a ${delta.toLocaleString()} m³ shortage. A clear ${window.length}-day window starts ${reschedule.from}.`
        : `Would cause a ${delta.toLocaleString()} m³ shortage at ${affectedGates.length} city gate(s).`,
    });
  }

  return verdicts;
}

/** The earliest run of `length` consecutive horizon days with no baseline shortage. */
function findRescheduleWindow(record, baselineDays, length) {
  for (let i = 0; i + length <= baselineDays.length; i += 1) {
    const slice = baselineDays.slice(i, i + length);
    if (slice.every((d) => d.totalShortage <= EPS)) {
      return { from: slice[0].date, to: slice[slice.length - 1].date };
    }
  }
  return null;
}

/** Decide each city-gate demand request from what the network could actually deliver. */
export function decideDemand(inputs, baselineDays) {
  const verdicts = [];
  for (const day of baselineDays) {
    for (const gate of day.gates) {
      if (!gate.assetId || gate.required <= 0) continue;
      const status =
        gate.shortage <= EPS ? "approved" : gate.delivered > EPS ? "adjusted" : "shortfall";
      verdicts.push({
        assetId: gate.assetId,
        gateName: gate.name,
        date: day.date,
        required: gate.required,
        approved: gate.delivered,
        status,
        cause: gate.cause,
        reason:
          status === "approved"
            ? "Requested volume is deliverable."
            : status === "adjusted"
              ? `Revised to ${gate.delivered.toLocaleString()} m³ — ${causeText(gate.cause)}.`
              : `No volume deliverable — ${causeText(gate.cause)}.`,
      });
    }
  }
  return verdicts;
}

function causeText(cause) {
  switch (cause) {
    case "isolated":
      return "the gate is not connected to any producing plant";
    case "insufficient_capacity":
      return "available production capacity is exhausted";
    case "transmission_bottleneck":
      return "the transmission network is the binding constraint";
    case "intake_limited":
      return "the gate's own intake capacity is the binding constraint";
    default:
      return "capacity is constrained";
  }
}

// ── Orchestration ───────────────────────────────────────────────────────────

/** Run a full dispatch: baseline solve, then both sets of verdicts, then KPIs. */
export async function runDispatch({ networkId, from, to, overrides = {} }) {
  const inputs = await loadDispatchInputs({ networkId, from, to });
  const days = solveDays(inputs, inputs.dates, { overrides });
  const maintenanceVerdicts = decideMaintenance(inputs, days, { overrides });
  const demandVerdicts = decideDemand(inputs, days);

  const totals = days.reduce(
    (acc, d) => ({
      required: acc.required + d.totalRequired,
      delivered: acc.delivered + d.totalDelivered,
      shortage: acc.shortage + d.totalShortage,
      cost: acc.cost + d.variableOmCost,
    }),
    { required: 0, delivered: 0, shortage: 0, cost: 0 },
  );

  // Utilisation is measured against what was actually available, not the
  // headline contracted figure — a plant offline for maintenance should not
  // drag the number down.
  let availableSum = 0;
  let outputSum = 0;
  for (const day of days) {
    for (const plant of day.plants) {
      availableSum += plant.available;
      outputSum += day.plantOutputs[plant.nodeId] || 0;
    }
  }

  const plantAllocations = buildPlantAllocations(inputs, days);

  return {
    network: inputs.network,
    from,
    to,
    days,
    pipes: summarisePipes(inputs, days),
    plantAllocations,
    maintenanceVerdicts,
    demandVerdicts,
    overrideCount: Object.keys(overrides).length,
    kpis: {
      days: days.length,
      totalRequiredM3: round(totals.required),
      totalDeliveredM3: round(totals.delivered),
      totalShortageM3: round(totals.shortage),
      satisfactionPct: totals.required > 0 ? round((totals.delivered / totals.required) * 100) : null,
      totalVariableOmCost: round(totals.cost),
      avgCostPerM3: totals.delivered > 0 ? round(totals.cost / totals.delivered) : null,
      plantUtilisationPct: availableSum > 0 ? round((outputSum / availableSum) * 100) : null,
      bottleneckDays: days.filter((d) => d.bindingConstraints.some((c) => c.kind !== "plant_supply")).length,
      gatesShort: new Set(
        days.flatMap((d) => d.gates.filter((g) => g.shortage > EPS).map((g) => g.assetId || g.nodeId)),
      ).size,
    },
  };
}

/**
 * Static pipe metadata plus how hard each one was worked. Capacity is fixed
 * across the horizon, so it lives at plan level rather than being repeated on
 * every day.
 */
function summarisePipes(inputs, days) {
  const labelOf = new Map(inputs.topology.nodes.map((n) => [n.id, n.label]));

  return inputs.topology.edges.map((edge) => {
    const { capacity, unconstrained } = pipeCapacity(edge.specs);
    const flows = days.map((d) => d.pipeFlows[edge.id] || 0);
    const peak = flows.length ? Math.max(...flows) : 0;

    return {
      id: edge.id,
      label: edge.label,
      source: labelOf.get(edge.source) || edge.source,
      target: labelOf.get(edge.target) || edge.target,
      bidirectional: edge.bidirectional,
      active: edge.active,
      capacity: unconstrained ? null : round(capacity),
      unconstrained,
      peakFlow: round(peak),
      avgFlow: round(flows.length ? flows.reduce((a, b) => a + b, 0) / flows.length : 0),
      peakUtilisationPct: unconstrained || capacity <= 0 ? null : round((peak / capacity) * 100),
    };
  });
}

/** Flatten the solved flows into the per-plant/per-day allocation the Production portal expects. */
function buildPlantAllocations(inputs, days) {
  const rows = [];
  for (const day of days) {
    for (const plant of day.plants) {
      if (!plant.assetId) continue;
      const allocated = day.plantOutputs[plant.nodeId] || 0;
      rows.push({
        assetId: plant.assetId,
        plantName: plant.name,
        date: day.date,
        allocatedM3: allocated,
        availableM3: round(plant.available),
        variableOm: plant.variableOm,
        costSar: round(allocated * plant.variableOm),
        status: allocated > EPS ? "approved" : "adjusted",
      });
    }
  }
  return rows;
}

export { causeText };
