import test from "node:test";
import assert from "node:assert/strict";

import { ProductionTabController } from "./ProductionTabController.ts";
import { productionTabStore } from "./productionTabStore.ts";
import { LIST_TAB_TITLE } from "./productionTab.types.ts";
import { MemoryTabSessionStorage } from "../../tabs/persistence/tabSessionStorage.ts";

const state = () => productionTabStore.getState();

/** Records the paths the controller mirrors, in order. */
const makeNavigator = () => {
  const paths: string[] = [];
  return { paths, replace: (path: string) => paths.push(path) };
};

const setup = () => {
  state().reset();
  const storage = new MemoryTabSessionStorage();
  const navigator = makeNavigator();
  const controller = new ProductionTabController({ storage });
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
  assert.equal(navigator.paths.at(-1), "/production/plant-1");
});

test("opening a plant that is already open focuses its tab", () => {
  const { controller } = setup();
  const first = controller.openPlant("plant-1", "Jubail RO");
  controller.activateTab(state().order[0]);

  const second = controller.openPlant("plant-1", "Jubail RO");
  assert.equal(second, first);
  assert.equal(state().order.length, 2);
  assert.equal(state().activeTabId, first);
});

test("a plant id with a slash survives URL mirroring", () => {
  const { controller, navigator } = setup();
  controller.openPlant("plant/1", "Odd Id");
  assert.equal(navigator.paths.at(-1), "/production/plant%2F1");
});

test("the sub-tab is per tab and survives switching away and back", () => {
  const { controller, navigator } = setup();
  const a = controller.openPlant("plant-1", "A");
  const b = controller.openPlant("plant-2", "B");

  controller.setSubTab(a, "quality");
  assert.equal(navigator.paths.at(-1), "/production/plant-2");

  controller.activateTab(a);
  assert.equal(state().tabs[a].state.subTab, "quality");
  assert.equal(state().tabs[b].state.subTab, "overview");
  assert.equal(navigator.paths.at(-1), "/production/plant-1?tab=quality");
});

test("closing the active tab activates its neighbour", () => {
  const { controller } = setup();
  const a = controller.openPlant("plant-1", "A");
  const b = controller.openPlant("plant-2", "B");
  controller.activateTab(a);

  controller.closeTab(a);
  assert.equal(state().activeTabId, b);
});

test("the list tab cannot be closed, by close or by closeOthers", () => {
  const { controller } = setup();
  const listId = state().order[0];
  const a = controller.openPlant("plant-1", "A");

  controller.closeTab(listId);
  assert.deepEqual(state().order, [listId, a]);

  controller.closeOthers(listId);
  assert.deepEqual(state().order, [listId]);
  assert.equal(state().activeTabId, listId);
});

test("closeToRight spares pinned tabs and the list tab", () => {
  const { controller } = setup();
  const listId = state().order[0];
  const a = controller.openPlant("plant-1", "A");
  const b = controller.openPlant("plant-2", "B");
  const c = controller.openPlant("plant-3", "C");
  controller.togglePin(c);

  controller.closeToRight(listId);
  assert.deepEqual(new Set(state().order), new Set([listId, c]));
  assert.ok(!state().tabs[a] && !state().tabs[b]);
});

test("reopening restores a closed tab at its original index", () => {
  const { controller } = setup();
  const listId = state().order[0];
  const a = controller.openPlant("plant-1", "A");
  controller.openPlant("plant-2", "B");

  controller.closeTab(a);
  const reopened = controller.reopenLastClosed();

  assert.equal(state().order[1], reopened);
  assert.equal(state().activeTabId, reopened);
  assert.equal(state().order[0], listId);
});

test("activateRelative wraps around the strip", () => {
  const { controller } = setup();
  const listId = state().order[0];
  const a = controller.openPlant("plant-1", "A");

  controller.activateRelative(1);
  assert.equal(state().activeTabId, listId);
  controller.activateRelative(-1);
  assert.equal(state().activeTabId, a);
});

test("adoptTitle takes the backend name as the authority", () => {
  const { controller } = setup();
  const a = controller.openPlant("plant-1", "plant-1");
  controller.adoptTitle(a, "Jubail RO Phase 2");
  assert.equal(state().tabs[a].title, "Jubail RO Phase 2");
});

test("a session is restored from storage, sub-tab included", () => {
  const { controller, storage } = setup();
  const a = controller.openPlant("plant-1", "A");
  controller.setSubTab(a, "outages");

  state().reset();
  const restored = new ProductionTabController({ storage });
  restored.registerNavigator(makeNavigator());
  restored.restoreSession(null);

  const plantTab = state().order.map((id) => state().tabs[id]).find((tab) => tab.key === "plant-1");
  assert.equal(plantTab?.state.subTab, "outages");
  assert.equal(state().order.length, 2);
});

test("a deep link focuses the restored tab for that plant rather than opening a second", () => {
  const { controller, storage } = setup();
  controller.openPlant("plant-1", "A");

  state().reset();
  const restored = new ProductionTabController({ storage });
  restored.registerNavigator(makeNavigator());
  restored.restoreSession("plant-1");

  assert.equal(state().order.length, 2);
  assert.equal(state().tabs[state().activeTabId!].key, "plant-1");
});

test("a deep link to an unopened plant opens a tab for it", () => {
  const { controller } = setup();
  controller.restoreSession("plant-9", "maintenance");

  const active = state().tabs[state().activeTabId!];
  assert.equal(active.key, "plant-9");
  assert.equal(active.state.subTab, "maintenance");
});

test("a corrupt stored session degrades to the list tab alone", () => {
  const storage = new MemoryTabSessionStorage();
  storage.write({ version: 99, nonsense: true });
  state().reset();

  const controller = new ProductionTabController({ storage });
  controller.registerNavigator(makeNavigator());
  controller.restoreSession(null);

  assert.deepEqual(titles(), [LIST_TAB_TITLE]);
  assert.equal(controller.getActiveTab()?.permanent, true);
});
