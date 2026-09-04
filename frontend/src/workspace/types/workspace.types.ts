// Domain types for the workspace (multi-document) tab system.
//
// A "workspace" is one open network document plus the UI state of the person
// viewing it. Workspace identity is deliberately independent of the backend
// network id: a never-saved workspace has `document.networkId === null`.

export type InspectorTab = "details" | "issues" | "trace" | "isolation";

export type IssuePanelMode = "issues" | "find";

export interface CanvasViewport {
  zoom: number;
  pan: { x: number; y: number };
}

/**
 * Canvas view toggles. Preserved per workspace so Network A can sit in
 * grid+snap mode while Network B does not.
 *
 * `hiddenAssetTypes` is an array rather than a Set because it crosses the
 * IndexedDB boundary; the page converts at its edge.
 */
export interface WorkspaceViewToggles {
  showLabels: boolean;
  showGrid: boolean;
  snapToGrid: boolean;
  showLibrary: boolean;
  canvasFocusMode: boolean;
  hiddenAssetTypes: string[];
}

export interface WorkspaceUiState {
  inspectorOpen: boolean;
  inspectorTab: InspectorTab;
  issuePanelMode: IssuePanelMode;
  viewport: CanvasViewport | null;
  selectedElementIds: string[];
  view: WorkspaceViewToggles;
}

export interface WorkspaceDocumentRef {
  /** Backend network id. `null` means this workspace was never saved. */
  networkId: string | null;
  name: string;
  description: string;
}

export interface WorkspaceInstance {
  /** Workspace id — never the backend network id. */
  id: string;
  type: "network-simulation";
  dirty: boolean;
  pinned: boolean;
  /**
   * Set when the backend document failed to load. While true the workspace
   * writes no recovery snapshot, so a transient network failure cannot
   * overwrite a good stored graph with an empty one.
   */
  loadError: boolean;
  document: WorkspaceDocumentRef;
  ui: WorkspaceUiState;
  createdAt: number;
  updatedAt: number;
}

export interface ClosedWorkspace {
  workspace: WorkspaceInstance;
  snapshotElements: unknown[] | null;
  /** Index the tab occupied, so reopening puts it back where it was. */
  index: number;
}

export const DEFAULT_VIEW_TOGGLES: WorkspaceViewToggles = {
  showLabels: true,
  showGrid: true,
  snapToGrid: false,
  showLibrary: true,
  canvasFocusMode: false,
  hiddenAssetTypes: [],
};

export const DEFAULT_UI_STATE: WorkspaceUiState = {
  inspectorOpen: true,
  inspectorTab: "details",
  issuePanelMode: "issues",
  viewport: null,
  selectedElementIds: [],
  view: DEFAULT_VIEW_TOGGLES,
};

let workspaceSeq = 0;

/** Test seam: keeps generated ids deterministic across runs. */
export const resetWorkspaceIdSequence = (): void => {
  workspaceSeq = 0;
};

export const createWorkspaceId = (): string => {
  workspaceSeq += 1;
  return `ws-${Date.now().toString(36)}-${workspaceSeq}`;
};

export interface CreateWorkspaceOptions {
  name?: string;
  networkId?: string | null;
  description?: string;
  ui?: Partial<WorkspaceUiState>;
  dirty?: boolean;
}

export const createWorkspaceInstance = (
  options: CreateWorkspaceOptions = {}
): WorkspaceInstance => {
  const now = Date.now();
  return {
    id: createWorkspaceId(),
    type: "network-simulation",
    dirty: options.dirty ?? false,
    pinned: false,
    loadError: false,
    document: {
      networkId: options.networkId ?? null,
      name: options.name ?? "Untitled",
      description: options.description ?? "",
    },
    ui: { ...DEFAULT_UI_STATE, ...options.ui },
    createdAt: now,
    updatedAt: now,
  };
};
