import { getDb } from "./db.js";

const PLANT_PROJECTION = {
  _id: 0,
  id: 1, external_id: 1, name: 1, asset_name_ar: 1, entity: 1, entity_type: 1,
  activity: 1, asset_type: 1, region: 1, cluster: 1, governorate: 1, city: 1,
  latitude: 1, longitude: 1, status: 1, capacity: 1,
  commissioning_date: 1, decommissioning_date: 1, specifications: 1,
};

// Pure: fold a plant together with its data status from a Map<plantId, latestIsoDate|null>.
export function deriveDataStatus(plant, dataMap) {
  const latest = dataMap.get(plant.id) ?? null;
  return { ...plant, hasData: latest != null, latestDataDate: latest };
}

export async function listProductionPlants() {
  const db = await getDb();
  const [plants, prodDates, qualDates] = await Promise.all([
    db.collection("plants").find({}, { projection: PLANT_PROJECTION }).toArray(),
    db.collection("productionInputs").find({}, { projection: { _id: 0, plant_id: 1, date: 1 } }).toArray(),
    db.collection("qualityRecords").find({}, { projection: { _id: 0, plant_id: 1, sampling_datetime: 1 } }).toArray(),
  ]);

  const dataMap = new Map();
  for (const r of prodDates) {
    const cur = dataMap.get(r.plant_id) ?? null;
    if (r.date && (cur == null || r.date > cur)) dataMap.set(r.plant_id, r.date);
    else if (!dataMap.has(r.plant_id)) dataMap.set(r.plant_id, cur);
  }
  for (const r of qualDates) {
    const iso = r.sampling_datetime ? String(r.sampling_datetime).slice(0, 10) : null;
    const cur = dataMap.get(r.plant_id) ?? null;
    if (iso && (cur == null || iso > cur)) dataMap.set(r.plant_id, iso);
    else if (!dataMap.has(r.plant_id)) dataMap.set(r.plant_id, cur);
  }

  return plants.map((p) => deriveDataStatus(p, dataMap));
}

export async function getPlantBundle(id) {
  const db = await getDb();
  const plant = await db.collection("plants").findOne({ id }, { projection: PLANT_PROJECTION });
  if (!plant) {
    const err = new Error("Plant not found");
    err.statusCode = 404;
    throw err;
  }

  const [productionInputs, qualityRecords, maintenanceRecords, outages, qualityLimitRows, capacityRows, userRows] =
    await Promise.all([
      db.collection("productionInputs").find({ plant_id: id }, { projection: { _id: 0 } }).toArray(),
      db.collection("qualityRecords").find({ plant_id: id }, { projection: { _id: 0 } }).toArray(),
      db.collection("maintenanceRecords").find({ plant_id: id }, { projection: { _id: 0 } }).toArray(),
      db.collection("outages").find({ plant_id: id }, { projection: { _id: 0 } }).toArray(),
      db.collection("qualityLimits").find({ plant_id: id }, { projection: { _id: 0 } }).sort({ effective_from: -1 }).toArray(),
      db.collection("contractedCapacity").find({ plant_id: id }, { projection: { _id: 0 } })
        .sort({ effective_from: -1 }).toArray(),
      db.collection("users").find({}, { projection: { _id: 1, id: 1, name: 1, email: 1 } }).toArray(),
    ]);

  // qualityLimits: fold rows into { [parameter]: { min, max } } keyed for this plant.
  // Rows are sorted newest-first (effective_from: -1), so keep only the first row seen per parameter.
  const qualityLimits = {};
  for (const row of qualityLimitRows) {
    const key = row.parameter;
    if (!key || qualityLimits[key]) continue;
    qualityLimits[key] = { min: row.min ?? undefined, max: row.max ?? undefined };
  }

  const referencedRefs = new Set();
  for (const r of [...productionInputs, ...maintenanceRecords, ...outages, ...qualityRecords]) {
    if (r.submitted_by) referencedRefs.add(r.submitted_by);
    if (r.approved_by) referencedRefs.add(r.approved_by);
  }
  const users = userRows
    .filter((u) => referencedRefs.has(u.id) || referencedRefs.has(String(u._id)))
    .map((u) => ({ id: u.id || String(u._id), name: u.name, email: u.email }));

  return {
    plant,
    productionInputs,
    qualityRecords,
    maintenanceRecords,
    outages,
    qualityLimits,
    contractedCapacities: capacityRows,
    users,
  };
}
