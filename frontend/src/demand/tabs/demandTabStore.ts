import { createTabStore, useTabStore } from "../../tabs/store/createTabStore.ts";
import type { TabStoreState } from "../../tabs/store/createTabStore.ts";
import type { DemandTabState } from "./demandTab.types.ts";

export const demandTabStore = createTabStore<DemandTabState>();

export const useDemandTabStore = <T,>(
  selector: (state: TabStoreState<DemandTabState>) => T
): T => useTabStore(demandTabStore, selector);
