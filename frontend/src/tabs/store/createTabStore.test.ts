import test from "node:test";
import assert from "node:assert/strict";

import { createTabStore } from "./createTabStore.ts";
import { createTabInstance, resetTabIdSequence } from "../types/tab.types.ts";

interface DemoState {
  subTab: string;
}

const store = createTabStore<DemoState>();
const state = () => store.getState();

const seed = (specs: Array<{ title: string; permanent?: boolean; key?: string }>) => {
  state().reset();
  resetTabIdSequence();
  return specs.map((spec) => {
    const tab = createTabInstance<DemoState>({
      title: spec.title,
      key: spec.key ?? null,
      permanent: spec.permanent ?? false,
      state: { subTab: "overview" },
    });
    state().addTab(tab);
    return tab;
  });
};

test("adds tabs in order and activates on request", () => {
  const [a, b] = seed([{ title: "A" }, { title: "B" }]);
  assert.deepEqual(state().order, [a.id, b.id]);
  state().setActive(b.id);
  assert.equal(state().activeTabId, b.id);
});

test("a tab id is never the domain key", () => {
  const [a] = seed([{ title: "A", key: "plant-1" }]);
  assert.equal(a.key, "plant-1");
  assert.notEqual(a.id, "plant-1");
});

test("removing a tab records it for reopening at its original index", () => {
  const [a, b, c] = seed([{ title: "A" }, { title: "B" }, { title: "C" }]);
  state().removeTab(b.id);

  assert.deepEqual(state().order, [a.id, c.id]);
  const closed = state().popRecentlyClosed();
  assert.equal(closed?.tab.id, b.id);
  assert.equal(closed?.index, 1);
  assert.equal(state().popRecentlyClosed(), null);
});

test("removing the active tab clears active, leaving the successor to the controller", () => {
  const [a, b] = seed([{ title: "A" }, { title: "B" }]);
  state().setActive(b.id);
  state().removeTab(b.id);
  assert.equal(state().activeTabId, null);
  assert.deepEqual(state().order, [a.id]);
});

test("a permanent tab is refused by remove, pin and reorder", () => {
  const [list, a] = seed([{ title: "All Plants", permanent: true }, { title: "A" }]);

  state().removeTab(list.id);
  assert.deepEqual(state().order, [list.id, a.id]);
  assert.equal(state().recentlyClosed.length, 0);

  state().togglePin(list.id);
  assert.equal(state().tabs[list.id].pinned, false);

  // Dragging the permanent tab to the end must leave it in front.
  state().reorderTabs(0, 1);
  assert.deepEqual(state().order, [list.id, a.id]);
});

test("pin and unpin both re-seat at the region boundary, behind any permanent tab", () => {
  const [list, a, b] = seed([
    { title: "All Plants", permanent: true },
    { title: "A" },
    { title: "B" },
  ]);

  state().togglePin(b.id);
  assert.deepEqual(state().order, [list.id, b.id, a.id]);

  // Unpinning re-seats at the same index — the head of the unpinned region —
  // which is the behaviour the workspace strip has always had.
  state().togglePin(b.id);
  assert.deepEqual(state().order, [list.id, b.id, a.id]);
  assert.equal(state().tabs[b.id].pinned, false);
});

test("setTabState merges rather than replaces, and renaming retitles", () => {
  const [a] = seed([{ title: "A" }]);
  state().setTabState(a.id, { subTab: "quality" });
  assert.equal(state().tabs[a.id].state.subTab, "quality");

  state().renameTab(a.id, "Renamed");
  assert.equal(state().tabs[a.id].title, "Renamed");
});

test("recentlyClosed is capped", () => {
  const store2 = createTabStore<DemoState>({ recentlyClosedLimit: 2 });
  ["A", "B", "C"].forEach((title) => {
    const tab = createTabInstance<DemoState>({ title, state: { subTab: "overview" } });
    store2.getState().addTab(tab);
    store2.getState().removeTab(tab.id);
  });
  assert.equal(store2.getState().recentlyClosed.length, 2);
});

test("hydrate drops order entries with no surviving tab", () => {
  state().reset();
  const a = createTabInstance<DemoState>({ title: "A", state: { subTab: "overview" } });
  state().hydrate({ tabs: [a], order: [a.id, "ghost"], activeTabId: a.id });
  assert.deepEqual(state().order, [a.id]);
  assert.equal(state().activeTabId, a.id);
});
