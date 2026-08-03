export const ASSET_TYPES = {
  SEAWATER_DESALINATION: "Seawater desalination",
  PUMPING_STATION: "Pumping station",
  HANDOVER_POINT_CITY_GATE: "Handover point/city gate",
  WATER_PURIFICATION: "Water purification",
  STORAGE_TANK: "Storage tank",
};

export const ALLOWED_ASSET_TYPES = [
  ASSET_TYPES.SEAWATER_DESALINATION,
  ASSET_TYPES.PUMPING_STATION,
  ASSET_TYPES.HANDOVER_POINT_CITY_GATE,
  ASSET_TYPES.WATER_PURIFICATION,
  ASSET_TYPES.STORAGE_TANK,
];

export const ASSET_TYPES_BY_CATEGORY = {
  plant: [ASSET_TYPES.SEAWATER_DESALINATION, ASSET_TYPES.WATER_PURIFICATION],
  pump: [ASSET_TYPES.PUMPING_STATION],
  handover_point: [ASSET_TYPES.HANDOVER_POINT_CITY_GATE],
  tank: [ASSET_TYPES.STORAGE_TANK],
};

const DEFAULT_ASSET_TYPE_BY_CATEGORY = Object.fromEntries(
  Object.entries(ASSET_TYPES_BY_CATEGORY)
    .filter(([, types]) => types.length === 1)
    .map(([category, types]) => [category, types[0]])
);

const normalizeKey = (value) =>
  String(value || "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "");

const TYPE_ALIASES = new Map(
  [
    [ASSET_TYPES.SEAWATER_DESALINATION, ASSET_TYPES.SEAWATER_DESALINATION],
    ["Seawater Desalination", ASSET_TYPES.SEAWATER_DESALINATION],
    ["seawater_desalination", ASSET_TYPES.SEAWATER_DESALINATION],
    [ASSET_TYPES.PUMPING_STATION, ASSET_TYPES.PUMPING_STATION],
    ["Pump station", ASSET_TYPES.PUMPING_STATION],
    ["Pump Station", ASSET_TYPES.PUMPING_STATION],
    ["Pumping Station", ASSET_TYPES.PUMPING_STATION],
    [ASSET_TYPES.HANDOVER_POINT_CITY_GATE, ASSET_TYPES.HANDOVER_POINT_CITY_GATE],
    ["Handover point / city gate", ASSET_TYPES.HANDOVER_POINT_CITY_GATE],
    ["Handover Point / City Gate", ASSET_TYPES.HANDOVER_POINT_CITY_GATE],
    ["Handover point city gate", ASSET_TYPES.HANDOVER_POINT_CITY_GATE],
    // What the `cityGates` documents actually store.
    ["City Gate", ASSET_TYPES.HANDOVER_POINT_CITY_GATE],
    ["Handover Point", ASSET_TYPES.HANDOVER_POINT_CITY_GATE],
    [ASSET_TYPES.WATER_PURIFICATION, ASSET_TYPES.WATER_PURIFICATION],
    ["Water Purification", ASSET_TYPES.WATER_PURIFICATION],
    ["water_purification", ASSET_TYPES.WATER_PURIFICATION],
    [ASSET_TYPES.STORAGE_TANK, ASSET_TYPES.STORAGE_TANK],
    ["Storage Tank", ASSET_TYPES.STORAGE_TANK],
    ["Tank", ASSET_TYPES.STORAGE_TANK],
    ["Reservoir", ASSET_TYPES.STORAGE_TANK],
    ["storage_tank", ASSET_TYPES.STORAGE_TANK],
  ].map(([from, to]) => [normalizeKey(from), to])
);

export function canonicalizeAssetType(type) {
  return TYPE_ALIASES.get(normalizeKey(type)) || null;
}

export function allowedAssetTypesForCategory(category) {
  return ASSET_TYPES_BY_CATEGORY[category] || ALLOWED_ASSET_TYPES;
}

export function isAllowedAssetType(type, category) {
  const canonical = canonicalizeAssetType(type);
  if (!canonical) return false;
  return allowedAssetTypesForCategory(category).includes(canonical);
}

export function normalizeAllowedAsset(asset) {
  const assetType = canonicalizeAssetType(asset?.asset_type) || DEFAULT_ASSET_TYPE_BY_CATEGORY[asset?.category] || null;
  if (!assetType || !isAllowedAssetType(assetType, asset?.category)) return null;
  return { ...asset, asset_type: assetType };
}

export function filterAllowedAssets(assets) {
  return assets.map(normalizeAllowedAsset).filter(Boolean);
}
