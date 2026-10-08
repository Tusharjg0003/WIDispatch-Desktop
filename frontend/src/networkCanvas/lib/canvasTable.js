// Table view data (SWIIMS NetworkSimulation2Page table view +
// utils/canvasAssetMetrics.js): flat, editable rows for the canvas's assets
// and pipes, an "in service" test for a chosen year, and per-category KPIs.
// Pure: works on plain element data, so it is unit tested.

const ANNOTATIONS = new Set(["note", "group-box"]);

export const ASSET_CATEGORY_LABELS = {
  plant: "Plants",
  pump: "Pump stations",
  tank: "Tanks",
  handover_point: "Handover points",
  filling_station: "Filling stations",
  stp: "Treatment plants",
  node: "Junctions",
};

const yearOf = (value) => {
  if (!value) return null;
  const m = String(value).match(/^(\d{4})/);
  if (m) return Number(m[1]);
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.getFullYear();
};

/** In service during `year`: commissioned on/before it, not decommissioned before it ends. */
export function inServiceInYear(commissioning, decommissioning, year) {
  if (year == null || year === "") return true;
  const y = Number(year);
  const from = yearOf(commissioning);
  const to = yearOf(decommissioning);
  if (from != null && from > y) return false;
  if (to != null && to <= y) return false;
  return true;
}

const num = (v) => (v === "" || v == null || !Number.isFinite(Number(v)) ? null : Number(v));

export function assetCapacity(spec = {}) {
  return num(spec.design_capacity) ?? num(spec.capacity) ?? num(spec.contracted_capacity) ?? num(spec.total_capacity_m3);
}

export function pipeCapacity(spec = {}) {
  return num(spec.capacity) ?? num(spec.designCapacity) ?? num(spec.maximumCapacity);
}

/** nodes/edges: arrays of element data objects (cy.json elements' `data`). */
export function buildAssetRows(nodes = [], year = null) {
  return nodes
    .filter((d) => d && !ANNOTATIONS.has(d.type))
    .map((d) => {
      const meta = d.meta || {};
      const spec = meta.specifications || {};
      return {
        id: d.id,
        name: d.label || "",
        type: d.type || d.category || "",
        status: d.status || "",
        region: meta.region || "",
        capacity: assetCapacity(spec),
        commissioning: (meta.commissioning_date || "").slice(0, 10),
        decommissioning: (meta.decommissioning_date || "").slice(0, 10),
        active: meta.active !== false && !["inactive", "decommissioned"].includes(d.status),
        inService: inServiceInYear(meta.commissioning_date, meta.decommissioning_date, year),
        registry: Boolean(d.assetId),
      };
    });
}

export function buildPipeRows(edges = [], labelById = {}, year = null) {
  return edges.map((d) => {
    const spec = d.meta?.specifications || {};
    return {
      id: d.id,
      name: d.label || "",
      from: labelById[d.source] || d.source,
      to: labelById[d.target] || d.target,
      capacity: pipeCapacity(spec),
      length: num(spec.pipelineLength),
      diameter: num(spec.pipelineDiameter),
      material: spec.pipelineMaterial || "",
      active: d.active !== false && d.status !== "inactive",
      bidirectional: Boolean(spec.bidirectional),
      commissioning: (d.commissioningDate || "").slice(0, 10),
      decommissioning: (d.decommissioningDate || "").slice(0, 10),
      inService: inServiceInYear(d.commissioningDate, d.decommissioningDate, year),
    };
  });
}

/** Per-category count and in-service capacity (SWIIMS summariseByCategory). */
export function summariseByCategory(assetRows = []) {
  const out = {};
  assetRows.forEach((row) => {
    if (row.type === "node") return;
    const entry = out[row.type] || (out[row.type] = { type: row.type, label: ASSET_CATEGORY_LABELS[row.type] || row.type, count: 0, inService: 0, capacity: 0 });
    entry.count += 1;
    if (row.inService && row.active) {
      entry.inService += 1;
      entry.capacity += row.capacity || 0;
    }
  });
  return Object.values(out).sort((a, b) => a.label.localeCompare(b.label));
}

/** Years worth offering in the filter: every commissioning/decommissioning year, plus this year. */
export function yearOptions(rows = [], now = new Date().getFullYear()) {
  const years = new Set([now]);
  rows.forEach((row) => {
    const a = yearOf(row.commissioning);
    const b = yearOf(row.decommissioning);
    if (a) years.add(a);
    if (b) years.add(b);
  });
  return [...years].sort((a, b) => a - b);
}
