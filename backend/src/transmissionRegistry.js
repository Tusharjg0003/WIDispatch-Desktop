import { getDb } from "./db.js";

const SYSTEMS_COLLECTION = "transmissionSystems";
const LINES_COLLECTION = "transmissionLines";
const NETWORKS_COLLECTION = "networks";

const SYSTEM_PROJECTION = { _id: 0, id: 1, name: 1 };
const LINE_PROJECTION = {
  _id: 0,
  id: 1,
  name: 1,
  systemId: 1,
  transmissionSystemId: 1,
  parentSystemId: 1,
  system_id: 1,
  transmission_system_id: 1,
  isBranch: 1,
  parentLineId: 1,
  branchName: 1,
};

function requireName(name) {
  if (!name || !String(name).trim()) {
    const err = new Error("Name is required");
    err.statusCode = 400;
    throw err;
  }
}

function notFound(message) {
  const err = new Error(message);
  err.statusCode = 404;
  return err;
}

const asArray = (value) => (Array.isArray(value) ? value : []);

function removeLineFromEdge(edge, lineId) {
  const data = edge?.data || edge;
  const meta = data?.meta || {};
  const specs = meta.specifications || {};
  if (!Array.isArray(specs.lineGroupIds) || !specs.lineGroupIds.includes(lineId)) {
    return { edge, changed: false };
  }

  const nextIds = specs.lineGroupIds.filter((id) => id !== lineId);
  const nextSpecs = { ...specs };
  if (nextIds.length) nextSpecs.lineGroupIds = nextIds;
  else delete nextSpecs.lineGroupIds;

  if (edge?.data) {
    return {
      edge: {
        ...edge,
        data: {
          ...data,
          meta: {
            ...meta,
            specifications: nextSpecs,
          },
        },
      },
      changed: true,
    };
  }

  return {
    edge: {
      ...edge,
      meta: {
        ...meta,
        specifications: nextSpecs,
      },
    },
    changed: true,
  };
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
    systemId: body.systemId || null,
    isBranch: !!body.isBranch,
    parentLineId: body.parentLineId || null,
    branchName: body.branchName || null,
    created_at: new Date().toISOString(),
  };
  await db.collection(LINES_COLLECTION).insertOne(doc);
  const { created_at, _id, ...line } = doc;
  return line;
}

export async function deleteTransmissionLine(id) {
  const db = await getDb();
  const line = await db
    .collection(LINES_COLLECTION)
    .findOne({ id }, { projection: { _id: 0, id: 1 } });
  if (!line) throw notFound("Transmission line not found");

  await db
    .collection(LINES_COLLECTION)
    .updateMany({ parentLineId: id }, { $set: { parentLineId: null } });

  const networks = await db
    .collection(NETWORKS_COLLECTION)
    .find({ edges: { $exists: true } }, { projection: { _id: 0, id: 1, edges: 1 } })
    .toArray();

  let scrubbedNetworks = 0;
  let scrubbedPipes = 0;
  for (const network of networks) {
    let changed = false;
    const edges = asArray(network.edges).map((edge) => {
      const result = removeLineFromEdge(edge, id);
      if (result.changed) {
        changed = true;
        scrubbedPipes += 1;
      }
      return result.edge;
    });

    if (changed) {
      scrubbedNetworks += 1;
      await db.collection(NETWORKS_COLLECTION).updateOne(
        { id: network.id },
        { $set: { edges, updatedAt: new Date().toISOString() } }
      );
    }
  }

  const deleted = await db.collection(LINES_COLLECTION).deleteOne({ id });
  if (deleted.deletedCount === 0) throw notFound("Transmission line not found");

  return { deleted: true, scrubbedNetworks, scrubbedPipes };
}
