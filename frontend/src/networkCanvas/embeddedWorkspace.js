// Stand-in for WorkspaceController when the canvas is embedded (Simulation
// Config), mirroring SWIIMS' `embedded` + controlled-snapshot mode of
// NetworkSimulation2Page. The embedded canvas has no workspace tabs, no
// IndexedDB recovery and no URL of its own: the host owns the document, so
// every workspace call is either a no-op or a dirty-flag report to the host.
//
// It implements exactly the WorkspaceController surface the canvas calls, so
// NetworkCanvasWorkspace can use one `ws` reference in both modes.

export function createEmbeddedWorkspace(getHost) {
  let dirty = false;
  const report = (next) => {
    if (dirty === next) return;
    dirty = next;
    getHost().onDirtyChange?.(next);
  };

  return {
    embedded: true,
    isDirty: () => dirty,
    notifyDocumentMutated: () => report(true),
    notifyViewChanged: () => {},
    markSaved: () => report(false),
    resetDirty: () => report(false),
    recoverSession: async () => {},
    registerInteraction: () => {},
    registerHistory: () => {},
    registerViewBridge: () => {},
    registerNavigator: () => {},
    detach: () => {},
    openNetwork: async () => {},
    createWorkspace: async () => null,
    activateRelative: async () => {},
    reopenLastClosed: async () => null,
    closeWorkspace: async () => {},
  };
}
