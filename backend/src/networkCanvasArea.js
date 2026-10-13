// A network's drawing area (see the frontend's cytoscape/canvasArea.js):
// `width × height` in km or m, `resolution` units per grid square, and the
// sheet's top-left corner in canvas model px. Stored as given once it checks
// out; anything else is dropped (null).

const UNITS = ["km", "m"];

const positive = (value) => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
};

const finite = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

export function sanitizeCanvasArea(raw) {
  if (!raw || typeof raw !== "object") return null;
  const width = positive(raw.width);
  const height = positive(raw.height);
  const resolution = positive(raw.resolution);
  if (!width || !height || !resolution) return null;
  return {
    width,
    height,
    unit: UNITS.includes(raw.unit) ? raw.unit : "km",
    resolution,
    origin: { x: finite(raw.origin?.x), y: finite(raw.origin?.y) },
  };
}
