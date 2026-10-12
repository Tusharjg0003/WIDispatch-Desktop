// A tab strip of records (plants, pump stations, systems, simulations,
// assets…): open-or-focus by key, close / reorder / pin, a per-tab sub-tab,
// URL mirroring and a localStorage session. Domain-neutral — each strip
// passes its own store, URL scheme and state rules.
//
// Two shapes:
//   list + records  (Production / Demand / Transmission / Asset Registry):
//     a permanent, keyless list tab first, then one tab per opened record.
//   records only    (Simulation Config, like the Network Builder):
//     `listTab: false` — no permanent tab; the strip can be empty.

import { createTabInstance } from "../types/tab.types.ts";
import type { TabInstance } from "../types/tab.types.ts";
import { neighbourAfterClose } from "../store/tabOrdering.ts";
import type { TabStore } from "../store/createTabStore.ts";
import { parseTabSession } from "../persistence/parseTabSession.ts";
import { TAB_SESSION_VERSION } from "../persistence/tabSession.schemas.ts";
import type { TabSessionStorage } from "../persistence/tabSessionStorage.ts";

export interface TabNavigator {
  replace(path: string): void;
}

const noopNavigator: TabNavigator = { replace: () => {} };

export interface RecordTabState {
  subTab: string;
}

export interface RecordTabControllerDeps<TState extends RecordTabState> {
  storage: TabSessionStorage;
  store: TabStore<TState>;
  basePath: string;
  listTitle?: string;
  isSubTab: (value: unknown) => boolean;
  defaultSubTab: string;
  /** False for strips without a permanent list tab (default true). */
  listTab?: boolean;
  /** URL for a tab; defaults to `${basePath}/${key}?tab=…` (list tab: basePath). */
  pathFor?: (tab: TabInstance<TState>) => string;
  /**
   * Rebuild a stored tab's state; defaults to keeping only a valid sub-tab.
   * Use it to keep extra state (e.g. an unsaved draft) across reloads.
   */
  parseState?: (raw: unknown, fallback: TState) => TState;
  /** Veto a close (e.g. unsaved changes). Return false to keep the tab. */
  beforeClose?: (tab: TabInstance<TState>) => boolean;
  /** Name used in console warnings about a bad stored session. */
  label?: string;
}

export class RecordTabController<TState extends RecordTabState = RecordTabState> {
  #storage: TabSessionStorage;
  #store: TabStore<TState>;
  #basePath: string;
  #listTitle: string;
  #isSubTab: (value: unknown) => boolean;
  #defaultSubTab: string;
  #listTab: boolean;
  #pathFor?: (tab: TabInstance<TState>) => string;
  #parseState?: (raw: unknown, fallback: TState) => TState;
  #beforeClose?: (tab: TabInstance<TState>) => boolean;
  #label: string;
  #navigator: TabNavigator = noopNavigator;
  #restoredOnce = false;

  constructor(deps: RecordTabControllerDeps<TState>) {
    this.#storage = deps.storage;
    this.#store = deps.store;
    this.#basePath = deps.basePath;
    this.#listTitle = deps.listTitle ?? "All";
    this.#isSubTab = deps.isSubTab;
    this.#defaultSubTab = deps.defaultSubTab;
    this.#listTab = deps.listTab ?? true;
    this.#pathFor = deps.pathFor;
    this.#parseState = deps.parseState;
    this.#beforeClose = deps.beforeClose;
    this.#label = deps.label ?? "record";
  }

  /** Set (or replace) the close veto — pages register it once they know about unsaved work. */
  setBeforeClose(fn: ((tab: TabInstance<TState>) => boolean) | undefined): void {
    this.#beforeClose = fn;
  }

  registerNavigator(navigator: TabNavigator): void {
    this.#navigator = navigator;
  }

  detach(): void {
    this.#navigator = noopNavigator;
  }

  /** Bring the URL in line with the active tab (when this strip takes the URL back). */
  syncUrl(): void {
    this.#mirrorUrl();
  }

  getActiveTab(): TabInstance<TState> | null {
    const { activeTabId, tabs } = this.#store.getState();
    return activeTabId ? tabs[activeTabId] ?? null : null;
  }

  findByKey(key: string): TabInstance<TState> | null {
    const { order, tabs } = this.#store.getState();
    const id = order.find((tabId) => tabs[tabId]?.key === key);
    return id ? tabs[id] ?? null : null;
  }

  #initialState(): TState {
    return { subTab: this.#defaultSubTab } as TState;
  }

  restoreSessionOnce(deepLinkKey?: string | null, deepLinkSubTab?: string | null): void {
    if (this.#restoredOnce) return;
    this.#restoredOnce = true;
    this.restoreSession(deepLinkKey, deepLinkSubTab);
  }

  restoreSession(deepLinkKey?: string | null, deepLinkSubTab?: string | null): void {
    const parsed = parseTabSession<TState>(
      this.#storage.read(),
      {
        onDroppedTab: (index, reason) => console.warn(`[tabs] dropped ${this.#label} tab ${index}: ${reason}`),
        onDroppedSession: (reason) => console.warn(`[tabs] ${this.#label} session invalid, starting fresh: ${reason}`),
      },
      (raw) => {
        const subTab = this.#isSubTab((raw as { subTab?: unknown } | null)?.subTab)
          ? (raw as { subTab: string }).subTab
          : this.#defaultSubTab;
        const base = { subTab } as TState;
        return this.#parseState ? this.#parseState(raw, base) : base;
      }
    );

    if (parsed) this.#store.getState().hydrate(parsed);
    const listId = this.#listTab ? this.#ensureListTab() : null;

    if (deepLinkKey) {
      const id = this.openRecord(deepLinkKey, deepLinkKey);
      if (this.#isSubTab(deepLinkSubTab)) this.setSubTab(id, deepLinkSubTab as string);
      return;
    }

    const { activeTabId, order } = this.#store.getState();
    const target = activeTabId ?? listId ?? order[0] ?? null;
    if (target) this.activateTab(target);
    else this.#afterMutation();
  }

  #ensureListTab(): string {
    const store = this.#store.getState();
    const existing = store.order.find((id) => store.tabs[id]?.permanent);
    if (existing) return existing;

    const tab = createTabInstance<TState>({
      title: this.#listTitle,
      key: null,
      permanent: true,
      state: this.#initialState(),
    });
    store.addTab(tab, 0);
    return tab.id;
  }

  /** Open (or focus) a record's tab. `state` seeds a newly created tab. */
  openRecord(key: string, title?: string, state?: Partial<TState>): string {
    const store = this.#store.getState();
    const existing = store.order.find((id) => store.tabs[id]?.key === key);
    if (existing) {
      if (state) store.setTabState(existing, state);
      this.activateTab(existing);
      return existing;
    }

    const tab = createTabInstance<TState>({
      title: title ?? key,
      key,
      state: { ...this.#initialState(), ...(state || {}) },
    });
    store.addTab(tab);
    this.activateTab(tab.id);
    return tab.id;
  }

  activateTab(id: string): void {
    const store = this.#store.getState();
    if (!store.tabs[id]) return;
    store.setActive(id);
    this.#mirrorUrl();
    this.#persist();
  }

  #mayClose(id: string): boolean {
    const tab = this.#store.getState().tabs[id];
    if (!tab || tab.permanent) return false;
    return this.#beforeClose ? this.#beforeClose(tab) !== false : true;
  }

  closeTab(id: string, { force = false }: { force?: boolean } = {}): void {
    const store = this.#store.getState();
    const tab = store.tabs[id];
    if (!tab || tab.permanent) return;
    if (!force && !this.#mayClose(id)) return;

    const wasActive = store.activeTabId === id;
    const successor = wasActive ? neighbourAfterClose(store.order, id) : null;
    store.removeTab(id);
    if (successor) this.activateTab(successor);
    else {
      if (wasActive) this.#store.getState().setActive(null);
      this.#afterMutation();
    }
  }

  /** Close a record's tab without asking (e.g. after the record was deleted). */
  closeByKey(key: string): void {
    const tab = this.findByKey(key);
    if (tab) this.closeTab(tab.id, { force: true });
  }

  closeActive(): void {
    const { activeTabId } = this.#store.getState();
    if (activeTabId) this.closeTab(activeTabId);
  }

  closeOthers(id: string): void {
    const store = this.#store.getState();
    const doomed = store.order.filter(
      (other) => other !== id && !store.tabs[other]?.pinned && !store.tabs[other]?.permanent
    );
    this.#closeMany(doomed, id);
  }

  closeToRight(id: string): void {
    const store = this.#store.getState();
    const index = store.order.indexOf(id);
    if (index === -1) return;
    const doomed = store.order
      .slice(index + 1)
      .filter((other) => !store.tabs[other]?.pinned && !store.tabs[other]?.permanent);
    this.#closeMany(doomed, id);
  }

  #closeMany(candidates: string[], survivorId: string): void {
    const doomed = candidates.filter((id) => this.#mayClose(id));
    if (!doomed.length) return;
    this.activateTab(survivorId);
    doomed.forEach((id) => this.#store.getState().removeTab(id));
    this.#afterMutation();
  }

  reopenLastClosed(): string | null {
    const entry = this.#store.getState().popRecentlyClosed();
    if (!entry) return null;
    this.#store.getState().addTab(entry.tab, entry.index);
    this.activateTab(entry.tab.id);
    return entry.tab.id;
  }

  activateRelative(offset: number): void {
    const { order, activeTabId } = this.#store.getState();
    if (order.length < 2 || !activeTabId) return;
    const index = order.indexOf(activeTabId);
    if (index === -1) return;
    this.activateTab(order[(index + offset + order.length) % order.length]);
  }

  setSubTab(tabId: string, subTab: string): void {
    this.#store.getState().setTabState(tabId, { subTab } as Partial<TState>);
    this.#afterMutation();
  }

  /** Merge extra state into a tab (persisted; the URL follows the sub-tab). */
  setTabState(tabId: string, patch: Partial<TState>): void {
    if (!this.#store.getState().tabs[tabId]) return;
    this.#store.getState().setTabState(tabId, patch);
    this.#afterMutation();
  }

  /** Point a tab at a different record (a "New …" tab once it has been saved). */
  rekeyTab(tabId: string, key: string, title?: string, patch?: Partial<TState>): void {
    const tab = this.#store.getState().tabs[tabId];
    if (!tab) return;
    this.#store.setState((prev) => ({
      tabs: {
        ...prev.tabs,
        [tabId]: {
          ...tab,
          key,
          title: title ?? tab.title,
          state: { ...tab.state, ...(patch || {}) },
          updatedAt: Date.now(),
        },
      },
    }));
    this.#afterMutation();
  }

  adoptTitle(tabId: string, name: string): void {
    const tab = this.#store.getState().tabs[tabId];
    if (!tab || !name || tab.title === name) return;
    this.#store.getState().renameTab(tabId, name);
    this.#persist();
  }

  togglePin(id: string): void {
    this.#store.getState().togglePin(id);
    this.#persist();
  }

  reorderTabs(from: number, to: number): void {
    this.#store.getState().reorderTabs(from, to);
    this.#persist();
  }

  #afterMutation(): void {
    this.#mirrorUrl();
    this.#persist();
  }

  #mirrorUrl(): void {
    const tab = this.getActiveTab();
    if (!tab) {
      // Records-only strip with nothing open: the module's root.
      if (!this.#listTab) this.#navigator.replace(this.#basePath);
      return;
    }
    if (this.#pathFor) {
      this.#navigator.replace(this.#pathFor(tab));
      return;
    }
    if (!tab.key) {
      this.#navigator.replace(this.#basePath);
      return;
    }
    const path = `${this.#basePath}/${encodeURIComponent(tab.key)}`;
    this.#navigator.replace(
      tab.state.subTab === this.#defaultSubTab ? path : `${path}?tab=${tab.state.subTab}`
    );
  }

  #persist(): void {
    const { activeTabId, order, tabs } = this.#store.getState();
    this.#storage.write({
      version: TAB_SESSION_VERSION,
      activeTabId,
      order,
      tabs: order.flatMap((id) => (tabs[id] ? [tabs[id]] : [])),
    });
  }
}
