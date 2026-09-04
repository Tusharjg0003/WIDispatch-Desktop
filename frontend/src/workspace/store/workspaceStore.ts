// Workspace metadata store.
//
// This store is PURE, SYNCHRONOUS state: Immer reducers only. Every async or
// cross-module operation (activating, loading, persisting) lives in
// WorkspaceController. Keeping the store incapable of async work is what makes
// "no workspace transactions from React effects" structurally enforceable
// rather than merely a convention.
//
// The store never holds the Cytoscape instance, graph elements, or snapshots.

import { createStore } from "zustand/vanilla";
import { useStore } from "zustand";
import { produce } from "immer";

import {
  createWorkspaceInstance,
  DEFAULT_UI_STATE,
} from "../types/workspace.types.ts";
import type {
  ClosedWorkspace,
  CreateWorkspaceOptions,
  WorkspaceInstance,
  WorkspaceUiState,
} from "../types/workspace.types.ts";

const RECENTLY_CLOSED_LIMIT = 10;

export interface WorkspaceStoreState {
  activeWorkspaceId: string | null;
  /** A switch has been requested but not committed. UI-only; never a capture key. */
  pendingWorkspaceId: string | null;
  instances: Record<string, WorkspaceInstance>;
  order: string[];
  recentlyClosed: ClosedWorkspace[];

  addWorkspace(workspace: WorkspaceInstance, index?: number): void;
  createWorkspace(options?: CreateWorkspaceOptions): WorkspaceInstance;
  setActive(id: string | null): void;
  setPending(id: string | null): void;
  removeWorkspace(id: string, snapshotElements: unknown[] | null): void;
  renameWorkspace(id: string, name: string): void;
  markDirty(id: string): void;
  markSaved(id: string, patch: { networkId?: string | null; name?: string }): void;
  setLoadError(id: string, loadError: boolean): void;
  updateWorkspaceUI(id: string, patch: Partial<WorkspaceUiState>): void;
  reorderWorkspaces(from: number, to: number): void;
  togglePin(id: string): void;
  popRecentlyClosed(): ClosedWorkspace | null;
  hydrate(input: {
    workspaces: WorkspaceInstance[];
    order: string[];
    activeWorkspaceId: string | null;
  }): void;
  reset(): void;
}

/** Number of leading pinned tabs — the boundary reorder clamps against. */
export const pinnedCount = (
  order: string[],
  instances: Record<string, WorkspaceInstance>
): number => {
  let count = 0;
  for (const id of order) {
    if (!instances[id]?.pinned) break;
    count += 1;
  }
  return count;
};

/** Which workspace becomes active when `id` closes: right neighbour, else left. */
export const neighbourAfterClose = (
  order: string[],
  closingId: string
): string | null => {
  const index = order.indexOf(closingId);
  if (index === -1) return null;
  const remaining = order.filter((id) => id !== closingId);
  if (!remaining.length) return null;
  // The element that shifted into this index is the right neighbour.
  return remaining[Math.min(index, remaining.length - 1)];
};

const touch = (workspace: WorkspaceInstance): void => {
  workspace.updatedAt = Date.now();
};

export const workspaceStore = createStore<WorkspaceStoreState>((set, get) => ({
  activeWorkspaceId: null,
  pendingWorkspaceId: null,
  instances: {},
  order: [],
  recentlyClosed: [],

  addWorkspace(workspace, index) {
    set(
      produce((state: WorkspaceStoreState) => {
        state.instances[workspace.id] = workspace;
        const at = index === undefined ? state.order.length : index;
        state.order.splice(Math.max(0, Math.min(at, state.order.length)), 0, workspace.id);
      })
    );
  },

  createWorkspace(options = {}) {
    const workspace = createWorkspaceInstance(options);
    get().addWorkspace(workspace);
    return workspace;
  },

  setActive(id) {
    set({ activeWorkspaceId: id, pendingWorkspaceId: null });
  },

  setPending(id) {
    set({ pendingWorkspaceId: id });
  },

  removeWorkspace(id, snapshotElements) {
    set(
      produce((state: WorkspaceStoreState) => {
        const workspace = state.instances[id];
        if (!workspace) return;
        const index = state.order.indexOf(id);

        state.recentlyClosed.unshift({ workspace, snapshotElements, index });
        if (state.recentlyClosed.length > RECENTLY_CLOSED_LIMIT) {
          state.recentlyClosed.length = RECENTLY_CLOSED_LIMIT;
        }

        delete state.instances[id];
        if (index !== -1) state.order.splice(index, 1);
        if (state.activeWorkspaceId === id) state.activeWorkspaceId = null;
        if (state.pendingWorkspaceId === id) state.pendingWorkspaceId = null;
      })
    );
  },

  renameWorkspace(id, name) {
    set(
      produce((state: WorkspaceStoreState) => {
        const workspace = state.instances[id];
        if (!workspace) return;
        workspace.document.name = name;
        // document.name is persisted to the backend, so a rename is a document
        // mutation, not a UI one.
        workspace.dirty = true;
        touch(workspace);
      })
    );
  },

  markDirty(id) {
    set(
      produce((state: WorkspaceStoreState) => {
        const workspace = state.instances[id];
        if (!workspace || workspace.dirty) return;
        workspace.dirty = true;
        touch(workspace);
      })
    );
  },

  markSaved(id, patch) {
    set(
      produce((state: WorkspaceStoreState) => {
        const workspace = state.instances[id];
        if (!workspace) return;
        workspace.dirty = false;
        workspace.loadError = false;
        if (patch.networkId !== undefined) workspace.document.networkId = patch.networkId;
        if (patch.name !== undefined) workspace.document.name = patch.name;
        touch(workspace);
      })
    );
  },

  setLoadError(id, loadError) {
    set(
      produce((state: WorkspaceStoreState) => {
        const workspace = state.instances[id];
        if (!workspace) return;
        workspace.loadError = loadError;
      })
    );
  },

  updateWorkspaceUI(id, patch) {
    set(
      produce((state: WorkspaceStoreState) => {
        const workspace = state.instances[id];
        if (!workspace) return;
        workspace.ui = { ...workspace.ui, ...patch };
        // UI changes deliberately do not touch `dirty` or `updatedAt`:
        // updatedAt drives recovery's active-workspace fallback, and a pan
        // should not outrank a real edit there.
      })
    );
  },

  reorderWorkspaces(from, to) {
    set(
      produce((state: WorkspaceStoreState) => {
        const { order, instances } = state;
        if (from < 0 || from >= order.length) return;
        const movingId = order[from];
        const isPinned = Boolean(instances[movingId]?.pinned);
        const pinned = pinnedCount(order, instances);

        // Clamp into the mover's own region so an unpinned tab can never land
        // ahead of a pinned one, and vice versa.
        const [lower, upper] = isPinned
          ? [0, pinned - 1]
          : [pinned, order.length - 1];
        const target = Math.max(lower, Math.min(to, upper));
        if (target === from) return;

        order.splice(from, 1);
        order.splice(target, 0, movingId);
        // activeWorkspaceId is deliberately untouched: reordering must never
        // change which workspace is active.
      })
    );
  },

  togglePin(id) {
    set(
      produce((state: WorkspaceStoreState) => {
        const workspace = state.instances[id];
        if (!workspace) return;
        workspace.pinned = !workspace.pinned;

        const index = state.order.indexOf(id);
        if (index === -1) return;
        state.order.splice(index, 1);
        // Re-seat at the pinned/unpinned boundary to preserve the invariant
        // that every pinned tab precedes every unpinned one.
        const boundary = pinnedCount(state.order, state.instances);
        state.order.splice(workspace.pinned ? boundary : boundary, 0, id);
      })
    );
  },

  popRecentlyClosed() {
    const entry = get().recentlyClosed[0];
    if (!entry) return null;
    set(
      produce((state: WorkspaceStoreState) => {
        state.recentlyClosed.shift();
      })
    );
    return entry;
  },

  hydrate({ workspaces, order, activeWorkspaceId }) {
    const instances: Record<string, WorkspaceInstance> = {};
    workspaces.forEach((workspace) => {
      instances[workspace.id] = {
        ...workspace,
        ui: { ...DEFAULT_UI_STATE, ...workspace.ui },
      };
    });
    set({
      instances,
      order: order.filter((id) => instances[id]),
      activeWorkspaceId,
      pendingWorkspaceId: null,
      recentlyClosed: [],
    });
  },

  reset() {
    set({
      activeWorkspaceId: null,
      pendingWorkspaceId: null,
      instances: {},
      order: [],
      recentlyClosed: [],
    });
  },
}));

export const useWorkspaceStore = <T,>(
  selector: (state: WorkspaceStoreState) => T
): T => useStore(workspaceStore, selector);
