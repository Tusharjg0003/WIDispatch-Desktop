import { demandTabStore } from "./demandTabStore.ts";
import {
  DEFAULT_SUB_TAB,
  LIST_TAB_TITLE,
  isCityGateSubTab,
} from "./demandTab.types.ts";
import type { CityGateSubTab, DemandTabState } from "./demandTab.types.ts";
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

export interface DemandTabControllerDeps {
  storage: TabSessionStorage;
}

export class DemandTabController {
  #storage: TabSessionStorage;
  #navigator: TabNavigator = noopNavigator;
  #restoredOnce = false;

  constructor(deps: DemandTabControllerDeps) {
    this.#storage = deps.storage;
  }

  registerNavigator(navigator: TabNavigator): void {
    this.#navigator = navigator;
  }

  detach(): void {
    this.#navigator = noopNavigator;
  }

  getActiveTab(): TabInstance<DemandTabState> | null {
    const { activeTabId, tabs } = demandTabStore.getState();
    return activeTabId ? tabs[activeTabId] ?? null : null;
  }

  restoreSessionOnce(
    deepLinkGateId?: string | null,
    deepLinkSubTab?: string | null
  ): void {
    if (this.#restoredOnce) return;
    this.#restoredOnce = true;
    this.restoreSession(deepLinkGateId, deepLinkSubTab);
  }

  restoreSession(
    deepLinkGateId?: string | null,
    deepLinkSubTab?: string | null
  ): void {
    const parsed = parseTabSession<DemandTabState>(
      this.#storage.read(),
      {
        onDroppedTab: (index, reason) =>
          console.warn(`[tabs] dropped demand tab ${index}: ${reason}`),
        onDroppedSession: (reason) =>
          console.warn(`[tabs] demand session invalid, starting fresh: ${reason}`),
      },
      (raw) => ({
        subTab: isCityGateSubTab((raw as { subTab?: unknown } | null)?.subTab)
          ? (raw as { subTab: CityGateSubTab }).subTab
          : DEFAULT_SUB_TAB,
      })
    );

    if (parsed) {
      demandTabStore.getState().hydrate(parsed);
    }
    const listId = this.#ensureListTab();

    if (deepLinkGateId) {
      const id = this.openGate(deepLinkGateId, deepLinkGateId);
      if (isCityGateSubTab(deepLinkSubTab)) this.setSubTab(id, deepLinkSubTab);
      return;
    }

    const { activeTabId } = demandTabStore.getState();
    this.activateTab(activeTabId ?? listId);
  }

  #ensureListTab(): string {
    const store = demandTabStore.getState();
    const existing = store.order.find((id) => store.tabs[id]?.permanent);
    if (existing) return existing;

    const tab = createTabInstance<DemandTabState>({
      title: LIST_TAB_TITLE,
      key: null,
      permanent: true,
      state: { subTab: DEFAULT_SUB_TAB },
    });
    store.addTab(tab, 0);
    return tab.id;
  }

  openGate(gateId: string, name?: string): string {
    const store = demandTabStore.getState();
    const existing = store.order.find((id) => store.tabs[id]?.key === gateId);
    if (existing) {
      this.activateTab(existing);
      return existing;
    }

    const tab = createTabInstance<DemandTabState>({
      title: name ?? gateId,
      key: gateId,
      state: { subTab: DEFAULT_SUB_TAB },
    });
    store.addTab(tab);
    this.activateTab(tab.id);
    return tab.id;
  }

  activateTab(id: string): void {
    const store = demandTabStore.getState();
    if (!store.tabs[id]) return;
    store.setActive(id);
    this.#mirrorUrl();
    this.#persist();
  }

  closeTab(id: string): void {
    const store = demandTabStore.getState();
    const tab = store.tabs[id];
    if (!tab || tab.permanent) return;

    const wasActive = store.activeTabId === id;
    const successor = wasActive ? neighbourAfterClose(store.order, id) : null;
    store.removeTab(id);
    if (successor) this.activateTab(successor);
    else this.#afterMutation();
  }

  closeActive(): void {
    const { activeTabId } = demandTabStore.getState();
    if (activeTabId) this.closeTab(activeTabId);
  }

  closeOthers(id: string): void {
    const store = demandTabStore.getState();
    const doomed = store.order.filter(
      (other) => other !== id && !store.tabs[other]?.pinned && !store.tabs[other]?.permanent
    );
    this.#closeMany(doomed, id);
  }

  closeToRight(id: string): void {
    const store = demandTabStore.getState();
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
    doomed.forEach((id) => demandTabStore.getState().removeTab(id));
    this.#afterMutation();
  }

  reopenLastClosed(): string | null {
    const entry = demandTabStore.getState().popRecentlyClosed();
    if (!entry) return null;
    demandTabStore.getState().addTab(entry.tab, entry.index);
    this.activateTab(entry.tab.id);
    return entry.tab.id;
  }

  activateRelative(offset: number): void {
    const { order, activeTabId } = demandTabStore.getState();
    if (order.length < 2 || !activeTabId) return;
    const index = order.indexOf(activeTabId);
    if (index === -1) return;
    this.activateTab(order[(index + offset + order.length) % order.length]);
  }

  setSubTab(tabId: string, subTab: CityGateSubTab): void {
    demandTabStore.getState().setTabState(tabId, { subTab });
    this.#afterMutation();
  }

  adoptTitle(tabId: string, name: string): void {
    const tab = demandTabStore.getState().tabs[tabId];
    if (!tab || !name || tab.title === name) return;
    demandTabStore.getState().renameTab(tabId, name);
    this.#persist();
  }

  togglePin(id: string): void {
    demandTabStore.getState().togglePin(id);
    this.#persist();
  }

  reorderTabs(from: number, to: number): void {
    demandTabStore.getState().reorderTabs(from, to);
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
      this.#navigator.replace("/demand");
      return;
    }
    const path = `/demand/${encodeURIComponent(tab.key)}`;
    this.#navigator.replace(
      tab.state.subTab === DEFAULT_SUB_TAB ? path : `${path}?tab=${tab.state.subTab}`
    );
  }

  #persist(): void {
    const { activeTabId, order, tabs } = demandTabStore.getState();
    this.#storage.write({
      version: TAB_SESSION_VERSION,
      activeTabId,
      order,
      tabs: order.flatMap((id) => (tabs[id] ? [tabs[id]] : [])),
    });
  }
}
