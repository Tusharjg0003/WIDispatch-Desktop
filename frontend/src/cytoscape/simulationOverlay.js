// Painting a solved dispatch day onto a Cytoscape instance.
//
// Deliberately thin: every decision about *which* bucket an element is in was
// made in lib/simulationCanvas.js, and every colour lives in buildCyStyle.js.
// This file only moves those decisions onto elements, so the whole overlay can
// be lifted again with one clearOverlay call.

const DASH_INTERVAL_MS = 60;
const DASH_STEP = 2;

/** Remove every trace of a previous overlay. */
export function clearOverlay(cy) {
  if (!cy) return;
  cy.batch(() => {
    cy.elements().forEach((el) => {
      const sim = el.classes().filter((cls) => cls.startsWith("sim-"));
      if (sim.length) el.removeClass(sim.join(" "));
      el.removeData("simFlow simUtil simWidth");
    });
  });
  cy.edges().removeStyle("line-dash-offset");
}

/**
 * Apply one day's overlay. Elements the run never saw are marked stale rather
 * than left carrying the previous day's paint.
 */
export function applyOverlay(cy, overlay, { staleIds = [] } = {}) {
  if (!cy || !overlay) return;
  clearOverlay(cy);

  const stale = new Set(staleIds);
  const overridden = new Set(overlay.overriddenIds || []);

  cy.batch(() => {
    cy.edges().forEach((edge) => {
      const id = edge.id();
      const state = overlay.edgeStates[id];
      if (stale.has(id) || !state) {
        edge.addClass("sim-stale");
        return;
      }
      edge.data("simFlow", overlay.flowByEdge[id] || 0);
      edge.data("simUtil", overlay.utilByEdge[id]);
      edge.data("simWidth", overlay.edgeWidths[id]);
      edge.addClass(`sim-edge--${state}`);
    });

    cy.nodes().forEach((node) => {
      const id = node.id();
      if (stale.has(id)) {
        node.addClass("sim-stale");
        return;
      }
      const state = overlay.nodeStates[id];
      // Junctions, notes and group boxes have no per-day result and keep their
      // Network Builder styling.
      if (!state) return;

      const category = node.data("category") || node.data("type");
      const prefix = category === "plant" ? "sim-plant" : category === "pump" ? "sim-pump" : "sim-gate";
      node.addClass(`${prefix}--${state}`);
      if (overridden.has(id)) node.addClass("sim-overridden");
    });
  });
}

/**
 * The moving-flow effect: shift the dash offset on every flowing pipe.
 * Returns a handle for stopFlowAnimation.
 */
export function startFlowAnimation(cy, flowByEdge = {}) {
  if (!cy) return null;
  let offset = 0;
  return setInterval(() => {
    offset -= DASH_STEP;
    cy.batch(() => {
      cy.edges().forEach((edge) => {
        if ((flowByEdge[edge.id()] || 0) > 0) edge.style("line-dash-offset", offset);
      });
    });
  }, DASH_INTERVAL_MS);
}

export function stopFlowAnimation(handle, cy) {
  if (handle) clearInterval(handle);
  if (cy) cy.edges().removeStyle("line-dash-offset");
}
