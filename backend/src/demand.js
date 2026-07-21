import { getDb } from "./db.js";
import { ObjectId } from "mongodb";
import { deriveDataStatus } from "./production.js";

const CITY_GATE_PROJECTION = {
  _id: 0,
  id: 1, external_id: 1, name: 1, asset_name_ar: 1, entity: 1, entity_type: 1,
  activity: 1, asset_type: 1, region: 1, cluster: 1, governorate: 1, city: 1,
  latitude: 1, longitude: 1, status: 1, capacity: 1,
  commissioning_date: 1, decommissioning_date: 1, specifications: 1,
};

// Pure: fold demand + quality dates into Map<plant_id, latestIsoDate|null>.
export function foldLatestDates(demandDates, qualDates) {
  const dataMap = new Map();
  for (const r of demandDates) {
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
  return dataMap;
}

export async function listCityGates() {
  const db = await getDb();
  const [cityGates, demandDates, qualDates] = await Promise.all([
    db.collection("cityGates").find({}, { projection: CITY_GATE_PROJECTION }).toArray(),
    db.collection("demandInputs").find({}, { projection: { _id: 0, plant_id: 1, date: 1 } }).toArray(),
    db.collection("qualityRecords").find({}, { projection: { _id: 0, plant_id: 1, sampling_datetime: 1 } }).toArray(),
  ]);
  const dataMap = foldLatestDates(demandDates, qualDates);
  return cityGates.map((g) => deriveDataStatus(g, dataMap));
}

function publicUsersForRecords(userRows, records) {
  const referenced = new Set();
  for (const r of records) {
    if (r.submitted_by) referenced.add(r.submitted_by);
    if (r.approved_by) referenced.add(r.approved_by);
  }
  return userRows
    .filter((u) => referenced.has(u.id) || referenced.has(String(u._id)))
    .map((u) => ({ id: u.id || String(u._id), name: u.name, email: u.email }));
}

export async function getCityGateBundle(id) {
  const db = await getDb();
  const cityGate = await db.collection("cityGates").findOne({ id }, { projection: CITY_GATE_PROJECTION });
  if (!cityGate) {
    const err = new Error("City gate not found");
    err.statusCode = 404;
    throw err;
  }

  const [demandInputs, qualityRecords, maintenanceRecordRows, outages, qualityLimitRows, capacityRows, userRows] =
    await Promise.all([
      db.collection("demandInputs").find({ plant_id: id, submission_status: "approved" }, { projection: { _id: 0 } }).toArray(),
      db.collection("qualityRecords").find({ plant_id: id }, { projection: { _id: 0 } }).toArray(),
      db.collection("maintenanceRecords").find({ plant_id: id }).toArray(),
      db.collection("outages").find({ plant_id: id }, { projection: { _id: 0 } }).toArray(),
      db.collection("qualityLimits").find({ plant_id: id }, { projection: { _id: 0 } }).sort({ effective_from: -1 }).toArray(),
      db.collection("contractedCapacity").find({ plant_id: id }, { projection: { _id: 0 } }).sort({ effective_from: -1 }).toArray(),
      db.collection("users").find({}, { projection: { _id: 1, id: 1, name: 1, email: 1 } }).toArray(),
    ]);

  const maintenanceRecords = maintenanceRecordRows.map(({ _id, ...row }) => ({ id: String(_id), ...row }));

  const qualityLimits = {};
  for (const row of qualityLimitRows) {
    const key = row.parameter;
    if (!key || qualityLimits[key]) continue;
    qualityLimits[key] = { min: row.min ?? undefined, max: row.max ?? undefined };
  }

  const users = publicUsersForRecords(userRows, [...demandInputs, ...maintenanceRecords, ...outages, ...qualityRecords]);

  return { cityGate, demandInputs, qualityRecords, maintenanceRecords, outages, qualityLimits, contractedCapacities: capacityRows, users };
}

// Record the desktop operator's approve/reject decision on a demand record.
// Matches on the record's business `id` (falls back to Mongo `_id`), and
// preserves that `id` in the returned document so the client can reconcile.
export async function updateDemandDesktopApproval(recordId, status) {
  if (!["approved", "rejected"].includes(status)) {
    const err = new Error("Desktop approval status must be approved or rejected");
    err.statusCode = 400;
    throw err;
  }

  const db = await getDb();
  const now = new Date().toISOString();
  const filter = ObjectId.isValid(recordId)
    ? { $or: [{ id: recordId }, { _id: new ObjectId(recordId) }] }
    : { id: recordId };

  const result = await db.collection("demandInputs").findOneAndUpdate(
    filter,
    {
      $set: {
        desktop_approval_status: status,
        desktop_approved_at: now,
        updated_at: now,
      },
    },
    { returnDocument: "after", projection: { _id: 0 } },
  );

  if (!result) {
    const err = new Error("Demand record not found");
    err.statusCode = 404;
    throw err;
  }

  return result;
}
