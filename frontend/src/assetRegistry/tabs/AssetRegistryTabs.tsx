import TabStrip from "../../tabs/components/TabStrip.tsx";
import type { TabCapabilities, TabView } from "../../tabs/components/TabStrip.tsx";
import { useAssetTabStore } from "./assetTabStore.ts";
import { assetTabController, openNewAssetTab } from "./assetTabControllerInstance.ts";

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

  const views: TabView[] = order.flatMap((id) => {
    const tab = tabs[id];
    if (!tab) return [];
    return [{ id, title: tab.title, pinned: tab.pinned, permanent: tab.permanent, dirty: Boolean(tab.state.dirty) }];
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
      onCreate={() => openNewAssetTab()}
    />
  );
}
