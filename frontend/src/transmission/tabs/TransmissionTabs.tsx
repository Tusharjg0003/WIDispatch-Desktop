import TabStrip from "../../tabs/components/TabStrip.tsx";
import type { TabCapabilities, TabView } from "../../tabs/components/TabStrip.tsx";
import { useTransmissionTabStore } from "./transmissionTabStore.ts";
import { transmissionTabController } from "./transmissionTabControllerInstance.ts";

const CAPABILITIES: TabCapabilities = {
  rename: false,
  duplicate: false,
  pin: true,
  create: false,
};

export default function TransmissionTabs() {
  const order = useTransmissionTabStore((state) => state.order);
  const tabs = useTransmissionTabStore((state) => state.tabs);
  const activeTabId = useTransmissionTabStore((state) => state.activeTabId);

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
      ariaLabel="Open pump stations"
      className="tab-strip--transmission"
      onActivate={(id) => transmissionTabController.activateTab(id)}
      onClose={(id) => transmissionTabController.closeTab(id)}
      onReorder={(from, to) => transmissionTabController.reorderTabs(from, to)}
      onCloseOthers={(id) => transmissionTabController.closeOthers(id)}
      onCloseToRight={(id) => transmissionTabController.closeToRight(id)}
      onTogglePin={(id) => transmissionTabController.togglePin(id)}
    />
  );
}
