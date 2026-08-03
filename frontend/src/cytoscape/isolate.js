// Isolate: hide everything on the canvas except a chosen set.
//
// Only the Cytoscape class manipulation lives here. Toast copy and the
// "isolation is active" flag stay with each page, because the Builder and the
// Simulation Canvas word them differently.

export const ISOLATE_CLASSES = "nb-isolate-hidden nb-isolate-dim";

export const isIsolated = (cy) => !!cy && cy.elements(".nb-isolate-hidden, .nb-isolate-dim").length > 0;

export function clearIsolation(cy) {
  if (!cy) return;
  cy.elements().removeClass(ISOLATE_CLASSES);
}

/**
 * Keep `elements` (plus the endpoints of any edges in it) and hide the rest.
 * Returns false when there is nothing to isolate, so the caller can decide what
 * to tell the operator.
 */
export function applyIsolation(cy, elements) {
  if (!cy || !elements || !elements.length) return false;

  let keep = elements;
  const edges = elements.filter((el) => el.isEdge());
  if (edges.length) keep = keep.union(edges.connectedNodes());

  const keepIds = new Set(keep.map((el) => el.id()));
  cy.elements().forEach((el) => {
    if (keepIds.has(el.id())) el.removeClass(ISOLATE_CLASSES);
    else el.addClass("nb-isolate-hidden");
  });

  cy.$(":selected").unselect();
  keep.select();
  cy.fit(keep, 80);
  return true;
}
