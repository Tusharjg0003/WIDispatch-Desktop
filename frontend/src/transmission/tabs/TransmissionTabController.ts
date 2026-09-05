import { transmissionTabStore } from "./transmissionTabStore.ts";
import {
  DEFAULT_SUB_TAB,
  LIST_TAB_TITLE,
  isPumpStationSubTab,
} from "./transmissionTab.types.ts";
import type { PumpStationSubTab, TransmissionTabState } from "./transmissionTab.types.ts";
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

export interface TransmissionTabControllerDeps {
  storage: TabSessionStorage;
}

export class TransmissionTabController {
  #storage: TabSessionStorage;
  #navigator: TabNavigator = noopNavigator;
  #restoredOnce = false;

  constructor(deps: TransmissionTabControllerDeps) {
    this.#storage = deps.storage;
  }

  registerNavigator(navigator: TabNavigator): void {
    this.#navigator = navigator;
  }

  detach(): void {
    this.#navigator = noopNavigator;
  }

  getActiveTab(): TabInstance<TransmissionTabState> | null {
    const { activeTabId, tabs } = transmissionTabStore.getState();
    return activeTabId ? tabs[activeTabId] ?? null : null;
  }

  restoreSessionOnce(
    deepLinkPumpStationId?: string | null,
    deepLinkSubTab?: string | null
  ): void {
    if (this.#restoredOnce) return;
    this.#restoredOnce = true;
    this.restoreSession(deepLinkPumpStationId, deepLinkSubTab);
  }

  restoreSession(
    deepLinkPumpStationId?: string | null,
    deepLinkSubTab?: string | null
  ): void {
    const parsed = parseTabSession<TransmissionTabState>(
      this.#storage.read(),
      {
        onDroppedTab: (index, reason) =>
          console.warn(`[tabs] dropped transmission tab ${index}: ${reason}`),
        onDroppedSession: (reason) =>
          console.warn(`[tabs] transmission session invalid, starting fresh: ${reason}`),
      },
      (raw) => ({
        subTab: isPumpStationSubTab((raw as { subTab?: unknown } | null)?.subTab)
          ? (raw as { subTab: PumpStationSubTab }).subTab
          : DEFAULT_SUB_TAB,
      })
    );

    if (parsed) {
      transmissionTabStore.getState().hydrate(parsed);
    }
    const listId = this.#ensureListTab();

    if (deepLinkPumpStationId) {
      const id = this.openPumpStation(deepLinkPumpStationId, deepLinkPumpStationId);
      if (isPumpStationSubTab(deepLinkSubTab)) this.setSubTab(id, deepLinkSubTab);
      return;
    }

    const { activeTabId } = transmissionTabStore.getState();
    this.activateTab(activeTabId ?? listId);
  }

  #ensureListTab(): string {
    const store = transmissionTabStore.getState();
    const existing = store.order.find((id) => store.tabs[id]?.permanent);
    if (existing) return existing;

    const tab = createTabInstance<TransmissionTabState>({
      title: LIST_TAB_TITLE,
      key: null,
      permanent: true,
      state: { subTab: DEFAULT_SUB_TAB },
    });
    store.addTab(tab, 0);
    return tab.id;
  }

  openPumpStation(pumpStationId: string, name?: string): string {
    const store = transmissionTabStore.getState();
    const existing = store.order.find((id) => store.tabs[id]?.key === pumpStationId);
    if (existing) {
      this.activateTab(existing);
      return existing;
    }

    const tab = createTabInstance<TransmissionTabState>({
      title: name ?? pumpStationId,
      key: pumpStationId,
      state: { subTab: DEFAULT_SUB_TAB },
    });
    store.addTab(tab);
    this.activateTab(tab.id);
    return tab.id;
  }

  activateTab(id: string): void {
    const store = transmissionTabStore.getState();
    if (!store.tabs[id]) return;
    store.setActive(id);
    this.#mirrorUrl();
    this.#persist();
  }

  closeTab(id: string): void {
    const store = transmissionTabStore.getState();
    const tab = store.tabs[id];
    if (!tab || tab.permanent) return;

    const wasActive = store.activeTabId === id;
    const successor = wasActive ? neighbourAfterClose(store.order, id) : null;
    store.removeTab(id);
    if (successor) this.activateTab(successor);
    else this.#afterMutation();
  }

  closeActive(): void {
    const { activeTabId } = transmissionTabStore.getState();
    if (activeTabId) this.closeTab(activeTabId);
  }

  closeOthers(id: string): void {
    const store = transmissionTabStore.getState();
    const doomed = store.order.filter(
      (other) => other !== id && !store.tabs[other]?.pinned && !store.tabs[other]?.permanent
    );
    this.#closeMany(doomed, id);
  }

  closeToRight(id: string): void {
    const store = transmissionTabStore.getState();
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
    doomed.forEach((id) => transmissionTabStore.getState().removeTab(id));
    this.#afterMutation();
  }

  reopenLastClosed(): string | null {
    const entry = transmissionTabStore.getState().popRecentlyClosed();
    if (!entry) return null;
    transmissionTabStore.getState().addTab(entry.tab, entry.index);
    this.activateTab(entry.tab.id);
    return entry.tab.id;
  }

  activateRelative(offset: number): void {
    const { order, activeTabId } = transmissionTabStore.getState();
    if (order.length < 2 || !activeTabId) return;
    const index = order.indexOf(activeTabId);
    if (index === -1) return;
    this.activateTab(order[(index + offset + order.length) % order.length]);
  }

  setSubTab(tabId: string, subTab: PumpStationSubTab): void {
    transmissionTabStore.getState().setTabState(tabId, { subTab });
    this.#afterMutation();
  }

  adoptTitle(tabId: string, name: string): void {
    const tab = transmissionTabStore.getState().tabs[tabId];
    if (!tab || !name || tab.title === name) return;
    transmissionTabStore.getState().renameTab(tabId, name);
    this.#persist();
  }

  togglePin(id: string): void {
    transmissionTabStore.getState().togglePin(id);
    this.#persist();
  }

  reorderTabs(from: number, to: number): void {
    transmissionTabStore.getState().reorderTabs(from, to);
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
      this.#navigator.replace("/transmission/pump-stations");
      return;
    }
    const path = `/transmission/pump-stations/${encodeURIComponent(tab.key)}`;
    this.#navigator.replace(
      tab.state.subTab === DEFAULT_SUB_TAB ? path : `${path}?tab=${tab.state.subTab}`
    );
  }

  #persist(): void {
    const { activeTabId, order, tabs } = transmissionTabStore.getState();
    this.#storage.write({
      version: TAB_SESSION_VERSION,
      activeTabId,
      order,
      tabs: order.flatMap((id) => (tabs[id] ? [tabs[id]] : [])),
    });
  }
}
