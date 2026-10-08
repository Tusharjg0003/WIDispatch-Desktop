// Dependency-free canvas math: adaptive grid pitch, snap-to-grid, and the
// conversion between absolute bend points and the weight/distance pairs
// cytoscape-edge-editing stores on an edge.
//
// Nothing here touches Cytoscape or the DOM, so it stays unit-testable
// (see canvasGeometry.test.js).

export const CANVAS_GRID_PITCH = 40;

// The minor grid is kept inside this on-screen band by doubling/halving the
// model pitch, so it never turns into a solid fill or disappears entirely.
const GRID_SCREEN_MIN = 24;
const GRID_SCREEN_MAX = 96;
// Minor lines fade out between GRID_SCREEN_MIN and here, so the step between
// two pitches is a cross-fade rather than a pop.
const GRID_FADE_FROM = 34;

/**
 * Pick the model-space grid pitch for a zoom level.
 * @returns {{minor:number, major:number, screenMinor:number, minorAlpha:number}}
 */
export const computeGridPitch = (zoom, basePitch = CANVAS_GRID_PITCH) => {
  const z = Number.isFinite(zoom) && zoom > 0 ? zoom : 1;
  const base = Number.isFinite(basePitch) && basePitch > 0 ? basePitch : CANVAS_GRID_PITCH;
  let minor = base;

  let guard = 0;
  while (minor * z < GRID_SCREEN_MIN && guard < 64) {
    minor *= 2;
    guard += 1;
  }
  while (minor * z > GRID_SCREEN_MAX && minor > 1e-6 && guard < 64) {
    minor /= 2;
    guard += 1;
  }

  const screenMinor = minor * z;
  const fadeSpan = GRID_FADE_FROM - GRID_SCREEN_MIN;
  const minorAlpha =
    fadeSpan > 0 ? Math.max(0, Math.min(1, (screenMinor - GRID_SCREEN_MIN) / fadeSpan)) : 1;

  return { minor, major: minor * 5, screenMinor, minorAlpha };
};

/** Positive modulo — used to keep a CSS background-position inside one tile. */
export const wrapOffset = (value, size) => {
  if (!Number.isFinite(size) || size <= 0) return 0;
  if (!Number.isFinite(value)) return 0;
  return ((value % size) + size) % size;
};

export const snapValue = (value, pitch = CANVAS_GRID_PITCH) => {
  if (!Number.isFinite(value)) return value;
  if (!Number.isFinite(pitch) || pitch <= 0) return value;
  return Math.round(value / pitch) * pitch;
};

export const snapPosition = (pos, pitch = CANVAS_GRID_PITCH) => {
  if (!pos) return pos;
  return { x: snapValue(pos.x, pitch), y: snapValue(pos.y, pitch) };
};

/**
 * cytoscape-edge-editing stores bends as two parallel arrays: a weight along
 * the source→target vector and a perpendicular distance from it. Expand them
 * back into absolute model points.
 */
export const bendPairsToPoints = (srcPos, tgtPos, weights = [], distances = []) => {
  if (!srcPos || !tgtPos) return [];
  const dx = tgtPos.x - srcPos.x;
  const dy = tgtPos.y - srcPos.y;
  const len = Math.hypot(dx, dy);
  if (!len) return [];

  const ux = dx / len;
  const uy = dy / len;
  const count = Math.min(weights.length, distances.length);
  const points = [];

  for (let i = 0; i < count; i += 1) {
    const w = weights[i];
    const d = distances[i];
    if (!Number.isFinite(w) || !Number.isFinite(d)) continue;
    points.push({
      x: srcPos.x + w * dx - d * uy,
      y: srcPos.y + w * dy + d * ux,
    });
  }

  return points;
};

/** Inverse of bendPairsToPoints for a single point. */
export const pointToBendPair = (srcPos, tgtPos, point) => {
  if (!srcPos || !tgtPos || !point) return null;
  const dx = tgtPos.x - srcPos.x;
  const dy = tgtPos.y - srcPos.y;
  const len2 = dx * dx + dy * dy;
  if (!len2) return null;

  const len = Math.sqrt(len2);
  const ux = dx / len;
  const uy = dy / len;
  const weight = ((point.x - srcPos.x) * dx + (point.y - srcPos.y) * dy) / len2;
  const footX = srcPos.x + weight * dx;
  const footY = srcPos.y + weight * dy;
  const distance = -(point.x - footX) * uy + (point.y - footY) * ux;

  return { weight, distance };
};

// ── Preferences & zoom ladder (ported from SWIIMS utils/canvasGeometry.js) ──

/** localStorage key for the canvas snap-to-grid preference. */
export const SNAP_TO_GRID_STORAGE_KEY = "widispatch_canvas_snap_to_grid";

/** Discrete zoom ladder for the status-bar zoom buttons, within the canvas
    minZoom (0.05) and maxZoom (4). */
export const ZOOM_STOPS = [0.05, 0.1, 0.25, 0.33, 0.5, 0.67, 0.75, 1, 1.25, 1.5, 2, 3, 4];

export const nextZoomStop = (level) => {
  for (let i = 0; i < ZOOM_STOPS.length; i += 1) {
    if (ZOOM_STOPS[i] > level + 1e-4) return ZOOM_STOPS[i];
  }
  return ZOOM_STOPS[ZOOM_STOPS.length - 1];
};

export const prevZoomStop = (level) => {
  for (let i = ZOOM_STOPS.length - 1; i >= 0; i -= 1) {
    if (ZOOM_STOPS[i] < level - 1e-4) return ZOOM_STOPS[i];
  }
  return ZOOM_STOPS[0];
};

// ── Polyline projection (insert-on-pipe at the clicked point) ──────────────

/** Closest point to `pt` on the segment a→b, plus the parameter t in [0, 1]. */
const projectOntoSegment = (a, b, pt) => {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (!len2) return { point: { x: a.x, y: a.y }, t: 0, distance: Math.hypot(pt.x - a.x, pt.y - a.y) };
  let t = ((pt.x - a.x) * dx + (pt.y - a.y) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const point = { x: a.x + t * dx, y: a.y + t * dy };
  return { point, t, distance: Math.hypot(pt.x - point.x, pt.y - point.y) };
};

/**
 * Project a point onto a polyline (a pipe with its bends). `ratio` is the
 * fraction of total ARC LENGTH before the projected point — what makes a
 * proportional pipeline-length split correct on a bent pipe.
 *
 * @returns {{ point, segmentIndex, t, ratio, totalLength, distance } | null}
 */
export const projectPointOntoPolyline = (points, pt) => {
  if (!Array.isArray(points) || points.length < 2 || !pt) return null;
  const cumulative = [0];
  for (let i = 1; i < points.length; i += 1) {
    cumulative.push(cumulative[i - 1] + Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y));
  }
  const totalLength = cumulative[cumulative.length - 1];
  let best = null;
  for (let i = 0; i < points.length - 1; i += 1) {
    const hit = projectOntoSegment(points[i], points[i + 1], pt);
    if (!best || hit.distance < best.distance) {
      best = { ...hit, segmentIndex: i, along: cumulative[i] + hit.t * (cumulative[i + 1] - cumulative[i]) };
    }
  }
  if (!best) return null;
  return {
    point: best.point,
    segmentIndex: best.segmentIndex,
    t: best.t,
    distance: best.distance,
    ratio: totalLength > 0 ? best.along / totalLength : 0.5,
    totalLength,
  };
};

/**
 * Split a pipe's numeric length by `ratio` (0..1) into the two new legs.
 * Non-numeric or missing lengths are left untouched (null).
 */
export const splitLengthByRatio = (length, ratio) => {
  const value = Number(length);
  if (length === "" || length == null || !Number.isFinite(value)) return [null, null];
  const r = Math.max(0, Math.min(1, Number(ratio)));
  const first = Math.round(value * r * 1000) / 1000;
  return [first, Math.round((value - first) * 1000) / 1000];
};
