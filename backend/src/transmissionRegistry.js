import { getDb } from "./db.js";

const SYSTEMS_COLLECTION = "transmissionSystems";
const LINES_COLLECTION = "transmissionLines";

const SYSTEM_PROJECTION = { _id: 0, id: 1, name: 1 };
const LINE_PROJECTION = { _id: 0, id: 1, name: 1, isBranch: 1, parentLineId: 1, branchName: 1 };

function requireName(name) {
  if (!name || !String(name).trim()) {
    const err = new Error("Name is required");
    err.statusCode = 400;
    throw err;
  }
}

export async function listTransmissionSystems() {
  const db = await getDb();
  const systems = await db
    .collection(SYSTEMS_COLLECTION)
    .find({}, { projection: SYSTEM_PROJECTION })
    .sort({ name: 1 })
    .toArray();
  return { systems };
}

export async function createTransmissionSystem(body = {}) {
  requireName(body.name);
  const db = await getDb();
  const doc = {
    id: `system_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    name: String(body.name).trim(),
    created_at: new Date().toISOString(),
  };
  await db.collection(SYSTEMS_COLLECTION).insertOne(doc);
  const { created_at, _id, ...system } = doc;
  return system;
}

export async function listTransmissionLines() {
  const db = await getDb();
  const lines = await db
    .collection(LINES_COLLECTION)
    .find({}, { projection: LINE_PROJECTION })
    .sort({ name: 1 })
    .toArray();
  return { lines };
}

export async function createTransmissionLine(body = {}) {
  requireName(body.name);
  const db = await getDb();
  const doc = {
    id: `line_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    name: String(body.name).trim(),
    isBranch: !!body.isBranch,
    parentLineId: body.parentLineId || null,
    branchName: body.branchName || null,
    created_at: new Date().toISOString(),
  };
  await db.collection(LINES_COLLECTION).insertOne(doc);
  const { created_at, _id, ...line } = doc;
  return line;
}
