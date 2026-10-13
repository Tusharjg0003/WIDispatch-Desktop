import TabStrip from "../../tabs/components/TabStrip.tsx";
import type { TabCapabilities, TabView } from "../../tabs/components/TabStrip.tsx";
import { useTabWindowStrip } from "../../windows/useTabWindowStrip.ts";
import { useAssetTabStore } from "./assetTabStore.ts";
import { assetTabController, openNewAssetTab } from "./assetTabControllerInstance.ts";
import { isNewAssetKey } from "./assetTab.types.ts";

const CAPABILITIES: TabCapabilities = {
  rename: false,
  duplicate: false,
  pin: true,
  create: true,
};

export default function AssetRegistryTabs() {
  const order = useAssetTabStore((state) => state.order);
  const tabs = useAssetTabStore((state) => state.tabs);
  const activeTabId = useAssetTabStore((state) => state.activeTabId);
  const win = useTabWindowStrip({
    domain: "asset-registry",
    order,
    tabs,
    activeTabId,
    pathOf: (tab) => assetTabController.pathOf(tab as never),
    activate: (id) => assetTabController.activateTab(id),
    applyReturn: (id, state) => assetTabController.setTabState(id, { ...(state as object), dirty: false } as never),
    // A "New asset" tab has nothing saved to open elsewhere yet.
    canDetach: (tab) => !isNewAssetKey(tab.key),
  });

  const views: TabView[] = order.flatMap((id) => {
    const tab = tabs[id];
    if (!tab) return [];
    return [{ id, title: tab.title, pinned: tab.pinned, permanent: tab.permanent, windowed: win.windowedIds.has(id), dirty: Boolean(tab.state.dirty) }];
  });

  return (
    <TabStrip
      tabs={views}
      activeId={activeTabId}
      capabilities={CAPABILITIES}
      ariaLabel="Open assets"
      className="tab-strip--asset-registry"
      newTabLabel="New asset"
      onActivate={(id) => assetTabController.activateTab(id)}
      onClose={(id) => assetTabController.closeTab(id)}
      onReorder={(from, to) => assetTabController.reorderTabs(from, to)}
      onCloseOthers={(id) => assetTabController.closeOthers(id)}
      onCloseToRight={(id) => assetTabController.closeToRight(id)}
      onTogglePin={(id) => assetTabController.togglePin(id)}
      onDetach={win.onDetach}
      onShowWindow={win.onShowWindow}
      onCreate={() => openNewAssetTab()}
    />
  );
}
