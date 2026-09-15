// Dependency-free alignment and distribution math for the canvas.
//
// The page reads the selected Cytoscape nodes into plain descriptors
// ({ id, x, y, w, h } — x/y is the node centre, w/h its outer box), calls one
// of these, and writes the returned centres back. Nothing here touches
// Cytoscape or the DOM, so it stays unit-testable (see align.test.js) and the
// two apps (WIDispatch / SWIIMS) share one definition of what "align left" means.

const ALIGN_MODES = ["left", "centerH", "right", "top", "middleV", "bottom"];

const num = (value) => (Number.isFinite(value) ? value : 0);
const halfW = (node) => num(node.w) / 2;
const halfH = (node) => num(node.h) / 2;

/**
 * New centre positions that align a set of nodes on one edge or axis.
 *
 * Horizontal modes only move x, vertical modes only move y — matching the
 * SWIIMS handlers. Edge alignment respects each node's own size so their
 * left/right/top/bottom edges line up, not their centres.
 *
 * @param {Array<{id,x,y,w,h}>} nodes
 * @param {'left'|'centerH'|'right'|'top'|'middleV'|'bottom'} mode
 * @returns {Array<{id,x,y}>} new centres; empty when fewer than 2 nodes.
 */
export function alignPositions(nodes = [], mode) {
  if (!ALIGN_MODES.includes(mode)) return [];
  const list = (nodes || []).filter((n) => n && n.id != null);
  if (list.length < 2) return [];

  switch (mode) {
    case "left": {
      const edge = Math.min(...list.map((n) => num(n.x) - halfW(n)));
      return list.map((n) => ({ id: n.id, x: edge + halfW(n), y: num(n.y) }));
    }
    case "right": {
      const edge = Math.max(...list.map((n) => num(n.x) + halfW(n)));
      return list.map((n) => ({ id: n.id, x: edge - halfW(n), y: num(n.y) }));
    }
    case "centerH": {
      const mean = list.reduce((sum, n) => sum + num(n.x), 0) / list.length;
      return list.map((n) => ({ id: n.id, x: mean, y: num(n.y) }));
    }
    case "top": {
      const edge = Math.min(...list.map((n) => num(n.y) - halfH(n)));
      return list.map((n) => ({ id: n.id, x: num(n.x), y: edge + halfH(n) }));
    }
    case "bottom": {
      const edge = Math.max(...list.map((n) => num(n.y) + halfH(n)));
      return list.map((n) => ({ id: n.id, x: num(n.x), y: edge - halfH(n) }));
    }
    case "middleV": {
      const mean = list.reduce((sum, n) => sum + num(n.y), 0) / list.length;
      return list.map((n) => ({ id: n.id, x: num(n.x), y: mean }));
    }
    default:
      return [];
  }
}

/**
 * New centre positions that space nodes evenly between the two extreme
 * nodes along one axis. The end nodes stay put; the inner ones are stepped
 * to equal gaps between the first and last centre.
 *
 * @param {Array<{id,x,y}>} nodes
 * @param {'h'|'v'} axis  'h' distributes along x, 'v' along y.
 * @returns {Array<{id,x,y}>} new centres; empty when fewer than 3 nodes.
 */
export function distributePositions(nodes = [], axis) {
  if (axis !== "h" && axis !== "v") return [];
  const list = (nodes || []).filter((n) => n && n.id != null);
  if (list.length < 3) return [];

  const key = axis === "h" ? "x" : "y";
  const sorted = [...list].sort((a, b) => num(a[key]) - num(b[key]));
  const min = num(sorted[0][key]);
  const max = num(sorted[sorted.length - 1][key]);
  const step = (max - min) / (sorted.length - 1);

  return sorted.map((n, i) => ({
    id: n.id,
    x: axis === "h" ? min + step * i : num(n.x),
    y: axis === "v" ? min + step * i : num(n.y),
  }));
}

export { ALIGN_MODES };
