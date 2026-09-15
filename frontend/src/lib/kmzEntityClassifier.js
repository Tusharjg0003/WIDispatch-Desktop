// Layered classifier that maps a parsed KMZ placemark (see parseNetworkGeoFile
// in ./networkKmz.js) to one of the canvas entity-type keys. A generic KMZ from
// Google Earth / QGIS / a utility GIS export carries no WIDispatch ExtendedData,
// so the type is inferred from every signal the file provides — ExtendedData
// custom fields, the KML folder the feature lives in, the placemark name, and
// the icon/style it renders with — in priority order.
//
// Ported from the reference SWIIMS kmzEntityClassifier.js. The type keys are
// WIDispatch's canvas categories (see buildCyStyle ENTITY_TYPE_COLORS): plant,
// tank, handover_point, node, pump, stp, filling_station.

// Legacy / SWIIMS-spelling → WIDispatch key folding.
const LEGACY_TYPE_MAP = {
  "distribution-point": "handover_point",
  point: "handover_point",
  "filling-station": "filling_station",
  "pump-station": "pump",
  pump_station: "pump",
};

const CANONICAL_KEYS = new Set([
  "plant", "tank", "handover_point", "node", "pump", "stp", "filling_station",
]);

export const normalizeTypeKey = (value) => {
  const key = String(value || "").trim().toLowerCase();
  return LEGACY_TYPE_MAP[key] || key;
};

// Ordered so the most specific / least ambiguous keywords win. 'stp' before
// 'plant' (an STP is a kind of plant), and 'filling_station' before 'handover'.
const KEYWORD_TABLE = [
  { type: "stp", words: ["stp", "sewage", "wastewater", "waste water", "wwtp", "sewerage"] },
  { type: "plant", words: ["plant", "wtp", "iwtp", "treatment", "desal", "desalination", "swro", "reverse osmosis", "ro plant"] },
  { type: "tank", words: ["tank", "reservoir", "gsr", "gst", "storage", "ground reservoir", "elevated reservoir"] },
  { type: "pump", words: ["pump", "pumping", "booster", "lift station", "lift-station"] },
  { type: "filling_station", words: ["filling station", "filling-station", "tanker fill", "water filling", "filling point"] },
  { type: "handover_point", words: ["city gate", "city-gate", "handover", "hand over", "offtake", "off-take", "custody", "delivery point", "delivery"] },
  { type: "node", words: ["node", "junction", "manifold", "valve", "tee", "chamber"] },
];

// Short, ambiguous tokens matched only as whole words, as a lower-confidence pass.
const ABBREVIATION_TABLE = [
  { type: "pump", words: ["ps"] },
  { type: "handover_point", words: ["cg", "hp"] },
  { type: "plant", words: ["pl"] },
  { type: "tank", words: ["tk"] },
];

const matchPhrases = (text) => {
  const haystack = String(text || "").toLowerCase();
  if (!haystack) return null;
  for (const { type, words } of KEYWORD_TABLE) {
    if (words.some((word) => haystack.includes(word))) return type;
  }
  return null;
};

const matchAbbreviations = (text) => {
  const haystack = String(text || "").toLowerCase();
  if (!haystack) return null;
  const tokens = haystack.split(/[^a-z0-9]+/).filter(Boolean);
  for (const { type, words } of ABBREVIATION_TABLE) {
    if (words.some((word) => tokens.includes(word))) return type;
  }
  return null;
};

const fromExtendedType = (value) => {
  const key = normalizeTypeKey(value);
  if (CANONICAL_KEYS.has(key)) return key;
  return matchPhrases(value);
};

/**
 * Classify a parsed KMZ point.
 * @returns {{ type: string, source: string }} canonical type key + which signal won.
 */
export function classifyKmzPoint(point = {}) {
  // 1. WIDispatch round-trip: exact assetType written on export.
  const own = normalizeTypeKey(point.assetType);
  if (CANONICAL_KEYS.has(own)) return { type: own, source: "assetType" };

  // 2. Other ExtendedData type-ish fields.
  for (const field of ["type", "category", "asset_type", "assetType", "kind", "class"]) {
    const hit = fromExtendedType(point[field]);
    if (hit) return { type: hit, source: `data:${field}` };
  }

  // 3. Folder name.
  const folderHit = matchPhrases(point.folder) || matchAbbreviations(point.folder);
  if (folderHit) return { type: folderHit, source: "folder" };

  // 4. Placemark name.
  const nameHit = matchPhrases(point.name) || matchAbbreviations(point.name);
  if (nameHit) return { type: nameHit, source: "name" };

  // 5. Icon / style.
  const iconHit = matchPhrases(point.iconHref) || matchPhrases(point.styleUrl);
  if (iconHit) return { type: iconHit, source: "icon/style" };

  // 6. Fallback.
  return { type: "node", source: "default" };
}

export { KEYWORD_TABLE, ABBREVIATION_TABLE };
