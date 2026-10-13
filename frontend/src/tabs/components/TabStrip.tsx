import { useCallback, useRef, useState } from "react";
import { Plus } from "lucide-react";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import type { DragEndEvent, DragStartEvent } from "@dnd-kit/core";
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
  /**
   * Take a tab out into its own window (hover button, menu, or dragging it
   * off the strip). `at` is where it was dropped, in screen pixels.
   */
  onDetach?(id: string, at?: { x: number; y: number } | null): void;
  /** Bring a taken-out tab's window forward. */
  onShowWindow?(id: string): void;
}

// A tab dropped this far above/below the strip (or outside the browser
// window) is torn off into its own window.
const TEAR_OFF_PX = 70;

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
  onDetach,
  onShowWindow,
}: TabStripProps) {
  const stripRef = useRef<HTMLDivElement | null>(null);
  // Last pointer position during a drag (the sortable transform is clamped to
  // the strip, so the drop point has to be tracked separately).
  const pointerRef = useRef<{ clientX: number; clientY: number; screenX: number; screenY: number } | null>(null);
  const stopTrackingRef = useRef<(() => void) | null>(null);
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

  const handleDragStart = useCallback(
    (event: DragStartEvent) => {
      if (!onDetach) return;
      const start = event.activatorEvent as PointerEvent | undefined;
      pointerRef.current = start
        ? { clientX: start.clientX, clientY: start.clientY, screenX: start.screenX, screenY: start.screenY }
        : null;
      const track = (e: PointerEvent) => {
        pointerRef.current = { clientX: e.clientX, clientY: e.clientY, screenX: e.screenX, screenY: e.screenY };
      };
      window.addEventListener("pointermove", track, true);
      stopTrackingRef.current = () => window.removeEventListener("pointermove", track, true);
    },
    [onDetach]
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      stopTrackingRef.current?.();
      stopTrackingRef.current = null;
      const pointer = pointerRef.current;
      pointerRef.current = null;
      if (onDetach && pointer) {
        const rect = stripRef.current?.getBoundingClientRect();
        const outside =
          pointer.clientX < 0 || pointer.clientY < 0 ||
          pointer.clientX > window.innerWidth || pointer.clientY > window.innerHeight;
        const torn = rect && (pointer.clientY < rect.top - TEAR_OFF_PX || pointer.clientY > rect.bottom + TEAR_OFF_PX);
        const tab = tabs.find((t) => t.id === String(event.active.id));
        if ((outside || torn) && tab && !tab.permanent && !tab.windowed) {
          onDetach(tab.id, { x: pointer.screenX, y: pointer.screenY });
          return;
        }
      }
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      const from = ids.indexOf(String(active.id));
      const to = ids.indexOf(String(over.id));
      if (from === -1 || to === -1) return;
      onReorder(from, to);
    },
    [ids, onReorder, onDetach, tabs]
  );

  const dismissMenu = useCallback(() => setMenu(null), []);

  if (!tabs.length) return null;

  const menuIndex = menu ? ids.indexOf(menu.tabId) : -1;
  const menuTab = menuIndex === -1 ? null : tabs[menuIndex];

  return (
    <div
      ref={stripRef}
      className={["tab-strip", className].filter(Boolean).join(" ")}
      role="tablist"
      aria-label={ariaLabel}
    >
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        modifiers={[restrictToHorizontalAxis, restrictToParentElement]}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={() => {
          stopTrackingRef.current?.();
          stopTrackingRef.current = null;
          pointerRef.current = null;
        }}
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
                onActivate={() => (tab.windowed && onShowWindow ? onShowWindow(tab.id) : onActivate(tab.id))}
                onDetach={onDetach ? () => onDetach(tab.id) : undefined}
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
          <Plus size={15} aria-hidden="true" />
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
          windowed={Boolean(menuTab.windowed)}
          onDetach={onDetach ? () => onDetach(menu.tabId) : null}
          onShowWindow={onShowWindow ? () => onShowWindow(menu.tabId) : null}
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
