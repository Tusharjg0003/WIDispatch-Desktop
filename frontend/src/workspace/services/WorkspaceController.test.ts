import test from "node:test";
import assert from "node:assert/strict";

import { WorkspaceController } from "./WorkspaceController.ts";
import { workspaceStore } from "../store/workspaceStore.ts";
import { inspectorStore } from "../../inspector/store/inspectorStore.ts";
import { issuesStore } from "../../issues/store/issuesStore.ts";
import { selectionStore } from "../../selection/store/selectionStore.ts";
import { DEFAULT_VIEW_TOGGLES } from "../types/workspace.types.ts";
import { InMemoryCanvasRepository } from "../../canvas/persistence/CanvasRepository.ts";
import type { CanvasControllerApi } from "../../canvas/controller/CanvasController.ts";
import type { CanvasSnapshot } from "../../canvas/persistence/canvasSnapshot.types.ts";
import type { CanvasViewport, WorkspaceViewToggles } from "../types/workspace.types.ts";

/** A fake canvas that records the transaction's calls in order. */
class FakeCanvas implements CanvasControllerApi {
  elements: unknown[] = [];
  viewport: CanvasViewport | null = null;
  selected: string[] = [];
  calls: string[] = [];
  captureReturnsNull = false;

  initialize(): never { throw new Error("initialize is not exercised in these tests"); }
  destroy() {}
  getCy() { return null; }
  isRestoring() { return false; }
  runBatch(fn: () => void) { fn(); }

  captureSnapshot(): CanvasSnapshot | null {
    this.calls.push("capture");
    if (this.captureReturnsNull) return null;
    return {
      version: 1,
      elements: [...this.elements],
      viewport: this.viewport,
    };
  }
  restoreSnapshot(snapshot: CanvasSnapshot | null) {
    this.calls.push("restore");
    this.elements = snapshot ? [...snapshot.elements] : [];
  }
  restoreElements(elements: unknown[] | null) {
    this.elements = elements ? [...elements] : [];
  }
  loadDocument(doc: unknown) {
    this.calls.push("loadDocument");
    this.elements = (doc as { nodes?: unknown[] })?.nodes ?? [];
  }
  clear() {
    this.calls.push("clear");
    this.elements = [];
  }
  getViewport() { return this.viewport; }
  restoreViewport(viewport: CanvasViewport | null) {
    this.calls.push("restoreViewport");
    this.viewport = viewport;
  }
  getSelectedIds() { return [...this.selected]; }
  restoreSelection(ids: string[]) {
    this.calls.push("restoreSelection");
    this.selected = [...ids];
  }
}

const setup = (overrides: Partial<{ fetchNetwork: (id: string) => Promise<unknown> }> = {}) => {
  workspaceStore.getState().reset();
  inspectorStore.getState().hydrate({ inspectorOpen: true, inspectorTab: "details" });
  issuesStore.getState().setMode("issues");
  selectionStore.getState().clearSelection();

  const canvas = new FakeCanvas();
  const repository = new InMemoryCanvasRepository();
  const calls: string[] = [];

  const controller = new WorkspaceController({
    canvas,
    repository,
    fetchNetwork: overrides.fetchNetwork ?? (async () => ({ nodes: [], edges: [] })),
  });

  let toggles: WorkspaceViewToggles = { ...DEFAULT_VIEW_TOGGLES };
  controller.registerInteraction({
    reset: () => { canvas.calls.push("interaction.reset"); calls.push("reset"); },
    cancelUnsafeInteraction: () => {
      canvas.calls.push("cancelUnsafe");
      calls.push("cancelUnsafe");
    },
  });
  controller.registerHistory({
    reset: () => { canvas.calls.push("history.reset"); calls.push("history.reset"); },
  });
  controller.registerViewBridge({
    capture: () => toggles,
    apply: (next) => { toggles = next; canvas.calls.push("view.apply"); },
  });
  const navigated: string[] = [];
  controller.registerNavigator({ replace: (path) => navigated.push(path) });

  return { controller, canvas, repository, calls, navigated, getToggles: () => toggles };
};

test("A -> B -> A restores each graph, viewport, inspector tab and selection", async () => {
  const { controller, canvas } = setup();

  const aId = await controller.createWorkspace("A");
  canvas.elements = [{ data: { id: "a1" } }];
  canvas.viewport = { zoom: 2, pan: { x: 10, y: 20 } };
  canvas.selected = ["a1"];
  inspectorStore.getState().openInspector("issues");
  issuesStore.getState().setMode("find");

  const bId = await controller.createWorkspace("B");
  assert.deepEqual(canvas.elements, []);
  assert.deepEqual(canvas.selected, []);
  // B is a fresh workspace, so it gets defaults rather than A's inspector state.
  assert.equal(inspectorStore.getState().activeTab, "details");
  assert.equal(issuesStore.getState().mode, "issues");

  canvas.elements = [{ data: { id: "b1" } }];
  canvas.viewport = { zoom: 0.5, pan: { x: -5, y: -5 } };

  await controller.activateWorkspace(aId);

  assert.deepEqual(canvas.elements, [{ data: { id: "a1" } }]);
  assert.deepEqual(canvas.viewport, { zoom: 2, pan: { x: 10, y: 20 } });
  assert.deepEqual(canvas.selected, ["a1"]);
  assert.equal(inspectorStore.getState().activeTab, "issues");
  assert.equal(issuesStore.getState().mode, "find");

  await controller.activateWorkspace(bId);
  assert.deepEqual(canvas.elements, [{ data: { id: "b1" } }]);
  assert.equal(inspectorStore.getState().activeTab, "details");
});

test("the switch transaction runs its steps in the required order", async () => {
  const { controller, canvas } = setup();
  const aId = await controller.createWorkspace("A");
  await controller.createWorkspace("B");
  canvas.calls.length = 0;

  await controller.activateWorkspace(aId);

  const order = canvas.calls;
  const idx = (name: string) => order.indexOf(name);

  assert.ok(idx("capture") < idx("cancelUnsafe"), "capture before cancel");
  assert.ok(idx("cancelUnsafe") < idx("interaction.reset"), "cancel before reset");
  assert.ok(idx("interaction.reset") < idx("history.reset"), "reset before history");
  assert.ok(idx("history.reset") < idx("restore"), "history reset before restore");
  assert.ok(idx("restore") < idx("restoreViewport"), "restore before viewport");
  assert.ok(idx("restoreViewport") < idx("view.apply"), "viewport before view toggles");
  assert.ok(idx("view.apply") < idx("restoreSelection"), "view toggles before selection");
});

test("selection is restored before the inspector is hydrated", async () => {
  const { controller, canvas } = setup();

  const aId = await controller.createWorkspace("A");
  inspectorStore.getState().openInspector("issues");
  canvas.selected = ["a1"];
  canvas.elements = [{ data: { id: "a1" } }];

  await controller.createWorkspace("B");

  // Emulate the page's select handler forcing Details whenever a selection
  // event arrives. Hydration must run afterwards and win.
  const original = canvas.restoreSelection.bind(canvas);
  canvas.restoreSelection = (ids: string[]) => {
    original(ids);
    if (ids.length) inspectorStore.getState().openInspector("details");
  };

  await controller.activateWorkspace(aId);

  assert.deepEqual(canvas.selected, ["a1"]);
  assert.equal(
    inspectorStore.getState().activeTab,
    "issues",
    "inspector hydration must override the select-driven jump to Details"
  );
});

test("switching cancels an unsafe interaction before restoring", async () => {
  const { controller, canvas } = setup();
  const aId = await controller.createWorkspace("A");
  await controller.createWorkspace("B");
  canvas.calls.length = 0;

  await controller.activateWorkspace(aId);

  assert.ok(canvas.calls.includes("cancelUnsafe"));
  assert.ok(canvas.calls.indexOf("cancelUnsafe") < canvas.calls.indexOf("restore"));
});

test("a switch superseded mid-fetch never writes the displayed graph into the pending workspace", async () => {
  let release!: (value: unknown) => void;
  const pending = new Promise<unknown>((resolve) => { release = resolve; });

  const { controller, canvas } = setup({
    fetchNetwork: async (id) => {
      if (id === "net-b") { await pending; return { nodes: [{ data: { id: "b1" } }] }; }
      return { nodes: [] };
    },
  });

  const aId = await controller.createWorkspace("A");
  canvas.elements = [{ data: { id: "a1" } }];

  // B exists but has never been loaded, so activating it must fetch.
  const b = workspaceStore.getState().createWorkspace({ name: "B", networkId: "net-b" });
  const c = workspaceStore.getState().createWorkspace({ name: "C" });
  controller.seedSnapshot(c.id, { version: 1, elements: [{ data: { id: "c1" } }], viewport: null });

  // Start the switch to B and, without waiting, switch to C.
  const bSwitch = controller.activateWorkspace(b.id);
  await controller.activateWorkspace(c.id);

  release(null);
  await bSwitch;

  assert.deepEqual(
    controller.getSnapshot(b.id)?.elements ?? [],
    [],
    "the still-loading workspace must not be given the displayed workspace's graph"
  );
  assert.equal(workspaceStore.getState().activeWorkspaceId, c.id);
  assert.equal(controller.displayedWorkspaceId, c.id);
  assert.deepEqual(canvas.elements, [{ data: { id: "c1" } }]);
  assert.deepEqual(controller.getSnapshot(aId)?.elements, [{ data: { id: "a1" } }]);
});

test("a null capture writes no snapshot", async () => {
  const { controller, canvas } = setup();
  const aId = await controller.createWorkspace("A");
  canvas.elements = [{ data: { id: "a1" } }];
  await controller.flushRecoverySnapshot();
  assert.deepEqual(controller.getSnapshot(aId)?.elements, [{ data: { id: "a1" } }]);

  canvas.captureReturnsNull = true;
  canvas.elements = [];
  await controller.createWorkspace("B");

  // The previous snapshot survives rather than being replaced by nothing.
  assert.deepEqual(controller.getSnapshot(aId)?.elements, [{ data: { id: "a1" } }]);
});

test("document mutations mark dirty; view changes do not", async () => {
  const { controller } = setup();
  const aId = await controller.createWorkspace("A");
  assert.equal(controller.getWorkspace(aId)?.dirty, false);

  controller.notifyViewChanged();
  assert.equal(controller.getWorkspace(aId)?.dirty, false);

  controller.notifyDocumentMutated();
  assert.equal(controller.getWorkspace(aId)?.dirty, true);

  controller.markSaved(aId, { networkId: "net-1", name: "A" });
  assert.equal(controller.getWorkspace(aId)?.dirty, false);
  assert.equal(controller.getWorkspace(aId)?.document.networkId, "net-1");
});

test("a workspace whose document failed to load writes no recovery snapshot", async () => {
  const { controller, repository } = setup({
    fetchNetwork: async () => { throw new Error("network down"); },
  });

  const id = await controller.openNetwork("net-broken", "Broken");

  assert.equal(controller.getWorkspace(id)?.loadError, true);
  await controller.flushRecoverySnapshot();

  const recovered = await repository.loadAll();
  assert.equal(
    recovered.workspaces.find((w) => w.id === id),
    undefined,
    "a failed load must not overwrite stored data"
  );
});

test("closing the active workspace activates the right neighbour", async () => {
  const { controller } = setup();
  const aId = await controller.createWorkspace("A");
  const bId = await controller.createWorkspace("B");
  const cId = await controller.createWorkspace("C");

  await controller.activateWorkspace(bId);
  await controller.closeWorkspace(bId);

  assert.equal(workspaceStore.getState().activeWorkspaceId, cId);
  assert.deepEqual(workspaceStore.getState().order, [aId, cId]);
});

test("closing the last workspace creates a fresh one", async () => {
  const { controller } = setup();
  const only = await controller.createWorkspace("Only");

  await controller.closeWorkspace(only);

  const state = workspaceStore.getState();
  assert.equal(state.order.length, 1);
  assert.notEqual(state.activeWorkspaceId, only);
  assert.equal(state.activeWorkspaceId, state.order[0]);
});

test("a closed workspace can be reopened with its graph", async () => {
  const { controller, canvas } = setup();
  const aId = await controller.createWorkspace("A");
  canvas.elements = [{ data: { id: "a1" } }];
  await controller.createWorkspace("B");

  await controller.closeWorkspace(aId);
  const reopened = await controller.reopenLastClosed();

  assert.equal(reopened, aId);
  assert.deepEqual(canvas.elements, [{ data: { id: "a1" } }]);
});

test("duplicate copies the graph into a new unsaved workspace", async () => {
  const { controller, canvas } = setup();
  const aId = await controller.openNetwork("net-1", "A");
  canvas.elements = [{ data: { id: "a1" } }];

  const copyId = await controller.duplicateWorkspace(aId);

  assert.ok(copyId);
  const copy = controller.getWorkspace(copyId!);
  assert.equal(copy?.document.networkId, null, "a duplicate must not share the backend record");
  assert.equal(copy?.dirty, true);
  assert.equal(copy?.document.name, "A (copy)");
  assert.deepEqual(canvas.elements, [{ data: { id: "a1" } }]);
});

test("renaming a background workspace is persisted", async () => {
  const { controller, repository } = setup();
  const aId = await controller.createWorkspace("A");
  const bId = await controller.createWorkspace("B");
  // B is displayed; rename A, which is not.
  assert.equal(controller.displayedWorkspaceId, bId);

  controller.renameWorkspace(aId, "Renamed A");
  await controller.flushRecoverySnapshot();

  const recovered = await repository.loadAll();
  const storedA = recovered.workspaces.find((w) => w.id === aId);
  assert.equal(
    storedA?.document.name,
    "Renamed A",
    "a rename of a background tab must reach storage, not just memory"
  );
  // The displayed workspace is still written too.
  assert.ok(recovered.workspaces.find((w) => w.id === bId));
});

test("pinning a background workspace is persisted", async () => {
  const { controller, repository } = setup();
  const aId = await controller.createWorkspace("A");
  await controller.createWorkspace("B");

  controller.togglePin(aId);
  await controller.flushRecoverySnapshot();

  const recovered = await repository.loadAll();
  assert.equal(recovered.workspaces.find((w) => w.id === aId)?.pinned, true);
});

test("cold start restores the recovered graph rather than leaving a blank canvas", async () => {
  const first = setup();
  const aId = await first.controller.createWorkspace("A");
  first.canvas.elements = [{ data: { id: "a1" } }];
  first.canvas.viewport = { zoom: 3, pan: { x: 1, y: 2 } };
  await first.controller.flushRecoverySnapshot();

  // Simulate a refresh: fresh stores and a fresh canvas, same storage.
  const second = setup();
  const controller = new WorkspaceController({
    canvas: second.canvas,
    repository: first.repository,
    fetchNetwork: async () => ({ nodes: [], edges: [] }),
  });

  await controller.recoverSession(null);

  assert.equal(workspaceStore.getState().activeWorkspaceId, aId);
  assert.equal(controller.displayedWorkspaceId, aId);
  assert.deepEqual(
    second.canvas.elements,
    [{ data: { id: "a1" } }],
    "the recovered workspace's graph must actually reach the canvas"
  );
  assert.deepEqual(second.canvas.viewport, { zoom: 3, pan: { x: 1, y: 2 } });
});

test("recovery with nothing stored creates a single untitled workspace", async () => {
  const { controller } = setup();
  await controller.recoverSession(null);

  const state = workspaceStore.getState();
  assert.equal(state.order.length, 1);
  assert.equal(state.instances[state.order[0]].document.name, "Untitled 1");
  assert.equal(state.activeWorkspaceId, state.order[0]);
});

test("a deep link to an already-open network activates it instead of duplicating", async () => {
  const { controller } = setup();
  const aId = await controller.openNetwork("net-1", "A");
  await controller.createWorkspace("B");

  const again = await controller.openNetwork("net-1", "A");

  assert.equal(again, aId);
  assert.equal(workspaceStore.getState().order.length, 2);
});

test("the URL mirrors the active workspace", async () => {
  const { controller, navigated } = setup();
  await controller.createWorkspace("A");
  assert.equal(navigated.at(-1), "/network-builder");

  await controller.openNetwork("net-9", "Nine");
  assert.equal(navigated.at(-1), "/network-builder/net-9");
});
