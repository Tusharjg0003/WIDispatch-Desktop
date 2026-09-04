// Boundary around the live Cytoscape instance.
//
// Owns construction, destruction and DOCUMENT LIFECYCLE — capture, restore,
// clear, viewport, selection. It deliberately does NOT own what the graph
// means: NetworkBuilderPage keeps its domain event handlers, its stylesheet
// and the edge-editing / context-menu extensions, registering them on
// getCy() after initialize(). This is a boundary, not a dumping ground.

import cytoscape from "cytoscape";

import { addGraph } from "../../cytoscape/graph.js";
import { restoreBendClasses } from "../../cytoscape/bendEditing.js";
import { buildCyStyle } from "../../cytoscape/buildCyStyle.js";
import { snapshotElements } from "./canvasSnapshotSerializer.ts";
import { SNAPSHOT_VERSION } from "../persistence/canvasSnapshot.types.ts";
import type { CanvasSnapshot } from "../persistence/canvasSnapshot.types.ts";
import type { CanvasViewport } from "../../workspace/types/workspace.types.ts";

export interface CanvasControllerApi {
  initialize(container: HTMLElement): cytoscape.Core;
  destroy(): void;
  getCy(): cytoscape.Core | null;

  captureSnapshot(): CanvasSnapshot | null;
  restoreSnapshot(snapshot: CanvasSnapshot | null): void;
  restoreElements(elements: unknown[] | null): void;
  loadDocument(doc: unknown): void;
  clear(): void;

  getViewport(): CanvasViewport | null;
  restoreViewport(viewport: CanvasViewport | null): void;

  getSelectedIds(): string[];
  restoreSelection(ids: string[]): void;

  runBatch(fn: () => void): void;
  isRestoring(): boolean;
}

export class CanvasController implements CanvasControllerApi {
  #cy: cytoscape.Core | null = null;
  #restoring = false;

  initialize(container: HTMLElement): cytoscape.Core {
    if (this.#cy) this.destroy();
    this.#cy = cytoscape({
      container,
      // buildCyStyle is untyped JS, so its selectors widen to `string` where
      // @types/cytoscape expects literal unions (NodeShape, etc). The
      // stylesheet is unchanged from what the page passed before; the cast is
      // purely to cross the JS/TS boundary.
      style: buildCyStyle() as unknown as cytoscape.StylesheetJson,
      layout: { name: "preset" },
      minZoom: 0.05,
      maxZoom: 4,
      boxSelectionEnabled: true, // shift-drag box-selects; plain drag pans
      wheelSensitivity: 0.2,
    });
    return this.#cy;
  }

  destroy(): void {
    this.#cy?.destroy();
    this.#cy = null;
    this.#restoring = false;
  }

  getCy(): cytoscape.Core | null {
    return this.#cy;
  }

  isRestoring(): boolean {
    return this.#restoring;
  }

  runBatch(fn: () => void): void {
    if (!this.#cy) return;
    this.#cy.batch(fn);
  }

  captureSnapshot(): CanvasSnapshot | null {
    if (!this.#cy) return null;
    return {
      version: SNAPSHOT_VERSION,
      elements: snapshotElements(this.#cy),
      viewport: this.getViewport(),
    };
  }

  /**
   * Restore in a single batch with the restoring flag raised, so the page's
   * history and dirty tracking treat the whole rehydration as one non-user
   * event rather than hundreds of edits.
   *
   * try/finally is required: a throw that left the flag raised would silently
   * disable undo and dirty tracking for the rest of the session.
   */
  restoreElements(elements: unknown[] | null): void {
    const cy = this.#cy;
    if (!cy) return;
    this.#restoring = true;
    try {
      cy.batch(() => {
        cy.elements().remove();
        if (elements && elements.length) {
          cy.add(elements as cytoscape.ElementDefinition[]);
        }
        // Idempotent and cheap. Bend classes are not in the transient set so
        // they do survive capture, but this guards against a future addition
        // to that set silently flattening every bent pipe.
        restoreBendClasses(cy);
      });
    } finally {
      this.#restoring = false;
    }
  }

  restoreSnapshot(snapshot: CanvasSnapshot | null): void {
    this.restoreElements(snapshot?.elements ?? null);
  }

  /**
   * Load a document straight from the backend. Separate from restoreSnapshot
   * because a backend document is a different shape from a captured snapshot:
   * addGraph accepts both the legacy flat shape and Cytoscape-exported
   * elements, and restores bend classes. Converting a document into a snapshot
   * array instead would silently drop edge bend rendering.
   */
  loadDocument(doc: unknown): void {
    const cy = this.#cy;
    if (!cy) return;
    this.#restoring = true;
    try {
      cy.batch(() => {
        cy.elements().remove();
        addGraph(cy, doc);
      });
    } finally {
      this.#restoring = false;
    }
  }

  clear(): void {
    this.restoreElements(null);
  }

  getViewport(): CanvasViewport | null {
    if (!this.#cy) return null;
    const pan = this.#cy.pan();
    return { zoom: this.#cy.zoom(), pan: { x: pan.x, y: pan.y } };
  }

  restoreViewport(viewport: CanvasViewport | null): void {
    const cy = this.#cy;
    if (!cy) return;
    if (!viewport) {
      // No stored viewport means a document being seen for the first time.
      cy.fit(undefined, 48);
      return;
    }
    cy.viewport({ zoom: viewport.zoom, pan: viewport.pan });
  }

  getSelectedIds(): string[] {
    if (!this.#cy) return [];
    return this.#cy.$(":selected").map((el) => el.id());
  }

  /**
   * Perform the real Cytoscape selection. Writing to selectionStore alone
   * would leave the canvas unselected — and the inspector ordering in
   * WorkspaceController depends on the resulting `select` event firing.
   */
  restoreSelection(ids: string[]): void {
    const cy = this.#cy;
    if (!cy) return;
    cy.batch(() => {
      cy.elements().unselect();
      if (!ids?.length) return;
      ids.forEach((id) => {
        const el = cy.getElementById(id);
        if (el && el.length) el.select();
      });
    });
  }
}

/** Application-wide instance. One live Cytoscape graph at a time by design. */
export const canvasController = new CanvasController();
