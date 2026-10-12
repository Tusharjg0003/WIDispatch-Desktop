import { createTabStore, useTabStore } from "../../tabs/store/createTabStore.ts";
import type { TabStoreState } from "../../tabs/store/createTabStore.ts";
import type { AssetTabState } from "./assetTab.types.ts";

export const assetTabStore = createTabStore<AssetTabState>();

export const useAssetTabStore = <T,>(selector: (state: TabStoreState<AssetTabState>) => T): T =>
  useTabStore(assetTabStore, selector);
