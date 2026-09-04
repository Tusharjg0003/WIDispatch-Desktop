// Dexie schema for workspace recovery.
//
// Two tables rather than one: reordering tabs or changing the active workspace
// writes a single small `session` row instead of rewriting every workspace
// record.

import Dexie from "dexie";
import type { Table } from "dexie";

import type {
  SessionRecord,
  WorkspaceRecoveryRecord,
} from "./canvasSnapshot.types.ts";

export class CanvasDatabase extends Dexie {
  workspaces!: Table<WorkspaceRecoveryRecord, string>;
  session!: Table<SessionRecord, string>;

  constructor() {
    super("WIDispatchNetworkCanvas");
    this.version(1).stores({
      workspaces: "workspaceId, updatedAt",
      session: "key",
    });
  }
}

/**
 * IndexedDB is unavailable in private-mode Safari and some hardened browser
 * configurations. Detected once so the repository can fall back rather than
 * letting the application fail to boot over a storage feature.
 */
export const isIndexedDbAvailable = (): boolean => {
  try {
    return typeof indexedDB !== "undefined" && indexedDB !== null;
  } catch {
    return false;
  }
};
