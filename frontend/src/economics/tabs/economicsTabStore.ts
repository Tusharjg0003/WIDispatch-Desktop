import { createTabStore, useTabStore } from "../../tabs/store/createTabStore.ts";
import type { TabStoreState } from "../../tabs/store/createTabStore.ts";
import type { EconomicsTabState } from "./economicsTab.types.ts";

export const economicsTabStore = createTabStore<EconomicsTabState>();

export const useEconomicsTabStore = <T,>(
  selector: (state: TabStoreState<EconomicsTabState>) => T
): T => useTabStore(economicsTabStore, selector);
