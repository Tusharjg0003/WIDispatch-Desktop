// Typed boundary around the canvas interaction mode.
//
// WorkspaceController depends only on this interface, never on how interaction
// modes are actually implemented. Today NetworkBuilderPage backs it with its
// existing `setModeSafe` mechanism; a later phase replaces that with an XState
// machine by re-implementing these two methods, and WorkspaceController does
// not change.

export interface CanvasInteractionController {
  /**
   * Clear derived analysis views (isolation, trace) and any classes they
   * applied. Called during a workspace switch before the incoming graph is
   * restored, so analysis anchored to outgoing element ids cannot bleed
   * across.
   */
  reset(): void;

  /**
   * Abandon any in-progress interaction that holds references to canvas
   * elements — edge insertion, node placement, area zoom. Unsafe state must
   * never survive into another document.
   */
  cancelUnsafeInteraction(): void;
}

/** Undo/redo history, owned by the page this phase. */
export interface CanvasHistoryController {
  reset(): void;
}

/**
 * Canvas view toggles, owned by the page this phase. Captured on switch-out
 * and re-applied on switch-in.
 */
export interface WorkspaceViewBridge {
  capture(): import("../../workspace/types/workspace.types.ts").WorkspaceViewToggles;
  apply(
    toggles: import("../../workspace/types/workspace.types.ts").WorkspaceViewToggles
  ): void;
}

/** History replace, so WorkspaceController never imports react-router-dom. */
export interface WorkspaceNavigator {
  replace(path: string): void;
}

/** Inert defaults, so the controller is safe before the page has registered. */
export const noopInteractionController: CanvasInteractionController = {
  reset() {},
  cancelUnsafeInteraction() {},
};

export const noopHistoryController: CanvasHistoryController = {
  reset() {},
};

export const noopNavigator: WorkspaceNavigator = {
  replace() {},
};
