// Hydrating a saved network document onto a Cytoscape instance.
//
// Saved documents come in two shapes: elements exported straight from
// Cytoscape (already carrying `data`), and the flatter shape the backend
// stores. Both are accepted so a canvas saved by any version still loads.

import { restoreBendClasses } from "./bendEditing.js";

export const addGraph = (cy, g) => {
  cy.batch(() => {
    (g.nodes || []).forEach((n) => {
      const data = n.data
        ? n.data
        : {
            id: n.id,
            assetId: n.assetId,
            category: n.category,
            type: n.type || n.category,
            label: n.label,
            displayLabel: n.label,
            status: n.status || "",
            meta: n.meta || {},
          };
      cy.add({ group: "nodes", data, position: n.position || { x: 0, y: 0 } });
    });
    (g.edges || []).forEach((e) => {
      const data = e.data
        ? e.data
        : {
            id: e.id,
            source: e.source,
            target: e.target,
            kind: e.kind || "pipe",
            assetId: e.assetId || null,
            label: e.label || "",
            displayLabel: e.label || "",
            status: e.status || "",
            meta: e.meta || {},
          };
      cy.add({ group: "edges", data });
    });
  });

  // Bend points persist as weight/distance arrays on the edge data, but the
  // marker class that makes the stylesheet draw them as segments does not.
  restoreBendClasses(cy);
};
