// Issues panel sub-mode.
//
// Deliberately separate from the inspector's active tab: "Issues" and "Find"
// are two faces of one inspector tab, not two inspector tabs. Merging them
// into a single activeTab is the namespacing mistake the architecture spec
// calls out.

import { createStore } from "zustand/vanilla";
import { useStore } from "zustand";

import type { IssuePanelMode } from "../../workspace/types/workspace.types.ts";

export interface IssuesStoreState {
  mode: IssuePanelMode;
  setMode(mode: IssuePanelMode): void;
}

export const issuesStore = createStore<IssuesStoreState>((set) => ({
  mode: "issues",
  setMode(mode) {
    set({ mode });
  },
}));

export const useIssuesStore = <T,>(
  selector: (state: IssuesStoreState) => T
): T => useStore(issuesStore, selector);
