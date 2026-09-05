// The Production strip's tab store. Metadata only, as the factory requires:
// every operation that touches storage or the URL lives in
// ProductionTabController.

import { createTabStore, useTabStore } from "../../tabs/store/createTabStore.ts";
import type { TabStoreState } from "../../tabs/store/createTabStore.ts";
import type { ProductionTabState } from "./productionTab.types.ts";

export const productionTabStore = createTabStore<ProductionTabState>();

export const useProductionTabStore = <T,>(
  selector: (state: TabStoreState<ProductionTabState>) => T
): T => useTabStore(productionTabStore, selector);
