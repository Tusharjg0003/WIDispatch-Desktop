import { getDb } from "./db.js";
import { finite, dateMatch } from "./assets.js";
import { getPlantBundle } from "./production.js";

async function userNames(db, ids) {
  const unique = [...new Set(ids.filter(Boolean))];
  const map = new Map();
  if (!unique.length) return map;
  const users = await db
    .collection("users")
    .find({}, { projection: { name: 1, email: 1 } })
    .toArray();
  for (const u of users) map.set(String(u._id), u.name || u.email || String(u._id));
  return map;
}

/**
 * Approved financial entries (cost-parameter sets) with summary KPIs and a
 * cost-composition breakdown. Amounts are passed through as stored — the
 * collection carries no currency unit.
 */
export async function buildEconomics(filters = {}) {
  const db = await getDb();
  const match = {
    submission_status: "approved",
    ...dateMatch("created_at", filters, true),
  };

  const [rows, plants] = await Promise.all([
    db.collection("financialEntries").find(match).sort({ created_at: -1 }).toArray(),
    db.collection("plants").find({}, { projection: {
      _id: 0, id: 1, name: 1, external_id: 1, region: 1, entity: 1, status: 1, specifications: 1,
    } }).sort({ name: 1 }).toArray(),
  ]);

  const names = await userNames(db, rows.map((r) => r.approved_by));

  let capex = 0, fixedOm = 0, variableOm = 0, ccr = 0, lifetimeSum = 0, lifetimeCount = 0;
  for (const r of rows) {
    capex += finite(r.capex) ?? 0;
    fixedOm += finite(r.fixed_om) ?? 0;
    variableOm += finite(r.variable_om) ?? 0;
    ccr += finite(r.ccr) ?? 0;
    if (finite(r.lifetime) != null) {
      lifetimeSum += r.lifetime;
      lifetimeCount += 1;
    }
  }

  const latestByPlant = new Map();
  const effectiveKey = (row) => String(row.effective_start || row.created_at || "");
  for (const row of rows) {
    if (row.scope_type !== "plant" || !row.scope_id) continue;
    const current = latestByPlant.get(row.scope_id);
    if (!current || effectiveKey(row) > effectiveKey(current)) latestByPlant.set(row.scope_id, row);
  }
  const plantRows = plants.map((plant) => {
    const entry = latestByPlant.get(plant.id);
    const entryVariableOm = finite(entry?.variable_om);
    const specVariableOm = finite(plant.specifications?.variable_om ?? plant.specifications?.variable_om_sar_m3);
    return {
      id: plant.id,
      externalId: plant.external_id ?? null,
      name: plant.name || plant.id,
      region: plant.region ?? null,
      entity: plant.entity ?? null,
      status: plant.status ?? null,
      variableOm: entryVariableOm ?? specVariableOm,
      source: entryVariableOm != null ? "economics" : specVariableOm != null ? "plant_spec" : "missing",
      effectiveFrom: dayIso(entry?.effective_start),
      updatedAt: entry?.updated_at ?? entry?.created_at ?? null,
    };
  });
  const variableValues = plantRows.map((plant) => plant.variableOm).filter((value) => value != null);
  const plantsWithEconomics = plantRows.filter((plant) => plant.source === "economics").length;
  const plantsUsingFallback = plantRows.filter((plant) => plant.source === "plant_spec").length;

  return {
    kpis: {
      entries: rows.length,
      totalCapex: capex,
      totalFixedOm: fixedOm,
      totalVariableOm: variableOm,
      totalCcr: ccr,
      avgLifetimeYears: lifetimeCount ? Math.round((lifetimeSum / lifetimeCount) * 10) / 10 : null,
      plantsTotal: plantRows.length,
      plantsWithEconomics,
      plantsUsingFallback,
      plantsMissingVariableOm: plantRows.length - plantsWithEconomics - plantsUsingFallback,
      variableOmMin: variableValues.length ? Math.min(...variableValues) : null,
      variableOmMax: variableValues.length ? Math.max(...variableValues) : null,
      variableOmAvg: variableValues.length ? Math.round((variableValues.reduce((sum, value) => sum + value, 0) / variableValues.length) * 100) / 100 : null,
    },
    composition: [
      { label: "CapEx", value: capex },
      { label: "Fixed O&M", value: fixedOm },
      { label: "Variable O&M", value: variableOm },
      { label: "CCR", value: ccr },
    ],
    entries: rows.map((r) => ({
      id: r.id,
      scopeType: r.scope_type ?? null,
      scopeId: r.scope_id ?? null,
      effectiveFrom: dayIso(r.effective_start),
      effectiveTo: dayIso(r.effective_end),
      ccr: finite(r.ccr),
      capex: finite(r.capex),
      fixedOm: finite(r.fixed_om),
      variableOm: finite(r.variable_om),
      lifetime: finite(r.lifetime),
      approvedBy: names.get(String(r.approved_by)) || null,
      approvedAt: r.approved_at ?? null,
    })),
    plants: plantRows,
  };
}

const dayIso = (v) => (v ? String(v).slice(0, 10) : null);

/**
 * The production plant bundle plus this plant's effective-dated cost-parameter
 * history, so the Economics plant view can share the production Overview tab
 * and add a Financial tab from one request.
 */
export async function getEconomicsPlantBundle(id) {
  const [bundle, db] = await Promise.all([getPlantBundle(id), getDb()]);

  const rows = await db
    .collection("financialEntries")
    .find({ scope_type: "plant", scope_id: id })
    .toArray();

  const names = await userNames(db, rows.flatMap((r) => [r.created_by, r.approved_by, r.submitted_by]));

  const financialEntries = rows
    .map((r) => ({
      id: r.id || String(r._id),
      effectiveFrom: dayIso(r.effective_start),
      effectiveTo: dayIso(r.effective_end),
      changedFields: Array.isArray(r.changed_fields) ? r.changed_fields : [],
      ccr: finite(r.ccr),
      fixedOm: finite(r.fixed_om),
      variableOm: finite(r.variable_om),
      capex: finite(r.capex),
      lifetime: finite(r.lifetime),
      status: r.submission_status || "draft",
      updatedAt: r.updated_at ?? r.created_at ?? null,
      updatedBy: names.get(String(r.approved_by ?? r.submitted_by ?? r.created_by)) || null,
    }))
    .sort((a, b) => String(b.effectiveFrom || "").localeCompare(String(a.effectiveFrom || "")));

  return { ...bundle, financialEntries };
}
