// Tab metadata store factory for snapshot-free domains.
//
// PURE, SYNCHRONOUS state only. Anything async or cross-module — loading,
// persisting, URL mirroring — belongs in a domain controller. A store that
// cannot perform a transaction cannot have one driven from a React effect.
//
// Unlike workspaceStore this uses plain immutable updates rather than Immer:
// `produce` over a generic TState drags Draft<T> through every assignment and
// costs a cast per reducer for no behavioural gain.

import { createStore } from "zustand/vanilla";
import type { StoreApi } from "zustand/vanilla";
import { useStore } from "zustand";

import { clampReorder, pinnedCount } from "./tabOrdering.ts";
import type { ClosedTab, TabInstance } from "../types/tab.types.ts";

const DEFAULT_RECENTLY_CLOSED_LIMIT = 10;

export interface TabStoreState<TState> {
  activeTabId: string | null;
  tabs: Record<string, TabInstance<TState>>;
  order: string[];
  recentlyClosed: ClosedTab<TState>[];

  addTab(tab: TabInstance<TState>, index?: number): void;
  setActive(id: string | null): void;
  removeTab(id: string): void;
  renameTab(id: string, title: string): void;
  setTabState(id: string, patch: Partial<TState>): void;
  togglePin(id: string): void;
  reorderTabs(from: number, to: number): void;
  popRecentlyClosed(): ClosedTab<TState> | null;
  hydrate(input: {
    tabs: TabInstance<TState>[];
    order: string[];
    activeTabId: string | null;
  }): void;
  reset(): void;
}

export interface CreateTabStoreOptions {
  recentlyClosedLimit?: number;
}

export const createTabStore = <TState>(options: CreateTabStoreOptions = {}) => {
  const limit = options.recentlyClosedLimit ?? DEFAULT_RECENTLY_CLOSED_LIMIT;

  return createStore<TabStoreState<TState>>((set, get) => ({
    activeTabId: null,
    tabs: {},
    order: [],
    recentlyClosed: [],

    addTab(tab, index) {
      set((prev) => {
        const at = index === undefined ? prev.order.length : index;
        const order = [...prev.order];
        order.splice(Math.max(0, Math.min(at, order.length)), 0, tab.id);
        return { tabs: { ...prev.tabs, [tab.id]: tab }, order };
      });
    },

    setActive(id) {
      set({ activeTabId: id });
    },

    removeTab(id) {
      set((prev) => {
        const tab = prev.tabs[id];
        // Refusal lives here rather than in callers so no code path can close
        // the one tab that gives a domain something to show.
        if (!tab || tab.permanent) return prev;

        const index = prev.order.indexOf(id);
        const tabs = { ...prev.tabs };
        delete tabs[id];

        return {
          tabs,
          order: prev.order.filter((other) => other !== id),
          activeTabId: prev.activeTabId === id ? null : prev.activeTabId,
          recentlyClosed: [{ tab, index }, ...prev.recentlyClosed].slice(0, limit),
        };
      });
    },

    renameTab(id, title) {
      set((prev) => {
        const tab = prev.tabs[id];
        if (!tab) return prev;
        return {
          tabs: { ...prev.tabs, [id]: { ...tab, title, updatedAt: Date.now() } },
        };
      });
    },

    setTabState(id, patch) {
      set((prev) => {
        const tab = prev.tabs[id];
        if (!tab) return prev;
        return {
          tabs: {
            ...prev.tabs,
            [id]: { ...tab, state: { ...tab.state, ...patch }, updatedAt: Date.now() },
          },
        };
      });
    },

    togglePin(id) {
      set((prev) => {
        const tab = prev.tabs[id];
        if (!tab || tab.permanent) return prev;

        const pinned = { ...tab, pinned: !tab.pinned, updatedAt: Date.now() };
        const tabs = { ...prev.tabs, [id]: pinned };
        const order = prev.order.filter((other) => other !== id);
        // Re-seat at the pinned/unpinned boundary, which is the same index in
        // both directions once `id` is out of the array.
        order.splice(pinnedCount(order, tabs), 0, id);
        return { tabs, order };
      });
    },

    reorderTabs(from, to) {
      set((prev) => {
        const target = clampReorder(prev.order, prev.tabs, from, to);
        if (target === null || target === from) return prev;
        const order = [...prev.order];
        const [movingId] = order.splice(from, 1);
        order.splice(target, 0, movingId);
        // activeTabId is deliberately untouched: reordering must never change
        // which tab is active.
        return { order };
      });
    },

    popRecentlyClosed() {
      const entry = get().recentlyClosed[0] ?? null;
      if (entry) set((prev) => ({ recentlyClosed: prev.recentlyClosed.slice(1) }));
      return entry;
    },

    hydrate({ tabs, order, activeTabId }) {
      const byId: Record<string, TabInstance<TState>> = {};
      tabs.forEach((tab) => {
        byId[tab.id] = tab;
      });
      set({
        tabs: byId,
        order: order.filter((id) => byId[id]),
        activeTabId: activeTabId && byId[activeTabId] ? activeTabId : null,
        recentlyClosed: [],
      });
    },

    reset() {
      set({ activeTabId: null, tabs: {}, order: [], recentlyClosed: [] });
    },
  }));
};

// Written as StoreApi rather than ReturnType<typeof createTabStore>: a
// conditional type is not inferable, so callers of useTabStore below would
// fail to infer TState from the store they pass.
export type TabStore<TState> = StoreApi<TabStoreState<TState>>;

/** React binding for a store built by the factory. */
export const useTabStore = <TState, TSelected>(
  store: TabStore<TState>,
  selector: (state: TabStoreState<TState>) => TSelected
): TSelected => useStore(store, selector);
