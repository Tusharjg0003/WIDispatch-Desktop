import TabStrip from "../../tabs/components/TabStrip.tsx";
import type { TabCapabilities, TabView } from "../../tabs/components/TabStrip.tsx";
import { useProductionTabStore } from "./productionTabStore.ts";
import { productionTabController } from "./productionTabControllerInstance.ts";

// A plant tab is named after its plant and there is no blank new plant, so
// renaming, duplicating and "+" have no meaning here.
const CAPABILITIES: TabCapabilities = {
  rename: false,
  duplicate: false,
  pin: true,
  create: false,
};

export default function ProductionTabs() {
  const order = useProductionTabStore((state) => state.order);
  const tabs = useProductionTabStore((state) => state.tabs);
  const activeTabId = useProductionTabStore((state) => state.activeTabId);

  const views: TabView[] = order.flatMap((id) => {
    const tab = tabs[id];
    if (!tab) return [];
    return [
      { id, title: tab.title, pinned: tab.pinned, permanent: tab.permanent },
    ];
  });

  return (
    <TabStrip
      tabs={views}
      activeId={activeTabId}
      capabilities={CAPABILITIES}
      ariaLabel="Open plants"
      className="tab-strip--production"
      onActivate={(id) => productionTabController.activateTab(id)}
      onClose={(id) => productionTabController.closeTab(id)}
      onReorder={(from, to) => productionTabController.reorderTabs(from, to)}
      onCloseOthers={(id) => productionTabController.closeOthers(id)}
      onCloseToRight={(id) => productionTabController.closeToRight(id)}
      onTogglePin={(id) => productionTabController.togglePin(id)}
    />
  );
}
