import test from "node:test";
import assert from "node:assert/strict";

import { TransmissionTabController } from "./TransmissionTabController.ts";
import { transmissionTabStore } from "./transmissionTabStore.ts";
import { LIST_TAB_TITLE } from "./transmissionTab.types.ts";
import { MemoryTabSessionStorage } from "../../tabs/persistence/tabSessionStorage.ts";

const state = () => transmissionTabStore.getState();

const makeNavigator = () => {
  const paths: string[] = [];
  return { paths, replace: (path: string) => paths.push(path) };
};

const setup = () => {
  state().reset();
  const storage = new MemoryTabSessionStorage();
  const navigator = makeNavigator();
  const controller = new TransmissionTabController({ storage });
  controller.registerNavigator(navigator);
  controller.restoreSession(null);
  return { controller, navigator, storage };
};

const titles = () => state().order.map((id) => state().tabs[id].title);

test("a fresh session opens with only the permanent list tab", () => {
  const { controller } = setup();
  assert.deepEqual(titles(), [LIST_TAB_TITLE]);
  assert.equal(state().tabs[state().activeTabId!].permanent, true);
  assert.equal(controller.getActiveTab()?.key, null);
});

test("opening a pump station adds a tab and activates it", () => {
  const { controller, navigator } = setup();
  const id = controller.openPumpStation("pump-1", "Jubail Booster");

  assert.deepEqual(titles(), [LIST_TAB_TITLE, "Jubail Booster"]);
  assert.equal(state().activeTabId, id);
  assert.equal(navigator.paths.at(-1), "/transmission/pump-stations/pump-1");
});

test("the overview sub-tab is preserved per pump station", () => {
  const { controller } = setup();
  const a = controller.openPumpStation("pump-1", "A");
  const b = controller.openPumpStation("pump-2", "B");

  controller.setSubTab(a, "maintenance");
  controller.activateTab(b);
  assert.equal(state().tabs[a].state.subTab, "maintenance");
  assert.equal(state().tabs[b].state.subTab, "overview");
});

test("closing the active tab activates its neighbour", () => {
  const { controller } = setup();
  const a = controller.openPumpStation("pump-1", "A");
  const b = controller.openPumpStation("pump-2", "B");
  controller.activateTab(a);

  controller.closeTab(a);
  assert.equal(state().activeTabId, b);
});

test("restoring without a navigator leaves the URL alone, and syncUrl mirrors it later", () => {
  state().reset();
  const storage = new MemoryTabSessionStorage();
  const controller = new TransmissionTabController({ storage });
  // Transmission Systems view: no navigator registered while the session restores.
  controller.restoreSession(null);
  const id = controller.openPumpStation("pump-1", "A");
  controller.setSubTab(id, "maintenance");

  const navigator = makeNavigator();
  controller.registerNavigator(navigator);
  assert.deepEqual(navigator.paths, []);
  controller.syncUrl();
  assert.deepEqual(navigator.paths, ["/transmission/pump-stations/pump-1?tab=maintenance"]);
});

test("detaching stops URL mirroring", () => {
  const { controller, navigator } = setup();
  const before = navigator.paths.length;
  controller.detach();
  controller.openPumpStation("pump-2", "B");
  assert.equal(navigator.paths.length, before);
});


test("a controller configured for systems uses its own store, path, list tab and sub-tabs", async () => {
  const { systemTabStore } = await import("../systemTabs/systemTabStore.ts");
  const { isSystemSubTab } = await import("../systemTabs/systemTab.types.ts");
  systemTabStore.getState().reset();
  const navigator = makeNavigator();
  const systems = new TransmissionTabController({
    storage: new MemoryTabSessionStorage(),
    store: systemTabStore,
    basePath: "/transmission/systems",
    listTitle: "All Systems",
    isSubTab: isSystemSubTab,
    defaultSubTab: "overview",
  });
  systems.registerNavigator(navigator);
  systems.restoreSession("sys-1", "lines");

  const sys = systemTabStore.getState();
  assert.deepEqual(sys.order.map((id) => sys.tabs[id].title), ["All Systems", "sys-1"]);
  assert.equal(navigator.paths.at(-1), "/transmission/systems/sys-1?tab=lines");
  // The pump-station store is untouched.
  assert.ok(!state().order.some((id) => state().tabs[id].key === "sys-1"));
});
