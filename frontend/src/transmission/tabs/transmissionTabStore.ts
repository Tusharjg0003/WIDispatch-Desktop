// The transmission pump-station strip's tab store. Metadata only: the
// controller owns the async URL/session work.

import { createTabStore, useTabStore } from "../../tabs/store/createTabStore.ts";
import type { TabStoreState } from "../../tabs/store/createTabStore.ts";
import type { TransmissionTabState } from "./transmissionTab.types.ts";

export const transmissionTabStore = createTabStore<TransmissionTabState>();

export const useTransmissionTabStore = <T,>(
  selector: (state: TabStoreState<TransmissionTabState>) => T
): T => useTabStore(transmissionTabStore, selector);
