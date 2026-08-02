import { toCsv } from "./csvCell.js";

// Pure derivations for the Simulation Config tables and the results grid,
// following the productionRows.js / demandRows.js precedent: the page fetches,
// these functions shape, the components only render.

const sum = (rows, pick) => rows.reduce((total, row) => total + (pick(row) || 0), 0);
const round = (x) => Math.round(x * 100) / 100;

// Averaging is fine for a gate's requested demand — that is a rate that applies
// on every day. It is NOT used for capacity or maintenance loss; see perDay().
const avg = (rows, pick) => (rows.length ? sum(rows, pick) / rows.length : 0);

// Capacity and loss are deliberately NOT averaged across the horizon. Maintenance
// is spiky — a plant losing 150,000 m³/day for 2 days of 14 averages to 21,429,
// a figure that occurs on no day and reconciles with nothing on the Production
// or Transmission tabs, both of which report strictly per-day. Each row instead
// carries its own per-day series plus counts, which are facts rather than a
// statistic that smooths away the day that actually binds the dispatch.
function perDay(entries) {
  return entries.map((e) => ({
    date: e.date,
    contracted: round(e.base),
    maintenanceLoss: round(e.maintenanceLoss),
    outageLoss: round(e.outageLoss),
    available: round(e.available),
  }));
}

const affectedCounts = (entries) => ({
  totalDays: entries.length,
  maintenanceDays: entries.filter((e) => e.maintenanceLoss > 0).length,
  outageDays: entries.filter((e) => e.outageLoss > 0).length,
  minAvailable: entries.length ? round(Math.min(...entries.map((e) => e.available))) : 0,
  peakMaintenanceLoss: entries.length ? round(Math.max(...entries.map((e) => e.maintenanceLoss))) : 0,
  peakOutageLoss: entries.length ? round(Math.max(...entries.map((e) => e.outageLoss))) : 0,
});

/** Group a day-series field by canvas node, keeping the date on each entry. */
function byNodeAcrossDays(days, field, extra) {
  const map = new Map();
  for (const day of days) {
    for (const row of day[field] || []) {
      if (!map.has(row.nodeId)) map.set(row.nodeId, []);
      map.get(row.nodeId).push({ ...row, date: day.date, ...(extra ? extra(day, row) : null) });
    }
  }
  return map;
}

/** One row per plant across the horizon, carrying its per-day breakdown. */
export function summarisePlants(days = []) {
  const byNode = byNodeAcrossDays(days, "plants", (day, row) => ({
    allocated: day.plantOutputs?.[row.nodeId] || 0,
  }));

  return [...byNode.entries()]
    .map(([nodeId, entries]) => {
      const first = entries[0];
      const allocated = sum(entries, (e) => e.allocated);
      const availableTotal = sum(entries, (e) => e.available);
      return {
        nodeId,
        assetId: first.assetId,
        name: first.name,
        contracted: round(first.base),
        variableOm: first.variableOm,
        variableOmSource: first.variableOmSource,
        // Only a plant with no capacity on any day of the range — one that is
        // merely fully derated for a while still has a capacity on record.
        noCapacity: entries.every((e) => e.noCapacity),
        overridden: entries.some((e) => e.overridden),
        allocatedM3: round(allocated),
        costSar: round(sum(entries, (e) => e.allocated * e.variableOm)),
        // Against what was actually available, so maintenance downtime does
        // not read as a plant being underused.
        utilisationPct: availableTotal > 0 ? round((allocated / availableTotal) * 100) : null,
        ...affectedCounts(entries),
        days: perDay(entries).map((d, i) => ({ ...d, allocated: round(entries[i].allocated) })),
      };
    })
    .sort((a, b) => a.variableOm - b.variableOm || a.name.localeCompare(b.name));
}

/** One row per pump station across the horizon, carrying its per-day breakdown. */
export function summarisePumps(days = []) {
  const byNode = byNodeAcrossDays(days, "pumps");

  return [...byNode.entries()]
    .map(([nodeId, entries]) => {
      const first = entries[0];
      return {
        nodeId,
        assetId: first.assetId,
        name: first.name,
        design: round(first.base),
        unconstrained: entries.every((e) => e.unconstrained),
        overridden: entries.some((e) => e.overridden),
        ...affectedCounts(entries),
        days: perDay(entries),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** One row per city gate across the horizon, with its worst day surfaced. */
export function summariseGates(days = []) {
  const byNode = new Map();
  for (const day of days) {
    for (const gate of day.gates || []) {
      if (!byNode.has(gate.nodeId)) byNode.set(gate.nodeId, []);
      byNode.get(gate.nodeId).push({ ...gate, date: day.date });
    }
  }

  return [...byNode.entries()]
    .map(([nodeId, entries]) => {
      const first = entries[0];
      const required = sum(entries, (e) => e.required);
      const delivered = sum(entries, (e) => e.delivered);
      const worst = entries.reduce((a, b) => (b.shortage > a.shortage ? b : a), entries[0]);
      return {
        nodeId,
        assetId: first.assetId,
        name: first.name,
        requiredM3: round(required),
        deliveredM3: round(delivered),
        shortageM3: round(Math.max(0, required - delivered)),
        avgRequired: round(avg(entries, (e) => e.required)),
        satisfactionPct: required > 0 ? round((delivered / required) * 100) : null,
        shortDays: entries.filter((e) => e.shortage > 0).length,
        worstDay: worst.shortage > 0 ? { date: worst.date, shortage: round(worst.shortage), cause: worst.cause } : null,
        overridden: entries.some((e) => e.overridden),
      };
    })
    .sort((a, b) => b.shortageM3 - a.shortageM3 || a.name.localeCompare(b.name));
}

/**
 * The per-plant × per-day allocation grid — the numbers the desktop hands back
 * to Production.
 */
export function allocationGrid(plan) {
  const dates = (plan?.days || []).map((d) => d.date);
  const byPlant = new Map();

  for (const row of plan?.plantAllocations || []) {
    if (!byPlant.has(row.assetId)) {
      byPlant.set(row.assetId, { assetId: row.assetId, name: row.plantName, byDate: {}, totalM3: 0, costSar: 0 });
    }
    const entry = byPlant.get(row.assetId);
    entry.byDate[row.date] = row.allocatedM3;
    entry.totalM3 = round(entry.totalM3 + row.allocatedM3);
    entry.costSar = round(entry.costSar + row.costSar);
  }

  const rows = [...byPlant.values()].sort((a, b) => b.totalM3 - a.totalM3);
  const totalsByDate = Object.fromEntries(
    dates.map((date) => [date, round(sum(rows, (r) => r.byDate[date]))]),
  );

  return { dates, rows, totalsByDate };
}

export function allocationsToCsv(grid) {
  const headers = ["Plant", "Asset ID", ...grid.dates, "Total (m³)", "Variable O&M cost (SAR)"];
  const body = grid.rows.map((row) => [
    row.name,
    row.assetId,
    ...grid.dates.map((date) => (row.byDate[date] ?? 0).toFixed(0)),
    row.totalM3.toFixed(0),
    row.costSar.toFixed(2),
  ]);
  return toCsv(headers, body);
}

/**
 * Collapse the per-gate-per-day demand verdicts into one row per gate. The
 * gate's overall status is its worst day — an operator needs to see that a
 * gate was cut on any day, not an average that hides it.
 */
const DEMAND_SEVERITY = { approved: 0, adjusted: 1, shortfall: 2 };

export function groupDemandVerdicts(verdicts = []) {
  const byGate = new Map();
  for (const verdict of verdicts) {
    if (!byGate.has(verdict.assetId)) {
      byGate.set(verdict.assetId, {
        assetId: verdict.assetId,
        gateName: verdict.gateName,
        days: [],
        requiredM3: 0,
        approvedM3: 0,
        status: "approved",
        causes: new Set(),
      });
    }
    const entry = byGate.get(verdict.assetId);
    entry.days.push(verdict);
    entry.requiredM3 = round(entry.requiredM3 + verdict.required);
    entry.approvedM3 = round(entry.approvedM3 + verdict.approved);
    if (DEMAND_SEVERITY[verdict.status] > DEMAND_SEVERITY[entry.status]) entry.status = verdict.status;
    if (verdict.cause) entry.causes.add(verdict.cause);
  }

  return [...byGate.values()]
    .map((entry) => ({
      ...entry,
      causes: [...entry.causes],
      revisedDays: entry.days.filter((d) => d.status !== "approved").length,
    }))
    .sort((a, b) => DEMAND_SEVERITY[b.status] - DEMAND_SEVERITY[a.status] || a.gateName.localeCompare(b.gateName));
}

/** Per-day series for the supply-vs-demand chart. */
export function chartSeries(days = []) {
  return days.map((day) => ({
    date: day.date,
    label: day.date.slice(5), // MM-DD
    required: day.totalRequired,
    delivered: day.totalDelivered,
    shortage: day.totalShortage,
    cost: day.variableOmCost,
  }));
}

/**
 * What blocks a run, and what merely deserves a warning. Mirrors SWIIMS'
 * validate() split: blockers disable the Run button, warnings do not.
 */
export function validateConfig(config, { plan } = {}) {
  const blockers = [];
  const warnings = [];

  if (!config?.name?.trim()) blockers.push("Give the configuration a name.");
  if (!config?.networkId) blockers.push("Select a saved network to dispatch over.");
  if (!config?.from || !config?.to) blockers.push("Set a from and to date.");
  else if (config.from > config.to) blockers.push("The from date must not be after the to date.");

  if (plan) {
    const plants = summarisePlants(plan.days);

    const missingCapacity = plants.filter((p) => p.noCapacity);
    if (missingCapacity.length) {
      warnings.push(
        `${missingCapacity.length} plant(s) have no contracted or design capacity on record and cannot be dispatched. ` +
          "Set it in Production or the Asset Registry, or override it below.",
      );
    }

    const missingCost = plants.filter((p) => p.variableOmSource === "default");
    if (missingCost.length) {
      warnings.push(
        `${missingCost.length} plant(s) have no Variable O&M in Economics or on the asset record — a default rate was used.`,
      );
    }
    if (plan.kpis?.totalRequiredM3 === 0) {
      // "Nothing to dispatch" has two very different causes, and saying which
      // saves the operator guessing: either the canvas has no city gates on
      // it, or the gates it does have carry no approved demand for this range.
      const gates = summariseGates(plan.days);
      if (!gates.length) {
        warnings.push("This network has no city gates on it, so there is no demand to dispatch to.");
      } else {
        warnings.push(
          `None of the ${gates.length} city gate(s) on this network have approved demand between ` +
            `${config.from} and ${config.to} (${gates.slice(0, 3).map((g) => g.name).join(", ")}` +
            `${gates.length > 3 ? ", …" : ""}). Demand comes from records approved in the Demand portal.`,
        );
      }
    }
  }

  return { blockers, warnings, canRun: blockers.length === 0 };
}

export function countOverrides(overrides = {}) {
  return Object.values(overrides).filter((o) => o && Object.keys(o).length > 0).length;
}
