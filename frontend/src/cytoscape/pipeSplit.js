// Insert-on-pipe geometry, ported from SWIIMS insertEntityOnEdge: the new
// asset lands where the pipe was clicked (projected onto the pipe as drawn,
// bends included), the recorded length is split in the same proportion, and
// each retained bend stays with the half it belongs to.
//
// Pure and Cytoscape-free so it can be unit tested.

import { bendPairsToPoints, pointToBendPair, projectPointOntoPolyline, splitLengthByRatio } from "./canvasGeometry.js";

const MIN_RATIO = 0.05;
const MAX_RATIO = 0.95;

/**
 * @param {{ srcPos, tgtPos, weights?, distances?, clickPos? }} input
 * @returns {{ ratio, point, firstBends, secondBends }}
 *   firstBends / secondBends are absolute model points for each new pipe.
 */
export function planPipeSplit({ srcPos, tgtPos, weights = [], distances = [], clickPos = null }) {
  const bends = bendPairsToPoints(srcPos, tgtPos, weights, distances);
  const polyline = [srcPos, ...bends, tgtPos];
  const projection = clickPos ? projectPointOntoPolyline(polyline, clickPos) : null;
  if (!projection) {
    const half = Math.floor(bends.length / 2);
    return {
      ratio: 0.5,
      point: { x: (srcPos.x + tgtPos.x) / 2, y: (srcPos.y + tgtPos.y) / 2 },
      firstBends: bends.slice(0, half),
      secondBends: bends.slice(half),
    };
  }
  return {
    ratio: Math.min(MAX_RATIO, Math.max(MIN_RATIO, projection.ratio)),
    point: projection.point,
    // Segment i runs from vertex i to i+1; vertex 0 is the source, so the bends
    // strictly before the hit segment's end belong to the first pipe.
    firstBends: bends.slice(0, projection.segmentIndex),
    secondBends: bends.slice(projection.segmentIndex),
  };
}

/** Absolute bend points → the weight/distance arrays stored on an edge. */
export function bendPointsToPairs(srcPos, tgtPos, points = []) {
  const weights = [];
  const distances = [];
  points.forEach((point) => {
    const pair = pointToBendPair(srcPos, tgtPos, point);
    if (pair) {
      weights.push(pair.weight);
      distances.push(pair.distance);
    }
  });
  return { weights, distances };
}

/** Split the length fields of a pipe's specifications by `ratio`. */
export function splitPipeSpecs(specs = {}, ratio) {
  const first = { ...specs };
  const second = { ...specs };
  ["pipelineLength", "length_km"].forEach((key) => {
    if (!Object.prototype.hasOwnProperty.call(specs, key)) return;
    const [a, b] = splitLengthByRatio(specs[key], ratio);
    if (a == null) return;
    first[key] = a;
    second[key] = b;
  });
  return [first, second];
}
