// Bend-point editing on top of cytoscape-edge-editing.
//
// The plugin's weight/distance arrays (`cyedgebendeditingWeights` /
// `cyedgebendeditingDistances`) are the single source of truth for a bent pipe:
// they are what the stylesheet's `curve-style: segments` rule reads and what
// serializeGraph persists. `bendPointPositions` is deliberately never written —
// leaving it around makes deleted bends reappear the next time the plugin
// redraws.

import { bendPairsToPoints, pointToBendPair } from "./canvasGeometry.js";

export const BEND_CLASS = "edgebendediting-hasbendpoints";
export const MULTI_BEND_CLASS = "edgebendediting-hasmultiplebendpoints";

const readPairs = (edge) => ({
  weights: [...(edge.data("cyedgebendeditingWeights") || [])],
  distances: [...(edge.data("cyedgebendeditingDistances") || [])],
});

/** Keep the bend marker classes in step with how many bends an edge has. */
export const updateBendClasses = (edge, bendCount) => {
  if (!edge || !edge.length) return;
  edge.removeData("bendPointPositions");

  if (bendCount <= 0) {
    edge.removeClass(`${BEND_CLASS} ${MULTI_BEND_CLASS}`);
    edge.data({ cyedgebendeditingWeights: [], cyedgebendeditingDistances: [] });
  } else if (bendCount === 1) {
    edge.addClass(BEND_CLASS);
    edge.removeClass(MULTI_BEND_CLASS);
  } else {
    edge.addClass(`${BEND_CLASS} ${MULTI_BEND_CLASS}`);
  }
};

/** Absolute model points of an edge's current bends, source→target order. */
export const edgeBendPoints = (edge) => {
  if (!edge || !edge.length) return [];
  return bendPairsToPoints(
    edge.source().position(),
    edge.target().position(),
    edge.data("cyedgebendeditingWeights") || [],
    edge.data("cyedgebendeditingDistances") || []
  );
};

/** source → bends → target, i.e. the polyline the pipe actually draws. */
export const edgePolyline = (edge) => {
  if (!edge || !edge.length) return [];
  return [edge.source().position(), ...edgeBendPoints(edge), edge.target().position()];
};

/**
 * Add a bend at a model-space point.
 *
 * `minOffset` nudges the bend off the pipe centreline: a right-click lands
 * exactly on the line, and a bend with zero perpendicular distance is stored
 * but invisible, which reads as "nothing happened".
 *
 * `minSeparation` rejects a bend landing on top of an existing one. Two bends
 * at the same point are indistinguishable on screen but take two deletions to
 * clear, and a double-click near a midpoint handle would otherwise stack them.
 */
export const addBendPoint = (edge, modelPoint, { minOffset = 0, minSeparation = 0 } = {}) => {
  if (!edge || !edge.length || !modelPoint) return false;
  const src = edge.source().position();
  const tgt = edge.target().position();
  if (src.x === tgt.x && src.y === tgt.y) return false;

  if (minSeparation > 0) {
    const tooClose = edgeBendPoints(edge).some(
      (point) => Math.hypot(point.x - modelPoint.x, point.y - modelPoint.y) < minSeparation
    );
    if (tooClose) return false;
  }

  const pair = pointToBendPair(src, tgt, modelPoint);
  if (!pair) return false;

  // Clamp away from the endpoints so a bend never hides under a node card.
  const weight = Math.min(0.95, Math.max(0.05, pair.weight));
  let distance = pair.distance;
  if (minOffset > 0 && Math.abs(distance) < minOffset) {
    distance = (distance < 0 ? -1 : 1) * minOffset;
  }

  const { weights, distances } = readPairs(edge);

  // Bends must stay sorted by weight, otherwise the polyline doubles back.
  let insertIndex = weights.length;
  for (let i = 0; i < weights.length; i += 1) {
    if (weight < weights[i]) {
      insertIndex = i;
      break;
    }
  }

  weights.splice(insertIndex, 0, weight);
  distances.splice(insertIndex, 0, distance);

  edge.select();
  edge.data({ cyedgebendeditingWeights: weights, cyedgebendeditingDistances: distances });
  updateBendClasses(edge, Math.min(weights.length, distances.length));
  return true;
};

/** Drop the bend nearest a model-space point. */
export const removeNearestBendPoint = (edge, clickPos) => {
  if (!edge || !edge.length || !clickPos) return false;
  const points = edgeBendPoints(edge);
  if (!points.length) return false;

  let nearestIndex = 0;
  let nearestDistance = Infinity;
  points.forEach((point, index) => {
    const d = Math.hypot(point.x - clickPos.x, point.y - clickPos.y);
    if (d < nearestDistance) {
      nearestDistance = d;
      nearestIndex = index;
    }
  });

  const { weights, distances } = readPairs(edge);
  weights.splice(nearestIndex, 1);
  distances.splice(nearestIndex, 1);

  edge.data({ cyedgebendeditingWeights: weights, cyedgebendeditingDistances: distances });
  updateBendClasses(edge, Math.min(weights.length, distances.length));
  return true;
};

export const removeAllBendPoints = (edge) => {
  if (!edge || !edge.length) return false;
  updateBendClasses(edge, 0);
  return true;
};

/**
 * Re-derive every edge's bend state from its weight/distance arrays.
 *
 * Used in two places, for the same reason: those arrays are the only thing
 * worth trusting. A saved canvas carries them but not the marker class, and
 * the editing plugin sometimes drops the class (or leaves a `bendPointPositions`
 * behind) while it manipulates anchors — after which a bent pipe would render
 * straight even though its bends are still on record. Re-deriving repairs that
 * in place, so a bend survives node drags and stays editable.
 */
export const restoreBendClasses = (cy) => {
  if (!cy) return;
  cy.edges().forEach((edge) => {
    const weights = edge.data("cyedgebendeditingWeights") || [];
    const distances = edge.data("cyedgebendeditingDistances") || [];
    const count = Math.min(weights.length, distances.length);
    // Never let the plugin's absolute positions become a second source of
    // truth: they go stale the moment a node moves.
    if (edge.data("bendPointPositions") !== undefined) edge.removeData("bendPointPositions");
    if (count > 0 || edge.hasClass(BEND_CLASS)) updateBendClasses(edge, count);
  });
};
