import { getDb } from "./db.js";
import { finite } from "./assets.js";
import { assertAllowedAssetType, normalizeAllowedAsset } from "./assetTypes.js";

// Maps the singular category used by the UI/API to its MongoDB collection.
//
// `handover_point` resolves to `cityGates` — the same collection the Demand tab
// reads and the dispatch engine resolves canvas gates against. The older
// `handover-points` collection holds only id/name stubs that nothing references;
// sourcing the registry and the Network Builder palette from it meant a gate
// placed on the canvas could never match a demand record.
export const ASSET_CATEGORIES = {
  plant: "plants",
  pump: "pumps",
  handover_point: "cityGates",
  tank: "tanks",
};

const LIST_PROJECTION = {
  _id: 0,
  id: 1, external_id: 1, name: 1, asset_name_ar: 1, entity: 1, entity_type: 1,
  activity: 1, asset_type: 1, region: 1, cluster: 1, governorate: 1, city: 1,
  latitude: 1, longitude: 1, end_latitude: 1, end_longitude: 1, status: 1,
  commissioning_date: 1, decommissioning_date: 1, specifications: 1,
  // City gates carry a top-level `capacity` alongside their specifications.
  capacity: 1,
  active: 1, entity_category: 1,
  // CSV-imported tanks currently keep their source column names in Mongo.
  StorageID: 1, ExternalID: 1, StorageDescriptionEN: 1, StorageDescriptionAR: 1,
  Cluster: 1, Region: 1, Governorate: 1, City: 1, XCoordinate: 1, YCoordinate: 1,
  TransmissionSystemID: 1, TransmissionSystemName: 1, Entity: 1, EntityType: 1,
  OperationalStatus: 1, CommissioningDate: 1, DecommissioningDate: 1,
  StorageMaterial: 1, "TotalCapacity (m3)": 1, NumberTanks: 1, Source: 1,
  IsActive: 1, CreatedDate: 1, ModifiedDate: 1,
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
const NUMERIC_SPEC_PATTERN = /(_capacity|_percentage|_absolute|_tanks|capex|ccr|_om)$/i;

const STATUS_ALIASES = new Map([
  ["inoperation", "operational"],
  ["operational", "operational"],
  ["maintenance", "maintenance"],
  ["underconstruction", "under_construction"],
  ["planned", "planned"],
  ["decommissioned", "decommissioned"],
  ["inactive", "inactive"],
]);

const clean = (value) => (value == null || value === "" || value === "NULL" ? null : value);
const normalizeKey = (value) => String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
const normalizeStatus = (value) => STATUS_ALIASES.get(normalizeKey(value)) || clean(value);

const parseCsvDate = (value) => {
  const v = clean(value);
  if (!v) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0, 10);
  const match = String(v).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return v;
  const [, month, day, year] = match;
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
};

const asBool = (value) => {
  if (value == null || value === "") return null;
  if (typeof value === "boolean") return value;
  return ["1", "true", "yes", "active"].includes(String(value).toLowerCase());
};

const tankCapacity = (doc) => finite(Number(doc["TotalCapacity (m3)"] ?? doc.specifications?.total_capacity_m3 ?? doc.capacity));

function normalizeTankAsset(doc = {}) {
  const specifications = {
    ...(doc.specifications || {}),
    storage_material: clean(doc.StorageMaterial) ?? doc.specifications?.storage_material,
    total_capacity_m3: tankCapacity(doc),
    number_tanks: finite(Number(doc.NumberTanks ?? doc.specifications?.number_tanks)),
    source: clean(doc.Source) ?? doc.specifications?.source,
    transmission_system_id: clean(doc.specifications?.transmission_system_id),
    transmission_system_name: clean(doc.specifications?.transmission_system_name),
  };
  Object.keys(specifications).forEach((key) => {
    if (specifications[key] == null || specifications[key] === "") delete specifications[key];
  });

  const { TransmissionSystemID, TransmissionSystemName, ...safeDoc } = doc;

  return {
    ...safeDoc,
    category: "tank",
    id: clean(doc.id) ?? clean(doc.StorageID),
    external_id: clean(doc.external_id) ?? clean(doc.ExternalID),
    name: clean(doc.name) ?? clean(doc.StorageDescriptionEN),
    asset_name_ar: clean(doc.asset_name_ar) ?? clean(doc.StorageDescriptionAR),
    entity: clean(doc.entity) ?? clean(doc.Entity),
    entity_type: clean(doc.entity_type) ?? clean(doc.EntityType),
    activity: clean(doc.activity) ?? "Water transmission",
    asset_type: clean(doc.asset_type) ?? "Storage tank",
    region: clean(doc.region) ?? clean(doc.Region),
    cluster: clean(doc.cluster) ?? clean(doc.Cluster),
    governorate: clean(doc.governorate) ?? clean(doc.Governorate),
    city: clean(doc.city) ?? clean(doc.City),
    latitude: doc.latitude ?? finite(Number(doc.YCoordinate)),
    longitude: doc.longitude ?? finite(Number(doc.XCoordinate)),
    status: normalizeStatus(doc.status ?? doc.OperationalStatus),
    commissioning_date: clean(doc.commissioning_date) ?? parseCsvDate(doc.CommissioningDate),
    decommissioning_date: clean(doc.decommissioning_date) ?? parseCsvDate(doc.DecommissioningDate),
    capacity: doc.capacity ?? tankCapacity(doc),
    active: doc.active ?? asBool(doc.IsActive),
    created_at: clean(doc.created_at) ?? parseCsvDate(doc.CreatedDate),
    updated_at: clean(doc.updated_at) ?? parseCsvDate(doc.ModifiedDate),
    specifications,
  };
}

function normalizeAssetForCategory(category, doc) {
  const withCategory = category === "tank" ? normalizeTankAsset(doc) : { category, ...doc };
  return normalizeAllowedAsset(withCategory);
}

function buildAssetMatch(category, { status, region, q } = {}) {
  const match = {};
  if (category === "tank") {
    if (status) {
      const rawByStatus = {
        operational: "In Operation",
        under_construction: "Under Construction",
      };
      match.$or = [{ status }, { OperationalStatus: rawByStatus[status] || status }];
    }
    if (region) {
      match.$and = [...(match.$and || []), { $or: [{ region }, { Region: region }] }];
    }
    if (q) {
      match.$and = [
        ...(match.$and || []),
        {
          $or: [
            { name: { $regex: q, $options: "i" } },
            { id: { $regex: q, $options: "i" } },
            { StorageDescriptionEN: { $regex: q, $options: "i" } },
            { StorageID: { $regex: q, $options: "i" } },
          ],
        },
      ];
    }
    return match;
  }

  if (status) match.status = status;
  if (region) match.region = region;
  if (q) {
    match.$or = [
      { name: { $regex: q, $options: "i" } },
      { id: { $regex: q, $options: "i" } },
    ];
  }
  return match;
}

export async function listAssets(filters = {}) {
  const db = await getDb();
  const { category, status, region, q, limit = 300 } = filters;

  const cats = category && ASSET_CATEGORIES[category]
    ? [category]
    : Object.keys(ASSET_CATEGORIES);

  let assets = [];
  for (const cat of cats) {
    const rows = await db
      .collection(ASSET_CATEGORIES[cat])
      .find(buildAssetMatch(cat, { status, region, q }), { projection: LIST_PROJECTION })
      .toArray();
    assets.push(...rows.map((r) => normalizeAssetForCategory(cat, r)).filter(Boolean));
  }
  assets.sort((a, b) => (a.name || a.id || "").localeCompare(b.name || b.id || ""));
  const total = assets.length;
  assets = assets.slice(0, Number(limit));

  // KPI overview across the full registry (unfiltered), including a
  // per-category status breakdown for the registry's KPI cards.
  const kpis = { total: 0, byCategory: {}, operational: 0, statusByCategory: {} };
  for (const [cat, coll] of Object.entries(ASSET_CATEGORIES)) {
    const rows = await db.collection(coll).find({}, { projection: LIST_PROJECTION }).toArray();
    const statuses = {};
    for (const r of rows.map((row) => normalizeAssetForCategory(cat, row)).filter(Boolean)) {
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
    const query = cat === "tank" ? { $or: [{ id }, { StorageID: id }] } : { id };
    const doc = await db.collection(collection).findOne(query, { projection: { _id: 0 } });
    if (doc) return normalizeAssetForCategory(cat, doc);
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
  const existingQuery = category === "tank" ? { $or: [{ id: doc.id }, { StorageID: doc.id }] } : { id: doc.id };
  const existing = await db.collection(collection).findOne(existingQuery);
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
    const query = cat === "tank" ? { $or: [{ id }, { StorageID: id }] } : { id };
    const doc = await db.collection(collection).findOne(query, { projection: { _id: 0, id: 1, StorageID: 1 } });
    if (doc) {
      found = { category: cat, collection, query };
      break;
    }
  }
  if (!found) return null;

  await db.collection(found.collection).updateOne(found.query, { $set: buildAssetUpdate(patch, found.category) });
  const updated = await db.collection(found.collection).findOne(found.query, { projection: { _id: 0 } });
  return normalizeAssetForCategory(found.category, updated);
}

export async function deleteAsset(id) {
  const db = await getDb();
  for (const [cat, collection] of Object.entries(ASSET_CATEGORIES)) {
    const query = cat === "tank" ? { $or: [{ id }, { StorageID: id }] } : { id };
    const result = await db.collection(collection).deleteOne(query);
    if (result.deletedCount > 0) return true;
  }
  return false;
}
