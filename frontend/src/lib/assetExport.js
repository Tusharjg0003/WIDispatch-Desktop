// Asset export (Asset Registry, Production, Demand, Economics): the assets that
// pass the user's filters (and, when
// they pick, only the ones they tick), with the columns they choose, as an
// Excel workbook or a PDF table.
//
// The pure parts (columns, filtering, rows, PDF column widths) have no DOM or
// library dependencies so they stay unit-testable (assetExport.test.js); the
// writers load jszip / jsPDF lazily.

import { activeFunctionalPumps, backupPumps, stationPumps, totalDesignCapacity } from "./pumpStation.js";

export const CATEGORY_LABELS = {
  plant: "Plant",
  handover_point: "City gate",
  pump: "Pump station",
  tank: "Tank",
};
export const CATEGORY_PLURALS = {
  plant: "Plants",
  handover_point: "City gates",
  pump: "Pump stations",
  tank: "Tanks",
};
export const CATEGORY_ORDER = ["plant", "handover_point", "pump", "tank"];

const clean = (v) => (v === null || v === undefined || v === "" || v === "NULL" ? null : v);
const spec = (key) => (a) => {
  const v = a.specifications?.[key];
  return Array.isArray(v) || (v && typeof v === "object") ? null : clean(v);
};
const count = (key) => (a) => {
  const v = a.specifications?.[key];
  return Array.isArray(v) ? v.length : null;
};
const num = (v) => {
  const n = Number(v);
  return v === null || v === undefined || v === "" || !Number.isFinite(n) ? null : n;
};

export const statusLabel = (s) =>
  s ? String(s).replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase()) : null;

/**
 * Every exportable column. `group` is the heading it is listed under in the
 * dialog; `categories` limits a detail to the assets that have it (other rows
 * leave it blank); `type` sets alignment and number formatting.
 */
export const ASSET_COLUMNS = [
  { id: "id", label: "Asset ID", group: "General", get: (a) => a.id },
  { id: "external_id", label: "External ID", group: "General", get: (a) => clean(a.external_id) },
  { id: "name", label: "Name", group: "General", get: (a) => clean(a.name) || clean(a.asset_name_ar) },
  { id: "name_ar", label: "Name (Arabic)", group: "General", get: (a) => clean(a.asset_name_ar) },
  { id: "category", label: "Category", group: "General", get: (a) => CATEGORY_LABELS[a.category] || clean(a.category) },
  { id: "asset_type", label: "Asset type", group: "General", get: (a) => clean(a.asset_type) },
  { id: "activity", label: "Activity", group: "General", get: (a) => clean(a.activity) },
  { id: "status", label: "Status", group: "General", get: (a) => statusLabel(a.status) },

  { id: "region", label: "Region", group: "Location", get: (a) => clean(a.region) },
  { id: "cluster", label: "Cluster", group: "Location", get: (a) => clean(a.cluster) },
  { id: "governorate", label: "Governorate", group: "Location", get: (a) => clean(a.governorate) },
  { id: "city", label: "City", group: "Location", get: (a) => clean(a.city) },
  { id: "latitude", label: "Latitude", group: "Location", type: "coord", get: (a) => num(a.latitude) },
  { id: "longitude", label: "Longitude", group: "Location", type: "coord", get: (a) => num(a.longitude) },

  { id: "entity", label: "Entity", group: "Ownership", get: (a) => clean(a.entity) },
  { id: "entity_type", label: "Entity type", group: "Ownership", get: (a) => clean(a.entity_type) },

  { id: "commissioning_date", label: "Commissioning date", group: "Dates", type: "date", get: (a) => clean(a.commissioning_date) },
  { id: "decommissioning_date", label: "Decommissioning date", group: "Dates", type: "date", get: (a) => clean(a.decommissioning_date) },

  // Pump stations: the active duty pumps' capacity, as the Transmission page
  // shows it (the station-level figure is often a stale aggregate).
  { id: "design_capacity", label: "Design capacity (m³/day)", group: "Capacity", type: "number", categories: ["plant", "handover_point", "pump"], get: (a) => (a.category === "pump" ? num(totalDesignCapacity(a.specifications)) : num(spec("design_capacity")(a))) },
  { id: "contracted_capacity", label: "Contracted capacity (m³/day)", group: "Capacity", type: "number", categories: ["plant", "handover_point"], get: (a) => num(spec("contracted_capacity")(a)) },
  { id: "maximum_capacity", label: "Maximum capacity (m³/day)", group: "Capacity", type: "number", categories: ["plant", "handover_point"], get: (a) => num(spec("maximum_capacity")(a)) },
  { id: "capacity_limit", label: "Capacity limit (m³/day)", group: "Capacity", type: "number", categories: ["plant"], get: (a) => num(spec("capacity_limit")(a)) },
  { id: "tank_capacity", label: "Storage capacity (m³)", group: "Capacity", type: "number", categories: ["tank"], get: (a) => num(spec("total_capacity_m3")(a)) },

  { id: "plant_type", label: "Plant type", group: "Plant details", categories: ["plant"], get: spec("plant_type") },
  { id: "plant_category", label: "Plant category", group: "Plant details", categories: ["plant"], get: spec("plant_category") },
  { id: "technology", label: "Technology", group: "Plant details", categories: ["plant"], get: spec("technology") },
  { id: "water_source", label: "Water source", group: "Plant details", categories: ["plant"], get: spec("water_source") },
  { id: "production_system", label: "Production system", group: "Plant details", categories: ["plant"], get: spec("production_system") },
  { id: "variable_om", label: "Variable O&M (per m³)", group: "Plant details", type: "number", categories: ["plant"], get: (a) => num(spec("variable_om")(a)) },
  { id: "maintenance_count", label: "Scheduled maintenance (count)", group: "Plant details", type: "number", categories: ["plant"], get: count("maintenance_schedules") },

  { id: "transmission_system", label: "Transmission system", group: "City gate details", categories: ["handover_point"], get: spec("transmission_system_name") },
  { id: "gate_source", label: "Supply source", group: "City gate details", categories: ["handover_point"], get: spec("source") },

  // Counted the way the Transmission page counts them (lib/pumpStation.js).
  { id: "pumps_total", label: "Pumps", group: "Pump station details", type: "number", categories: ["pump"], get: (a) => stationPumps(a.specifications).length },
  { id: "pumps_active", label: "Active pumps", group: "Pump station details", type: "number", categories: ["pump"], get: (a) => activeFunctionalPumps(a.specifications).length },
  { id: "pumps_standby", label: "Standby pumps", group: "Pump station details", type: "number", categories: ["pump"], get: (a) => backupPumps(a.specifications).length },

  { id: "number_tanks", label: "Number of tanks", group: "Tank details", type: "number", categories: ["tank"], get: (a) => num(spec("number_tanks")(a)) },
  { id: "storage_material", label: "Storage material", group: "Tank details", categories: ["tank"], get: spec("storage_material") },
  { id: "tank_source", label: "Tank source", group: "Tank details", categories: ["tank"], get: spec("source") },
  { id: "initial_level", label: "Initial level (%)", group: "Tank details", type: "number", categories: ["tank"], get: (a) => num(spec("initial_level_pct")(a)) },
  { id: "min_level", label: "Minimum level (%)", group: "Tank details", type: "number", categories: ["tank"], get: (a) => num(spec("min_level_pct")(a)) },
  { id: "max_level", label: "Maximum level (%)", group: "Tank details", type: "number", categories: ["tank"], get: (a) => num(spec("max_level_pct")(a)) },
  { id: "reserve_rule", label: "Reserve rule", group: "Tank details", categories: ["tank"], get: spec("reserve_rule") },
];

// ── Page catalogues ──────────────────────────────────────────────────────────

const COST_SOURCES = { economics: "Economics", plant_spec: "Asset record", missing: "Not set" };

/**
 * Economics: each plant's current approved costs, attached by the page as
 * `asset.cost` ({ variableOm, fixedOm, ccr, capex, source, effectiveFrom }).
 */
export const COST_COLUMNS = [
  { id: "cost_variable_om", label: "Variable O&M (SAR/m³)", group: "Costs", type: "number", get: (a) => num(a.cost?.variableOm) },
  { id: "cost_fixed_om", label: "Fixed O&M (SAR/month)", group: "Costs", type: "number", get: (a) => num(a.cost?.fixedOm) },
  { id: "cost_ccr", label: "CCR (SAR/month)", group: "Costs", type: "number", get: (a) => num(a.cost?.ccr) },
  { id: "cost_capex", label: "CAPEX (SAR)", group: "Costs", type: "number", get: (a) => num(a.cost?.capex) },
  { id: "cost_source", label: "Cost source", group: "Costs", get: (a) => (a.cost ? COST_SOURCES[a.cost.source] || null : null) },
  { id: "cost_effective_from", label: "Costs effective from", group: "Costs", type: "date", get: (a) => clean(a.cost?.effectiveFrom) },
];

/** Production / Economics: plants only. Demand: city gates only. */
const onlyFor = (category) => (c) => !c.categories || c.categories.includes(category);
export const PLANT_COLUMNS = ASSET_COLUMNS.filter(onlyFor("plant"));
export const ECONOMICS_COLUMNS = [...PLANT_COLUMNS, ...COST_COLUMNS];
export const CITY_GATE_COLUMNS = ASSET_COLUMNS.filter(onlyFor("handover_point"));
export const PUMP_STATION_COLUMNS = ASSET_COLUMNS.filter(onlyFor("pump"));

export const PLANT_PRESETS = {
  essentials: ["id", "external_id", "name", "asset_type", "entity", "region", "status", "contracted_capacity"],
  location: ["id", "name", "region", "cluster", "governorate", "city", "latitude", "longitude"],
  capacity: ["id", "name", "asset_type", "status", "design_capacity", "contracted_capacity", "maximum_capacity", "capacity_limit"],
  all: PLANT_COLUMNS.map((c) => c.id),
};
export const ECONOMICS_PRESETS = {
  costs: ["id", "external_id", "name", "asset_type", "region", "cost_variable_om", "cost_fixed_om", "cost_ccr", "cost_capex", "cost_source"],
  essentials: ["id", "name", "asset_type", "entity", "region", "status", "contracted_capacity", "cost_variable_om"],
  location: PLANT_PRESETS.location,
  all: ECONOMICS_COLUMNS.map((c) => c.id),
};
export const CITY_GATE_PRESETS = {
  essentials: ["id", "external_id", "name", "asset_type", "entity", "region", "status", "contracted_capacity"],
  location: ["id", "name", "region", "cluster", "governorate", "city", "latitude", "longitude"],
  capacity: ["id", "name", "status", "design_capacity", "contracted_capacity", "maximum_capacity", "transmission_system", "gate_source"],
  all: CITY_GATE_COLUMNS.map((c) => c.id),
};

export const PUMP_STATION_PRESETS = {
  essentials: ["id", "external_id", "name", "entity", "region", "status", "commissioning_date", "decommissioning_date", "pumps_active", "pumps_standby", "design_capacity"],
  location: ["id", "name", "region", "cluster", "governorate", "city", "latitude", "longitude"],
  capacity: ["id", "name", "status", "region", "pumps_total", "pumps_active", "pumps_standby", "design_capacity"],
  all: PUMP_STATION_COLUMNS.map((c) => c.id),
};

/**
 * Transmission → Systems. A system isn't a registry asset: the page flattens
 * each one (lines, network pipes, assets on it) into a row of this shape:
 * { id, name, networks: [names], lines, segments, length, plants: [names],
 *   gates, pumps, tanks: [names], junctions }.
 */
const names = (key) => (a) => (a[key]?.length ? a[key].join("; ") : null);
const howMany = (key) => (a) => (Array.isArray(a[key]) ? a[key].length : null);
export const SYSTEM_COLUMNS = [
  { id: "id", label: "System ID", group: "System", get: (a) => a.id },
  { id: "name", label: "Transmission system", group: "System", get: (a) => clean(a.name) },
  { id: "networks", label: "Networks", group: "Network", get: names("networks") },
  { id: "network_count", label: "Networks (count)", group: "Network", type: "number", get: howMany("networks") },
  { id: "lines", label: "Registered lines", group: "Network", type: "number", get: (a) => num(a.lines) },
  { id: "segments", label: "Segments", group: "Network", type: "number", get: (a) => num(a.segments) },
  { id: "length", label: "Length (km)", group: "Network", type: "number", get: (a) => num(a.length) },
  { id: "plant_count", label: "Plants", group: "Assets on the system", type: "number", get: howMany("plants") },
  { id: "gate_count", label: "City gates", group: "Assets on the system", type: "number", get: howMany("gates") },
  { id: "pump_count", label: "Pump stations", group: "Assets on the system", type: "number", get: howMany("pumps") },
  { id: "tank_count", label: "Tanks", group: "Assets on the system", type: "number", get: howMany("tanks") },
  { id: "junction_count", label: "Junctions", group: "Assets on the system", type: "number", get: (a) => num(a.junctions) },
  { id: "plant_names", label: "Plant names", group: "Asset names", get: names("plants") },
  { id: "gate_names", label: "City gate names", group: "Asset names", get: names("gates") },
  { id: "pump_names", label: "Pump station names", group: "Asset names", get: names("pumps") },
  { id: "tank_names", label: "Tank names", group: "Asset names", get: names("tanks") },
];
export const SYSTEM_PRESETS = {
  summary: ["id", "name", "lines", "segments", "length", "plant_count", "gate_count", "pump_count", "tank_count"],
  networks: ["id", "name", "networks", "network_count", "lines", "segments", "length"],
  assets: ["id", "name", "plant_count", "gate_count", "pump_count", "tank_count", "plant_names", "gate_names", "pump_names", "tank_names"],
  all: SYSTEM_COLUMNS.map((c) => c.id),
};

/** By name, then ID. */
export const sortByName = (rows) =>
  [...rows].sort((a, b) => String(a.name || a.id).localeCompare(String(b.name || b.id)));

/** Economics' merit order: cheapest Variable O&M first, unpriced last, then by name. */
export const sortByVariableOm = (assets) =>
  [...assets].sort(
    (a, b) =>
      (a.cost?.variableOm ?? Infinity) - (b.cost?.variableOm ?? Infinity) ||
      String(a.name || a.id).localeCompare(String(b.name || b.id))
  );

const COLUMN_BY_ID = new Map(ASSET_COLUMNS.map((c) => [c.id, c]));
export const columnById = (id) => COLUMN_BY_ID.get(id);

export const COLUMN_GROUPS = [...new Set(ASSET_COLUMNS.map((c) => c.group))];

export const COLUMN_PRESETS = {
  essentials: ["id", "name", "category", "asset_type", "status", "region", "city", "entity"],
  location: ["id", "name", "category", "region", "cluster", "governorate", "city", "latitude", "longitude"],
  capacity: ["id", "name", "category", "status", "region", "design_capacity", "contracted_capacity", "maximum_capacity", "tank_capacity"],
  all: ASSET_COLUMNS.map((c) => c.id),
};

/** Columns in their defined order, ignoring unknown ids. */
export const orderColumns = (ids, catalog = ASSET_COLUMNS) => {
  const wanted = new Set(ids);
  return catalog.filter((c) => wanted.has(c.id));
};

/** The groups of a column catalogue, in order. */
export const columnGroups = (catalog = ASSET_COLUMNS) => [...new Set(catalog.map((c) => c.group))];

/** "Production plants" → "production-plants-2026-10-13" */
export const exportFileName = (title) =>
  `${String(title || "assets").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "assets"}-${fileStamp()}`;

/** Columns that apply to at least one of the given categories (general ones always do). */
export const columnsForCategories = (categories) => {
  const set = new Set(categories);
  return ASSET_COLUMNS.filter((c) => !c.categories || c.categories.some((cat) => set.has(cat)));
};

// ── Filtering ────────────────────────────────────────────────────────────────

export const EMPTY_FILTERS = Object.freeze({
  query: "",
  categories: [],
  statuses: [],
  regions: [],
  entities: [],
  assetTypes: [],
  // Page-defined filters ({ network: ["Tank Demo Network"] }), matched
  // against each record's `tags` ({ network: [...] }).
  tags: {},
});

// `search_text`: anything else a page wants searchable (e.g. network names).
const SEARCH_FIELDS = (a) => [a.name, a.asset_name_ar, a.id, a.external_id, a.asset_type, a.activity, a.region, a.governorate, a.city, a.entity, a.search_text];

/** Assets passing every filter. An empty list means "any". */
export const filterAssets = (assets, filters = EMPTY_FILTERS) => {
  const q = String(filters.query || "").trim().toLowerCase();
  const inList = (list, value) => !list?.length || list.includes(value);
  return assets.filter((a) => {
    if (!inList(filters.categories, a.category)) return false;
    if (!inList(filters.statuses, a.status)) return false;
    if (!inList(filters.regions, clean(a.region))) return false;
    if (!inList(filters.entities, clean(a.entity))) return false;
    if (!inList(filters.assetTypes, clean(a.asset_type))) return false;
    for (const [key, wanted] of Object.entries(filters.tags || {})) {
      if (wanted?.length && !(a.tags?.[key] || []).some((v) => wanted.includes(v))) return false;
    }
    if (!q) return true;
    return SEARCH_FIELDS(a).some((field) => field && String(field).toLowerCase().includes(q));
  });
};

const uniqSorted = (values) => [...new Set(values.filter(Boolean))].sort((x, y) => String(x).localeCompare(String(y)));

/** The values each filter can take, from the records (`tagKeys`: the page's own filters). */
export const filterOptions = (assets, tagKeys = []) => ({
  categories: CATEGORY_ORDER.filter((c) => assets.some((a) => a.category === c)),
  statuses: uniqSorted(assets.map((a) => a.status)),
  regions: uniqSorted(assets.map((a) => clean(a.region))),
  entities: uniqSorted(assets.map((a) => clean(a.entity))),
  assetTypes: uniqSorted(assets.map((a) => clean(a.asset_type))),
  tags: Object.fromEntries(tagKeys.map((key) => [key, uniqSorted(assets.flatMap((a) => a.tags?.[key] || []))])),
});

/** "Category: Plants, Tanks · Status: Operational" — the filters in words (empty when none). */
export const describeFilters = (filters, tagLabels = {}) => {
  const parts = [];
  if (filters.query?.trim()) parts.push(`Search: “${filters.query.trim()}”`);
  if (filters.categories?.length) parts.push(`Category: ${filters.categories.map((c) => CATEGORY_PLURALS[c] || c).join(", ")}`);
  if (filters.statuses?.length) parts.push(`Status: ${filters.statuses.map(statusLabel).join(", ")}`);
  if (filters.regions?.length) parts.push(`Region: ${filters.regions.join(", ")}`);
  if (filters.entities?.length) parts.push(`Entity: ${filters.entities.join(", ")}`);
  if (filters.assetTypes?.length) parts.push(`Asset type: ${filters.assetTypes.join(", ")}`);
  for (const [key, values] of Object.entries(filters.tags || {})) {
    if (values?.length) parts.push(`${tagLabels[key] || key}: ${values.join(", ")}`);
  }
  return parts.join(" · ");
};

// ── Rows ─────────────────────────────────────────────────────────────────────

/** Sort by category (registry order), then name. */
export const sortAssets = (assets) =>
  [...assets].sort((a, b) => {
    const ca = CATEGORY_ORDER.indexOf(a.category);
    const cb = CATEGORY_ORDER.indexOf(b.category);
    if (ca !== cb) return (ca < 0 ? 99 : ca) - (cb < 0 ? 99 : cb);
    return String(a.name || a.id).localeCompare(String(b.name || b.id));
  });

/** One plain value per column, in column order (null when the asset has none). */
export const assetValues = (asset, columns) =>
  columns.map((c) => {
    if (c.categories && !c.categories.includes(asset.category)) return null;
    const v = c.get(asset);
    return v === undefined ? null : v;
  });

/** Rows keyed by column label, for the spreadsheet writer. */
export const assetRows = (assets, columns) =>
  assets.map((a) => {
    const values = assetValues(a, columns);
    return Object.fromEntries(columns.map((c, i) => [c.label, values[i]]));
  });

/** Assets split by category, in registry order: [[category, assets], …]. */
export const groupByCategory = (assets) =>
  CATEGORY_ORDER.map((c) => [c, assets.filter((a) => a.category === c)])
    .concat([["other", assets.filter((a) => !CATEGORY_ORDER.includes(a.category))]])
    .filter(([, list]) => list.length);

/** Per-category counts for a summary — none when everything is one kind of record. */
const categoryCounts = (assets) => {
  const groups = groupByCategory(assets);
  return groups.length > 1 ? groups : [];
};

const fmtNumber = (v, column) => {
  if (v === null || v === undefined) return "";
  if (column.type === "coord") return Number(v).toFixed(5);
  return Number(v).toLocaleString("en-US", { maximumFractionDigits: 2 });
};

/** A value as it reads in the PDF. */
export const displayValue = (v, column) => {
  if (v === null || v === undefined || v === "") return "";
  if (column.type === "number" || column.type === "coord") return fmtNumber(v, column);
  if (column.type === "date") {
    const d = new Date(`${String(v).slice(0, 10)}T00:00:00`);
    if (Number.isNaN(d.getTime())) return String(v);
    return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  }
  return String(v);
};

// ── PDF layout ───────────────────────────────────────────────────────────────

/**
 * Column widths (pt) that fill `available`: each column gets room in
 * proportion to its typical content (header and values), clamped so one long
 * column can't starve the rest; long text wraps inside its cell. When the
 * table must shrink, no column goes below the width of its longest word (up to
 * `wordCap` pt), so short words like city names never break mid-word.
 */
export const pdfColumnWidths = (columns, textRows, available, { charW = 4.6, min = 38, max = 190, wordCap = 84 } = {}) => {
  if (!columns.length) return [];
  const want = [];
  const floor = [];
  columns.forEach((c, i) => {
    const values = textRows.map((r) => String(r[i] ?? ""));
    const lengths = values.map((v) => v.length).sort((x, y) => x - y);
    // The 90th percentile, so a single outlier doesn't widen the column.
    const typical = lengths.length ? lengths[Math.min(lengths.length - 1, Math.floor(lengths.length * 0.9))] : 0;
    const longestWord = Math.max(
      0,
      ...c.label.split(/\s+/).map((w) => w.length),
      ...values.flatMap((v) => v.split(/\s+/).map((w) => w.length))
    );
    floor.push(Math.max(min, Math.min(wordCap, longestWord * charW + 10)));
    want.push(Math.min(max, Math.max(floor[i], typical * charW + 10)));
  });
  const total = want.reduce((s, w) => s + w, 0);
  if (total <= available) {
    // Spread the spare room so the table spans the page.
    return want.map((w) => (w / total) * available);
  }
  // Too wide: shrink in proportion, holding each column at its floor. When
  // even the floors don't fit, every column keeps `min` and the rest of the
  // page goes by how much more than that each one wanted.
  const floorTotal = floor.reduce((s, w) => s + w, 0);
  if (floorTotal >= available) {
    const spare = available - min * columns.length;
    if (spare <= 0) return columns.map(() => available / columns.length);
    const extra = floorTotal - min * columns.length;
    return floor.map((w) => min + (extra > 0 ? ((w - min) / extra) * spare : spare / columns.length));
  }
  let widths = want.map((w) => (w / total) * available);
  for (let pass = 0; pass < columns.length; pass += 1) {
    const low = widths.map((w, i) => w < floor[i] - 1e-9);
    if (!low.some(Boolean)) break;
    const fixed = low.reduce((s, isLow, i) => s + (isLow ? floor[i] : 0), 0);
    const flexTotal = want.reduce((s, w, i) => s + (low[i] ? 0 : w), 0);
    widths = want.map((w, i) => (low[i] ? floor[i] : (w / flexTotal) * (available - fixed)));
  }
  return widths;
};

/** Page format for a table this wide: A4 portrait up to 6 columns, A4 landscape to 11, A3 landscape beyond. */
export const pdfPageFor = (columnCount) => {
  if (columnCount <= 6) return { format: "a4", orientation: "portrait" };
  if (columnCount <= 11) return { format: "a4", orientation: "landscape" };
  return { format: "a3", orientation: "landscape" };
};

// ── Writers ──────────────────────────────────────────────────────────────────

const stampText = () =>
  new Date().toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

const fileStamp = () => new Date().toISOString().slice(0, 10);

/**
 * Excel workbook: the assets (one sheet, or one per category) plus a
 * "Report" sheet saying what was exported and how it was filtered.
 */
export async function exportAssetsXlsx(assets, columnIds, { filters = EMPTY_FILTERS, filtersText, sheetPerCategory = false, picked = false, title = "Asset Registry", noun = "assets", sheetName = "Assets", catalog = ASSET_COLUMNS, sort = sortAssets, filename } = {}) {
  const { exportSheetsToXlsx } = await import("./xlsxWriter.js");
  const columns = orderColumns(columnIds, catalog);
  const sorted = sort(assets);
  const sheets = {};
  if (sheetPerCategory) {
    for (const [category, list] of groupByCategory(sorted)) {
      // Per category, only the details that category has.
      const own = columns.filter((c) => !c.categories || c.categories.includes(category));
      sheets[CATEGORY_PLURALS[category] || "Other"] = assetRows(list, own);
    }
  } else {
    sheets[sheetName] = assetRows(sorted, columns);
  }
  sheets.Report = [
    { Item: "Report", Value: `${title} export` },
    { Item: "Generated", Value: stampText() },
    { Item: noun.charAt(0).toUpperCase() + noun.slice(1), Value: sorted.length },
    ...categoryCounts(sorted).map(([c, list]) => ({ Item: `  ${CATEGORY_PLURALS[c] || "Other"}`, Value: list.length })),
    { Item: "Filters", Value: (filtersText ?? describeFilters(filters)) || "None (all records)" },
    { Item: "Selection", Value: picked ? "Picked by hand" : "Everything matching the filters" },
    { Item: "Columns", Value: columns.map((c) => c.label).join(", ") },
  ];
  await exportSheetsToXlsx(sheets, filename || exportFileName(title), { title });
}

/**
 * PDF table report, branded (SWIIMS · Utility Optimo header and footer, the
 * Wtt font so Arabic names render): what was exported, then a table that
 * repeats its header on every page — one section per category when
 * `groupSections`.
 */
export async function exportAssetsPdf(assets, columnIds, { filters = EMPTY_FILTERS, filtersText, groupSections = false, picked = false, title = "Asset Registry", noun = "assets", catalog = ASSET_COLUMNS, sort = sortAssets, filename } = {}) {
  const [{ jsPDF }, branding] = await Promise.all([import("jspdf"), import("./exportBranding.js")]);
  const { brandPdf, drawPdfFooters, drawPdfHeader, renderPdfTable, PDF_FOOTER_SPACE } = branding;
  const columns = orderColumns(columnIds, catalog);
  const sorted = sort(assets);
  const doc = new jsPDF({ unit: "pt", compress: true, ...pdfPageFor(columns.length) });
  const kit = await brandPdf(doc);
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const marginX = 32;
  const top = 40;
  const bottom = pageH - PDF_FOOTER_SPACE;
  const available = pageW - marginX * 2;
  const NAVY = [0, 48, 87];
  const fontSize = columns.length > 11 ? 7.5 : 8;

  const counts = [
    `${sorted.length} ${sorted.length === 1 ? noun.replace(/s$/, "") : noun}`,
    ...categoryCounts(sorted).map(([c, list]) => `${list.length} ${(CATEGORY_PLURALS[c] || "other").toLowerCase()}`),
  ];
  let y = drawPdfHeader(doc, kit, {
    title,
    marginX,
    lines: [
      `${counts[0]}${counts.length > 1 ? ` (${counts.slice(1).join(", ")})` : ""}`,
      `Filters: ${(filtersText ?? describeFilters(filters)) || `none (all ${noun})`}${picked ? ` · ${noun.charAt(0).toUpperCase()}${noun.slice(1)} picked by hand` : ""}`,
    ],
  });

  const drawTable = (list, cols) => {
    doc.setFont(kit.font, "normal");
    doc.setFontSize(fontSize);
    const rows = list.map((a) => assetValues(a, cols).map((v, i) => displayValue(v, cols[i])));
    const widths = pdfColumnWidths(cols, rows, available, { charW: fontSize * 0.55 });
    y = renderPdfTable(doc, kit, {
      headers: cols.map((c) => c.label),
      rows,
      widths,
      numeric: cols.map((c) => c.type === "number" || c.type === "coord"),
      y,
      marginX,
      top,
      bottom,
      fontSize,
    });
  };

  const section = (label, list, cols) => {
    if (y + 60 > bottom) {
      doc.addPage();
      y = top;
    }
    doc.setFont(kit.font, "bold");
    doc.setFontSize(11);
    doc.setTextColor(...NAVY);
    kit.text(`${label} (${list.length})`, marginX, y + 10);
    y += 18;
    drawTable(list, cols);
    y += 14;
  };

  const note = (text) => {
    doc.setFont(kit.font, "normal");
    doc.setFontSize(11);
    doc.setTextColor(150, 150, 150);
    kit.text(text, marginX, y + 10);
  };

  if (!sorted.length) note(`No ${noun} match these filters.`);
  else if (!columns.length) note("No columns were chosen.");
  else if (groupSections) {
    for (const [category, list] of groupByCategory(sorted)) {
      const own = columns.filter((c) => !c.categories || c.categories.includes(category));
      section(CATEGORY_PLURALS[category] || "Other", list, own);
    }
  } else {
    drawTable(sorted, columns);
  }

  drawPdfFooters(doc, kit, { title, marginX });
  doc.save(`${filename || exportFileName(title)}.pdf`);
}

/** CSV text: a header row of column labels, then one row per asset. */
export const assetsCsv = (assets, columnIds, escapeCell, { catalog = ASSET_COLUMNS, sort = sortAssets } = {}) => {
  const columns = orderColumns(columnIds, catalog);
  // Numbers go out as-is: the formula guard would otherwise quote a negative
  // coordinate ("'-5.2") and spreadsheets would read it as text.
  const cell = (v) => (typeof v === "number" && Number.isFinite(v) ? String(v) : escapeCell(v ?? ""));
  const lines = [columns.map((c) => escapeCell(c.label)).join(",")];
  for (const asset of sort(assets)) lines.push(assetValues(asset, columns).map(cell).join(","));
  return lines.join("\n");
};

export async function exportAssetsCsv(assets, columnIds, { title = "Asset Registry", catalog = ASSET_COLUMNS, sort = sortAssets, filename } = {}) {
  const [{ escapeCell }, { downloadCsv }] = await Promise.all([import("./csvCell.js"), import("./exportCsv.js")]);
  // downloadCsv adds the brand lines and the UTF-8 byte-order mark (Arabic).
  downloadCsv(`${filename || exportFileName(title)}.csv`, assetsCsv(assets, columnIds, escapeCell, { catalog, sort }), { title });
}
