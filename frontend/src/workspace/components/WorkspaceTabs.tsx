import { useCallback, useState } from "react";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import type { DragEndEvent } from "@dnd-kit/core";
import {
  restrictToHorizontalAxis,
  restrictToParentElement,
} from "@dnd-kit/modifiers";
import {
  SortableContext,
  horizontalListSortingStrategy,
} from "@dnd-kit/sortable";

import WorkspaceTab from "./WorkspaceTab.tsx";
import WorkspaceTabContextMenu from "./WorkspaceTabContextMenu.tsx";
import { useWorkspaceStore } from "../store/workspaceStore.ts";
import { workspaceController } from "../services/workspaceControllerInstance.ts";
import "./WorkspaceTabs.css";

interface MenuState {
  workspaceId: string;
  x: number;
  y: number;
}

export default function WorkspaceTabs() {
  const order = useWorkspaceStore((state) => state.order);
  const instances = useWorkspaceStore((state) => state.instances);
  const activeWorkspaceId = useWorkspaceStore((state) => state.activeWorkspaceId);
  const pendingWorkspaceId = useWorkspaceStore((state) => state.pendingWorkspaceId);

  const [menu, setMenu] = useState<MenuState | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      // Without a small threshold every click would begin a drag and the tab
      // would never activate.
      activationConstraint: { distance: 4 },
    })
  );

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const from = order.indexOf(String(active.id));
    const to = order.indexOf(String(over.id));
    if (from === -1 || to === -1) return;
    workspaceController.reorderWorkspaces(from, to);
  }, [order]);

  const dismissMenu = useCallback(() => setMenu(null), []);

  if (!order.length) return null;

  const menuWorkspace = menu ? instances[menu.workspaceId] : null;
  const menuIndex = menu ? order.indexOf(menu.workspaceId) : -1;

  return (
    <div className="ws-tabs" role="tablist" aria-label="Open networks">
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        modifiers={[restrictToHorizontalAxis, restrictToParentElement]}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={order} strategy={horizontalListSortingStrategy}>
          <div className="ws-tabs__strip">
            {order.map((id) => {
              const workspace = instances[id];
              if (!workspace) return null;
              return (
                <WorkspaceTab
                  key={id}
                  workspace={workspace}
                  active={id === activeWorkspaceId}
                  pending={id === pendingWorkspaceId}
                  renaming={id === renamingId}
                  onActivate={() => void workspaceController.activateWorkspace(id)}
                  onClose={() => void workspaceController.closeWorkspace(id)}
                  onStartRename={() => setRenamingId(id)}
                  onCommitRename={(name) => {
                    workspaceController.renameWorkspace(id, name);
                    setRenamingId(null);
                  }}
                  onCancelRename={() => setRenamingId(null)}
                  onContextMenu={(event) => {
                    event.preventDefault();
                    setMenu({ workspaceId: id, x: event.clientX, y: event.clientY });
                  }}
                />
              );
            })}
          </div>
        </SortableContext>
      </DndContext>

      <button
        type="button"
        className="ws-tabs__new"
        title="New network (Ctrl/Cmd+Alt+N)"
        aria-label="New network"
        onClick={() => void workspaceController.createWorkspace()}
      >
        +
      </button>

      {menu && menuWorkspace && (
        <WorkspaceTabContextMenu
          x={menu.x}
          y={menu.y}
          pinned={menuWorkspace.pinned}
          canCloseOthers={order.some(
            (id) => id !== menu.workspaceId && !instances[id]?.pinned
          )}
          canCloseToRight={order
            .slice(menuIndex + 1)
            .some((id) => !instances[id]?.pinned)}
          onRename={() => setRenamingId(menu.workspaceId)}
          onDuplicate={() => void workspaceController.duplicateWorkspace(menu.workspaceId)}
          onTogglePin={() => workspaceController.togglePin(menu.workspaceId)}
          onClose={() => void workspaceController.closeWorkspace(menu.workspaceId)}
          onCloseOthers={() => void workspaceController.closeOthers(menu.workspaceId)}
          onCloseToRight={() => void workspaceController.closeToRight(menu.workspaceId)}
          onDismiss={dismissMenu}
        />
      )}
    </div>
  );
}
