import TabStrip from "../../tabs/components/TabStrip.tsx";
import type { TabCapabilities, TabView } from "../../tabs/components/TabStrip.tsx";
import { useTabWindowStrip } from "../../windows/useTabWindowStrip.ts";
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
  const win = useTabWindowStrip({
    domain: "economics",
    order,
    tabs,
    activeTabId,
    pathOf: (tab) => `/economics/${encodeURIComponent(tab.key ?? "")}?tab=${(tab.state as { subTab?: string })?.subTab ?? ""}`,
    activate: (id) => economicsTabController.activateTab(id),
    applyReturn: (id, state) => { if (typeof state.subTab === "string") economicsTabController.setSubTab(id, state.subTab as never); },
  });

  const views: TabView[] = order.flatMap((id) => {
    const tab = tabs[id];
    if (!tab) return [];
    return [{ id, title: tab.title, pinned: tab.pinned, permanent: tab.permanent, windowed: win.windowedIds.has(id) }];
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
      onDetach={win.onDetach}
      onShowWindow={win.onShowWindow}
    />
  );
}
