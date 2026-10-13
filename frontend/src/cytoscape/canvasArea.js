// A network's drawing area: a sheet of `width × height` real units (km or m)
// on the canvas, where one grid square (CANVAS_GRID_PITCH model px) stands for
// `resolution` units. It is a soft guide — nothing is clamped to it — and the
// scale is for display only (pipe lengths stay what the user enters).
//
// Dependency-free so it stays unit-testable (see canvasArea.test.js).

import { CANVAS_GRID_PITCH } from "./canvasGeometry.js";

export const AREA_UNITS = ["km", "m"];

export const DEFAULT_CANVAS_AREA = Object.freeze({
  width: 100,
  height: 70,
  unit: "km",
  resolution: 1,
  origin: Object.freeze({ x: 0, y: 0 }),
});

// Room left around a drawing when an area is fitted to it.
const FIT_MARGIN = 0.1;

const positive = (value) => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
};

const finite = (value, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

/** A valid area, or null when `raw` isn't one (e.g. a network saved before areas existed). */
export const normalizeCanvasArea = (raw) => {
  if (!raw || typeof raw !== "object") return null;
  const width = positive(raw.width);
  const height = positive(raw.height);
  const resolution = positive(raw.resolution);
  if (!width || !height || !resolution) return null;
  return {
    width,
    height,
    unit: AREA_UNITS.includes(raw.unit) ? raw.unit : "km",
    resolution,
    origin: { x: finite(raw.origin?.x), y: finite(raw.origin?.y) },
  };
};

/** Model px per real unit. */
export const pxPerUnit = (area) => CANVAS_GRID_PITCH / area.resolution;

/** The sheet in model px: { x1, y1, x2, y2, w, h }. */
export const areaRectPx = (area) => {
  const k = pxPerUnit(area);
  const w = area.width * k;
  const h = area.height * k;
  const { x, y } = area.origin;
  return { x1: x, y1: y, x2: x + w, y2: y + h, w, h };
};

const isBox = (bb) =>
  bb && [bb.x1, bb.y1, bb.x2, bb.y2].every(Number.isFinite) && bb.x2 >= bb.x1 && bb.y2 >= bb.y1;

/**
 * An area around a drawing's bounding box (model px), with a margin, a whole
 * number of grid squares wide/high and its corner on the grid. With no drawing
 * it is the default sheet.
 */
export const fitAreaToBounds = (bb, { unit = DEFAULT_CANVAS_AREA.unit, resolution = DEFAULT_CANVAS_AREA.resolution } = {}) => {
  if (!isBox(bb)) {
    return { ...DEFAULT_CANVAS_AREA, unit, resolution, origin: { ...DEFAULT_CANVAS_AREA.origin } };
  }
  const pitch = CANVAS_GRID_PITCH;
  const marginX = Math.max(pitch, (bb.x2 - bb.x1) * FIT_MARGIN);
  const marginY = Math.max(pitch, (bb.y2 - bb.y1) * FIT_MARGIN);
  const x1 = Math.floor((bb.x1 - marginX) / pitch) * pitch;
  const y1 = Math.floor((bb.y1 - marginY) / pitch) * pitch;
  const cellsX = Math.max(1, Math.ceil((bb.x2 + marginX - x1) / pitch));
  const cellsY = Math.max(1, Math.ceil((bb.y2 + marginY - y1) / pitch));
  return {
    width: roundUnits(cellsX * resolution),
    height: roundUnits(cellsY * resolution),
    unit,
    resolution,
    origin: { x: x1, y: y1 },
  };
};

// Keep floating-point dust (0.1 * 3) out of the stored sizes.
const roundUnits = (value) => Math.round(value * 1e6) / 1e6;

/**
 * Re-anchor a resized area. The scale is unchanged; `anchor` says which point
 * stays put: "top-left" (grow right/down) or "center" (grow on every side).
 */
export const resizeArea = (area, { width, height, unit, resolution }, anchor = "top-left") => {
  const next = {
    width,
    height,
    unit: unit ?? area.unit,
    resolution: resolution ?? area.resolution,
    origin: { ...area.origin },
  };
  if (anchor === "center") {
    const before = areaRectPx(area);
    const after = areaRectPx(next);
    next.origin = {
      x: before.x1 + (before.w - after.w) / 2,
      y: before.y1 + (before.h - after.h) / 2,
    };
  }
  return next;
};

/**
 * Does `area` still hold the drawing? Returns null when it does, otherwise the
 * smallest width/height (in the area's units, rounded up to grid squares) that
 * would hold it from the same corner.
 */
export const shortfallForBounds = (area, bb) => {
  if (!isBox(bb)) return null;
  const rect = areaRectPx(area);
  if (bb.x1 >= rect.x1 && bb.y1 >= rect.y1 && bb.x2 <= rect.x2 && bb.y2 <= rect.y2) return null;
  const k = pxPerUnit(area);
  const step = area.resolution;
  const need = (px) => Math.max(step, Math.ceil(px / k / step) * step);
  return {
    width: roundUnits(need(Math.max(rect.w, bb.x2 - rect.x1))),
    height: roundUnits(need(Math.max(rect.h, bb.y2 - rect.y1))),
    // The drawing sticks out on the top/left; growing won't help, moving will.
    startsBefore: bb.x1 < rect.x1 || bb.y1 < rect.y1,
  };
};

/** Ids of the positioned items whose point lies outside the sheet. */
export const idsOutside = (rect, items) =>
  items
    .filter(({ x, y }) => Number.isFinite(x) && Number.isFinite(y) && (x < rect.x1 || x > rect.x2 || y < rect.y1 || y > rect.y2))
    .map((item) => item.id);

/** A real distance as text: "250 m", "1.5 km", "12 km". */
export const formatDistance = (value, unit) => {
  const metres = unit === "km" ? value * 1000 : value;
  if (metres >= 1000) {
    const km = metres / 1000;
    return `${Number.isInteger(km) ? km : Number(km.toPrecision(3))} km`;
  }
  return `${Number.isInteger(metres) ? metres : Number(metres.toPrecision(3))} m`;
};

/**
 * A scale bar no longer than `maxScreenPx`: the longest 1/2/5 × 10ⁿ distance
 * that fits. `unitsPerScreenPx` is in the area's unit.
 */
export const niceScaleBar = (unitsPerScreenPx, unit, maxScreenPx = 120) => {
  if (!Number.isFinite(unitsPerScreenPx) || unitsPerScreenPx <= 0) return null;
  const metresPerPx = unit === "km" ? unitsPerScreenPx * 1000 : unitsPerScreenPx;
  const maxMetres = metresPerPx * maxScreenPx;
  const pow = 10 ** Math.floor(Math.log10(maxMetres));
  const step = [5, 2, 1].map((m) => m * pow).find((s) => s <= maxMetres) ?? pow;
  return {
    px: step / metresPerPx,
    label: formatDistance(step, "m"),
  };
};

/** "100 × 70 km" */
export const describeArea = (area) => `${area.width} × ${area.height} ${area.unit}`;

// ── Dragging the sheet's edges ───────────────────────────────────────────────

const snapSpan = (raw, min, pitch, free) => {
  const floor = Math.max(min, free ? 1 : pitch);
  if (free) return Math.max(raw, floor);
  let span = Math.round(raw / pitch) * pitch;
  if (span < floor) span = Math.ceil(floor / pitch) * pitch;
  return span;
};

/**
 * The sheet rectangle while a handle is dragged. `handle` names the edges it
 * moves ("n", "e", "se", …); the opposite edges stay put. `point` is the
 * pointer in model px. The size snaps to whole grid squares (unless `free`)
 * and never shrinks past `keep` — the bounds of what is on the sheet.
 */
export const dragSheetRect = (rect, handle, point, { keep = null, free = false, pitch = CANVAS_GRID_PITCH } = {}) => {
  let { x1, y1, x2, y2 } = rect;
  if (handle.includes("e")) {
    const min = keep ? keep.x2 - x1 : 0;
    x2 = x1 + snapSpan(point.x - x1, min, pitch, free);
  } else if (handle.includes("w")) {
    const min = keep ? x2 - keep.x1 : 0;
    x1 = x2 - snapSpan(x2 - point.x, min, pitch, free);
  }
  if (handle.includes("s")) {
    const min = keep ? keep.y2 - y1 : 0;
    y2 = y1 + snapSpan(point.y - y1, min, pitch, free);
  } else if (handle.includes("n")) {
    const min = keep ? y2 - keep.y1 : 0;
    y1 = y2 - snapSpan(y2 - point.y, min, pitch, free);
  }
  return { x1, y1, x2, y2, w: x2 - x1, h: y2 - y1 };
};

/** The area a dragged rectangle describes (same unit and scale). */
export const areaFromRect = (area, rect) => {
  const k = pxPerUnit(area);
  return {
    ...area,
    width: roundUnits(rect.w / k),
    height: roundUnits(rect.h / k),
    origin: { x: rect.x1, y: rect.y1 },
  };
};

/** The bounds of the points that are on the sheet now (null when none are). */
export const onSheetBounds = (rect, items) => {
  const inside = items.filter(({ x, y }) => x >= rect.x1 && x <= rect.x2 && y >= rect.y1 && y <= rect.y2);
  if (!inside.length) return null;
  const xs = inside.map((i) => i.x);
  const ys = inside.map((i) => i.y);
  return { x1: Math.min(...xs), y1: Math.min(...ys), x2: Math.max(...xs), y2: Math.max(...ys) };
};

export const sameArea = (a, b) =>
  Boolean(a && b) &&
  a.width === b.width && a.height === b.height && a.unit === b.unit &&
  a.resolution === b.resolution && a.origin.x === b.origin.x && a.origin.y === b.origin.y;
