// Production tab operations as one explicit owner.
//
// Framework-independent by design — no React, no react-router — so the whole
// thing is testable against a fake navigator and fake storage. The navigator
// arrives through an interface for the same reason it does in
// WorkspaceController.
//
// Unlike the canvas there is no two-phase switch: the detail view fetches its
// own bundle keyed by plant id, so activation is synchronous throughout and
// there is no pending state to track.

import { productionTabStore } from "./productionTabStore.ts";
import {
  DEFAULT_SUB_TAB,
  LIST_TAB_TITLE,
  isPlantSubTab,
} from "./productionTab.types.ts";
import type { PlantSubTab, ProductionTabState } from "./productionTab.types.ts";
import { createTabInstance } from "../../tabs/types/tab.types.ts";
import type { TabInstance } from "../../tabs/types/tab.types.ts";
import { neighbourAfterClose } from "../../tabs/store/tabOrdering.ts";
import { parseTabSession } from "../../tabs/persistence/parseTabSession.ts";
import { TAB_SESSION_VERSION } from "../../tabs/persistence/tabSession.schemas.ts";
import type { TabSessionStorage } from "../../tabs/persistence/tabSessionStorage.ts";

export interface TabNavigator {
  replace(path: string): void;
}

const noopNavigator: TabNavigator = { replace: () => {} };

export interface ProductionTabControllerDeps {
  storage: TabSessionStorage;
}

export class ProductionTabController {
  #storage: TabSessionStorage;
  #navigator: TabNavigator = noopNavigator;

  constructor(deps: ProductionTabControllerDeps) {
    this.#storage = deps.storage;
  }

  registerNavigator(navigator: TabNavigator): void {
    this.#navigator = navigator;
  }

  detach(): void {
    this.#navigator = noopNavigator;
  }

  getActiveTab(): TabInstance<ProductionTabState> | null {
    const { activeTabId, tabs } = productionTabStore.getState();
    return activeTabId ? tabs[activeTabId] ?? null : null;
  }

  // ── startup ───────────────────────────────────────────────────────────────

  /**
   * Hydrates from storage, then honours the route as deep-link INTENT — read
   * once, never as a live data source, so switching tabs cannot re-trigger it.
   */
  restoreSession(
    deepLinkPlantId?: string | null,
    deepLinkSubTab?: string | null
  ): void {
    const parsed = parseTabSession<ProductionTabState>(this.#storage.read(), {
      onDroppedTab: (index, reason) =>
        console.warn(`[tabs] dropped production tab ${index}: ${reason}`),
      onDroppedSession: (reason) =>
        console.warn(`[tabs] production session invalid, starting fresh: ${reason}`),
    });

    if (parsed) {
      productionTabStore.getState().hydrate(parsed);
    }
    const listId = this.#ensureListTab();

    if (deepLinkPlantId) {
      const id = this.openPlant(deepLinkPlantId, deepLinkPlantId);
      if (isPlantSubTab(deepLinkSubTab)) this.setSubTab(id, deepLinkSubTab);
      return;
    }

    const { activeTabId } = productionTabStore.getState();
    this.activateTab(activeTabId ?? listId);
  }

  /** The strip must always have its permanent home tab, whatever storage held. */
  #ensureListTab(): string {
    const store = productionTabStore.getState();
    const existing = store.order.find((id) => store.tabs[id]?.permanent);
    if (existing) return existing;

    const tab = createTabInstance<ProductionTabState>({
      title: LIST_TAB_TITLE,
      key: null,
      permanent: true,
      state: { subTab: DEFAULT_SUB_TAB },
    });
    store.addTab(tab, 0);
    return tab.id;
  }

  // ── lifecycle ─────────────────────────────────────────────────────────────

  openPlant(plantId: string, name?: string): string {
    const store = productionTabStore.getState();
    const existing = store.order.find((id) => store.tabs[id]?.key === plantId);
    if (existing) {
      this.activateTab(existing);
      return existing;
    }

    const tab = createTabInstance<ProductionTabState>({
      title: name ?? plantId,
      key: plantId,
      state: { subTab: DEFAULT_SUB_TAB },
    });
    store.addTab(tab);
    this.activateTab(tab.id);
    return tab.id;
  }

  activateTab(id: string): void {
    const store = productionTabStore.getState();
    if (!store.tabs[id]) return;
    store.setActive(id);
    this.#mirrorUrl();
    this.#persist();
  }

  closeTab(id: string): void {
    const store = productionTabStore.getState();
    const tab = store.tabs[id];
    // The permanent tab is refused by the store too; returning early here just
    // avoids pointlessly recomputing a successor.
    if (!tab || tab.permanent) return;

    const wasActive = store.activeTabId === id;
    const successor = wasActive ? neighbourAfterClose(store.order, id) : null;
    store.removeTab(id);
    // The list tab can never close, so the strip cannot be emptied and there is
    // no "never leave an empty tab bar" fallback to write.
    if (successor) this.activateTab(successor);
    else this.#afterMutation();
  }

  closeOthers(id: string): void {
    const store = productionTabStore.getState();
    const doomed = store.order.filter(
      (other) =>
        other !== id && !store.tabs[other]?.pinned && !store.tabs[other]?.permanent
    );
    this.#closeMany(doomed, id);
  }

  closeToRight(id: string): void {
    const store = productionTabStore.getState();
    const index = store.order.indexOf(id);
    if (index === -1) return;
    const doomed = store.order
      .slice(index + 1)
      .filter((other) => !store.tabs[other]?.pinned && !store.tabs[other]?.permanent);
    this.#closeMany(doomed, id);
  }

  #closeMany(doomed: string[], survivorId: string): void {
    if (!doomed.length) return;
    // Activate the survivor first, so no removal has to pick a successor.
    this.activateTab(survivorId);
    doomed.forEach((id) => productionTabStore.getState().removeTab(id));
    this.#afterMutation();
  }

  reopenLastClosed(): string | null {
    const entry = productionTabStore.getState().popRecentlyClosed();
    if (!entry) return null;
    productionTabStore.getState().addTab(entry.tab, entry.index);
    this.activateTab(entry.tab.id);
    return entry.tab.id;
  }

  activateRelative(offset: number): void {
    const { order, activeTabId } = productionTabStore.getState();
    if (order.length < 2 || !activeTabId) return;
    const index = order.indexOf(activeTabId);
    if (index === -1) return;
    this.activateTab(order[(index + offset + order.length) % order.length]);
  }

  // ── mutations ─────────────────────────────────────────────────────────────

  setSubTab(tabId: string, subTab: PlantSubTab): void {
    productionTabStore.getState().setTabState(tabId, { subTab });
    this.#afterMutation();
  }

  /**
   * The loaded plant record is the authority on its own name, so a tab restored
   * with a stale stored title corrects itself once the bundle arrives.
   */
  adoptTitle(tabId: string, name: string): void {
    const tab = productionTabStore.getState().tabs[tabId];
    if (!tab || !name || tab.title === name) return;
    productionTabStore.getState().renameTab(tabId, name);
    this.#persist();
  }

  togglePin(id: string): void {
    productionTabStore.getState().togglePin(id);
    this.#persist();
  }

  reorderTabs(from: number, to: number): void {
    productionTabStore.getState().reorderTabs(from, to);
    this.#persist();
  }

  // ── url + storage ─────────────────────────────────────────────────────────

  #afterMutation(): void {
    this.#mirrorUrl();
    this.#persist();
  }

  #mirrorUrl(): void {
    const tab = this.getActiveTab();
    if (!tab) return;
    if (!tab.key) {
      this.#navigator.replace("/production");
      return;
    }
    // encodeURIComponent because plant ids come from imported records and are
    // not guaranteed to be path-safe.
    const path = `/production/${encodeURIComponent(tab.key)}`;
    this.#navigator.replace(
      tab.state.subTab === DEFAULT_SUB_TAB ? path : `${path}?tab=${tab.state.subTab}`
    );
  }

  #persist(): void {
    const { activeTabId, order, tabs } = productionTabStore.getState();
    this.#storage.write({
      version: TAB_SESSION_VERSION,
      activeTabId,
      order,
      tabs: order.flatMap((id) => (tabs[id] ? [tabs[id]] : [])),
    });
  }
}
