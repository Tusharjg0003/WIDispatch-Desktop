import { getDb } from "./db.js";
import { finite, dateMatch, resolveAssetNames } from "./assets.js";

/**
 * Approved water-quality samples, joined with plant + handover-point names.
 * Filtered by sampling_datetime (an ISO datetime) and optional plant.
 */
export async function buildQuality(filters = {}) {
  const db = await getDb();
  const match = {
    submission_status: "approved",
    ...dateMatch("sampling_datetime", filters, true),
  };
  if (filters.plant) match.plant_id = filters.plant;

  const rows = await db.collection("qualityRecords").find(match).toArray().catch(() => []);

  const names = await resolveAssetNames(db, rows.map((r) => r.plant_id));

  const hopIds = [...new Set(rows.map((r) => r.handover_point_id).filter(Boolean))];
  const hopMap = new Map();
  if (hopIds.length) {
    const hops = await db
      .collection("handover-points")
      .find({ id: { $in: hopIds } }, { projection: { id: 1, name: 1 } })
      .toArray();
    for (const h of hops) hopMap.set(h.id, h.name);
  }

  return rows
    .map((r) => ({
      id: r.id,
      plantName: names.get(r.plant_id)?.name ?? r.plant_id,
      handoverPointName: r.handover_point_id
        ? hopMap.get(r.handover_point_id) ?? r.handover_point_id
        : null,
      sampledAt: r.sampling_datetime ?? null,
      residualChlorine: finite(r.residual_chlorine),
      turbidity: finite(r.turbidity),
      conductivity: finite(r.conductivity),
      complianceFlag: r.compliance_flag ?? null,
      comments: r.comments ?? null,
    }))
    .sort((a, b) => (b.sampledAt || "").localeCompare(a.sampledAt || ""));
}
