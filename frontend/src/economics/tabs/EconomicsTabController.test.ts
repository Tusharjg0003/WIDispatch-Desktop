import test from "node:test";
import assert from "node:assert/strict";

import { EconomicsTabController } from "./EconomicsTabController.ts";
import { economicsTabStore } from "./economicsTabStore.ts";
import { LIST_TAB_TITLE } from "./economicsTab.types.ts";
import { MemoryTabSessionStorage } from "../../tabs/persistence/tabSessionStorage.ts";

const state = () => economicsTabStore.getState();

const makeNavigator = () => {
  const paths: string[] = [];
  return { paths, replace: (path: string) => paths.push(path) };
};

const setup = () => {
  state().reset();
  const storage = new MemoryTabSessionStorage();
  const navigator = makeNavigator();
  const controller = new EconomicsTabController({ storage });
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

test("opening a plant adds a tab and activates it", () => {
  const { controller, navigator } = setup();
  const id = controller.openPlant("plant-1", "Jubail RO");

  assert.deepEqual(titles(), [LIST_TAB_TITLE, "Jubail RO"]);
  assert.equal(state().activeTabId, id);
  assert.equal(navigator.paths.at(-1), "/economics/plant-1");
});

test("the finance sub-tab is preserved per tab", () => {
  const { controller } = setup();
  const a = controller.openPlant("plant-1", "A");
  const b = controller.openPlant("plant-2", "B");

  controller.setSubTab(a, "financial");
  controller.activateTab(b);
  assert.equal(state().tabs[a].state.subTab, "financial");
  assert.equal(state().tabs[b].state.subTab, "overview");
});

test("closing the active tab activates its neighbour", () => {
  const { controller } = setup();
  const a = controller.openPlant("plant-1", "A");
  const b = controller.openPlant("plant-2", "B");
  controller.activateTab(a);

  controller.closeTab(a);
  assert.equal(state().activeTabId, b);
});
