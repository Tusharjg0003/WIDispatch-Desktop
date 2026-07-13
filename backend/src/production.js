import { getDb } from "./db.js";
import { ObjectId } from "mongodb";

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

  const [productionInputs, qualityRecords, maintenanceRecordRows, outages, qualityLimitRows, capacityRows, userRows] =
    await Promise.all([
      db.collection("productionInputs").find({ plant_id: id }, { projection: { _id: 0 } }).toArray(),
      db.collection("qualityRecords").find({ plant_id: id }, { projection: { _id: 0 } }).toArray(),
      db.collection("maintenanceRecords").find({ plant_id: id }).toArray(),
      db.collection("outages").find({ plant_id: id }, { projection: { _id: 0 } }).toArray(),
      db.collection("qualityLimits").find({ plant_id: id }, { projection: { _id: 0 } }).sort({ effective_from: -1 }).toArray(),
      db.collection("contractedCapacity").find({ plant_id: id }, { projection: { _id: 0 } })
        .sort({ effective_from: -1 }).toArray(),
      db.collection("users").find({}, { projection: { _id: 1, id: 1, name: 1, email: 1 } }).toArray(),
    ]);

  const maintenanceRecords = maintenanceRecordRows.map(({ _id, ...row }) => ({
    id: String(_id),
    ...row,
  }));

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

export async function updateMaintenanceDesktopApproval(recordId, status) {
  if (!["approved", "rejected"].includes(status)) {
    const err = new Error("Desktop approval status must be approved or rejected");
    err.statusCode = 400;
    throw err;
  }

  const db = await getDb();
  const now = new Date().toISOString();
  const filter = ObjectId.isValid(recordId) ? { _id: new ObjectId(recordId) } : { id: recordId };
  const result = await db.collection("maintenanceRecords").findOneAndUpdate(
    filter,
    {
      $set: {
        desktop_approval_status: status,
        desktop_approved_at: now,
        updated_at: now,
      },
    },
    { returnDocument: "after" },
  );

  if (!result) {
    const err = new Error("Maintenance record not found");
    err.statusCode = 404;
    throw err;
  }

  const { _id, ...row } = result;
  return { id: String(_id), ...row };
}

function asIso(value) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? String(value) : parsed.toISOString();
}

function outageEventTime(row) {
  return [
    asIso(row.submitted_at),
    asIso(row.submittedAt),
    asIso(row.created_at),
    asIso(row.createdAt),
    asIso(row.updated_at),
    asIso(row.updatedAt),
    row._id?.getTimestamp?.()?.toISOString(),
  ].filter(Boolean).sort().at(-1) || null;
}

function newerThan(field, sinceDate) {
  return [
    { [field]: { $gt: sinceDate.toISOString() } },
    { [field]: { $gt: sinceDate } },
  ];
}

export async function listRecentOutages({ since, limit = 10 } = {}) {
  const db = await getDb();
  const parsedLimit = Math.min(Math.max(Number(limit) || 10, 1), 50);
  const sinceDate = since ? new Date(since) : null;
  const hasSince = sinceDate && !Number.isNaN(sinceDate.getTime());

  const query = hasSince
    ? {
        $or: [
          ...newerThan("submitted_at", sinceDate),
          ...newerThan("submittedAt", sinceDate),
          ...newerThan("created_at", sinceDate),
          ...newerThan("createdAt", sinceDate),
          ...newerThan("updated_at", sinceDate),
          ...newerThan("updatedAt", sinceDate),
          { _id: { $gt: ObjectId.createFromTime(Math.floor(sinceDate.getTime() / 1000)) } },
        ],
      }
    : {};

  const rows = await db.collection("outages")
    .find(query)
    .sort({ _id: -1 })
    .limit(parsedLimit)
    .toArray();

  const plantIds = [...new Set(rows.map((r) => r.plant_id).filter(Boolean))];
  const plants = plantIds.length
    ? await db.collection("plants").find({ id: { $in: plantIds } }, { projection: { _id: 0, id: 1, name: 1 } }).toArray()
    : [];
  const plantNameById = new Map(plants.map((p) => [p.id, p.name]));

  return rows
    .map(({ _id, ...row }) => ({
      id: String(_id),
      plantId: row.plant_id,
      plantName: plantNameById.get(row.plant_id) || row.plant_id || "Unknown plant",
      failureType: row.failure_type || row.failureType || row.outage_type || row.outageType || "Outage",
      scope: row.outage_scope || row.scope || null,
      description: row.description || null,
      start: asIso(row.start_datetime) || asIso(row.startDate),
      submittedAt: asIso(row.submitted_at) || asIso(row.submittedAt) || asIso(row.created_at) || asIso(row.createdAt),
      eventTime: outageEventTime({ _id, ...row }),
    }))
    .filter((row) => !hasSince || !row.eventTime || row.eventTime > sinceDate.toISOString())
    .sort((a, b) => (b.eventTime || "").localeCompare(a.eventTime || ""));
}
