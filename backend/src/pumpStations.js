import { getDb } from "./db.js";

const PUMP_PROJECTION = {
  _id: 0,
  id: 1, external_id: 1, name: 1, asset_name_ar: 1, entity: 1, entity_type: 1,
  activity: 1, asset_type: 1, region: 1, cluster: 1, governorate: 1, city: 1,
  latitude: 1, longitude: 1, status: 1,
  commissioning_date: 1, decommissioning_date: 1, specifications: 1,
};

function publicUsersForRecords(userRows, records) {
  const referencedRefs = new Set();
  for (const record of records) {
    if (record.submitted_by) referencedRefs.add(record.submitted_by);
    if (record.approved_by) referencedRefs.add(record.approved_by);
  }
  return userRows
    .filter((user) => referencedRefs.has(user.id) || referencedRefs.has(String(user._id)))
    .map((user) => ({ id: user.id || String(user._id), name: user.name, email: user.email }));
}

export async function listPumpStations() {
  const db = await getDb();
  return db.collection("pumps").find({}, { projection: PUMP_PROJECTION }).toArray();
}

export async function getPumpStationBundle(id) {
  const db = await getDb();
  const pumpStation = await db.collection("pumps").findOne({ id }, { projection: PUMP_PROJECTION });
  if (!pumpStation) {
    const err = new Error("Pump station not found");
    err.statusCode = 404;
    throw err;
  }

  const [maintenanceRecordRows, outages, userRows] = await Promise.all([
    db.collection("maintenanceRecords").find({ plant_id: id }).toArray(),
    db.collection("outages").find({ plant_id: id }, { projection: { _id: 0 } }).toArray(),
    db.collection("users").find({}, { projection: { _id: 1, id: 1, name: 1, email: 1 } }).toArray(),
  ]);

  const maintenanceRecords = maintenanceRecordRows.map(({ _id, ...row }) => ({
    id: String(_id),
    ...row,
  }));
  const users = publicUsersForRecords(userRows, [...maintenanceRecords, ...outages]);

  return {
    pumpStation,
    maintenanceRecords,
    outages,
    users,
  };
}
