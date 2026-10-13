// A network's drawing area: a sheet of `width × height` canvas pixels (model
// px) with its top-left corner at `origin`, drawn over a grid of `grid`-px
// squares. It is a soft guide — nothing is clamped to it. The grid size is the
// network's grid: the canvas grid, snapping and arrow-key nudges all use it.
//
// Networks saved before sizes were in pixels stored km/m with `resolution`
// units per 40 px grid square; those convert to the same pixels on load.
//
// Dependency-free so it stays unit-testable (see canvasArea.test.js).

import { CANVAS_GRID_PITCH } from "./canvasGeometry.js";

export const MIN_GRID = 5;
export const MAX_GRID = 400;

export const DEFAULT_CANVAS_AREA = Object.freeze({
  width: 4000,
  height: 2800,
  grid: CANVAS_GRID_PITCH,
  origin: Object.freeze({ x: 0, y: 0 }),
});

// Room left around a drawing when an area is fitted to it.
const FIT_MARGIN = 0.1;
const LEGACY_UNITS = ["km", "m"];

const positive = (value) => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
};

const finite = (value, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

// Keep floating-point dust out of the stored sizes.
const roundPx = (value) => Math.round(value * 1000) / 1000;

const clampGrid = (value) => Math.min(MAX_GRID, Math.max(MIN_GRID, value));

/** A valid area, or null when `raw` isn't one (e.g. a network saved before areas existed). */
export const normalizeCanvasArea = (raw) => {
  if (!raw || typeof raw !== "object") return null;
  let width = positive(raw.width);
  let height = positive(raw.height);
  if (!width || !height) return null;
  let grid = positive(raw.grid);
  if (!grid && LEGACY_UNITS.includes(raw.unit)) {
    // Old km/m sheet: `resolution` units per 40 px square.
    const resolution = positive(raw.resolution);
    if (!resolution) return null;
    const k = CANVAS_GRID_PITCH / resolution;
    width *= k;
    height *= k;
  }
  grid = clampGrid(grid || CANVAS_GRID_PITCH);
  return {
    width: roundPx(width),
    height: roundPx(height),
    grid,
    origin: { x: finite(raw.origin?.x), y: finite(raw.origin?.y) },
  };
};

/** The grid square size of an area, in px (the default grid with no area). */
export const gridOf = (area) => (area && positive(area.grid)) || CANVAS_GRID_PITCH;

/** The sheet in model px: { x1, y1, x2, y2, w, h }. */
export const areaRectPx = (area) => {
  const { x, y } = area.origin;
  return { x1: x, y1: y, x2: x + area.width, y2: y + area.height, w: area.width, h: area.height };
};

const isBox = (bb) =>
  bb && [bb.x1, bb.y1, bb.x2, bb.y2].every(Number.isFinite) && bb.x2 >= bb.x1 && bb.y2 >= bb.y1;

/**
 * An area around a drawing's bounding box (model px), with a margin, a whole
 * number of grid squares wide/high and its corner on the grid. With no drawing
 * it is the default sheet.
 */
export const fitAreaToBounds = (bb, { grid = DEFAULT_CANVAS_AREA.grid } = {}) => {
  if (!isBox(bb)) {
    return { ...DEFAULT_CANVAS_AREA, grid, origin: { ...DEFAULT_CANVAS_AREA.origin } };
  }
  const marginX = Math.max(grid, (bb.x2 - bb.x1) * FIT_MARGIN);
  const marginY = Math.max(grid, (bb.y2 - bb.y1) * FIT_MARGIN);
  const x1 = Math.floor((bb.x1 - marginX) / grid) * grid;
  const y1 = Math.floor((bb.y1 - marginY) / grid) * grid;
  const cellsX = Math.max(1, Math.ceil((bb.x2 + marginX - x1) / grid));
  const cellsY = Math.max(1, Math.ceil((bb.y2 + marginY - y1) / grid));
  return {
    width: roundPx(cellsX * grid),
    height: roundPx(cellsY * grid),
    grid,
    origin: { x: x1, y: y1 },
  };
};

/**
 * Re-anchor a resized area. `anchor` says which point stays put: "top-left"
 * (grow right/down) or "center" (grow on every side).
 */
export const resizeArea = (area, { width, height, grid }, anchor = "top-left") => {
  const next = {
    width,
    height,
    grid: grid ?? area.grid,
    origin: { ...area.origin },
  };
  if (anchor === "center") {
    next.origin = {
      x: area.origin.x + (area.width - width) / 2,
      y: area.origin.y + (area.height - height) / 2,
    };
  }
  return next;
};

/**
 * Does `area` still hold the drawing? Returns null when it does, otherwise the
 * smallest width/height (px, rounded up to grid squares) that would hold it
 * from the same corner.
 */
export const shortfallForBounds = (area, bb) => {
  if (!isBox(bb)) return null;
  const rect = areaRectPx(area);
  if (bb.x1 >= rect.x1 && bb.y1 >= rect.y1 && bb.x2 <= rect.x2 && bb.y2 <= rect.y2) return null;
  const step = gridOf(area);
  const need = (px) => Math.max(step, Math.ceil(px / step) * step);
  return {
    width: roundPx(need(Math.max(rect.w, bb.x2 - rect.x1))),
    height: roundPx(need(Math.max(rect.h, bb.y2 - rect.y1))),
    // The drawing sticks out on the top/left; growing won't help, moving will.
    startsBefore: bb.x1 < rect.x1 || bb.y1 < rect.y1,
  };
};

/** Ids of the positioned items whose point lies outside the sheet. */
export const idsOutside = (rect, items) =>
  items
    .filter(({ x, y }) => Number.isFinite(x) && Number.isFinite(y) && (x < rect.x1 || x > rect.x2 || y < rect.y1 || y > rect.y2))
    .map((item) => item.id);

const fmtPx = (value) => Math.round(value).toLocaleString("en-US");

/** "4,000 × 2,800 px" */
export const describeArea = (area) => `${fmtPx(area.width)} × ${fmtPx(area.height)} px`;

/** "40 px grid" */
export const describeGrid = (area) => `${fmtPx(gridOf(area))} px grid`;

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

/** The area a dragged rectangle describes (same grid). */
export const areaFromRect = (area, rect) => ({
  ...area,
  width: roundPx(rect.w),
  height: roundPx(rect.h),
  origin: { x: rect.x1, y: rect.y1 },
});

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
  a.width === b.width && a.height === b.height && a.grid === b.grid &&
  a.origin.x === b.origin.x && a.origin.y === b.origin.y;
