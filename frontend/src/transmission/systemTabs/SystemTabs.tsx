import TabStrip from "../../tabs/components/TabStrip.tsx";
import type { TabCapabilities, TabView } from "../../tabs/components/TabStrip.tsx";
import { useSystemTabStore } from "./systemTabStore.ts";
import { systemTabController } from "./systemTabControllerInstance.ts";

const CAPABILITIES: TabCapabilities = {
  rename: false,
  duplicate: false,
  pin: true,
  create: false,
};

export default function SystemTabs() {
  const order = useSystemTabStore((state) => state.order);
  const tabs = useSystemTabStore((state) => state.tabs);
  const activeTabId = useSystemTabStore((state) => state.activeTabId);

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
      ariaLabel="Open transmission systems"
      className="tab-strip--transmission"
      onActivate={(id) => systemTabController.activateTab(id)}
      onClose={(id) => systemTabController.closeTab(id)}
      onReorder={(from, to) => systemTabController.reorderTabs(from, to)}
      onCloseOthers={(id) => systemTabController.closeOthers(id)}
      onCloseToRight={(id) => systemTabController.closeToRight(id)}
      onTogglePin={(id) => systemTabController.togglePin(id)}
    />
  );
}
