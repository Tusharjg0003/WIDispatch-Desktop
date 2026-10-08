// Node symbols for the canvas.
//
// An asset is drawn as a 44px map symbol, not a card: a white node body, a
// generated SVG background carrying a tinted disc and the entity glyph, a
// status-coloured border, and the label underneath. Cytoscape draws the body,
// border and label from the stylesheet; this file supplies the two data fields
// those rules read — `cardIcon` (the symbol) and `cardStatusColor` (the border).

import { ENTITY_TYPE_COLORS } from "./buildCyStyle.js";

export const SYMBOL_SIZE = 44;

// Node types drawn as symbols. Junctions are a plain dot, and notes and group
// boxes are annotations with their own geometry.
export const SYMBOL_TYPES = new Set([
  "plant",
  "pump",
  "tank",
  "handover_point",
  "stp",
  "filling_station",
]);

// The border reports lifecycle, independently of the type colour inside.
const STATUS_BORDER = {
  planned: "#3b82f6",
  under_construction: "#f59e0b",
  "under-construction": "#f59e0b",
  maintenance: "#f59e0b",
  operational: "#6fa300",
  "in-operation": "#6fa300",
  decommissioned: "#ef4444",
  inactive: "#d1d5db",
};

const DEFAULT_BORDER = "#94a3b8";

export const statusBorderColor = (status) => STATUS_BORDER[status] || DEFAULT_BORDER;

// Symbol shape (View → Symbol), as SWIIMS setEntitySymbolShape: circle or
// rounded box, remembered per browser.
export const SYMBOL_SHAPE_STORAGE_KEY = "widispatch_canvas_symbol_shape";
const readStoredShape = () => {
  try {
    return globalThis.localStorage?.getItem(SYMBOL_SHAPE_STORAGE_KEY) === "box" ? "box" : "circle";
  } catch {
    return "circle";
  }
};
let currentSymbolShape = readStoredShape();

export const getEntitySymbolShape = () => currentSymbolShape;

export function setEntitySymbolShape(shape) {
  currentSymbolShape = shape === "box" ? "box" : "circle";
  try {
    globalThis.localStorage?.setItem(SYMBOL_SHAPE_STORAGE_KEY, currentSymbolShape);
  } catch {
    // Storage unavailable: the shape still applies for this session.
  }
  return currentSymbolShape;
}

// Glyphs: the same lucide icons the side panels, toolbar and legend use for
// each type (Factory, Droplets, Cylinder, MapPinned, Fuel), copied from
// lucide-react so a type looks identical everywhere. Drawn in a 24×24 box.
const FACTORY =
  '<path d="M12 16h.01"/><path d="M16 16h.01"/><path d="M3 19a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8.5a.5.5 0 0 0-.769-.422l-4.462 2.844A.5.5 0 0 1 15 10.5v-2a.5.5 0 0 0-.769-.422L9.77 10.922A.5.5 0 0 1 9 10.5V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2z"/><path d="M8 16h.01"/>';
const GLYPH = {
  plant: FACTORY,
  stp: FACTORY,
  pump:
    '<path d="M7 16.3c2.2 0 4-1.83 4-4.05 0-1.16-.57-2.26-1.71-3.19S7.29 6.75 7 5.3c-.29 1.45-1.14 2.84-2.29 3.76S3 11.1 3 12.25c0 2.22 1.8 4.05 4 4.05z"/><path d="M12.56 6.6A10.97 10.97 0 0 0 14 3.02c.5 2.5 2 4.9 4 6.5s3 3.5 3 5.5a6.98 6.98 0 0 1-11.91 4.97"/>',
  tank: '<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14a9 3 0 0 0 18 0V5"/>',
  handover_point:
    '<path d="M18 8c0 3.613-3.869 7.429-5.393 8.795a1 1 0 0 1-1.214 0C9.87 15.429 6 11.613 6 8a6 6 0 0 1 12 0"/><circle cx="12" cy="8" r="2"/><path d="M8.714 14h-3.71a1 1 0 0 0-.948.683l-2.004 6A1 1 0 0 0 3 22h18a1 1 0 0 0 .948-1.316l-2-6a1 1 0 0 0-.949-.684h-3.712"/>',
  filling_station:
    '<path d="M14 13h2a2 2 0 0 1 2 2v2a2 2 0 0 0 4 0v-6.998a2 2 0 0 0-.59-1.42L18 5"/><path d="M14 21V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v16"/><path d="M2 21h13"/><path d="M3 9h11"/>',
};

const DEFAULT_GLYPH = '<rect x="5" y="5" width="14" height="14" rx="3"/>';

const escapeSvg = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const svgDataUri = (svg) =>
  `data:image/svg+xml;utf8,${encodeURIComponent(svg.replace(/\s+/g, " ").trim())}`;

/**
 * The symbol drawn behind an entity node: a type-tinted disc (or rounded
 * square), the entity glyph in the same colour, and an amber dot for assets
 * whose capacity is limited.
 */
export function makeEntitySymbol({ type, typeColor, hasCapacityLimit = false, symbolShape = "circle" } = {}) {
  const size = SYMBOL_SIZE;
  const c = size / 2;
  const color = escapeSvg(typeColor || ENTITY_TYPE_COLORS[type] || "#6b7280");
  const glyph = GLYPH[type] || DEFAULT_GLYPH;

  const tint =
    symbolShape === "box"
      ? `<rect x="3" y="3" width="${size - 6}" height="${size - 6}" rx="9" ry="9" fill="${color}" fill-opacity="0.16" stroke="${color}" stroke-opacity="0.32" stroke-width="1"/>`
      : `<circle cx="${c}" cy="${c}" r="${c - 3}" fill="${color}" fill-opacity="0.16" stroke="${color}" stroke-opacity="0.32" stroke-width="1"/>`;

  // The glyph is authored in a 24×24 box; centre it and scale it to ~22px.
  const body =
    `<g transform="translate(${c} ${c}) scale(0.84) translate(-12 -12)" fill="none" stroke="${color}" ` +
    `stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${glyph}</g>`;

  // Kept inside the disc: the node clips its background to its own shape, so a
  // dot in the very corner of the 44px box is sliced in half.
  const limitDot = hasCapacityLimit
    ? `<circle cx="${size - 11}" cy="11" r="5" fill="#f59e0b" stroke="#ffffff" stroke-width="1.5"/>`
    : "";

  return svgDataUri(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">` +
      `${tint}${body}${limitDot}</svg>`
  );
}

/**
 * Whether an asset's throughput is capped, from whichever spec field its
 * category uses (plants cap by mode, handover points by limitation type).
 */
export function hasCapacityLimit(nodeData) {
  const spec = nodeData?.meta?.specifications || nodeData?.specifications || {};
  const flags = [spec.capacity_limit_mode, spec.capacity_limitation_type, spec.capacityLimitationType];
  return flags.some((flag) => flag && flag !== "none");
}

/**
 * Refresh a node's derived symbol fields. Both are recomputed from persisted
 * data (type, status, specs) rather than stored, and only written when they
 * actually change — the canvas re-runs this on every data change, so an
 * unconditional write would loop.
 */
export function applyEntitySymbol(node) {
  if (!node || !node.length) return;
  const data = node.data();
  const type = data.type || data.category;

  const isSymbol = SYMBOL_TYPES.has(type);
  const symbolShape = isSymbol ? currentSymbolShape : undefined;
  const cardIcon = isSymbol
    ? makeEntitySymbol({
        type,
        typeColor: ENTITY_TYPE_COLORS[type],
        hasCapacityLimit: hasCapacityLimit(data),
        symbolShape,
      })
    : // Junctions and annotations draw no symbol. "none" is a valid
      // background-image, so the base rule's data mapper stays defined.
      "none";
  const cardStatusColor = statusBorderColor(data.status);

  if (data.cardIcon !== cardIcon) node.data("cardIcon", cardIcon);
  if (data.cardStatusColor !== cardStatusColor) node.data("cardStatusColor", cardStatusColor);
  if (isSymbol && data.symbolShape !== symbolShape) node.data("symbolShape", symbolShape);
}
