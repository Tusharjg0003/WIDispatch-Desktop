// Which elements a selection rectangle catches.
//
// Kept apart from the gesture that draws the rectangle so the rule itself is
// testable: a node counts when its position is inside the box, and a pipe only
// when both of its ends are — half-enclosed pipes belong to whatever is
// outside the box as much as to what is inside it.

/** Normalise two model-space corners into {x1,y1,x2,y2}. */
export const normalizeBox = (a, b) => ({
  x1: Math.min(a.x, b.x),
  y1: Math.min(a.y, b.y),
  x2: Math.max(a.x, b.x),
  y2: Math.max(a.y, b.y),
});

export const nodeInBox = (node, box) => {
  const p = node.position();
  return p.x >= box.x1 && p.x <= box.x2 && p.y >= box.y1 && p.y <= box.y2;
};

/** Nodes inside the box, plus the edges fully spanned by them. */
export const elementsInBox = (cy, box) => {
  const nodes = cy.nodes().filter((node) => nodeInBox(node, box));
  const edges = cy.edges().filter(
    (edge) => nodeInBox(edge.source(), box) && nodeInBox(edge.target(), box)
  );
  return { nodes, edges };
};

/**
 * Select everything the box encloses. `additive` (Shift) keeps whatever was
 * already selected instead of replacing it.
 */
export const selectInBox = (cy, box, { additive = false } = {}) => {
  if (!cy) return { nodes: 0, edges: 0 };
  const { nodes, edges } = elementsInBox(cy, box);
  if (!additive) cy.$(":selected").unselect();
  nodes.select();
  edges.select();
  return { nodes: nodes.length, edges: edges.length };
};
