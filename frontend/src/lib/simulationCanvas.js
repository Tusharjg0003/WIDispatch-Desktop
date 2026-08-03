// Turning a solved dispatch day into canvas paint.
//
// Everything here is pure so it can be tested under `node --test`; the
// Cytoscape side lives in cytoscape/simulationOverlay.js. Follows the
// simulationRows.js precedent: the page fetches, these functions shape, the
// components only render.

export const EPS = 1e-6;

/**
 * Which visual bucket a pipe falls into on one day.
 *
 * Order matters. A pipe named in the day's bindingConstraints is the reason
 * demand could not be met, so it outranks its own utilisation. A pipe with no
 * capacity on record is reported as unconstrained rather than divided by a
 * stand-in denominator — the reference implementation used `capacity || 1`,
 * which made every uncapacitated pipe carrying any flow read as critical.
 */
export function edgeState({ flow = 0, capacity = null, unconstrained = false, isBottleneck = false } = {}) {
  if (!(flow > EPS)) return "idle";
  if (isBottleneck) return "bottleneck";
  if (unconstrained || !(capacity > 0)) return "unconstrained";

  const util = flow / capacity;
  if (util >= 0.9) return "high";
  if (util >= 0.7) return "medium";
  return "low";
}

/** Line width in px: thicker the harder the pipe is worked. */
export function edgeWidth(state, util) {
  if (state === "idle") return 2;
  if (state === "unconstrained") return 3;
  return Math.max(2, Math.min(6, 2 + (util || 0) * 4));
}

/**
 * A plant with no capacity anywhere on record could not be dispatched at all,
 * which is a different fact from a plant the solver chose not to run. The
 * config screen already warns about these; the canvas must not hide them among
 * the idle ones.
 */
export function plantState(plant = {}, allocated = 0) {
  if (plant.noCapacity) return "no-capacity";
  if (!(allocated > EPS)) return "idle";
  if (plant.available > 0 && allocated >= plant.available - EPS) return "at-capacity";
  return "partial";
}

export function gateState(gate = {}) {
  if (!(gate.required > EPS)) return "no-demand";
  if (gate.shortage <= EPS) return "met";
  return gate.delivered > EPS ? "adjusted" : "shortfall";
}

export function pumpState(pump = {}, isBinding = false) {
  if (isBinding) return "binding";
  if (pump.fullOutage) return "offline";
  if (pump.unconstrained) return "unconstrained";
  return "normal";
}
