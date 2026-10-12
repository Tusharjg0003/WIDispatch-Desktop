import { RecordTabController } from "../../tabs/controller/RecordTabController.ts";
import { createTabSessionStorage } from "../../tabs/persistence/tabSessionStorage.ts";
import { assetTabStore } from "./assetTabStore.ts";
import { ASSET_LIST_TAB_TITLE, DEFAULT_ASSET_SUB_TAB, NEW_ASSET_PREFIX, isAssetSubTab, isNewAssetKey } from "./assetTab.types.ts";
import type { AssetTabState } from "./assetTab.types.ts";

export const assetTabController = new RecordTabController<AssetTabState>({
  storage: createTabSessionStorage("asset-registry"),
  store: assetTabStore,
  basePath: "/asset-registry",
  listTitle: ASSET_LIST_TAB_TITLE,
  isSubTab: isAssetSubTab,
  defaultSubTab: DEFAULT_ASSET_SUB_TAB,
  label: "asset",
  // The registry's existing URLs: /asset-registry, /create, /view/:id, /edit/:id.
  pathFor: (tab) => {
    if (!tab.key) return "/asset-registry";
    if (isNewAssetKey(tab.key)) return "/asset-registry/create";
    return `/asset-registry/${tab.state.subTab === "edit" ? "edit" : "view"}/${encodeURIComponent(tab.key)}`;
  },
  // Form input is not stored, so a reloaded tab is never "unsaved".
  parseState: (_raw, base) => ({ ...base, dirty: false }),
  beforeClose: (tab) => !tab.state.dirty || window.confirm(`Discard unsaved changes to "${tab.title}"?`),
});

let newSeq = 0;
/** Open a fresh "New asset" tab (on the form). */
export const openNewAssetTab = (): string => {
  newSeq += 1;
  return assetTabController.openRecord(`${NEW_ASSET_PREFIX}${Date.now().toString(36)}-${newSeq}`, "New asset", { subTab: "edit" });
};
