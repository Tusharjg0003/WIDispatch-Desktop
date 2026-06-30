import { getDb } from "./db.js";
import { finite, dateMatch, resolveAssetNames } from "./assets.js";

const ASSET_COLLECTIONS = [
  { key: "plants", label: "Plants" },
  { key: "pumps", label: "Pumps" },
  { key: "valves", label: "Valves" },
  { key: "pipelines", label: "Pipelines" },
];

const ASSET_STATUSES = [
  "operational",
  "maintenance",
  "under_construction",
  "planned",
  "decommissioned",
];

export async function buildTransmission(filters = {}) {
  const db = await getDb();
  const approved = { submission_status: "approved" };

  // --- Source records (approved only) ---
  const [reqRows, maint, outages, issues] = await Promise.all([
    db.collection("productionInputs")
      .find({ ...approved, required_m3: { $ne: null }, ...dateMatch("date", filters, false) })
      .toArray(),
    db.collection("maintenanceRecords")
      .find({ ...approved, ...dateMatch("start_datetime", filters, true) })
      .toArray(),
    db.collection("outages")
      .find({ ...approved, ...dateMatch("start_datetime", filters, true) })
      .toArray(),
    db.collection("issues")
      .find({ ...approved, ...dateMatch("date", filters, false) })
      .toArray(),
  ]);

  const names = await resolveAssetNames(db, [
    ...reqRows, ...maint, ...outages, ...issues,
  ].map((r) => r.plant_id));
  const nameOf = (id) => names.get(id)?.name ?? id;

  // --- Required production by plant ---
  const reqMap = new Map();
  for (const r of reqRows) {
    const v = finite(r.required_m3) ?? 0;
    const p = reqMap.get(r.plant_id) || { plantId: r.plant_id, plantName: nameOf(r.plant_id), requiredM3: 0, days: 0 };
    p.requiredM3 += v;
    p.days += 1;
    reqMap.set(r.plant_id, p);
  }
  const requiredByPlant = [...reqMap.values()].sort((a, b) => b.requiredM3 - a.requiredM3);

  // --- Asset status matrix ---
  const assets = { byType: [], statuses: ASSET_STATUSES, totals: {} };
  for (const { key, label } of ASSET_COLLECTIONS) {
    const rows = await db.collection(key).aggregate([
      { $group: { _id: "$status", n: { $sum: 1 } } },
    ]).toArray();
    const counts = {};
    let total = 0;
    for (const r of rows) {
      const status = r._id || "unknown";
      counts[status] = (counts[status] || 0) + r.n;
      total += r.n;
    }
    assets.byType.push({ type: label, counts, total });
  }
  for (const s of ASSET_STATUSES) {
    assets.totals[s] = assets.byType.reduce((sum, t) => sum + (t.counts[s] || 0), 0);
  }
  assets.grandTotal = assets.byType.reduce((sum, t) => sum + t.total, 0);

  // --- Event lists ---
  const sum = (rows, ...fields) =>
    rows.reduce((acc, r) => {
      for (const f of fields) {
        if (finite(r[f]) != null) return acc + r[f];
      }
      return acc;
    }, 0);

  return {
    range: { from: filters.from ?? null, to: filters.to ?? null },
    kpis: {
      requiredProductionM3: sum(reqRows, "required_m3"),
      maintenanceImpactM3: sum(maint, "actual_impact_m3", "expected_impact_m3"),
      outageLossM3: sum(outages, "actual_loss_m3", "estimated_loss_m3"),
      issueLossM3: sum(issues, "actual_loss_m3"),
      assetsOperational: assets.totals.operational || 0,
      assetsTotal: assets.grandTotal,
      assetsInMaintenance: assets.totals.maintenance || 0,
    },
    requiredByPlant,
    assets,
    maintenance: maint
      .map((r) => ({
        id: r.id,
        plantName: nameOf(r.plant_id),
        type: r.maintenance_type ?? "—",
        start: r.start_datetime ?? null,
        end: r.end_datetime ?? null,
        impactM3: finite(r.actual_impact_m3) ?? finite(r.expected_impact_m3),
        description: r.description ?? null,
      }))
      .sort((a, b) => (b.start || "").localeCompare(a.start || "")),
    outages: outages
      .map((r) => ({
        id: r.id,
        plantName: nameOf(r.plant_id),
        type: r.outage_type ?? "—",
        start: r.start_datetime ?? null,
        durationHours: finite(r.duration_hours),
        lossM3: finite(r.actual_loss_m3) ?? finite(r.estimated_loss_m3),
        isEmergency: !!r.is_emergency,
      }))
      .sort((a, b) => (b.start || "").localeCompare(a.start || "")),
    issues: issues
      .map((r) => ({
        id: r.id,
        plantName: nameOf(r.plant_id),
        date: r.date ?? null,
        lossM3: finite(r.actual_loss_m3),
        description: r.description ?? null,
      }))
      .sort((a, b) => (b.date || "").localeCompare(a.date || "")),
  };
}
