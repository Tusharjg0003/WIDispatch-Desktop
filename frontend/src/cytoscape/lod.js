// Level-of-detail for node cards.
//
// An entity symbol is 44px with a label under it; zoomed out far enough that
// label stops being information and becomes overlapping text. The bands below
// shrink the symbol and then drop the label. Junctions, notes and group boxes
// carry their own geometry in the stylesheet and are left alone.

import { SYMBOL_TYPES } from "./entitySymbol.js";

export const LOD_CLASSES = "lod-far lod-mid lod-near";

/** Which detail band a zoom level falls in. */
export const zoomBand = (zoom) => {
  const z = Number.isFinite(zoom) && zoom > 0 ? zoom : 1;
  if (z < 0.35) return "far";
  if (z < 0.7) return "mid";
  return "near";
};

/** Put every symbol node in the band matching the current zoom. */
export const applyZoomLod = (cy) => {
  if (!cy) return;
  const band = zoomBand(cy.zoom());
  const symbols = cy.nodes().filter((n) => SYMBOL_TYPES.has(n.data("type")));
  if (!symbols.length) return;
  // Restyling every symbol on every zoom tick is wasted work — bail if the
  // band has not actually changed.
  if (symbols.every((n) => n.hasClass(`lod-${band}`))) return;
  cy.batch(() => {
    symbols.removeClass(LOD_CLASSES).addClass(`lod-${band}`);
  });
};
