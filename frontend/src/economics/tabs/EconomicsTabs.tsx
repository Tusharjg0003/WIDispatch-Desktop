import TabStrip from "../../tabs/components/TabStrip.tsx";
import type { TabCapabilities, TabView } from "../../tabs/components/TabStrip.tsx";
import { useEconomicsTabStore } from "./economicsTabStore.ts";
import { economicsTabController } from "./economicsTabControllerInstance.ts";

const CAPABILITIES: TabCapabilities = {
  rename: false,
  duplicate: false,
  pin: true,
  create: false,
};

export default function EconomicsTabs() {
  const order = useEconomicsTabStore((state) => state.order);
  const tabs = useEconomicsTabStore((state) => state.tabs);
  const activeTabId = useEconomicsTabStore((state) => state.activeTabId);

  const views: TabView[] = order.flatMap((id) => {
    const tab = tabs[id];
    if (!tab) return [];
    return [{ id, title: tab.title, pinned: tab.pinned, permanent: tab.permanent }];
  });

  return (
    <TabStrip
      tabs={views}
      activeId={activeTabId}
      capabilities={CAPABILITIES}
      ariaLabel="Open plants"
      className="tab-strip--economics"
      onActivate={(id) => economicsTabController.activateTab(id)}
      onClose={(id) => economicsTabController.closeTab(id)}
      onReorder={(from, to) => economicsTabController.reorderTabs(from, to)}
      onCloseOthers={(id) => economicsTabController.closeOthers(id)}
      onCloseToRight={(id) => economicsTabController.closeToRight(id)}
      onTogglePin={(id) => economicsTabController.togglePin(id)}
    />
  );
}
