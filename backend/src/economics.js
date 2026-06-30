import { getDb } from "./db.js";
import { finite, dateMatch } from "./assets.js";

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

  const rows = await db
    .collection("financialEntries")
    .find(match)
    .sort({ created_at: -1 })
    .toArray();

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

  return {
    kpis: {
      entries: rows.length,
      totalCapex: capex,
      totalFixedOm: fixedOm,
      totalVariableOm: variableOm,
      totalCcr: ccr,
      avgLifetimeYears: lifetimeCount ? Math.round((lifetimeSum / lifetimeCount) * 10) / 10 : null,
    },
    composition: [
      { label: "CapEx", value: capex },
      { label: "Fixed O&M", value: fixedOm },
      { label: "Variable O&M", value: variableOm },
      { label: "CCR", value: ccr },
    ],
    entries: rows.map((r) => ({
      id: r.id,
      ccr: finite(r.ccr),
      capex: finite(r.capex),
      fixedOm: finite(r.fixed_om),
      variableOm: finite(r.variable_om),
      lifetime: finite(r.lifetime),
      approvedBy: names.get(String(r.approved_by)) || null,
      approvedAt: r.approved_at ?? null,
    })),
  };
}
