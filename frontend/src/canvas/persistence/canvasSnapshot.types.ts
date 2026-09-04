// Persistence-facing types for canvas snapshots and workspace recovery.

import type {
  CanvasViewport,
  WorkspaceInstance,
} from "../../workspace/types/workspace.types.ts";

export const SNAPSHOT_VERSION = 1;

export interface CanvasSnapshot {
  version: number;
  /** Cytoscape element JSON, as produced by `snapshotElements`. */
  elements: unknown[];
  viewport: CanvasViewport | null;
}

/** One row of the Dexie `workspaces` table. */
export interface WorkspaceRecoveryRecord {
  workspaceId: string;
  workspace: WorkspaceInstance;
  snapshot: CanvasSnapshot;
  updatedAt: number;
}

/** The single row of the Dexie `session` table. */
export interface SessionRecord {
  key: "current";
  activeWorkspaceId: string | null;
  order: string[];
}

export interface RecoveredSession {
  workspaces: WorkspaceInstance[];
  snapshots: Map<string, CanvasSnapshot>;
  order: string[];
  activeWorkspaceId: string | null;
  /** Records dropped by validation — surfaced so recovery can be reported. */
  droppedRecordCount: number;
}

export const EMPTY_RECOVERED_SESSION: RecoveredSession = {
  workspaces: [],
  snapshots: new Map(),
  order: [],
  activeWorkspaceId: null,
  droppedRecordCount: 0,
};
