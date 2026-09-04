// Workspace switching as an explicit, ordered transaction.
//
// This controller — not a React effect — owns activation, loading, closing and
// recovery. It is framework-independent: no React, no react-router. Every
// collaborator arrives through an interface, so the whole transaction is
// testable against fakes.

import { workspaceStore, neighbourAfterClose } from "../store/workspaceStore.ts";
import { inspectorStore } from "../../inspector/store/inspectorStore.ts";
import { issuesStore } from "../../issues/store/issuesStore.ts";
import { selectionStore } from "../../selection/store/selectionStore.ts";
import {
  noopHistoryController,
  noopInteractionController,
  noopNavigator,
} from "../../canvas/controller/CanvasInteractionController.ts";
import { DEFAULT_VIEW_TOGGLES } from "../types/workspace.types.ts";
import type {
  CanvasHistoryController,
  CanvasInteractionController,
  WorkspaceNavigator,
  WorkspaceViewBridge,
} from "../../canvas/controller/CanvasInteractionController.ts";
import type { CanvasControllerApi } from "../../canvas/controller/CanvasController.ts";
import type { CanvasRepository } from "../../canvas/persistence/CanvasRepository.ts";
import type { CanvasSnapshot } from "../../canvas/persistence/canvasSnapshot.types.ts";
import { SNAPSHOT_VERSION } from "../../canvas/persistence/canvasSnapshot.types.ts";
import type { WorkspaceInstance } from "../types/workspace.types.ts";

const RECOVERY_DEBOUNCE_MS = 750;

export interface WorkspaceControllerDeps {
  canvas: CanvasControllerApi;
  repository: CanvasRepository;
  fetchNetwork: (networkId: string) => Promise<unknown>;
  onError?: (message: string, error: unknown) => void;
  now?: () => number;
}

export class WorkspaceController {
  #canvas: CanvasControllerApi;
  #repository: CanvasRepository;
  #fetchNetwork: (networkId: string) => Promise<unknown>;
  #onError: (message: string, error: unknown) => void;

  #interaction: CanvasInteractionController = noopInteractionController;
  #history: CanvasHistoryController = noopHistoryController;
  #navigator: WorkspaceNavigator = noopNavigator;
  #viewBridge: WorkspaceViewBridge | null = null;

  /**
   * Which workspace the live Cytoscape graph ACTUALLY holds. Distinct from the
   * store's activeWorkspaceId, and the only key ever used when capturing the
   * outgoing graph. Capturing against activeWorkspaceId is what would let a
   * switch away from a still-loading workspace write the previous workspace's
   * graph into it.
   */
  #displayedWorkspaceId: string | null = null;

  #snapshots = new Map<string, CanvasSnapshot>();
  /**
   * Workspaces whose METADATA changed while they were not on screen. The
   * displayed workspace is always written; without this set a rename or pin of
   * a background tab would never reach IndexedDB and would vanish on refresh.
   */
  #pendingRecordWrites = new Set<string>();
  #switchToken = 0;
  #recoveryTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(deps: WorkspaceControllerDeps) {
    this.#canvas = deps.canvas;
    this.#repository = deps.repository;
    this.#fetchNetwork = deps.fetchNetwork;
    this.#onError = deps.onError ?? (() => {});
  }

  // ── wiring ────────────────────────────────────────────────────────────────

  registerInteraction(interaction: CanvasInteractionController): void {
    this.#interaction = interaction;
  }

  registerHistory(history: CanvasHistoryController): void {
    this.#history = history;
  }

  registerNavigator(navigator: WorkspaceNavigator): void {
    this.#navigator = navigator;
  }

  registerViewBridge(bridge: WorkspaceViewBridge): void {
    this.#viewBridge = bridge;
  }

  detach(): void {
    this.#interaction = noopInteractionController;
    this.#history = noopHistoryController;
    this.#navigator = noopNavigator;
    this.#viewBridge = null;
    this.#displayedWorkspaceId = null;
    if (this.#recoveryTimer) {
      clearTimeout(this.#recoveryTimer);
      this.#recoveryTimer = null;
    }
  }

  get displayedWorkspaceId(): string | null {
    return this.#displayedWorkspaceId;
  }

  getSnapshot(workspaceId: string): CanvasSnapshot | undefined {
    return this.#snapshots.get(workspaceId);
  }

  // ── the switch transaction ────────────────────────────────────────────────

  async activateWorkspace(nextId: string): Promise<void> {
    const store = workspaceStore.getState();
    const next = store.instances[nextId];
    if (!next) return;

    // The guard requires BOTH that the store considers this workspace active
    // and that Cytoscape actually holds it. After a refresh the store can say
    // A is active while the canvas is still blank; a bare id comparison would
    // return early and leave the user staring at an empty canvas.
    if (nextId === store.activeWorkspaceId && this.#displayedWorkspaceId === nextId) {
      return;
    }

    const token = ++this.#switchToken;

    // ── PHASE 1: resolve the incoming payload. Nothing is mutated here, so a
    // superseded switch leaves store, canvas and snapshot map untouched. ──
    let snapshot = this.#snapshots.get(nextId) ?? null;
    let doc: unknown = null;
    let loadError = false;

    if (!snapshot && next.document.networkId) {
      workspaceStore.getState().setPending(nextId);
      try {
        doc = await this.#fetchNetwork(next.document.networkId);
      } catch (error) {
        loadError = true;
        this.#onError("Couldn't load network", error);
      }
      if (token !== this.#switchToken) return; // superseded
      workspaceStore.getState().setPending(null);
    }

    // ── PHASE 2: commit. Synchronous from here to the end. ──
    this.#commitSwitch(nextId, snapshot, doc, loadError);
  }

  #commitSwitch(
    nextId: string,
    snapshot: CanvasSnapshot | null,
    doc: unknown,
    loadError: boolean
  ): void {
    this.#flushDisplayedWorkspace();

    // Cancel everything transient before the incoming graph arrives, so no
    // interaction or analysis anchored to outgoing elements survives.
    this.#interaction.cancelUnsafeInteraction();
    this.#interaction.reset();
    selectionStore.getState().clearSelection();
    this.#history.reset();

    workspaceStore.getState().setActive(nextId);

    if (snapshot) this.#canvas.restoreSnapshot(snapshot);
    else if (doc) this.#canvas.loadDocument(doc);
    else this.#canvas.clear();

    this.#displayedWorkspaceId = nextId;
    workspaceStore.getState().setLoadError(nextId, loadError);

    // Adopt identity from the freshly loaded document. A workspace opened by
    // id alone (from the saved-networks rail) starts with a placeholder name;
    // the backend document is the authority, so the tab shows the real name
    // without the sidebar having to pass it in.
    if (doc && !loadError) {
      const loaded = doc as { name?: string; description?: string };
      if (loaded.name) {
        workspaceStore.getState().adoptDocumentIdentity(nextId, {
          name: loaded.name,
          description: loaded.description ?? "",
        });
        this.#markRecordDirty(nextId);
      }
    }

    const next = workspaceStore.getState().instances[nextId];
    if (!next) return;

    this.#canvas.restoreViewport(next.ui.viewport);
    // After the restore: the asset filter applies classes to elements that
    // must already exist.
    this.#viewBridge?.apply(next.ui.view ?? DEFAULT_VIEW_TOGGLES);
    // Fires real Cytoscape select events, which the page turns into a jump to
    // the Details tab — so inspector hydration must come after, and win.
    this.#canvas.restoreSelection(next.ui.selectedElementIds);
    selectionStore.getState().setSelection(next.ui.selectedElementIds);
    inspectorStore.getState().hydrate({
      inspectorOpen: next.ui.inspectorOpen,
      inspectorTab: next.ui.inspectorTab,
    });
    issuesStore.getState().setMode(next.ui.issuePanelMode);

    this.#navigator.replace(
      next.document.networkId
        ? `/network-builder/${next.document.networkId}`
        : "/network-builder"
    );

    if (!loadError) this.scheduleRecoverySnapshot();
  }

  /** Capture the graph and UI of whatever Cytoscape is currently displaying. */
  #flushDisplayedWorkspace(): void {
    const outgoing = this.#displayedWorkspaceId;
    if (!outgoing) return;
    const store = workspaceStore.getState();
    if (!store.instances[outgoing]) return;

    const captured = this.#canvas.captureSnapshot();
    // A null capture means there is no live canvas; storing it would replace a
    // real graph with nothing.
    if (captured) this.#snapshots.set(outgoing, captured);

    store.updateWorkspaceUI(outgoing, {
      inspectorOpen: inspectorStore.getState().open,
      inspectorTab: inspectorStore.getState().activeTab,
      issuePanelMode: issuesStore.getState().mode,
      selectedElementIds: this.#canvas.getSelectedIds(),
      viewport: this.#canvas.getViewport(),
      view: this.#viewBridge?.capture() ?? DEFAULT_VIEW_TOGGLES,
    });
  }

  // ── lifecycle ─────────────────────────────────────────────────────────────

  async createWorkspace(name?: string): Promise<string> {
    const store = workspaceStore.getState();
    const existing = Object.values(store.instances).length;
    const workspace = store.createWorkspace({
      name: name ?? `Untitled ${existing + 1}`,
    });
    // A brand-new workspace has no stored graph; seed an empty snapshot so
    // activation takes the synchronous path rather than trying to fetch.
    this.#snapshots.set(workspace.id, {
      version: SNAPSHOT_VERSION,
      elements: [],
      viewport: null,
    });
    await this.activateWorkspace(workspace.id);
    return workspace.id;
  }

  /** Opening an already-open network activates its tab rather than duplicating it. */
  async openNetwork(
    networkId: string,
    name = "Network"
  ): Promise<string> {
    const store = workspaceStore.getState();
    const existing = Object.values(store.instances).find(
      (workspace) => workspace.document.networkId === networkId
    );
    if (existing) {
      await this.activateWorkspace(existing.id);
      return existing.id;
    }
    const workspace = store.createWorkspace({ networkId, name });
    await this.activateWorkspace(workspace.id);
    return workspace.id;
  }

  async closeWorkspace(id: string): Promise<void> {
    const store = workspaceStore.getState();
    if (!store.instances[id]) return;

    // Capture the live graph first when closing the displayed workspace, so
    // reopening restores what was on screen rather than the last autosave.
    if (this.#displayedWorkspaceId === id) this.#flushDisplayedWorkspace();

    const wasActive = store.activeWorkspaceId === id;
    const successor = wasActive ? neighbourAfterClose(store.order, id) : null;
    const snapshot = this.#snapshots.get(id) ?? null;

    if (this.#displayedWorkspaceId === id) this.#displayedWorkspaceId = null;
    this.#snapshots.delete(id);
    this.#pendingRecordWrites.delete(id);
    workspaceStore.getState().removeWorkspace(id, snapshot?.elements ?? null);
    await this.#repository.deleteWorkspace(id);

    if (successor) {
      await this.activateWorkspace(successor);
    } else if (wasActive) {
      // Never leave an empty tab bar.
      await this.createWorkspace();
    }
    await this.#persistSession();
  }

  async closeOthers(id: string): Promise<void> {
    const store = workspaceStore.getState();
    const doomed = store.order.filter(
      (other) => other !== id && !store.instances[other]?.pinned
    );
    await this.#closeMany(doomed, id);
  }

  async closeToRight(id: string): Promise<void> {
    const store = workspaceStore.getState();
    const index = store.order.indexOf(id);
    if (index === -1) return;
    const doomed = store.order
      .slice(index + 1)
      .filter((other) => !store.instances[other]?.pinned);
    await this.#closeMany(doomed, id);
  }

  async #closeMany(doomed: string[], survivorId: string): Promise<void> {
    if (!doomed.length) return;
    // Activate the survivor first so each removal is a plain metadata delete
    // rather than a chain of switch transactions.
    await this.activateWorkspace(survivorId);
    for (const id of doomed) {
      this.#snapshots.delete(id);
      workspaceStore.getState().removeWorkspace(id, null);
      await this.#repository.deleteWorkspace(id);
    }
    await this.#persistSession();
  }

  async duplicateWorkspace(id: string): Promise<string | null> {
    const store = workspaceStore.getState();
    const source = store.instances[id];
    if (!source) return null;

    if (this.#displayedWorkspaceId === id) this.#flushDisplayedWorkspace();
    const snapshot = this.#snapshots.get(id);

    const copy = workspaceStore.getState().createWorkspace({
      name: `${source.document.name} (copy)`,
      // A duplicate is a new unsaved document, never a second tab bound to the
      // same backend record.
      networkId: null,
      description: source.document.description,
      ui: { ...source.ui, selectedElementIds: [] },
      dirty: true,
    });
    this.#snapshots.set(copy.id, {
      version: SNAPSHOT_VERSION,
      elements: snapshot ? [...snapshot.elements] : [],
      viewport: snapshot?.viewport ?? null,
    });

    await this.activateWorkspace(copy.id);
    this.scheduleRecoverySnapshot();
    return copy.id;
  }

  renameWorkspace(id: string, name: string): void {
    workspaceStore.getState().renameWorkspace(id, name);
    this.#markRecordDirty(id);
    this.scheduleRecoverySnapshot();
  }

  reorderWorkspaces(from: number, to: number): void {
    workspaceStore.getState().reorderWorkspaces(from, to);
    void this.#persistSession();
  }

  togglePin(id: string): void {
    workspaceStore.getState().togglePin(id);
    this.#markRecordDirty(id);
    this.scheduleRecoverySnapshot();
    void this.#persistSession();
  }

  async reopenLastClosed(): Promise<string | null> {
    const entry = workspaceStore.getState().popRecentlyClosed();
    if (!entry) return null;
    workspaceStore.getState().addWorkspace(entry.workspace, entry.index);
    this.#snapshots.set(entry.workspace.id, {
      version: SNAPSHOT_VERSION,
      elements: entry.snapshotElements ?? [],
      viewport: entry.workspace.ui.viewport,
    });
    await this.activateWorkspace(entry.workspace.id);
    return entry.workspace.id;
  }

  async activateRelative(offset: number): Promise<void> {
    const store = workspaceStore.getState();
    const { order, activeWorkspaceId } = store;
    if (order.length < 2 || !activeWorkspaceId) return;
    const index = order.indexOf(activeWorkspaceId);
    if (index === -1) return;
    const nextIndex = (index + offset + order.length) % order.length;
    await this.activateWorkspace(order[nextIndex]);
  }

  // ── dirty + recovery ──────────────────────────────────────────────────────

  /** Called for DOCUMENT mutations only. UI changes must not reach this. */
  notifyDocumentMutated(): void {
    const id = this.#displayedWorkspaceId;
    if (!id) return;
    workspaceStore.getState().markDirty(id);
    this.scheduleRecoverySnapshot();
  }

  /** Called for viewport/UI changes: persist for refresh, but never mark dirty. */
  notifyViewChanged(): void {
    if (!this.#displayedWorkspaceId) return;
    this.scheduleRecoverySnapshot();
  }

  markSaved(id: string, patch: { networkId?: string | null; name?: string }): void {
    workspaceStore.getState().markSaved(id, patch);
    this.#markRecordDirty(id);
    const workspace = workspaceStore.getState().instances[id];
    if (workspace && this.#displayedWorkspaceId === id) {
      this.#navigator.replace(
        workspace.document.networkId
          ? `/network-builder/${workspace.document.networkId}`
          : "/network-builder"
      );
    }
    this.scheduleRecoverySnapshot();
  }

  scheduleRecoverySnapshot(): void {
    if (this.#recoveryTimer) clearTimeout(this.#recoveryTimer);
    const timer = setTimeout(() => {
      this.#recoveryTimer = null;
      void this.flushRecoverySnapshot();
    }, RECOVERY_DEBOUNCE_MS);
    // Under Node (tests) a pending debounce would otherwise hold the process
    // open. No-op in browsers, where setTimeout returns a number.
    (timer as unknown as { unref?: () => void }).unref?.();
    this.#recoveryTimer = timer;
  }

  #markRecordDirty(id: string): void {
    this.#pendingRecordWrites.add(id);
  }

  async flushRecoverySnapshot(): Promise<void> {
    const displayed = this.#displayedWorkspaceId;
    const targets = new Set(this.#pendingRecordWrites);
    this.#pendingRecordWrites.clear();
    if (displayed) targets.add(displayed);
    if (!targets.size) return;

    for (const id of targets) {
      const workspace = workspaceStore.getState().instances[id];
      if (!workspace) continue;
      // A workspace whose document failed to load holds an empty canvas.
      // Writing that would overwrite a good stored graph with nothing.
      if (workspace.loadError) continue;

      let snapshot: CanvasSnapshot | null = null;
      if (id === displayed) {
        snapshot = this.#canvas.captureSnapshot();
        if (snapshot) this.#snapshots.set(id, snapshot);
      }
      snapshot = snapshot ?? this.#snapshots.get(id) ?? null;
      if (!snapshot) continue;

      // Only the displayed workspace has live UI state to harvest; a
      // background tab's stored ui is already current.
      const ui =
        id === displayed
          ? {
              ...workspace.ui,
              inspectorOpen: inspectorStore.getState().open,
              inspectorTab: inspectorStore.getState().activeTab,
              issuePanelMode: issuesStore.getState().mode,
              selectedElementIds: this.#canvas.getSelectedIds(),
              viewport: snapshot.viewport,
              view: this.#viewBridge?.capture() ?? workspace.ui.view,
            }
          : workspace.ui;

      await this.#repository.saveWorkspace({
        workspaceId: id,
        workspace: { ...workspace, ui },
        snapshot,
        updatedAt: Date.now(),
      });
    }
    await this.#persistSession();
  }

  async #persistSession(): Promise<void> {
    const { activeWorkspaceId, order } = workspaceStore.getState();
    await this.#repository.saveSession(activeWorkspaceId, order);
  }

  // ── recovery ──────────────────────────────────────────────────────────────

  /**
   * Cold start. Hydrates with activeWorkspaceId null on purpose: activation
   * then takes the ordinary path with no outgoing workspace to flush. Hydrating
   * the recovered id directly would make the first activateWorkspace hit the
   * early-return guard and never restore the graph.
   */
  async recoverSession(deepLinkNetworkId?: string | null): Promise<void> {
    const recovered = await this.#repository.loadAll();

    this.#snapshots = new Map(recovered.snapshots);
    workspaceStore.getState().hydrate({
      workspaces: recovered.workspaces,
      order: recovered.order,
      activeWorkspaceId: null,
    });
    this.#displayedWorkspaceId = null;

    if (deepLinkNetworkId) {
      const match = recovered.workspaces.find(
        (workspace) => workspace.document.networkId === deepLinkNetworkId
      );
      if (match) {
        await this.activateWorkspace(match.id);
        return;
      }
      await this.openNetwork(deepLinkNetworkId);
      return;
    }

    const target =
      recovered.activeWorkspaceId ?? recovered.order[0] ?? null;
    if (target) {
      await this.activateWorkspace(target);
      return;
    }
    await this.createWorkspace("Untitled 1");
  }

  /** Test seam. */
  seedSnapshot(workspaceId: string, snapshot: CanvasSnapshot): void {
    this.#snapshots.set(workspaceId, snapshot);
  }

  getWorkspace(id: string): WorkspaceInstance | undefined {
    return workspaceStore.getState().instances[id];
  }
}
