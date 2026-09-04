// Selected element identity.
//
// Stores IDs only. The authoritative element data lives in Cytoscape; keeping
// copies here would go stale on every edit. The page's `selectedEl` remains a
// derived view-model for editing forms, but workspace-level selection identity
// — the part that must not leak between workspaces — lives here.

import { createStore } from "zustand/vanilla";
import { useStore } from "zustand";

export interface SelectionStoreState {
  selectedElementIds: string[];
  setSelection(ids: string[]): void;
  clearSelection(): void;
}

const sameIds = (a: string[], b: string[]): boolean =>
  a.length === b.length && a.every((id, index) => id === b[index]);

export const selectionStore = createStore<SelectionStoreState>((set, get) => ({
  selectedElementIds: [],

  setSelection(ids) {
    // Cytoscape fires select/unselect per element; bailing on an unchanged
    // list keeps a box-select from re-rendering subscribers once per node.
    if (sameIds(get().selectedElementIds, ids)) return;
    set({ selectedElementIds: ids });
  },

  clearSelection() {
    if (!get().selectedElementIds.length) return;
    set({ selectedElementIds: [] });
  },
}));

export const useSelectionStore = <T,>(
  selector: (state: SelectionStoreState) => T
): T => useStore(selectionStore, selector);
