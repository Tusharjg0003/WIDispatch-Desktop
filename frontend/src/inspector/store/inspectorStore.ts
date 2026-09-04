// Inspector (right panel) state.
//
// This is the LIVE state the UI binds to. `workspace.ui` is the persisted
// shape; WorkspaceController flushes this store into it on switch-out and
// hydrates it back on switch-in. Components subscribe here rather than to the
// workspace store so an inspector click does not re-render every tab.

import { createStore } from "zustand/vanilla";
import { useStore } from "zustand";

import type { InspectorTab } from "../../workspace/types/workspace.types.ts";

export interface InspectorStoreState {
  open: boolean;
  activeTab: InspectorTab;

  openInspector(tab?: InspectorTab): void;
  closeInspector(): void;
  toggleInspector(tab?: InspectorTab): void;
  setActiveTab(tab: InspectorTab): void;
  hydrate(ui: { inspectorOpen: boolean; inspectorTab: InspectorTab }): void;
}

export const inspectorStore = createStore<InspectorStoreState>((set, get) => ({
  open: true,
  activeTab: "details",

  openInspector(tab) {
    set(tab ? { open: true, activeTab: tab } : { open: true });
  },

  closeInspector() {
    set({ open: false });
  },

  toggleInspector(tab) {
    const state = get();
    // Clicking the tab you are already on closes the panel; clicking a
    // different one switches to it rather than closing.
    if (state.open && (!tab || state.activeTab === tab)) {
      set({ open: false });
      return;
    }
    set(tab ? { open: true, activeTab: tab } : { open: true });
  },

  setActiveTab(tab) {
    set({ activeTab: tab });
  },

  hydrate(ui) {
    set({ open: ui.inspectorOpen, activeTab: ui.inspectorTab });
  },
}));

export const useInspectorStore = <T,>(
  selector: (state: InspectorStoreState) => T
): T => useStore(inspectorStore, selector);
