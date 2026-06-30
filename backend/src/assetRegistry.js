import { getDb } from "./db.js";
import { finite } from "./assets.js";

// Maps the singular category used by the UI/API to its MongoDB collection.
export const ASSET_CATEGORIES = {
  plant: "plants",
  pump: "pumps",
  valve: "valves",
  pipeline: "pipelines",
};

const LIST_PROJECTION = {
  _id: 0,
  id: 1, external_id: 1, name: 1, asset_name_ar: 1, entity: 1, entity_type: 1,
  activity: 1, asset_type: 1, region: 1, cluster: 1, governorate: 1, city: 1,
  latitude: 1, longitude: 1, end_latitude: 1, end_longitude: 1, status: 1,
  commissioning_date: 1, decommissioning_date: 1, specifications: 1,
};

const TOP_LEVEL_FIELDS = [
  "external_id", "name", "asset_name_ar", "entity", "entity_type", "activity",
  "asset_type", "region", "cluster", "governorate", "city", "status",
  "commissioning_date", "decommissioning_date",
];

const SPEC_FIELDS = ["technology", "water_source", "design_capacity", "contracted_capacity"];

export async function listAssets(filters = {}) {
  const db = await getDb();
  const { category, status, region, q, limit = 300 } = filters;

  const cats = category && ASSET_CATEGORIES[category]
    ? [category]
    : Object.keys(ASSET_CATEGORIES);

  const match = {};
  if (status) match.status = status;
  if (region) match.region = region;
  if (q) {
    match.$or = [
      { name: { $regex: q, $options: "i" } },
      { id: { $regex: q, $options: "i" } },
    ];
  }

  let assets = [];
  for (const cat of cats) {
    const rows = await db
      .collection(ASSET_CATEGORIES[cat])
      .find(match, { projection: LIST_PROJECTION })
      .toArray();
    assets.push(...rows.map((r) => ({ category: cat, ...r })));
  }
  assets.sort((a, b) => (a.name || a.id || "").localeCompare(b.name || b.id || ""));
  const total = assets.length;
  assets = assets.slice(0, Number(limit));

  // KPI overview across the full registry (unfiltered).
  const kpis = { total: 0, byCategory: {}, operational: 0 };
  for (const [cat, coll] of Object.entries(ASSET_CATEGORIES)) {
    const n = await db.collection(coll).countDocuments();
    kpis.byCategory[cat] = n;
    kpis.total += n;
    kpis.operational += await db.collection(coll).countDocuments({ status: "operational" });
  }

  return { kpis, assets, total, returned: assets.length };
}

export async function createAsset(category, body = {}) {
  const collection = ASSET_CATEGORIES[category];
  if (!collection) {
    const err = new Error(`Unknown asset category: ${category}`);
    err.statusCode = 400;
    throw err;
  }
  if (!body.name || !String(body.name).trim()) {
    const err = new Error("Asset name is required");
    err.statusCode = 400;
    throw err;
  }

  const db = await getDb();
  const now = new Date().toISOString();

  const doc = {};
  for (const f of TOP_LEVEL_FIELDS) {
    if (body[f] != null && body[f] !== "") doc[f] = body[f];
  }
  if (body.latitude != null && body.latitude !== "") doc.latitude = finite(Number(body.latitude));
  if (body.longitude != null && body.longitude !== "") doc.longitude = finite(Number(body.longitude));

  const spec = {};
  const inSpec = body.specifications || body;
  for (const f of SPEC_FIELDS) {
    const v = inSpec[f];
    if (v != null && v !== "") {
      spec[f] = f.includes("capacity") ? finite(Number(v)) : v;
    }
  }
  if (Object.keys(spec).length) doc.specifications = spec;

  doc.id = (body.id && String(body.id).trim()) || `${category}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  doc.status = doc.status || "planned";
  doc.created_at = now;
  doc.updated_at = now;

  // Guard against duplicate ids.
  const existing = await db.collection(collection).findOne({ id: doc.id });
  if (existing) {
    const err = new Error(`An asset with id "${doc.id}" already exists`);
    err.statusCode = 409;
    throw err;
  }

  await db.collection(collection).insertOne(doc);
  return { category, ...doc };
}
