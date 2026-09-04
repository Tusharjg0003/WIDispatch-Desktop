import test from "node:test";
import assert from "node:assert/strict";

import {
  neighbourAfterClose,
  pinnedCount,
  workspaceStore,
} from "./workspaceStore.ts";

const reset = () => workspaceStore.getState().reset();

const seed = (names: string[]) => {
  reset();
  return names.map((name) => workspaceStore.getState().createWorkspace({ name }));
};

const order = () => workspaceStore.getState().order;
const instances = () => workspaceStore.getState().instances;

test("reorder preserves the active workspace", () => {
  const [a, b, c] = seed(["A", "B", "C"]);
  workspaceStore.getState().setActive(b.id);

  workspaceStore.getState().reorderWorkspaces(0, 2);

  assert.deepEqual(order(), [b.id, c.id, a.id]);
  assert.equal(workspaceStore.getState().activeWorkspaceId, b.id);
});

test("closing the active workspace picks the right neighbour, else the left", () => {
  const [a, b, c] = seed(["A", "B", "C"]);

  assert.equal(neighbourAfterClose(order(), b.id), c.id);
  // Closing the last tab falls back to the left neighbour.
  assert.equal(neighbourAfterClose(order(), c.id), b.id);
  assert.equal(neighbourAfterClose(order(), a.id), b.id);
});

test("neighbourAfterClose returns null when the last workspace closes", () => {
  const [only] = seed(["Only"]);
  assert.equal(neighbourAfterClose(order(), only.id), null);
});

test("closing pushes the workspace and its snapshot onto recentlyClosed", () => {
  const [a, b] = seed(["A", "B"]);
  workspaceStore.getState().setActive(a.id);

  workspaceStore.getState().removeWorkspace(a.id, [{ data: { id: "n1" } }]);

  const state = workspaceStore.getState();
  assert.deepEqual(state.order, [b.id]);
  assert.equal(state.activeWorkspaceId, null);
  assert.equal(state.recentlyClosed.length, 1);
  assert.equal(state.recentlyClosed[0].workspace.id, a.id);
  assert.equal(state.recentlyClosed[0].index, 0);
  assert.deepEqual(state.recentlyClosed[0].snapshotElements, [{ data: { id: "n1" } }]);

  const reopened = workspaceStore.getState().popRecentlyClosed();
  assert.equal(reopened?.workspace.id, a.id);
  assert.equal(workspaceStore.getState().recentlyClosed.length, 0);
});

test("an unpinned tab cannot be dropped ahead of a pinned one", () => {
  const [a, b, c] = seed(["A", "B", "C"]);
  workspaceStore.getState().togglePin(b.id);

  assert.deepEqual(order(), [b.id, a.id, c.id]);
  assert.equal(pinnedCount(order(), instances()), 1);

  // Try to drag C (unpinned, index 2) to the very front.
  workspaceStore.getState().reorderWorkspaces(2, 0);

  // Clamped to the first unpinned slot, not position 0.
  assert.deepEqual(order(), [b.id, c.id, a.id]);
});

test("a pinned tab cannot be dropped after the unpinned ones", () => {
  const [a, b, c] = seed(["A", "B", "C"]);
  workspaceStore.getState().togglePin(a.id);
  workspaceStore.getState().togglePin(b.id);

  assert.deepEqual(order(), [a.id, b.id, c.id]);
  workspaceStore.getState().reorderWorkspaces(0, 2);

  // A stays inside the pinned region.
  assert.deepEqual(order(), [b.id, a.id, c.id]);
});

test("unpinning re-seats the tab at the pinned boundary", () => {
  const [a, b, c] = seed(["A", "B", "C"]);
  workspaceStore.getState().togglePin(c.id);
  assert.deepEqual(order(), [c.id, a.id, b.id]);

  workspaceStore.getState().togglePin(c.id);
  assert.deepEqual(order(), [c.id, a.id, b.id]);
  assert.equal(pinnedCount(order(), instances()), 0);
});

test("renaming marks the document dirty", () => {
  const [a] = seed(["A"]);
  assert.equal(instances()[a.id].dirty, false);

  workspaceStore.getState().renameWorkspace(a.id, "Renamed");

  assert.equal(instances()[a.id].document.name, "Renamed");
  assert.equal(instances()[a.id].dirty, true);
});

test("UI updates never mark the document dirty", () => {
  const [a] = seed(["A"]);

  workspaceStore.getState().updateWorkspaceUI(a.id, {
    inspectorTab: "issues",
    viewport: { zoom: 3, pan: { x: 10, y: 20 } },
  });

  assert.equal(instances()[a.id].dirty, false);
  assert.equal(instances()[a.id].ui.inspectorTab, "issues");
  assert.deepEqual(instances()[a.id].ui.viewport, { zoom: 3, pan: { x: 10, y: 20 } });
});

test("markSaved clears dirty and adopts the backend id", () => {
  const [a] = seed(["A"]);
  workspaceStore.getState().markDirty(a.id);
  assert.equal(instances()[a.id].dirty, true);

  workspaceStore.getState().markSaved(a.id, { networkId: "net-7", name: "Saved" });

  assert.equal(instances()[a.id].dirty, false);
  assert.equal(instances()[a.id].document.networkId, "net-7");
  assert.equal(instances()[a.id].document.name, "Saved");
});

test("hydrate drops order entries with no surviving workspace", () => {
  const [a] = seed(["A"]);
  workspaceStore.getState().hydrate({
    workspaces: [a],
    order: [a.id, "ghost"],
    activeWorkspaceId: null,
  });

  assert.deepEqual(order(), [a.id]);
  assert.equal(workspaceStore.getState().activeWorkspaceId, null);
});
