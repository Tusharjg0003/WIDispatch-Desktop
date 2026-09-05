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

import Tab from "./Tab.tsx";
import TabContextMenu from "./TabContextMenu.tsx";
import type { TabView } from "./Tab.tsx";
import type { TabCapabilities } from "./TabContextMenu.tsx";
import "./tabs.css";

export type { TabView } from "./Tab.tsx";
export type { TabCapabilities } from "./TabContextMenu.tsx";

interface MenuState {
  tabId: string;
  x: number;
  y: number;
}

export interface TabStripProps {
  tabs: TabView[];
  activeId: string | null;
  /** A tab whose content is still resolving. Domains without async switching pass null. */
  pendingId?: string | null;
  capabilities: TabCapabilities;
  ariaLabel: string;
  /** Domain modifier class, e.g. "tab-strip--production". */
  className?: string;
  newTabLabel?: string;
  onActivate(id: string): void;
  onClose(id: string): void;
  onReorder(from: number, to: number): void;
  onCloseOthers(id: string): void;
  onCloseToRight(id: string): void;
  onRename?(id: string, title: string): void;
  onDuplicate?(id: string): void;
  onTogglePin?(id: string): void;
  onCreate?(): void;
}

export default function TabStrip({
  tabs,
  activeId,
  pendingId = null,
  capabilities,
  ariaLabel,
  className,
  newTabLabel = "New tab",
  onActivate,
  onClose,
  onReorder,
  onCloseOthers,
  onCloseToRight,
  onRename,
  onDuplicate,
  onTogglePin,
  onCreate,
}: TabStripProps) {
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      // Without a small threshold every click would begin a drag and the tab
      // would never activate.
      activationConstraint: { distance: 4 },
    })
  );

  const ids = tabs.map((tab) => tab.id);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      const from = ids.indexOf(String(active.id));
      const to = ids.indexOf(String(over.id));
      if (from === -1 || to === -1) return;
      onReorder(from, to);
    },
    [ids, onReorder]
  );

  const dismissMenu = useCallback(() => setMenu(null), []);

  if (!tabs.length) return null;

  const menuIndex = menu ? ids.indexOf(menu.tabId) : -1;
  const menuTab = menuIndex === -1 ? null : tabs[menuIndex];

  return (
    <div
      className={["tab-strip", className].filter(Boolean).join(" ")}
      role="tablist"
      aria-label={ariaLabel}
    >
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        modifiers={[restrictToHorizontalAxis, restrictToParentElement]}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={ids} strategy={horizontalListSortingStrategy}>
          <div className="tab-strip__list">
            {tabs.map((tab) => (
              <Tab
                key={tab.id}
                tab={tab}
                active={tab.id === activeId}
                pending={tab.id === pendingId}
                renaming={tab.id === renamingId}
                onActivate={() => onActivate(tab.id)}
                onClose={() => onClose(tab.id)}
                onStartRename={() => {
                  if (capabilities.rename && !tab.permanent) setRenamingId(tab.id);
                }}
                onCommitRename={(title) => {
                  onRename?.(tab.id, title);
                  setRenamingId(null);
                }}
                onCancelRename={() => setRenamingId(null)}
                onContextMenu={(event) => {
                  event.preventDefault();
                  setMenu({ tabId: tab.id, x: event.clientX, y: event.clientY });
                }}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      {capabilities.create && onCreate && (
        <button
          type="button"
          className="tab-strip__new"
          title={newTabLabel}
          aria-label={newTabLabel}
          onClick={onCreate}
        >
          +
        </button>
      )}

      {menu && menuTab && (
        <TabContextMenu
          x={menu.x}
          y={menu.y}
          capabilities={capabilities}
          pinned={menuTab.pinned}
          permanent={menuTab.permanent}
          canCloseOthers={tabs.some(
            (tab) => tab.id !== menu.tabId && !tab.pinned && !tab.permanent
          )}
          canCloseToRight={tabs
            .slice(menuIndex + 1)
            .some((tab) => !tab.pinned && !tab.permanent)}
          onRename={() => setRenamingId(menu.tabId)}
          onDuplicate={() => onDuplicate?.(menu.tabId)}
          onTogglePin={() => onTogglePin?.(menu.tabId)}
          onClose={() => onClose(menu.tabId)}
          onCloseOthers={() => onCloseOthers(menu.tabId)}
          onCloseToRight={() => onCloseToRight(menu.tabId)}
          onDismiss={dismissMenu}
        />
      )}
    </div>
  );
}
