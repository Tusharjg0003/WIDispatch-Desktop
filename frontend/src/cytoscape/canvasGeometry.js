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
