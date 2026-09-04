// Pure recovery parsing — no Dexie, no IndexedDB, no async.
//
// Everything worth testing about recovery lives here so the Dexie layer can
// stay a thin I/O shell. Rows arrive as `unknown` because they were written by
// a possibly older version of this schema.

import {
  SessionRecordSchema,
  WorkspaceRecoveryRecordSchema,
} from "./canvasSnapshot.schemas.ts";
import type {
  CanvasSnapshot,
  RecoveredSession,
} from "./canvasSnapshot.types.ts";
import type { WorkspaceInstance } from "../../workspace/types/workspace.types.ts";

export interface ParseDiagnostics {
  onDroppedRecord?: (index: number, reason: string) => void;
  onDroppedSession?: (reason: string) => void;
}

/**
 * Validates rows read back from IndexedDB into a usable session.
 *
 * Degradation is deliberate and one-way: a record that fails validation is
 * dropped, never thrown. One corrupt workspace from an older schema must not
 * stop the remaining tabs from recovering.
 */
export const parseRecoveredSession = (
  rows: unknown[],
  sessionRow: unknown,
  diagnostics: ParseDiagnostics = {}
): RecoveredSession => {
  const workspaces: WorkspaceInstance[] = [];
  const snapshots = new Map<string, CanvasSnapshot>();
  let droppedRecordCount = 0;

  (rows || []).forEach((row, index) => {
    const parsed = WorkspaceRecoveryRecordSchema.safeParse(row);
    if (!parsed.success) {
      droppedRecordCount += 1;
      diagnostics.onDroppedRecord?.(index, parsed.error.message);
      return;
    }
    const record = parsed.data;
    // A record whose key disagrees with its payload is internally
    // inconsistent; trusting either half could resurrect the wrong graph.
    if (record.workspaceId !== record.workspace.id) {
      droppedRecordCount += 1;
      diagnostics.onDroppedRecord?.(index, "workspaceId does not match workspace.id");
      return;
    }
    workspaces.push(record.workspace as WorkspaceInstance);
    snapshots.set(record.workspaceId, record.snapshot as CanvasSnapshot);
  });

  const known = new Set(workspaces.map((w) => w.id));

  // Order and active id come from the session row when it is valid, but are
  // always reconciled against the workspaces that actually survived.
  const session = SessionRecordSchema.safeParse(sessionRow);
  if (!session.success && sessionRow != null) {
    diagnostics.onDroppedSession?.(session.error.message);
  }

  const orderedFromSession = session.success
    ? session.data.order.filter((id) => known.has(id))
    : [];

  const missing = workspaces
    .filter((w) => !orderedFromSession.includes(w.id))
    .sort((a, b) => a.createdAt - b.createdAt)
    .map((w) => w.id);

  const order = [...orderedFromSession, ...missing];

  const sessionActive =
    session.success && session.data.activeWorkspaceId !== null
      ? session.data.activeWorkspaceId
      : null;

  let activeWorkspaceId: string | null = null;
  if (sessionActive && known.has(sessionActive)) {
    activeWorkspaceId = sessionActive;
  } else if (workspaces.length) {
    // Fall back to the most recently touched surviving workspace.
    activeWorkspaceId = [...workspaces].sort(
      (a, b) => b.updatedAt - a.updatedAt
    )[0].id;
  }

  return { workspaces, snapshots, order, activeWorkspaceId, droppedRecordCount };
};
