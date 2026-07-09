// Builds the left "icon band" of a node card as a data-URI SVG, mimicking the
// NetworkSimulation2Page card style: a status-tinted band with the asset's icon
// (lucide path data, stroked white). Cytoscape draws the rest of the card (white
// body + border) and the label; this only supplies the band via background-image.

// Node types rendered as cards (junctions/notes/group-boxes are not).
export const CARD_TYPES = new Set(["plant", "pump"]);

// Lifecycle band colour by status (falls back to slate when unknown).
const STATUS_BAND = {
  operational: "#10b981",
  "in-operation": "#10b981",
  maintenance: "#f59e0b",
  under_construction: "#3b82f6",
  "under-construction": "#3b82f6",
  planned: "#6366f1",
  decommissioned: "#ef4444",
  inactive: "#94a3b8",
};

// lucide icon inner markup (24×24 viewBox, stroked, no fill).
const ICON = {
  plant:
    '<path d="M12 16h.01"/><path d="M16 16h.01"/><path d="M3 19a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8.5a.5.5 0 0 0-.769-.422l-4.462 2.844A.5.5 0 0 1 15 10.5v-2a.5.5 0 0 0-.769-.422L9.77 10.922A.5.5 0 0 1 9 10.5V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2z"/><path d="M8 16h.01"/>',
  pump:
    '<path d="M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z"/>',
};

const DEFAULT_ICON = '<rect x="4" y="4" width="16" height="16" rx="2"/>';

export function makeCardIcon(type, status) {
  const band = STATUS_BAND[status] || "#64748b";
  const icon = ICON[type] || DEFAULT_ICON;
  const svg =
    `<svg xmlns='http://www.w3.org/2000/svg' width='54' height='54' viewBox='0 0 54 54'>` +
    `<rect width='54' height='54' fill='${band}'/>` +
    `<g transform='translate(15 15)' fill='none' stroke='#ffffff' stroke-width='2' ` +
    `stroke-linecap='round' stroke-linejoin='round'>${icon}</g></svg>`;
  return "data:image/svg+xml;utf8," + encodeURIComponent(svg);
}

// Set/refresh the cardIcon on a node if it's a card type.
export function applyCardIcon(node) {
  const type = node.data("type");
  if (CARD_TYPES.has(type)) {
    node.data("cardIcon", makeCardIcon(type, node.data("status")));
  }
}
