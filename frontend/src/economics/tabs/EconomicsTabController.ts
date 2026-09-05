import { economicsTabStore } from "./economicsTabStore.ts";
import {
  DEFAULT_SUB_TAB,
  LIST_TAB_TITLE,
  isPlantSubTab,
} from "./economicsTab.types.ts";
import type { EconomicsTabState, PlantSubTab } from "./economicsTab.types.ts";
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

export interface EconomicsTabControllerDeps {
  storage: TabSessionStorage;
}

export class EconomicsTabController {
  #storage: TabSessionStorage;
  #navigator: TabNavigator = noopNavigator;
  #restoredOnce = false;

  constructor(deps: EconomicsTabControllerDeps) {
    this.#storage = deps.storage;
  }

  registerNavigator(navigator: TabNavigator): void {
    this.#navigator = navigator;
  }

  detach(): void {
    this.#navigator = noopNavigator;
  }

  getActiveTab(): TabInstance<EconomicsTabState> | null {
    const { activeTabId, tabs } = economicsTabStore.getState();
    return activeTabId ? tabs[activeTabId] ?? null : null;
  }

  restoreSessionOnce(
    deepLinkPlantId?: string | null,
    deepLinkSubTab?: string | null
  ): void {
    if (this.#restoredOnce) return;
    this.#restoredOnce = true;
    this.restoreSession(deepLinkPlantId, deepLinkSubTab);
  }

  restoreSession(
    deepLinkPlantId?: string | null,
    deepLinkSubTab?: string | null
  ): void {
    const parsed = parseTabSession<EconomicsTabState>(
      this.#storage.read(),
      {
        onDroppedTab: (index, reason) =>
          console.warn(`[tabs] dropped economics tab ${index}: ${reason}`),
        onDroppedSession: (reason) =>
          console.warn(`[tabs] economics session invalid, starting fresh: ${reason}`),
      },
      (raw) => ({
        subTab: isPlantSubTab((raw as { subTab?: unknown } | null)?.subTab)
          ? (raw as { subTab: PlantSubTab }).subTab
          : DEFAULT_SUB_TAB,
      })
    );

    if (parsed) {
      economicsTabStore.getState().hydrate(parsed);
    }
    const listId = this.#ensureListTab();

    if (deepLinkPlantId) {
      const id = this.openPlant(deepLinkPlantId, deepLinkPlantId);
      if (isPlantSubTab(deepLinkSubTab)) this.setSubTab(id, deepLinkSubTab);
      return;
    }

    const { activeTabId } = economicsTabStore.getState();
    this.activateTab(activeTabId ?? listId);
  }

  #ensureListTab(): string {
    const store = economicsTabStore.getState();
    const existing = store.order.find((id) => store.tabs[id]?.permanent);
    if (existing) return existing;

    const tab = createTabInstance<EconomicsTabState>({
      title: LIST_TAB_TITLE,
      key: null,
      permanent: true,
      state: { subTab: DEFAULT_SUB_TAB },
    });
    store.addTab(tab, 0);
    return tab.id;
  }

  openPlant(plantId: string, name?: string): string {
    const store = economicsTabStore.getState();
    const existing = store.order.find((id) => store.tabs[id]?.key === plantId);
    if (existing) {
      this.activateTab(existing);
      return existing;
    }

    const tab = createTabInstance<EconomicsTabState>({
      title: name ?? plantId,
      key: plantId,
      state: { subTab: DEFAULT_SUB_TAB },
    });
    store.addTab(tab);
    this.activateTab(tab.id);
    return tab.id;
  }

  activateTab(id: string): void {
    const store = economicsTabStore.getState();
    if (!store.tabs[id]) return;
    store.setActive(id);
    this.#mirrorUrl();
    this.#persist();
  }

  closeTab(id: string): void {
    const store = economicsTabStore.getState();
    const tab = store.tabs[id];
    if (!tab || tab.permanent) return;

    const wasActive = store.activeTabId === id;
    const successor = wasActive ? neighbourAfterClose(store.order, id) : null;
    store.removeTab(id);
    if (successor) this.activateTab(successor);
    else this.#afterMutation();
  }

  closeActive(): void {
    const { activeTabId } = economicsTabStore.getState();
    if (activeTabId) this.closeTab(activeTabId);
  }

  closeOthers(id: string): void {
    const store = economicsTabStore.getState();
    const doomed = store.order.filter(
      (other) => other !== id && !store.tabs[other]?.pinned && !store.tabs[other]?.permanent
    );
    this.#closeMany(doomed, id);
  }

  closeToRight(id: string): void {
    const store = economicsTabStore.getState();
    const index = store.order.indexOf(id);
    if (index === -1) return;
    const doomed = store.order
      .slice(index + 1)
      .filter((other) => !store.tabs[other]?.pinned && !store.tabs[other]?.permanent);
    this.#closeMany(doomed, id);
  }

  #closeMany(doomed: string[], survivorId: string): void {
    if (!doomed.length) return;
    this.activateTab(survivorId);
    doomed.forEach((id) => economicsTabStore.getState().removeTab(id));
    this.#afterMutation();
  }

  reopenLastClosed(): string | null {
    const entry = economicsTabStore.getState().popRecentlyClosed();
    if (!entry) return null;
    economicsTabStore.getState().addTab(entry.tab, entry.index);
    this.activateTab(entry.tab.id);
    return entry.tab.id;
  }

  activateRelative(offset: number): void {
    const { order, activeTabId } = economicsTabStore.getState();
    if (order.length < 2 || !activeTabId) return;
    const index = order.indexOf(activeTabId);
    if (index === -1) return;
    this.activateTab(order[(index + offset + order.length) % order.length]);
  }

  setSubTab(tabId: string, subTab: PlantSubTab): void {
    economicsTabStore.getState().setTabState(tabId, { subTab });
    this.#afterMutation();
  }

  adoptTitle(tabId: string, name: string): void {
    const tab = economicsTabStore.getState().tabs[tabId];
    if (!tab || !name || tab.title === name) return;
    economicsTabStore.getState().renameTab(tabId, name);
    this.#persist();
  }

  togglePin(id: string): void {
    economicsTabStore.getState().togglePin(id);
    this.#persist();
  }

  reorderTabs(from: number, to: number): void {
    economicsTabStore.getState().reorderTabs(from, to);
    this.#persist();
  }

  #afterMutation(): void {
    this.#mirrorUrl();
    this.#persist();
  }

  #mirrorUrl(): void {
    const tab = this.getActiveTab();
    if (!tab) return;
    if (!tab.key) {
      this.#navigator.replace("/economics");
      return;
    }
    const path = `/economics/${encodeURIComponent(tab.key)}`;
    this.#navigator.replace(
      tab.state.subTab === DEFAULT_SUB_TAB ? path : `${path}?tab=${tab.state.subTab}`
    );
  }

  #persist(): void {
    const { activeTabId, order, tabs } = economicsTabStore.getState();
    this.#storage.write({
      version: TAB_SESSION_VERSION,
      activeTabId,
      order,
      tabs: order.flatMap((id) => (tabs[id] ? [tabs[id]] : [])),
    });
  }
}
