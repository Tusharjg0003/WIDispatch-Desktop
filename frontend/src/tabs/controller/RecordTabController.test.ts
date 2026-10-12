import test from "node:test";
import assert from "node:assert/strict";

import { RecordTabController } from "./RecordTabController.ts";
import { createTabStore } from "../store/createTabStore.ts";
import { MemoryTabSessionStorage } from "../persistence/tabSessionStorage.ts";

interface State { subTab: string; draft?: { name: string } | null; dirty?: boolean }

const SUBS = ["view", "edit"];

const makeNavigator = () => {
  const paths: string[] = [];
  return { paths, replace: (path: string) => paths.push(path) };
};

const setup = (extra: Record<string, unknown> = {}) => {
  const store = createTabStore<State>();
  const storage = new MemoryTabSessionStorage();
  const navigator = makeNavigator();
  const controller = new RecordTabController<State>({
    storage,
    store,
    basePath: "/things",
    listTitle: "All Things",
    isSubTab: (v) => typeof v === "string" && SUBS.includes(v),
    defaultSubTab: "view",
    ...extra,
  });
  controller.registerNavigator(navigator);
  return { store, storage, navigator, controller, state: () => store.getState() };
};

test("listTab: false — no permanent tab, the strip can be empty, the URL falls back to the root", () => {
  const { controller, state, navigator } = setup({ listTab: false });
  controller.restoreSession(null);
  assert.equal(state().order.length, 0);

  const id = controller.openRecord("a", "A");
  assert.deepEqual(state().order, [id]);
  assert.equal(navigator.paths.at(-1), "/things/a");

  controller.closeTab(id);
  assert.equal(state().order.length, 0);
  assert.equal(state().activeTabId, null);
  assert.equal(navigator.paths.at(-1), "/things");
});

test("pathFor shapes the mirrored URL", () => {
  const { controller, navigator } = setup({
    pathFor: (tab: { key: string | null; state: State }) =>
      !tab.key ? "/things" : tab.key.startsWith("new-") ? "/things/create" : `/things/${tab.state.subTab}/${tab.key}`,
  });
  controller.restoreSession(null);
  const id = controller.openRecord("a", "A");
  assert.equal(navigator.paths.at(-1), "/things/view/a");
  controller.setSubTab(id, "edit");
  assert.equal(navigator.paths.at(-1), "/things/edit/a");
  controller.openRecord("new-1", "New thing", { subTab: "edit" });
  assert.equal(navigator.paths.at(-1), "/things/create");
});

test("rekeyTab turns a new-record tab into the saved record's tab", () => {
  const { controller, state, navigator } = setup();
  controller.restoreSession(null);
  const id = controller.openRecord("new-1", "New thing", { subTab: "edit" });
  controller.rekeyTab(id, "t-42", "Thing 42", { subTab: "view" });
  assert.equal(state().tabs[id].key, "t-42");
  assert.equal(state().tabs[id].title, "Thing 42");
  assert.equal(navigator.paths.at(-1), "/things/t-42");
  // Opening the saved record focuses the same tab rather than adding one.
  assert.equal(controller.openRecord("t-42"), id);
});

test("beforeClose can veto a close; closeByKey forces it", () => {
  let allow = false;
  const { controller, state } = setup({ beforeClose: () => allow });
  controller.restoreSession(null);
  const id = controller.openRecord("a", "A");
  controller.closeTab(id);
  assert.ok(state().tabs[id], "vetoed close keeps the tab");
  controller.closeOthers(state().order[0]);
  assert.ok(state().tabs[id], "vetoed close-others keeps it too");
  controller.closeByKey("a");
  assert.equal(state().tabs[id], undefined);
  allow = true;
});

test("parseState keeps extra tab state through a reload", () => {
  const first = setup({
    listTab: false,
    parseState: (raw: unknown, base: State) => ({ ...base, draft: (raw as State)?.draft ?? null, dirty: Boolean((raw as State)?.dirty) }),
  });
  first.controller.restoreSession(null);
  const id = first.controller.openRecord("a", "A");
  first.controller.setTabState(id, { draft: { name: "edited" }, dirty: true });

  const store = createTabStore<State>();
  const again = new RecordTabController<State>({
    storage: first.storage,
    store,
    basePath: "/things",
    isSubTab: (v) => typeof v === "string" && SUBS.includes(v),
    defaultSubTab: "view",
    listTab: false,
    parseState: (raw: unknown, base: State) => ({ ...base, draft: (raw as State)?.draft ?? null, dirty: Boolean((raw as State)?.dirty) }),
  });
  again.restoreSession(null);
  const restored = store.getState().tabs[store.getState().order[0]];
  assert.deepEqual(restored.state.draft, { name: "edited" });
  assert.equal(restored.state.dirty, true);
});
