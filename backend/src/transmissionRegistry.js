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

function getLineSystemId(line) {
  return (
    line?.systemId ||
    line?.transmissionSystemId ||
    line?.parentSystemId ||
    line?.system_id ||
    line?.transmission_system_id ||
    ""
  );
}

function getElementData(element) {
  return element?.data || element || {};
}

function getEdgeSpec(edge) {
  return getElementData(edge).meta?.specifications || {};
}

function normalizeBundleNode(node, network) {
  const data = getElementData(node);
  const originalId = data.id || node.id;
  const id = `${network.id}:${originalId}`;
  return {
    ...node,
    data: {
      ...data,
      id,
      originalNodeId: originalId,
      sourceNetworkId: network.id,
      sourceNetworkName: network.name || network.id,
    },
    position: node.position || { x: 0, y: 0 },
  };
}

function normalizeBundleEdge(edge, network) {
  const data = getElementData(edge);
  const originalId = data.id || edge.id;
  return {
    ...edge,
    data: {
      ...data,
      id: `${network.id}:${originalId}`,
      originalEdgeId: originalId,
      source: `${network.id}:${data.source}`,
      target: `${network.id}:${data.target}`,
      sourceNetworkId: network.id,
      sourceNetworkName: network.name || network.id,
    },
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

export async function listTransmissionSystemLibrary() {
  const db = await getDb();
  const [systems, lines, networks] = await Promise.all([
    db.collection(SYSTEMS_COLLECTION).find({}, { projection: SYSTEM_PROJECTION }).sort({ name: 1 }).toArray(),
    db.collection(LINES_COLLECTION).find({}, { projection: LINE_PROJECTION }).toArray(),
    db.collection(NETWORKS_COLLECTION).find({ edges: { $exists: true } }, { projection: { _id: 0, id: 1, nodes: 1, edges: 1 } }).toArray(),
  ]);

  const lineById = new Map(lines.map((line) => [line.id, line]));
  const buckets = new Map(systems.map((system) => [
    system.id,
    {
      ...system,
      nodeIds: new Set(),
      lineIds: new Set(),
      networkIds: new Set(),
      pipeCount: 0,
    },
  ]));

  lines.forEach((line) => {
    const systemId = getLineSystemId(line);
    if (buckets.has(systemId)) buckets.get(systemId).lineIds.add(line.id);
  });

  networks.forEach((network) => {
    asArray(network.edges).forEach((edge) => {
      const data = getElementData(edge);
      const systemId = getEdgeSpec(edge).transmissionSystemId;
      if (!buckets.has(systemId)) return;
      const bucket = buckets.get(systemId);
      bucket.pipeCount += 1;
      bucket.networkIds.add(network.id);
      if (data.source) bucket.nodeIds.add(`${network.id}:${data.source}`);
      if (data.target) bucket.nodeIds.add(`${network.id}:${data.target}`);
      asArray(getEdgeSpec(edge).lineGroupIds).forEach((lineId) => {
        const lineSystem = getLineSystemId(lineById.get(lineId));
        if (!lineSystem || lineSystem === systemId) bucket.lineIds.add(lineId);
      });
    });
  });

  return {
    systems: Array.from(buckets.values()).map(({ nodeIds, lineIds, networkIds, pipeCount, ...system }) => ({
      ...system,
      nodeCount: nodeIds.size,
      lineCount: lineIds.size,
      pipeCount,
      networkCount: networkIds.size,
    })),
  };
}

export async function getTransmissionSystemNetwork(id) {
  const db = await getDb();
  const [system, lines, networks] = await Promise.all([
    db.collection(SYSTEMS_COLLECTION).findOne({ id }, { projection: SYSTEM_PROJECTION }),
    db.collection(LINES_COLLECTION).find({}, { projection: LINE_PROJECTION }).toArray(),
    db.collection(NETWORKS_COLLECTION).find({ edges: { $exists: true } }, { projection: { _id: 0, id: 1, name: 1, nodes: 1, edges: 1 } }).toArray(),
  ]);
  if (!system) throw notFound("Transmission system not found");

  const systemLines = lines.filter((line) => getLineSystemId(line) === id);
  const lineById = new Map(lines.map((line) => [line.id, line]));
  const nodes = [];
  const edges = [];
  const usedNodeKeys = new Set();
  const usedLineIds = new Set(systemLines.map((line) => line.id));
  const networkIds = new Set();

  networks.forEach((network) => {
    const nodeById = new Map(asArray(network.nodes).map((node) => {
      const data = getElementData(node);
      return [data.id || node.id, node];
    }));

    asArray(network.edges).forEach((edge) => {
      const spec = getEdgeSpec(edge);
      if (spec.transmissionSystemId !== id) return;
      const data = getElementData(edge);
      edges.push(normalizeBundleEdge(edge, network));
      networkIds.add(network.id);
      asArray(spec.lineGroupIds).forEach((lineId) => {
        const lineSystem = getLineSystemId(lineById.get(lineId));
        if (!lineSystem || lineSystem === id) usedLineIds.add(lineId);
      });
      [data.source, data.target].filter(Boolean).forEach((nodeId) => {
        const key = `${network.id}:${nodeId}`;
        if (usedNodeKeys.has(key)) return;
        const node = nodeById.get(nodeId);
        if (!node) return;
        usedNodeKeys.add(key);
        nodes.push(normalizeBundleNode(node, network));
      });
    });
  });

  return {
    system,
    nodes,
    edges,
    lines: lines.filter((line) => usedLineIds.has(line.id)),
    networkIds: Array.from(networkIds),
  };
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
  const rawName = body.name || (body.isBranch ? body.branchName : "");
  requireName(rawName);
  const db = await getDb();
  const name = String(rawName).trim();
  const doc = {
    id: `line_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    name,
    systemId: body.systemId || null,
    isBranch: !!body.isBranch,
    parentLineId: body.parentLineId || null,
    branchName: body.isBranch ? String(body.branchName || name).trim() : null,
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
