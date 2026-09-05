import test from "node:test";
import assert from "node:assert/strict";

import { DemandTabController } from "./DemandTabController.ts";
import { demandTabStore } from "./demandTabStore.ts";
import { LIST_TAB_TITLE } from "./demandTab.types.ts";
import { MemoryTabSessionStorage } from "../../tabs/persistence/tabSessionStorage.ts";

const state = () => demandTabStore.getState();

const makeNavigator = () => {
  const paths: string[] = [];
  return { paths, replace: (path: string) => paths.push(path) };
};

const setup = () => {
  state().reset();
  const storage = new MemoryTabSessionStorage();
  const navigator = makeNavigator();
  const controller = new DemandTabController({ storage });
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

test("opening a city gate adds a tab and activates it", () => {
  const { controller, navigator } = setup();
  const id = controller.openGate("gate-1", "North Gate");

  assert.deepEqual(titles(), [LIST_TAB_TITLE, "North Gate"]);
  assert.equal(state().activeTabId, id);
  assert.equal(navigator.paths.at(-1), "/demand/gate-1");
});

test("the city gate sub-tab is preserved per tab", () => {
  const { controller } = setup();
  const a = controller.openGate("gate-1", "A");
  const b = controller.openGate("gate-2", "B");

  controller.setSubTab(a, "quality");
  controller.activateTab(b);
  assert.equal(state().tabs[a].state.subTab, "quality");
  assert.equal(state().tabs[b].state.subTab, "overview");
});

test("closing the active tab activates its neighbour", () => {
  const { controller } = setup();
  const a = controller.openGate("gate-1", "A");
  const b = controller.openGate("gate-2", "B");
  controller.activateTab(a);

  controller.closeTab(a);
  assert.equal(state().activeTabId, b);
});
