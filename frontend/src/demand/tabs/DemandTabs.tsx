import TabStrip from "../../tabs/components/TabStrip.tsx";
import type { TabCapabilities, TabView } from "../../tabs/components/TabStrip.tsx";
import { useDemandTabStore } from "./demandTabStore.ts";
import { demandTabController } from "./demandTabControllerInstance.ts";

const CAPABILITIES: TabCapabilities = {
  rename: false,
  duplicate: false,
  pin: true,
  create: false,
};

export default function DemandTabs() {
  const order = useDemandTabStore((state) => state.order);
  const tabs = useDemandTabStore((state) => state.tabs);
  const activeTabId = useDemandTabStore((state) => state.activeTabId);

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
      ariaLabel="Open city gates"
      className="tab-strip--demand"
      onActivate={(id) => demandTabController.activateTab(id)}
      onClose={(id) => demandTabController.closeTab(id)}
      onReorder={(from, to) => demandTabController.reorderTabs(from, to)}
      onCloseOthers={(id) => demandTabController.closeOthers(id)}
      onCloseToRight={(id) => demandTabController.closeToRight(id)}
      onTogglePin={(id) => demandTabController.togglePin(id)}
    />
  );
}
