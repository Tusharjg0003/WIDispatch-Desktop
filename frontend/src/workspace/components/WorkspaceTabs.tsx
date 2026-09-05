import TabStrip from "../../tabs/components/TabStrip.tsx";
import type { TabCapabilities, TabView } from "../../tabs/components/TabStrip.tsx";
import { useWorkspaceStore } from "../store/workspaceStore.ts";
import { workspaceController } from "../services/workspaceControllerInstance.ts";

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
      onReorder={(from, to) => workspaceController.reorderWorkspaces(from, to)}
      onCloseOthers={(id) => void workspaceController.closeOthers(id)}
      onCloseToRight={(id) => void workspaceController.closeToRight(id)}
      onRename={(id, title) => workspaceController.renameWorkspace(id, title)}
      onDuplicate={(id) => void workspaceController.duplicateWorkspace(id)}
      onTogglePin={(id) => workspaceController.togglePin(id)}
      onCreate={() => void workspaceController.createWorkspace()}
    />
  );
}
