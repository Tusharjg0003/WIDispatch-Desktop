// A network's drawing area (see the frontend's cytoscape/canvasArea.js):
// `width × height` canvas pixels on a `grid`-px grid, and the sheet's
// top-left corner in canvas model px. Stored as given once it checks out;
// anything else is dropped (null).
//
// Areas sent in the older km/m form (`resolution` units per 40 px grid
// square) are converted to the same pixels.

const LEGACY_UNITS = ["km", "m"];
const DEFAULT_GRID = 40;
const MIN_GRID = 5;
const MAX_GRID = 400;

const positive = (value) => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
};

const finite = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

const roundPx = (value) => Math.round(value * 1000) / 1000;

export function sanitizeCanvasArea(raw) {
  if (!raw || typeof raw !== "object") return null;
  let width = positive(raw.width);
  let height = positive(raw.height);
  if (!width || !height) return null;
  let grid = positive(raw.grid);
  if (!grid && LEGACY_UNITS.includes(raw.unit)) {
    const resolution = positive(raw.resolution);
    if (!resolution) return null;
    const k = DEFAULT_GRID / resolution;
    width *= k;
    height *= k;
  }
  return {
    width: roundPx(width),
    height: roundPx(height),
    grid: Math.min(MAX_GRID, Math.max(MIN_GRID, grid || DEFAULT_GRID)),
    origin: { x: finite(raw.origin?.x), y: finite(raw.origin?.y) },
  };
}
