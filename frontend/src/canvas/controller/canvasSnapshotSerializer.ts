// Graph serialization shared by the page's undo history and the workspace
// snapshot layer.
//
// Previously private to NetworkBuilderPage. Extracted so CanvasController does
// not need a parallel serializer — two serializers that drift would mean undo
// and workspace-restore disagreeing about what a graph is.

import { FILTER_HIDDEN_CLASS } from "../../cytoscape/assetFilter.js";
import { LOD_CLASSES } from "../../cytoscape/lod.js";
import { TRACE_CLASSES } from "../../cytoscape/trace.js";

/**
 * Classes that are derived rather than authored: they are re-applied from
 * live state after a restore, so persisting them would resurrect stale
 * analysis or filter styling onto a graph it no longer describes.
 *
 * Note `edgebendediting-hasbendpoints` is deliberately NOT here — bend markers
 * are authored state and must survive a round trip.
 */
export const TRANSIENT_CANVAS_CLASSES =
  `${TRACE_CLASSES} ${LOD_CLASSES} ${FILTER_HIDDEN_CLASS} ` +
  "draw-source insert-target nb-isolate-hidden nb-isolate-dim hide-labels";

export const TRANSIENT_CANVAS_CLASS_SET = new Set(
  TRANSIENT_CANVAS_CLASSES.split(/\s+/)
);

export const stripTransientClasses = (json: Record<string, unknown>) => {
  if (!json || typeof json.classes !== "string") return json;
  const kept = String(json.classes)
    .split(/\s+/)
    .filter((cls) => cls && !TRANSIENT_CANVAS_CLASS_SET.has(cls));
  if (!kept.length) {
    const { classes: _classes, ...rest } = json;
    return rest;
  }
  return { ...json, classes: kept.join(" ") };
};

export const snapshotElements = (cy: {
  elements: () => { jsons: () => Record<string, unknown>[] };
}): unknown[] => cy.elements().jsons().map(stripTransientClasses);
