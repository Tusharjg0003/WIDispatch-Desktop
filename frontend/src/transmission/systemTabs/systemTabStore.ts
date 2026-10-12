// The Transmission Systems strip's tab store (metadata only; the controller
// owns URL and session work).

import { createTabStore, useTabStore } from "../../tabs/store/createTabStore.ts";
import type { TabStoreState } from "../../tabs/store/createTabStore.ts";
import type { TransmissionTabState } from "../tabs/transmissionTab.types.ts";

export const systemTabStore = createTabStore<TransmissionTabState>();

export const useSystemTabStore = <T,>(
  selector: (state: TabStoreState<TransmissionTabState>) => T
): T => useTabStore(systemTabStore, selector);
