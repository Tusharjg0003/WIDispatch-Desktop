import { createTabStore, useTabStore } from "../../tabs/store/createTabStore.ts";
import type { TabStoreState } from "../../tabs/store/createTabStore.ts";
import type { SimTabState } from "./simTab.types.ts";

export const simTabStore = createTabStore<SimTabState>();

export const useSimTabStore = <T,>(selector: (state: TabStoreState<SimTabState>) => T): T =>
  useTabStore(simTabStore, selector);
