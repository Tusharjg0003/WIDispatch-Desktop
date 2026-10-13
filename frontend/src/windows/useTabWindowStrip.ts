// Wires a record tab strip to tabs/windows: which of its tabs are out in
// their own windows, taking one out, bringing its window forward, and taking
// back the tab's state when its window closes.

import { useCallback, useEffect, useMemo, useRef } from "react";
import {
  findTabWindow,
  focusTabWindow,
  isTabWindow,
  onTabReturned,
  openTabWindow,
  useTabWindows,
} from "./tabWindows.ts";

interface StripTab {
  id: string;
  key: string | null;
  title: string;
  permanent?: boolean;
  state?: unknown;
}

export interface TabWindowStripOptions {
  /** Same name as the strip's session storage, e.g. "production". */
  domain: string;
  order: string[];
  tabs: Record<string, StripTab | undefined>;
  activeTabId: string | null;
  /** The URL the tab's window opens on. */
  pathOf(tab: StripTab): string;
  /** Switch the main window to another tab. */
  activate(id: string): void;
  /** The tab came back: apply the state its window hands back (tab state object). */
  applyReturn?(id: string, state: Record<string, unknown>): void;
  /** Tabs that can't go out (e.g. an unsaved "New asset"). */
  canDetach?(tab: StripTab): boolean;
  /** Get the tab ready for its window first (e.g. write its unsaved canvas). */
  beforeDetach?(tab: StripTab): Promise<void>;
  /** Instead of applyReturn + activate: take the tab back yourself. */
  onReturned?(id: string): void;
  /** The main window has nothing left to show once the tab is out. */
  onNoneLeft?(): void;
}

export interface TabWindowStrip {
  /** Tab ids that are out in a window. */
  windowedIds: Set<string>;
  onDetach?: (id: string, at?: { x: number; y: number } | null) => void;
  onShowWindow?: (id: string) => void;
}

const nextOpenTab = (order: string[], id: string, skip: Set<string>): string | null => {
  const index = order.indexOf(id);
  const after = order.slice(index + 1).find((other) => !skip.has(other));
  if (after) return after;
  const before = order.slice(0, Math.max(index, 0)).reverse().find((other) => !skip.has(other));
  return before ?? null;
};

export function useTabWindowStrip(options: TabWindowStripOptions): TabWindowStrip {
  const { domain, order, tabs, activeTabId } = options;
  const entries = useTabWindows();
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const inWindow = isTabWindow();

  const windowedIds = useMemo(() => {
    const ids = new Set<string>();
    if (inWindow) return ids;
    for (const id of order) {
      const key = tabs[id]?.key;
      if (key && findTabWindow(entries, domain, key)) ids.add(id);
    }
    return ids;
  }, [inWindow, order, tabs, entries, domain]);

  const onDetach = useCallback((id: string, at?: { x: number; y: number } | null) => {
    const { tabs: all, order: ids, activeTabId: active, pathOf, activate } = optionsRef.current;
    const tab = all[id];
    if (!tab?.key || tab.permanent) return;
    if (optionsRef.current.canDetach && !optionsRef.current.canDetach(tab)) return;
    const open = () => {
      const opened = openTabWindow({ domain, key: tab.key as string, title: tab.title, path: pathOf(tab), tab, at });
      if (!opened || active !== id) return;
      // The main window moves off the tab, so the record is only open in one place.
      const next = nextOpenTab(ids, id, new Set([...windowedIds, id]));
      if (next) activate(next);
      else optionsRef.current.onNoneLeft?.();
    };
    const prepare = optionsRef.current.beforeDetach;
    if (prepare) void prepare(tab).then(open);
    else open();
  }, [domain, windowedIds]);

  const onShowWindow = useCallback((id: string) => {
    const key = optionsRef.current.tabs[id]?.key;
    const entry = key ? findTabWindow(entries, domain, key) : null;
    if (entry) focusTabWindow(entry);
  }, [entries, domain]);

  // Something opened a tab that is out (a link, a deep link, a session
  // restore): bring its window forward and keep the main window elsewhere.
  useEffect(() => {
    if (inWindow || !activeTabId || !windowedIds.has(activeTabId)) return;
    onShowWindow(activeTabId);
    const next = nextOpenTab(order, activeTabId, windowedIds);
    if (next) optionsRef.current.activate(next);
  }, [inWindow, activeTabId, windowedIds, order, onShowWindow]);

  // The window closed: take the tab's state back and show it here again.
  useEffect(() => {
    if (inWindow) return undefined;
    return onTabReturned(domain, (info, state) => {
      if (info.sub) return; // a single sub-view: nothing of the tab's own to restore
      const { tabs: all, order: ids, applyReturn, activate, onReturned } = optionsRef.current;
      const id = ids.find((tabId) => all[tabId]?.key === info.key);
      if (!id) return;
      if (onReturned) {
        onReturned(id);
        return;
      }
      const returnedTab = state as { state?: Record<string, unknown> } | null;
      if (returnedTab?.state && applyReturn) applyReturn(id, returnedTab.state);
      activate(id);
    });
  }, [inWindow, domain]);

  if (inWindow) return { windowedIds };
  return { windowedIds, onDetach, onShowWindow };
}
