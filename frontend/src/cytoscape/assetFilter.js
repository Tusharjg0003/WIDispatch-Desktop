// Category visibility filter for the canvas.
//
// The right panel lists the categories present on the canvas; clicking one
// hides it. Hiding is a class — `filter-hidden`, which the stylesheet renders
// as display: none — so it is pure view state: nothing is removed, nothing is
// persisted, and clearing the filter brings everything straight back.

// Displayed in this order; a category is only listed when the canvas has one.
export const ASSET_CATEGORIES = [
  { key: "plant", label: "Plants", unit: "m³/day" },
  { key: "tank", label: "Tanks", unit: "m³" },
  { key: "pump", label: "Pump Stations", unit: "m³/day" },
  { key: "pipeline", label: "Pipelines", edge: true, unit: "m³/day" },
  { key: "handover_point", label: "City Gates", unit: "m³/day" },
  { key: "stp", label: "STPs", unit: "m³/day" },
  { key: "filling_station", label: "Filling Stations", unit: "m³/day" },
  { key: "node", label: "Junction Nodes" },
];

export const FILTER_HIDDEN_CLASS = "filter-hidden";

// Every edge is a pipeline as far as the filter is concerned.
export const PIPELINE_KEY = "pipeline";

// Annotations are canvas furniture, not assets — they are never filtered out.
const ANNOTATION_TYPES = new Set(["note", "group-box"]);

const firstNumber = (...values) => {
  for (const value of values) {
    if (value === "" || value == null) continue;
    const numeric = Number(value);
    if (Number.isFinite(numeric)) return numeric;
  }
  return 0;
};

/** Which filter category an element belongs to, or null if it is exempt. */
export const categoryKeyOf = (element) => {
  if (!element) return null;
  if (element.isEdge?.()) return PIPELINE_KEY;
  const type = element.data("type") || element.data("category");
  if (!type || ANNOTATION_TYPES.has(type)) return null;
  return type;
};

/**
 * The headline capacity for one element's data, in its category's unit. Which
 * field carries it depends on where the element came from: pipes keep camelCase
 * fields on the edge itself, placed assets keep the registry's snake_case spec.
 * Contracted wins over design wins over maximum — closest description of
 * throughput first.
 */
export const capacityOf = (data = {}) => {
  const spec = data?.meta?.specifications || data?.specifications || {};
  return firstNumber(
    data?.contractedCapacity,
    data?.capacity,
    data?.designCapacity,
    data?.maximumCapacity,
    spec.contracted_capacity,
    spec.design_capacity,
    spec.maximum_capacity,
    spec.total_capacity_m3
  );
};

/** Display name for a sidebar row. */
export const nameOf = (data = {}, fallbackId = "") =>
  data?.label || data?.name || data?.displayLabel || fallbackId;

/**
 * The canvas as plain records: one per asset node and one per pipe. The sidebar
 * reads these rather than the graph, so counting, charting and sorting never
 * touch Cytoscape.
 */
export const canvasAssets = (cy) => {
  if (!cy) return [];
  const out = [];
  cy.elements().forEach((element) => {
    const category = categoryKeyOf(element);
    if (!category) return;
    out.push({
      id: element.id(),
      category,
      isEdge: !!element.isEdge?.(),
      data: { ...element.data() },
    });
  });
  return out;
};

const yearOf = (value) => {
  if (!value) return null;
  const year = Number(String(value).slice(0, 4));
  return Number.isFinite(year) ? year : null;
};

/** Commissioning / decommissioning years, from whichever field carries them. */
export const lifecycleYears = (data = {}) => {
  const spec = data?.meta?.specifications || data?.specifications || {};
  const meta = data?.meta || {};
  return {
    from: yearOf(data?.commissioningDate ?? meta.commissioning_date ?? spec.commissioning_date),
    to: yearOf(data?.decommissioningDate ?? meta.decommissioning_date ?? spec.decommissioning_date),
  };
};

/**
 * Whether an element counts towards a given year. An asset with no
 * commissioning date on record is treated as already in service — most of the
 * registry carries no dates, and dropping those would chart an empty network.
 */
export const isActiveInYear = (data, year) => {
  const { from, to } = lifecycleYears(data);
  if (from != null && year < from) return false;
  if (to != null && year > to) return false;
  return true;
};

/** Inclusive year list, capped so a typo cannot chart a thousand columns. */
export const horizonYears = (start, end) => {
  // Number("") is 0, so an empty input would otherwise chart from year zero.
  if (start === "" || end === "" || start == null || end == null) return [];
  const from = Number(start);
  const to = Number(end);
  if (!Number.isFinite(from) || !Number.isFinite(to) || to < from) return [];
  const span = Math.min(to - from, 200);
  return Array.from({ length: span + 1 }, (_, index) => from + index);
};

/** One stacked-bar row per year: in-service capacity per category. */
export const capacityByYear = (assets, years) =>
  (years || []).map((year) => {
    const row = { year: String(year) };
    (assets || []).forEach(({ category, data }) => {
      if (!isActiveInYear(data, year)) return;
      row[category] = (row[category] || 0) + capacityOf(data);
    });
    return row;
  });

/** The biggest assets with a capacity on record, largest first. */
export const largestByCapacity = (assets, { hidden, limit = 10 } = {}) => {
  const hiddenKeys = hidden instanceof Set ? hidden : new Set(hidden || []);
  return (assets || [])
    .filter((asset) => !hiddenKeys.has(asset.category) && capacityOf(asset.data) > 0)
    .sort((a, b) => capacityOf(b.data) - capacityOf(a.data))
    .slice(0, limit);
};

/** Count and total capacity per category, for the categories actually present. */
export const summarizeCategories = (assets) => {
  const summary = {};
  (assets || []).forEach(({ category, data }) => {
    const entry = summary[category] || (summary[category] = { count: 0, capacity: 0 });
    entry.count += 1;
    entry.capacity += capacityOf(data);
  });
  return summary;
};

/**
 * Apply the hidden set to the graph.
 *
 * Pipes attached to a hidden asset are hidden too — a pipe running to nothing
 * reads as a broken network rather than a filtered one.
 */
export const applyCategoryFilter = (cy, hiddenKeys) => {
  if (!cy) return;
  const hidden = hiddenKeys instanceof Set ? hiddenKeys : new Set(hiddenKeys || []);

  cy.batch(() => {
    cy.elements().removeClass(FILTER_HIDDEN_CLASS);
    if (hidden.size === 0) return;

    cy.nodes().forEach((node) => {
      const key = categoryKeyOf(node);
      if (key && hidden.has(key)) node.addClass(FILTER_HIDDEN_CLASS);
    });

    if (hidden.has(PIPELINE_KEY)) cy.edges().addClass(FILTER_HIDDEN_CLASS);

    cy.nodes(`.${FILTER_HIDDEN_CLASS}`).connectedEdges().addClass(FILTER_HIDDEN_CLASS);
  });
};

/** Compact capacity for the sidebar: 1.2M, 44k, 900. */
export const formatCapacity = (value) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return "—";
  if (numeric >= 1_000_000) return `${(numeric / 1_000_000).toFixed(numeric >= 10_000_000 ? 0 : 1)}M`;
  if (numeric >= 1_000) return `${(numeric / 1_000).toFixed(numeric >= 10_000 ? 0 : 1)}k`;
  return String(Math.round(numeric));
};
