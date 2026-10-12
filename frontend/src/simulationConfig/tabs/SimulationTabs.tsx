import TabStrip from "../../tabs/components/TabStrip.tsx";
import type { TabCapabilities, TabView } from "../../tabs/components/TabStrip.tsx";
import { useSimTabStore } from "./simTabStore.ts";
import { simTabController } from "./simTabControllerInstance.ts";

const CAPABILITIES: TabCapabilities = {
  rename: false,
  duplicate: true,
  pin: true,
  create: true,
};

interface Props {
  onCreate(): void;
  onDuplicate(tabId: string): void;
}

// Open simulations, Network Builder style: + creates one, the dot marks a
// tab with unsaved setup, Duplicate copies a simulation into a new one.
export default function SimulationTabs({ onCreate, onDuplicate }: Props) {
  const order = useSimTabStore((state) => state.order);
  const tabs = useSimTabStore((state) => state.tabs);
  const activeTabId = useSimTabStore((state) => state.activeTabId);

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
      ariaLabel="Open simulations"
      className="tab-strip--workspace tab-strip--simulation"
      newTabLabel="New simulation"
      onActivate={(id) => simTabController.activateTab(id)}
      onClose={(id) => simTabController.closeTab(id)}
      onReorder={(from, to) => simTabController.reorderTabs(from, to)}
      onCloseOthers={(id) => simTabController.closeOthers(id)}
      onCloseToRight={(id) => simTabController.closeToRight(id)}
      onTogglePin={(id) => simTabController.togglePin(id)}
      onCreate={onCreate}
      onDuplicate={onDuplicate}
    />
  );
}
