// Persistence boundary for workspace recovery.
//
// Deliberately thin: every branching decision worth testing lives in the pure
// parseRecoveredSession, so this shell is table reads/writes and the
// availability fallback only.

import { CanvasDatabase, isIndexedDbAvailable } from "./canvasDb.ts";
import { parseRecoveredSession } from "./parseRecoveredSession.ts";
import { EMPTY_RECOVERED_SESSION } from "./canvasSnapshot.types.ts";
import type {
  RecoveredSession,
  WorkspaceRecoveryRecord,
} from "./canvasSnapshot.types.ts";

export interface CanvasRepository {
  saveWorkspace(record: WorkspaceRecoveryRecord): Promise<void>;
  saveSession(activeWorkspaceId: string | null, order: string[]): Promise<void>;
  deleteWorkspace(workspaceId: string): Promise<void>;
  loadAll(): Promise<RecoveredSession>;
  clear(): Promise<void>;
  readonly available: boolean;
}

/** Used when IndexedDB is unavailable. Switching still works; recovery does not. */
export class InMemoryCanvasRepository implements CanvasRepository {
  readonly available = false;
  #records = new Map<string, WorkspaceRecoveryRecord>();
  #activeWorkspaceId: string | null = null;
  #order: string[] = [];

  async saveWorkspace(record: WorkspaceRecoveryRecord): Promise<void> {
    this.#records.set(record.workspaceId, record);
  }

  async saveSession(activeWorkspaceId: string | null, order: string[]): Promise<void> {
    this.#activeWorkspaceId = activeWorkspaceId;
    this.#order = order;
  }

  async deleteWorkspace(workspaceId: string): Promise<void> {
    this.#records.delete(workspaceId);
  }

  async loadAll(): Promise<RecoveredSession> {
    return parseRecoveredSession([...this.#records.values()], {
      key: "current",
      activeWorkspaceId: this.#activeWorkspaceId,
      order: this.#order,
    });
  }

  async clear(): Promise<void> {
    this.#records.clear();
    this.#order = [];
    this.#activeWorkspaceId = null;
  }
}

export class DexieCanvasRepository implements CanvasRepository {
  readonly available = true;
  #db: CanvasDatabase;

  constructor(db: CanvasDatabase = new CanvasDatabase()) {
    this.#db = db;
  }

  async saveWorkspace(record: WorkspaceRecoveryRecord): Promise<void> {
    await this.#db.workspaces.put(record);
  }

  async saveSession(activeWorkspaceId: string | null, order: string[]): Promise<void> {
    await this.#db.session.put({ key: "current", activeWorkspaceId, order });
  }

  async deleteWorkspace(workspaceId: string): Promise<void> {
    await this.#db.workspaces.delete(workspaceId);
  }

  async loadAll(): Promise<RecoveredSession> {
    const [rows, sessionRow] = await Promise.all([
      this.#db.workspaces.toArray(),
      this.#db.session.get("current"),
    ]);
    return parseRecoveredSession(rows, sessionRow ?? null, {
      onDroppedRecord: (index, reason) =>
        console.warn(`[recovery] dropped workspace record ${index}: ${reason}`),
      onDroppedSession: (reason) =>
        console.warn(`[recovery] session row invalid, deriving order: ${reason}`),
    });
  }

  async clear(): Promise<void> {
    await Promise.all([this.#db.workspaces.clear(), this.#db.session.clear()]);
  }
}

/**
 * Every method swallows storage errors: recovery is a convenience, and a
 * failing quota or a blocked upgrade must never break canvas interaction.
 */
class SafeCanvasRepository implements CanvasRepository {
  #inner: CanvasRepository;

  constructor(inner: CanvasRepository) {
    this.#inner = inner;
  }

  get available(): boolean {
    return this.#inner.available;
  }

  async saveWorkspace(record: WorkspaceRecoveryRecord): Promise<void> {
    try {
      await this.#inner.saveWorkspace(record);
    } catch (error) {
      console.warn("[recovery] failed to save workspace snapshot", error);
    }
  }

  async saveSession(activeWorkspaceId: string | null, order: string[]): Promise<void> {
    try {
      await this.#inner.saveSession(activeWorkspaceId, order);
    } catch (error) {
      console.warn("[recovery] failed to save session", error);
    }
  }

  async deleteWorkspace(workspaceId: string): Promise<void> {
    try {
      await this.#inner.deleteWorkspace(workspaceId);
    } catch (error) {
      console.warn("[recovery] failed to delete workspace snapshot", error);
    }
  }

  async loadAll(): Promise<RecoveredSession> {
    try {
      return await this.#inner.loadAll();
    } catch (error) {
      console.warn("[recovery] failed to read stored workspaces", error);
      return EMPTY_RECOVERED_SESSION;
    }
  }

  async clear(): Promise<void> {
    try {
      await this.#inner.clear();
    } catch (error) {
      console.warn("[recovery] failed to clear stored workspaces", error);
    }
  }
}

export const createCanvasRepository = (): CanvasRepository => {
  if (!isIndexedDbAvailable()) {
    console.warn(
      "[recovery] IndexedDB unavailable — workspace switching will work, " +
        "but open workspaces will not survive a refresh."
    );
    return new SafeCanvasRepository(new InMemoryCanvasRepository());
  }
  try {
    return new SafeCanvasRepository(new DexieCanvasRepository());
  } catch (error) {
    console.warn("[recovery] could not open IndexedDB, falling back", error);
    return new SafeCanvasRepository(new InMemoryCanvasRepository());
  }
};
