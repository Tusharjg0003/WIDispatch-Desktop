import TabStrip from "../../tabs/components/TabStrip.tsx";
import type { TabCapabilities, TabView } from "../../tabs/components/TabStrip.tsx";
import { useWorkspaceStore } from "../store/workspaceStore.ts";
import { workspaceController } from "../services/workspaceControllerInstance.ts";
import { useEffect, useMemo } from "react";
import { useTabWindowStrip } from "../../windows/useTabWindowStrip.ts";

const CAPABILITIES: TabCapabilities = {
  rename: true,
  duplicate: true,
  pin: true,
  create: true,
};

export default function WorkspaceTabs() {
  const order = useWorkspaceStore((state) => state.order);
  const instances = useWorkspaceStore((state) => state.instances);
  const activeWorkspaceId = useWorkspaceStore((state) => state.activeWorkspaceId);
  const pendingWorkspaceId = useWorkspaceStore((state) => state.pendingWorkspaceId);

  // A network canvas can go out into its own window; its unsaved graph
  // travels through its recovery record, which the window then owns.
  const stripTabs = useMemo(
    () =>
      Object.fromEntries(
        order.map((id) => [id, instances[id] ? { id, key: id, title: instances[id].document.name } : undefined])
      ),
    [order, instances]
  );
  const win = useTabWindowStrip({
    domain: "workspace",
    order,
    tabs: stripTabs,
    activeTabId: activeWorkspaceId,
    pathOf: (tab) => {
      const networkId = instances[tab.id]?.document.networkId;
      return networkId ? `/network-builder/${encodeURIComponent(networkId)}` : "/network-builder";
    },
    activate: (id) => void workspaceController.activateWorkspace(id),
    beforeDetach: (tab) => workspaceController.prepareForWindow(tab.id),
    onReturned: (id) => void workspaceController.reloadFromRecovery(id),
    onNoneLeft: () => void workspaceController.createWorkspace(),
  });
  useEffect(() => workspaceController.setDetached(win.windowedIds), [win.windowedIds]);

  // The workspace shape is richer than the strip's view model; mapping it here
  // keeps the strip domain-neutral and leaves the canvas store untouched.
  const tabs: TabView[] = order.flatMap((id) => {
    const workspace = instances[id];
    if (!workspace) return [];
    return [
      {
        id,
        title: workspace.document.name,
        pinned: workspace.pinned,
        permanent: false,
        dirty: workspace.dirty,
        warning: workspace.loadError ? "couldn't load" : null,
        windowed: win.windowedIds.has(id),
      },
    ];
  });

  return (
    <TabStrip
      tabs={tabs}
      activeId={activeWorkspaceId}
      pendingId={pendingWorkspaceId}
      capabilities={CAPABILITIES}
      ariaLabel="Open networks"
      className="tab-strip--workspace"
      newTabLabel="New network (Ctrl/Cmd+Alt+N)"
      onActivate={(id) => void workspaceController.activateWorkspace(id)}
      onClose={(id) => void workspaceController.closeWorkspace(id)}
      onReorder={(from, to) => {
        // TabStrip computes from/to over the FILTERED `tabs` array above, but
        // reorderWorkspaces indexes the raw store `order` (which can be
        // longer, when an id in `order` has no instance yet). Translate back
        // through the tab ids so a drag can never move the wrong workspace.
        const fromId = tabs[from]?.id;
        const toId = tabs[to]?.id;
        if (fromId == null || toId == null) return;
        const rawFrom = order.indexOf(fromId);
        const rawTo = order.indexOf(toId);
        if (rawFrom === -1 || rawTo === -1) return;
        workspaceController.reorderWorkspaces(rawFrom, rawTo);
      }}
      onCloseOthers={(id) => void workspaceController.closeOthers(id)}
      onCloseToRight={(id) => void workspaceController.closeToRight(id)}
      onRename={(id, title) => workspaceController.renameWorkspace(id, title)}
      onDuplicate={(id) => void workspaceController.duplicateWorkspace(id)}
      onTogglePin={(id) => workspaceController.togglePin(id)}
      onCreate={() => void workspaceController.createWorkspace()}
      onDetach={win.onDetach}
      onShowWindow={win.onShowWindow}
    />
  );
}
