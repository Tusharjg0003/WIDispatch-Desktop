import { RecordTabController } from "../../tabs/controller/RecordTabController.ts";
import { createTabSessionStorage } from "../../tabs/persistence/tabSessionStorage.ts";
import { simTabStore } from "./simTabStore.ts";
import { DEFAULT_SIM_SUB_TAB, NEW_SIM_PREFIX, NEW_SIM_TITLE, isNewSimKey, isSimSubTab } from "./simTab.types.ts";
import type { SimTabState } from "./simTab.types.ts";

const BASE_PATH = "/simulation-config";

export const simTabController = new RecordTabController<SimTabState>({
  storage: createTabSessionStorage("simulation-config"),
  store: simTabStore,
  basePath: BASE_PATH,
  isSubTab: isSimSubTab,
  defaultSubTab: DEFAULT_SIM_SUB_TAB,
  listTab: false,
  label: "simulation",
  // A "New simulation" tab sits on the module root; a saved one on its id.
  pathFor: (tab) => {
    if (!tab.key || isNewSimKey(tab.key)) return BASE_PATH;
    const path = `${BASE_PATH}/${encodeURIComponent(tab.key)}`;
    return tab.state.subTab === DEFAULT_SIM_SUB_TAB ? path : `${path}?tab=${tab.state.subTab}`;
  },
  // Keep a tab's unsaved setup across reloads too.
  parseState: (raw, base) => {
    const r = (raw ?? {}) as { draft?: unknown; dirty?: unknown };
    const draft = r.draft && typeof r.draft === "object" ? (r.draft as Record<string, unknown>) : null;
    return { ...base, draft, dirty: Boolean(r.dirty && draft) };
  },
});

let newSeq = 0;

/** Focus the open "New simulation" tab, or open one (the strip is never empty). */
export const openNewSimTab = (): string => {
  const { order, tabs } = simTabStore.getState();
  const existing = order.find((id) => isNewSimKey(tabs[id]?.key));
  if (existing) {
    simTabController.activateTab(existing);
    return existing;
  }
  newSeq += 1;
  return simTabController.openRecord(`${NEW_SIM_PREFIX}${Date.now().toString(36)}-${newSeq}`, NEW_SIM_TITLE);
};

/**
 * Open a saved simulation. From a "New simulation" tab it takes that tab's
 * place (like picking a page in a browser's new tab) unless it is already open.
 */
export const openSimulation = (configId: string, name?: string): string => {
  const active = simTabController.getActiveTab();
  if (active && isNewSimKey(active.key) && !simTabController.findByKey(configId)) {
    simTabController.rekeyTab(active.id, configId, name ?? configId, { subTab: DEFAULT_SIM_SUB_TAB, draft: null, dirty: false });
    return active.id;
  }
  const id = simTabController.openRecord(configId, name);
  // The placeholder is no longer needed once a real simulation took focus.
  if (active && isNewSimKey(active.key) && active.id !== id) simTabController.closeTab(active.id, { force: true });
  return id;
};
