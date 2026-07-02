import { getDb } from "./db.js";

// Persisted network-builder graphs. Each document is a saved canvas: a set of
// placed asset nodes (with positions + a metadata snapshot) and the pipes/edges
// the user drew between them. Stored normalized (not raw cytoscape json) so it
// stays readable server-side and stable across cytoscape versions.
const COLLECTION = "networks";

// Body fields kept verbatim on create/update. `nodes`/`edges` are handled
// separately so we can normalize/default them.
const META_FIELDS = ["name", "description"];

const LIST_PROJECTION = {
  _id: 0,
  id: 1,
  name: 1,
  description: 1,
  nodes: 1,
  edges: 1,
  createdAt: 1,
  updatedAt: 1,
};

const DETAIL_PROJECTION = { _id: 0 };

function badRequest(message) {
  const err = new Error(message);
  err.statusCode = 400;
  return err;
}

function notFound(message) {
  const err = new Error(message);
  err.statusCode = 404;
  return err;
}

const asArray = (v) => (Array.isArray(v) ? v : []);

// Lightweight list for the "Load" picker: name/description + counts only,
// never the full node/edge bodies.
export async function listNetworks() {
  const db = await getDb();
  const rows = await db
    .collection(COLLECTION)
    .find({}, { projection: LIST_PROJECTION })
    .sort({ updatedAt: -1 })
    .toArray();

  const networks = rows.map((r) => ({
    id: r.id,
    name: r.name,
    description: r.description || "",
    nodeCount: asArray(r.nodes).length,
    edgeCount: asArray(r.edges).length,
    updatedAt: r.updatedAt,
  }));

  return { networks, total: networks.length };
}

export async function getNetwork(id) {
  const db = await getDb();
  const doc = await db
    .collection(COLLECTION)
    .findOne({ id }, { projection: DETAIL_PROJECTION });
  if (!doc) throw notFound("Network not found");
  return doc;
}

export async function createNetwork(body = {}) {
  if (!body.name || !String(body.name).trim()) {
    throw badRequest("Network name is required");
  }

  const db = await getDb();
  const now = new Date().toISOString();

  const doc = {
    id: `net_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    name: String(body.name).trim(),
    description: body.description ? String(body.description) : "",
    nodes: asArray(body.nodes),
    edges: asArray(body.edges),
    createdAt: now,
    updatedAt: now,
  };

  await db.collection(COLLECTION).insertOne(doc);
  const { _id, ...clean } = doc;
  return clean;
}

export async function updateNetwork(id, body = {}) {
  const db = await getDb();

  const set = { updatedAt: new Date().toISOString() };
  for (const f of META_FIELDS) {
    if (body[f] != null) set[f] = f === "name" ? String(body[f]).trim() : String(body[f]);
  }
  if (set.name != null && !set.name) throw badRequest("Network name cannot be empty");
  if (Array.isArray(body.nodes)) set.nodes = body.nodes;
  if (Array.isArray(body.edges)) set.edges = body.edges;

  const result = await db
    .collection(COLLECTION)
    .findOneAndUpdate(
      { id },
      { $set: set },
      { returnDocument: "after", projection: DETAIL_PROJECTION }
    );

  // Driver v6 returns the doc directly; older shapes wrap it in `.value`.
  const doc = result && (result.value !== undefined ? result.value : result);
  if (!doc || !doc.id) throw notFound("Network not found");
  return doc;
}
