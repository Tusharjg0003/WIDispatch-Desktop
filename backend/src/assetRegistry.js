import { getDb } from "./db.js";
import { finite } from "./assets.js";
import { assertAllowedAssetType, normalizeAllowedAsset } from "./assetTypes.js";

// Maps the singular category used by the UI/API to its MongoDB collection.
export const ASSET_CATEGORIES = {
  plant: "plants",
  pump: "pumps",
  handover_point: "handover-points",
};

const LIST_PROJECTION = {
  _id: 0,
  id: 1, external_id: 1, name: 1, asset_name_ar: 1, entity: 1, entity_type: 1,
  activity: 1, asset_type: 1, region: 1, cluster: 1, governorate: 1, city: 1,
  latitude: 1, longitude: 1, end_latitude: 1, end_longitude: 1, status: 1,
  commissioning_date: 1, decommissioning_date: 1, specifications: 1,
  active: 1, entity_category: 1,
};

const TOP_LEVEL_FIELDS = [
  "external_id", "name", "asset_name_ar", "entity", "entity_type", "activity",
  "asset_type", "region", "cluster", "governorate", "city", "status",
  "commissioning_date", "decommissioning_date", "active", "entity_category",
];

// Specifications vary a lot by category/plant type (production vs. treatment
// plant fields, pump configuration arrays, etc.), so rather than an allowlist
// of scalar fields we store `specifications` mostly as given and only coerce
// keys that are unambiguously numeric by name.
const NUMERIC_SPEC_PATTERN = /(_capacity|_percentage|_absolute|capex|ccr|_om)$/i;

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
    assets.push(...rows.map((r) => normalizeAllowedAsset({ category: cat, ...r })).filter(Boolean));
  }
  assets.sort((a, b) => (a.name || a.id || "").localeCompare(b.name || b.id || ""));
  const total = assets.length;
  assets = assets.slice(0, Number(limit));

  // KPI overview across the full registry (unfiltered), including a
  // per-category status breakdown for the registry's KPI cards.
  const kpis = { total: 0, byCategory: {}, operational: 0, statusByCategory: {} };
  for (const [cat, coll] of Object.entries(ASSET_CATEGORIES)) {
    const rows = await db.collection(coll).find({}, { projection: { _id: 0, asset_type: 1, status: 1 } }).toArray();
    const statuses = {};
    for (const r of rows.map((row) => normalizeAllowedAsset({ category: cat, ...row })).filter(Boolean)) {
      const status = r.status || "unknown";
      statuses[status] = (statuses[status] || 0) + 1;
    }
    const n = Object.values(statuses).reduce((sum, count) => sum + count, 0);
    kpis.byCategory[cat] = n;
    kpis.statusByCategory[cat] = statuses;
    kpis.total += n;
    kpis.operational += statuses.operational || 0;
  }

  return { kpis, assets, total, returned: assets.length };
}

export async function getAssetById(id) {
  const db = await getDb();
  for (const [cat, collection] of Object.entries(ASSET_CATEGORIES)) {
    const doc = await db.collection(collection).findOne({ id }, { projection: { _id: 0 } });
    if (doc) return normalizeAllowedAsset({ category: cat, ...doc });
  }
  return null;
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
  const assetType = assertAllowedAssetType(body.asset_type, category);

  const db = await getDb();
  const now = new Date().toISOString();

  const doc = {};
  for (const f of TOP_LEVEL_FIELDS) {
    if (body[f] != null && body[f] !== "") doc[f] = body[f];
  }
  doc.asset_type = assetType;
  if (body.latitude != null && body.latitude !== "") doc.latitude = finite(Number(body.latitude));
  if (body.longitude != null && body.longitude !== "") doc.longitude = finite(Number(body.longitude));
  if (body.end_latitude != null && body.end_latitude !== "") doc.end_latitude = finite(Number(body.end_latitude));
  if (body.end_longitude != null && body.end_longitude !== "") doc.end_longitude = finite(Number(body.end_longitude));

  const spec = {};
  const inSpec = body.specifications || {};
  for (const [f, v] of Object.entries(inSpec)) {
    if (v == null || v === "") continue;
    spec[f] = NUMERIC_SPEC_PATTERN.test(f) ? finite(Number(v)) : v;
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

// Build the $set payload for an update: only allowed top-level fields present
// in the patch, coerced coordinates and specifications, plus updated_at.
// id and category are immutable, so they are never emitted.
export function buildAssetUpdate(patch = {}, category = null) {
  const update = {};
  for (const f of TOP_LEVEL_FIELDS) {
    if (patch[f] !== undefined) update[f] = patch[f];
  }
  if (patch.asset_type !== undefined) {
    update.asset_type = assertAllowedAssetType(patch.asset_type, category);
  }
  if (patch.latitude !== undefined) {
    update.latitude = patch.latitude === "" || patch.latitude == null ? null : finite(Number(patch.latitude));
  }
  if (patch.longitude !== undefined) {
    update.longitude = patch.longitude === "" || patch.longitude == null ? null : finite(Number(patch.longitude));
  }
  if (patch.end_latitude !== undefined) {
    update.end_latitude = patch.end_latitude === "" || patch.end_latitude == null ? null : finite(Number(patch.end_latitude));
  }
  if (patch.end_longitude !== undefined) {
    update.end_longitude = patch.end_longitude === "" || patch.end_longitude == null ? null : finite(Number(patch.end_longitude));
  }
  if (patch.specifications && typeof patch.specifications === "object") {
    const spec = {};
    for (const [f, v] of Object.entries(patch.specifications)) {
      if (v == null || v === "") continue;
      spec[f] = NUMERIC_SPEC_PATTERN.test(f) ? finite(Number(v)) : v;
    }
    update.specifications = spec;
  }
  update.updated_at = new Date().toISOString();
  return update;
}

export async function updateAsset(id, patch = {}) {
  const db = await getDb();
  let found = null;
  for (const [cat, collection] of Object.entries(ASSET_CATEGORIES)) {
    const doc = await db.collection(collection).findOne({ id }, { projection: { _id: 0, id: 1 } });
    if (doc) {
      found = { category: cat, collection };
      break;
    }
  }
  if (!found) return null;

  await db.collection(found.collection).updateOne({ id }, { $set: buildAssetUpdate(patch, found.category) });
  const updated = await db.collection(found.collection).findOne({ id }, { projection: { _id: 0 } });
  return { category: found.category, ...updated };
}
