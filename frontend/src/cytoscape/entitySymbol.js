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
  operational: "#10b981",
  "in-operation": "#10b981",
  decommissioned: "#ef4444",
  inactive: "#d1d5db",
};

const DEFAULT_BORDER = "#94a3b8";

export const statusBorderColor = (status) => STATUS_BORDER[status] || DEFAULT_BORDER;

// lucide glyph interiors, drawn in a 24×24 box and scaled into the symbol.
const GLYPH = {
  plant:
    '<path d="M12 16h.01"/><path d="M16 16h.01"/><path d="M3 19a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8.5a.5.5 0 0 0-.769-.422l-4.462 2.844A.5.5 0 0 1 15 10.5v-2a.5.5 0 0 0-.769-.422L9.77 10.922A.5.5 0 0 1 9 10.5V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2z"/><path d="M8 16h.01"/>',
  pump:
    '<path d="M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z"/>',
  tank:
    '<path d="M5 6c0-1.7 3.1-3 7-3s7 1.3 7 3-3.1 3-7 3-7-1.3-7-3z"/><path d="M5 6v12c0 1.7 3.1 3 7 3s7-1.3 7-3V6"/><path d="M5 12c0 1.7 3.1 3 7 3s7-1.3 7-3"/>',
  handover_point:
    '<path d="m16 3 4 4-4 4"/><path d="M20 7H4"/><path d="m8 21-4-4 4-4"/><path d="M4 17h16"/>',
  stp:
    '<path d="M4 8h16v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z"/><path d="M7 8V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v3"/><path d="M8 13h8"/><path d="M8 17h8"/>',
  filling_station:
    '<path d="M4 21V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v16"/><path d="M4 21h12"/><path d="M7 7h6v5H7z"/><path d="M14 10h3l3 3v6a1.5 1.5 0 0 1-3 0v-4"/>',
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
      ? `<rect x="2" y="2" width="${size - 4}" height="${size - 4}" rx="10" ry="10" fill="${color}" opacity="0.18"/>`
      : `<circle cx="${c}" cy="${c}" r="${c - 2}" fill="${color}" opacity="0.18"/>`;

  // The glyph is authored in a 24×24 box; centre it and scale it to ~22px.
  const body =
    `<g transform="translate(${c} ${c}) scale(0.92) translate(-12 -12)" fill="none" stroke="${color}" ` +
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

  const cardIcon = SYMBOL_TYPES.has(type)
    ? makeEntitySymbol({
        type,
        typeColor: ENTITY_TYPE_COLORS[type],
        hasCapacityLimit: hasCapacityLimit(data),
      })
    : // Junctions and annotations draw no symbol. "none" is a valid
      // background-image, so the base rule's data mapper stays defined.
      "none";
  const cardStatusColor = statusBorderColor(data.status);

  if (data.cardIcon !== cardIcon) node.data("cardIcon", cardIcon);
  if (data.cardStatusColor !== cardStatusColor) node.data("cardStatusColor", cardStatusColor);
}
