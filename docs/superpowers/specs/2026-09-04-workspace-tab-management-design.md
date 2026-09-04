# Workspace Tab Management — Phase 1 Design

**Date:** 2026-09-04
**Status:** Approved for planning
**Source spec:** `docs/network_canvas_greenfield_build_spec.md`
**Branch context:** `simulation-canvas-tab`

---

## 1. Purpose and scope

Introduce a genuine multi-document **Workspace Tab** system to the Network
Builder, and lift Inspector / Issues / Selection state out of
`NetworkBuilderPage.jsx` into stores, so that each open workspace is
independently isolated and persistent.

The greenfield spec describes a full rebuild. This document adapts it to the
existing application as a **controlled first phase**.

### In scope

- Workspace Tabs: create, activate, close, close others, close to right,
  duplicate, rename, reorder (drag), pin, dirty indicator, reopen closed.
- `WorkspaceController` owning workspace switching as an explicit transaction.
- `CanvasController` owning the Cytoscape instance lifecycle and document
  capture/restore.
- IndexedDB persistence (Dexie) for recovery snapshots and refresh recovery.
- Zod validation at the IndexedDB read boundary.
- `inspectorStore`, `issuesStore`, `selectionStore`.
- Routing: `/network-builder/:id` becomes deep-link intent; the URL mirrors the
  active workspace via history replace.

### Explicitly out of scope

Deferred to later controlled phases:

- Ribbon Tabs (Home / Insert / Edit / View / Tools).
- XState interaction state machine.
- Radix UI Tabs migration.
- TanStack Query / simulation API state.
- `react-resizable-panels` / resizable Inspector.
- Command bus and command palette.
- Migrating `NetworkBuilderPage.jsx` to TypeScript.
- General refactoring of toolbar JSX, modals, asset editor, Details / Config /
  Results / Validation rendering, domain Cytoscape handlers, context menus,
  existing forms.

### Success criterion

Not lines removed. This sequence must work without leakage:

```text
Open A → modify graph → select node → open an Inspector panel
→ start an unsafe canvas interaction → switch to B
→ A is captured → unsafe interaction is cancelled
→ B restores independently → change B → switch to A
→ graph, viewport and Inspector state restore correctly
→ refresh browser → workspace recovery succeeds
```

---

## 2. Decisions taken

| Decision | Choice | Rationale |
|---|---|---|
| Tab systems this phase | Workspace + Inspector/Issues refactor | Ribbon deferred |
| Language | TypeScript for new modules only | No repo-wide migration |
| Dependencies | zustand, immer, dexie, zod, @dnd-kit/{core,sortable,utilities,modifiers} | No Radix, no XState this phase |
| Graph holding strategy | Single Cytoscape instance, rehydrate on switch | Spec §7; one handler registration; O(1) *live instances* (see below) |
| Snapshot transport | In-memory map for switching; Dexie debounced for recovery | Switching stays synchronous and race-free |
| Routing | URL mirrors active workspace via history replace | Deep links keep working |
| Same network in two tabs | Not allowed — activates existing tab | Avoids two dirty tabs clobbering one backend record |
| Canvas view toggles | Preserved per workspace | Cheap; no graph re-validation |
| Isolation / trace | Transient — reset during switch | Anchored to element ids; safe restore needs analysis re-run |
| Undo history | Cleared on switch | Preserves today's effective behaviour explicitly; §16/§25 |
| Interaction mode | Typed adapter, not XState | Later phase swaps implementation without touching WorkspaceController |
| Close confirmation | None — close is undoable via reopen | Avoids introducing a modal |

### Memory characteristics — stated precisely

The single-instance strategy is **not** O(1) total memory. It is:

```text
O(1)              live Cytoscape instances, renderers, and event handler sets
O(N × snapshot)   serialized element JSON held in the in-memory snapshot map
```

The win is that N grows only in *serialized* form — no renderer, no Konva
layers, no per-instance handler closures, no hidden-container resize handling.
That is a large constant-factor saving, not an asymptotic one, and the document
should not claim otherwise. If the snapshot map becomes a memory concern for
very large graphs, the eviction strategy is to drop snapshots for non-adjacent
tabs and reload them from Dexie on demand — deferred until measured.

### Dependency install

```bash
npm install zustand immer dexie zod \
  @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities @dnd-kit/modifiers
npm install --save-dev typescript
```

**`@dnd-kit/modifiers` is a fourth dnd-kit package beyond the originally agreed
three.** It provides `restrictToHorizontalAxis` and
`restrictToParentElement`, which the tab bar requires. The alternative is to
clamp the axis manually in an `onDragMove` handler; the package is the
supported path and is part of the same dnd-kit release line.

---

## 3. Module layout

```text
frontend/src/
├── workspace/
│   ├── types/workspace.types.ts
│   ├── store/workspaceStore.ts
│   ├── services/WorkspaceController.ts
│   ├── components/WorkspaceTabs.tsx
│   ├── components/WorkspaceTab.tsx
│   ├── components/WorkspaceTabContextMenu.tsx
│   ├── components/WorkspaceTabs.css
│   └── index.ts
├── canvas/
│   ├── controller/CanvasController.ts
│   ├── controller/CanvasInteractionController.ts
│   ├── persistence/canvasDb.ts
│   ├── persistence/CanvasRepository.ts
│   ├── persistence/canvasSnapshot.types.ts
│   ├── persistence/canvasSnapshot.schemas.ts
│   └── index.ts
├── inspector/store/inspectorStore.ts
├── issues/store/issuesStore.ts
└── selection/store/selectionStore.ts
```

### TypeScript configuration

`frontend/tsconfig.json`: `strict: true`, `allowJs: true`, `checkJs: false`,
`noEmit: true`, `jsx: "react-jsx"`, `moduleResolution: "bundler"`,
`allowImportingTsExtensions: true`, `verbatimModuleSyntax: true`.

Vite already transpiles `.ts`/`.tsx` via esbuild, so no build config change is
required. `typescript` is a devDependency used only by a `typecheck` script.

**Erasable-syntax constraint.** Node 25 strips TS types natively, which is how
tests run without a new test runner. New TS code must therefore avoid `enum`,
`namespace`, and constructor parameter properties, and must use `import type`
for type-only imports. Relative imports keep explicit file extensions, matching
existing code (`./bendEditing.js`).

---

## 4. Domain types

```ts
export type InspectorTab   = 'details' | 'issues' | 'trace' | 'isolation';
export type IssuePanelMode = 'issues' | 'find';

export interface CanvasViewport {
  zoom: number;
  pan: { x: number; y: number };
}

export interface WorkspaceViewToggles {
  showLabels: boolean;
  showGrid: boolean;
  snapToGrid: boolean;
  showLibrary: boolean;
  canvasFocusMode: boolean;
  hiddenAssetTypes: string[];
}

export interface WorkspaceUiState {
  inspectorOpen: boolean;
  inspectorTab: InspectorTab;
  issuePanelMode: IssuePanelMode;
  viewport: CanvasViewport | null;
  selectedElementIds: string[];
  view: WorkspaceViewToggles;
}

export interface WorkspaceDocumentRef {
  networkId: string | null;
  name: string;
  description: string;
}

export interface WorkspaceInstance {
  id: string;
  type: 'network-simulation';
  dirty: boolean;
  pinned: boolean;
  loadError: boolean;
  document: WorkspaceDocumentRef;
  ui: WorkspaceUiState;
  createdAt: number;
  updatedAt: number;
}
```

**`InspectorTab` is complete for this application.** The right panel today
renders exactly four tabs — verified against every `setRightPanelTab(...)` call
site and every `rightPanelTab === ...` comparison in `NetworkBuilderPage.jsx`.
The greenfield spec's Assets / Config / Validation / Results tabs **do not exist
in this codebase**; asset and configuration editing live in the Details panel
and in modals, and the right-panel asset filter is a control inside the panel,
not a tab. Adding those tabs is a separate feature, not a state-preservation
concern, so `activeInspectorTab` preserving four values preserves the real
active tab exactly. When those tabs are introduced, the union widens and
`WorkspaceUiState` needs no shape change.

Two further deliberate calls:

- **No separate `title`.** The tab renders `document.name`; `renameWorkspace`
  writes to it. A single source of truth avoids tab/header divergence.
- **`hiddenAssetTypes` is `string[]`, not `Set`** — it crosses the IndexedDB
  boundary. The page converts at its edge.

---

## 5. Stores

| Store | Owns | Never owns |
|---|---|---|
| `workspaceStore` | `activeWorkspaceId`, `pendingWorkspaceId`, `instances`, `order`, `recentlyClosed`, dirty/pinned/loadError | Async work, Cytoscape, snapshots, `displayedWorkspaceId` |
| `inspectorStore` | `open`, `activeTab` | Which workspace it belongs to |
| `issuesStore` | `mode` | Anything inspector-tab-related |
| `selectionStore` | `selectedElementIds: string[]` | Cytoscape element objects |

`workspaceStore` is **pure synchronous state** — Immer reducers only. Every
async or cross-module operation lives in `WorkspaceController`. This makes
spec §31 ("do not trigger workspace transactions from React effects")
structurally enforceable: the store cannot do it.

### Live stores vs. `workspace.ui`

`inspectorStore`, `issuesStore`, `selectionStore` and the page's view toggles
are the **live** state the UI binds to. `workspace.ui` is the **persisted
shape**. `WorkspaceController` flushes live → `workspace.ui` on switch-out and
hydrates back on switch-in.

The alternative — binding components directly to `workspace.ui` — would make
every inspector click write through the workspace store and force components to
subscribe to a large object, which §25 warns against. The cost is that
flush/hydrate must be exhaustive; test 5 round-trips every field.

### Store interfaces

```ts
interface InspectorStore {
  open: boolean;
  activeTab: InspectorTab;
  openInspector(tab?: InspectorTab): void;
  closeInspector(): void;
  setActiveTab(tab: InspectorTab): void;
  hydrate(ui: Pick<WorkspaceUiState, 'inspectorOpen' | 'inspectorTab'>): void;
}

interface IssuesStore {
  mode: IssuePanelMode;
  setMode(mode: IssuePanelMode): void;
}

interface SelectionStore {
  selectedElementIds: string[];
  setSelection(ids: string[]): void;
  clearSelection(): void;
}
```

### Selection boundary

`selectionStore` owns element **ids** — the workspace-relevant identity that
prevents leakage. The page's existing `selectedEl` object stays as a derived
view-model for the Details panel, note-format toolbar and asset editor, which
are on the keep-in-place list. `WorkspaceController` clears both on switch.
Collapsing `selectedEl` into a store-derived selector is a later phase.

---

## 6. CanvasController

```ts
export interface CanvasController {
  initialize(container: HTMLElement): cytoscape.Core;
  destroy(): void;
  getCy(): cytoscape.Core | null;

  captureSnapshot(): CanvasSnapshot | null;
  restoreSnapshot(snapshot: CanvasSnapshot | null): void;
  loadDocument(doc: NetworkDocument): void;
  clear(): void;

  getSelectedIds(): string[];
  restoreSelection(ids: string[]): void;

  getViewport(): CanvasViewport | null;
  restoreViewport(viewport: CanvasViewport | null): void;

  runBatch(fn: () => void): void;
  isRestoring(): boolean;
}
```

The controller owns **construction, destruction, and document lifecycle**. The
page keeps ownership of what the graph means — its domain handlers, the
`cytoscape-edge-editing` and `cytoscape-context-menus` extensions, the
stylesheet — registering them on `getCy()` after `initialize()`. The controller
is a boundary around the live instance, not a dumping ground.

`captureSnapshot()` builds on the existing `snapshotElements` /
`stripTransientClasses` serializer rather than a parallel one.

`loadDocument()` exists separately from `restoreSnapshot()` because a document
arriving from the backend is not the same shape as a captured snapshot. It
delegates to the existing `addGraph(cy, doc)`, which accepts both the legacy
flat shape and Cytoscape-exported elements **and calls `restoreBendClasses`**.
Converting a backend document into a snapshot array instead would silently drop
edge bend rendering. Both paths set the `#restoring` flag identically.

```ts
restoreSnapshot(snapshot) {
  this.#restoring = true;
  try {
    this.#cy.batch(() => {
      this.#cy.elements().remove();
      this.#cy.add(snapshot?.elements ?? []);
      restoreBendClasses(this.#cy);
    });
  } finally {
    this.#restoring = false;
  }
}
```

### Post-restore derived state

`stripTransientClasses` removes classes on capture that must be re-derived on
restore. Verified against `TRANSIENT_CANVAS_CLASS_SET`:

| Class | Re-applied by | Status |
|---|---|---|
| `hide-labels` | page's `cy.on("add", …)` handler | automatic |
| LOD classes | page's `cy.on("add","node", applyZoomLod)` | automatic |
| entity symbols | page's `cy.on("add","node", applyEntitySymbol)` | automatic |
| `FILTER_HIDDEN_CLASS` (asset filter) | `viewBridge.apply()` restoring `hiddenAssetTypes` | **ordering-dependent** |
| trace / isolation classes | intentionally dropped — transient this phase | by design |
| `edgebendediting-hasbendpoints` | **not** stripped; survives capture | plus defensive `restoreBendClasses` |

Two consequences:

1. **`viewBridge.apply()` must run after the graph is restored**, or the asset
   filter re-applies to elements that no longer exist and the incoming graph
   shows hidden types. The transaction in §9 orders it correctly.
2. **`restoreBendClasses` is called defensively.** Bend classes are not in the
   transient set, so they do survive a snapshot round-trip — but the call is
   idempotent, cheap, and guards against a future addition to the transient set
   silently flattening every bent pipe. `loadDocument`'s `addGraph` path already
   calls it.

`restoreSelection(ids)` performs the real Cytoscape operation —
`cy.$(...).select()` inside a batch — because updating `selectionStore` alone
does **not** produce a Cytoscape selection. The §9 ordering rationale depends on
the resulting `select` event actually firing. Selection events reach
`syncSelection`, not `scheduleCommit`, so restoring a selection does not mark
the workspace dirty.

**Known cost, not addressed this phase:** the page's
`cy.on("add remove", () => { syncGraph(); syncSelection(); })` fires per element,
so restoring a large graph runs it once per element even inside `batch()`. This
is pre-existing behaviour on the current `addGraph` load path and is unchanged
by this phase.

**`isRestoring()` is load-bearing.** The page's `scheduleCommit` already bails
on `restoringRef.current`; it will also consult `canvasController.isRestoring()`.
Without it, rehydrating a workspace fires `add`/`remove`, committing a history
entry and marking the incoming workspace dirty on arrival. The `try/finally` is
required — a throw that left the flag set would silently disable undo for the
rest of the session.

---

## 7. CanvasInteractionController

```ts
export interface CanvasInteractionController {
  reset(): void;
  cancelUnsafeInteraction(): void;
}
```

The page registers a concrete implementation on mount:

- `cancelUnsafeInteraction()` calls the existing `setModeSafe("select")`, which
  already clears `.draw-source`, `lineSourceRef`, `insertEdgeRef`,
  `insertPositionRef`, `pendingPlacementRef`, `pendingAsset` / `pendingSystem` /
  `pendingEntity`, `areaBox`, and the insert modal.
- `reset()` additionally clears isolation and trace state:
  `isolationActive`, `activeIsolationKey`, `traceInfo`, `traceMode`, and the
  Cytoscape classes both apply.

`WorkspaceController` depends only on this interface. The later XState phase
reimplements these two methods; `WorkspaceController` does not change.

### Navigator adapter

`WorkspaceController` must not import `react-router-dom`. The page registers:

```ts
interface WorkspaceNavigator { replace(path: string): void; }
```

backed by `navigate(path, { replace: true })`. This keeps the controller
framework-independent and directly testable.

### Additional registered seams

Because view toggles and undo history remain in the page this phase:

```ts
interface CanvasHistoryController { reset(): void; }

interface WorkspaceViewBridge {
  capture(): WorkspaceViewToggles;
  apply(toggles: WorkspaceViewToggles): void;
}
```

Three adapters is the deliberate price of leaving that state in place. Each
deletes itself as a later phase moves its state into a store.

---

## 8. Persistence

```ts
export interface CanvasSnapshot {
  version: 1;
  elements: unknown[];
  viewport: CanvasViewport;
}
```

```ts
export interface WorkspaceRecoveryRecord {
  workspaceId: string;
  workspace: WorkspaceInstance;
  snapshot: CanvasSnapshot;
  updatedAt: number;
}

export interface RecoveredSession {
  workspaces: WorkspaceInstance[];
  snapshots: Map<string, CanvasSnapshot>;
  order: string[];
  activeWorkspaceId: string | null;
  droppedRecordCount: number;
}
```

Dexie, two tables:

```ts
this.version(1).stores({
  workspaces: 'workspaceId, updatedAt',
  session:    'key',
});
```

Splitting `session` from `workspaces` means reordering tabs or changing the
active workspace writes one small row, not every workspace record.

```ts
export interface CanvasRepository {
  saveWorkspace(record: WorkspaceRecoveryRecord): Promise<void>;
  loadAll(): Promise<RecoveredSession>;
  deleteWorkspace(workspaceId: string): Promise<void>;
  saveSession(activeWorkspaceId: string | null, order: string[]): Promise<void>;
  clear(): Promise<void>;
}
```

### Zod boundary

Validation applies on **exactly one path: `loadAll()`**, using `safeParse` per
record.

- A record that fails validation is **dropped and logged**, never thrown. One
  corrupt workspace from an older schema must not prevent other tabs from
  recovering.
- If the `session` row fails, order is derived from the surviving workspace
  records and the most recently updated becomes active.

Schemas cover `CanvasSnapshot`, the workspace persistence record,
`WorkspaceUiState`, and `CanvasViewport`.

The Cytoscape element schema stays deliberately loose — `data.id` required,
`position` optional, `.passthrough()` elsewhere — because element data carries
arbitrary domain fields and a strict schema would reject valid graphs whenever a
new field is added.

### Testability split — no browser IndexedDB in tests

Plain Node has no IndexedDB, and Dexie expects one. Rather than pull in a
test-only IndexedDB polyfill, the repository is split so that **all logic worth
testing is pure**:

```text
parseRecoveredSession(rows, sessionRow) → RecoveredSession   ← pure, fully tested
DexieCanvasRepository                                        ← thin I/O shell
```

`parseRecoveredSession` holds every behaviour tests 11–14 target: Zod
`safeParse` per record, dropping corrupt records, deriving order when the
session row is invalid, and choosing the active workspace. It takes plain arrays
and returns a plain object — no Dexie, no IndexedDB, no async.

`DexieCanvasRepository` is then deliberately thin: table reads/writes and the
availability probe, with no branching logic of its own. It is exercised by
manual verification rather than automated tests.

`WorkspaceController` tests inject a fake in-memory `CanvasRepository`, so they
never touch Dexie at all.

**If true integration coverage of the Dexie layer is wanted later**, the option
is `fake-indexeddb` as a devDependency. That is deliberately *not* in this
phase's dependency scope; the split above is what avoids needing it.

### IndexedDB unavailability

Private-mode Safari and hardened configurations reject `indexedDB.open`. The
repository detects this once at init and falls back to a no-op in-memory
implementation, logging a single warning. Tab switching is unaffected (it runs
off the in-memory snapshot map); only refresh recovery is lost. **The app must
never fail to boot because persistence is unavailable.**

---

## 9. WorkspaceController

### Workspace identity: three distinct ids

```text
activeWorkspaceId     what the UI treats as current (workspaceStore)
pendingWorkspaceId    a switch has been requested but not yet committed
displayedWorkspaceId  which workspace the live Cytoscape graph ACTUALLY holds
```

`displayedWorkspaceId` is owned privately by `WorkspaceController`, never by the
store, and is the **only** key ever used when capturing the outgoing graph.
Capturing against `activeWorkspaceId` is what makes the race below possible.

### `activateWorkspace(nextId)`

The transaction has two phases: an **async resolve phase that mutates nothing**,
then a **fully synchronous commit phase**.

```ts
async activateWorkspace(nextId: string): Promise<void> {
  const already = nextId === store.activeWorkspaceId
               && this.#displayedWorkspaceId === nextId;
  if (already) return;

  const token = ++this.#switchToken;
  const next  = store.instances[nextId];

  // ── PHASE 1: resolve incoming payload. No state is mutated here. ──
  let snapshot = this.#snapshots.get(nextId) ?? null;
  let doc: NetworkDocument | null = null;
  let loadError = false;

  if (!snapshot && next.document.networkId) {
    store.setPending(nextId);                    // tab shows a loading state
    try {
      doc = await fetchNetwork(next.document.networkId);
    } catch (err) {
      loadError = true;
      reportError(err);
    }
    if (token !== this.#switchToken) return;     // superseded — nothing mutated
    store.setPending(null);
  }

  // ── PHASE 2: commit. Synchronous start to finish. ──
  const outgoing = this.#displayedWorkspaceId;
  if (outgoing) {
    const captured = canvas.captureSnapshot();
    if (captured) this.#snapshots.set(outgoing, captured);   // skip on null
    store.updateWorkspaceUI(outgoing, {
      inspectorOpen:      inspectorStore.open,
      inspectorTab:       inspectorStore.activeTab,
      issuePanelMode:     issuesStore.mode,
      selectedElementIds: canvas.getSelectedIds(),
      viewport:           canvas.getViewport(),
      view:               viewBridge.capture(),
    });
  }

  interaction.cancelUnsafeInteraction();
  interaction.reset();
  selectionStore.clearSelection();
  history.reset();

  store.setActive(nextId);

  if (snapshot)      canvas.restoreSnapshot(snapshot);
  else if (doc)      canvas.loadDocument(doc);
  else               canvas.clear();

  this.#displayedWorkspaceId = nextId;
  store.setLoadError(nextId, loadError);

  canvas.restoreViewport(next.ui.viewport);
  viewBridge.apply(next.ui.view);                       // after restore
  canvas.restoreSelection(next.ui.selectedElementIds);  // fires cy select event
  selectionStore.setSelection(next.ui.selectedElementIds);
  inspectorStore.hydrate(next.ui);                      // must come last
  issuesStore.setMode(next.ui.issuePanelMode);

  navigator.replace(next.document.networkId
    ? `/network-builder/${next.document.networkId}`
    : `/network-builder`);

  if (!loadError) this.scheduleRecoverySnapshot();
}
```

### Why the two-phase split is required

Consider A → B (B needs fetching), then the user clicks C mid-flight.

If `setActive(B)` ran before the `await`, the store would say B is active while
Cytoscape still holds **A's graph**. The C switch would then capture the live
graph and store it under B — **writing A's graph into B's snapshot**. A
`#switchToken` alone does not prevent this: it stops stale B from *restoring*,
but the corrupting capture has already happened.

Two mechanisms together close it:

1. **Nothing mutates before the `await` resolves.** A superseded switch returns
   having changed no store, no canvas, and no snapshot map entry.
2. **Capture is keyed on `displayedWorkspaceId`**, which by construction names
   the workspace whose graph is actually in Cytoscape — never a workspace whose
   load is still in flight.

`pendingWorkspaceId` exists purely so the tab bar can show a loading state
during the fetch, since `setActive` no longer runs early. It is UI-only and
never used as a capture key.

### Ordering constraints, made explicit

| Step | Must come | Because |
|---|---|---|
| capture outgoing | before any reset | resets destroy the state being captured |
| `cancelUnsafeInteraction` | before restore | insertion refs point at outgoing elements |
| `restoreViewport` | after restore | zoom/pan on an empty graph is meaningless |
| `viewBridge.apply` | after restore | asset-filter classes apply to restored elements |
| `restoreSelection` | after restore | the ids must exist to be selectable |
| `inspectorStore.hydrate` | after `restoreSelection` | the `select` event forces the Details tab; hydration must win |

### Lifecycle operations

- `createWorkspace()` — new `Untitled N`, empty graph, activated.
- `openNetwork(networkId)` — if already open, activates that tab; else creates
  one and loads the document.
- `closeWorkspace(id)` — pushes the workspace **and its snapshot** onto
  `recentlyClosed` (cap 10) and retains its Dexie record until evicted. Close is
  therefore non-destructive and undoable, so a dirty tab needs no confirmation
  modal. Closing the active tab activates the right-hand neighbour, else the
  left. Closing the last tab creates a fresh `Untitled` — the tab bar is never
  empty.
- `closeOthers(id)` / `closeToRight(id)` — respect pinned tabs (pinned are not
  closed by either).
- `duplicateWorkspace(id)` — copies the current snapshot into a new workspace
  with `networkId: null`, name `"<name> (copy)"`, `dirty: true`.
- `renameWorkspace(id, name)` — writes `document.name`, **sets `dirty: true`,
  and schedules a recovery write**. Because there is no separate tab title,
  `document.name` is the field persisted to the backend, so a rename is a
  document mutation, not a UI mutation. Renaming a saved network without
  flagging unsaved changes would let the new name be lost silently on refresh.
  Renaming a never-saved workspace also sets dirty, which is harmless — it is
  already dirty.
- `reorderWorkspaces(from, to)` — touches `order` only, never
  `activeWorkspaceId`.
- `togglePin(id)` — pinned tabs sort first.
- `reopenLastClosed()` — pops `recentlyClosed`.
- `markSaved(workspaceId, { networkId, name })` — called by the page after a
  successful backend save. Sets `dirty: false`, adopts the backend id for a
  previously unsaved workspace, and mirrors the new id into the URL.

### Dirty vs. recovery — §23 applied precisely

| Event | `dirty` | Recovery write |
|---|---|---|
| add / remove / move node, edit element data | true | debounced 750 ms |
| **rename workspace** (`document.name`) | **true** | debounced 750 ms |
| pan, zoom, inspector tab, view toggle | unchanged | debounced 750 ms |
| workspace switch, `visibilitychange` | unchanged | immediate flush |

Document mutations already funnel through one place — `commitHistory`, gated by
`restoringRef` and reached from `cy.on("add remove dragfree")`. That is the
single hook point for `notifyDocumentMutated()`. No new Cytoscape event
registration is required.

**A workspace with `loadError: true` writes no recovery snapshot.** Otherwise a
transient network failure would overwrite a good stored graph with an empty one
on the next debounce tick. The flag clears on a successful load.

### Startup recovery

`recoverSession(routeId)` on mount:

1. `repository.loadAll()` — per-record `safeParse`, drop-and-log failures.
2. Restore `instances`, `order`, and the recovered **snapshots** into the
   in-memory map — but set **`activeWorkspaceId: null`**, and leave
   `displayedWorkspaceId` null.
3. Determine the target: the `routeId`'s workspace if it matches one recovered,
   else the recovered active id, else the most recently updated.
4. Call `activateWorkspace(target)` — which now takes the normal path.
5. Deep link to a network that is *not* among the recovered workspaces →
   `openNetwork(routeId)` opens it as an additional tab.
6. Nothing recovered and no `routeId` → `createWorkspace()` → `Untitled 1`.

**Why hydrating with `activeWorkspaceId: null` matters.** If recovery restored
`activeWorkspaceId: 'A'` directly, the subsequent `activateWorkspace('A')` would
hit the early-return guard and **never restore A's graph** — leaving a blank
canvas above a tab bar confidently showing A as active. Hydrating with a null
active id makes the first activation an ordinary switch with no outgoing
workspace to flush, so no special-case initialization path or `forceRestore`
flag is needed.

The early-return guard is additionally hardened to require that Cytoscape
actually holds the workspace:

```ts
if (nextId === store.activeWorkspaceId
    && this.#displayedWorkspaceId === nextId) return;
```

so any future path that desynchronizes store state from canvas state
self-corrects rather than silently no-opping.

---

## 10. UI layer

### Mount point

`LayoutContext` already gives the page a toolbar slot rendered by `App.jsx` as
`<header className="app-toolbar">`. The existing `setToolbar(...)` call becomes:

```jsx
setToolbar(<><WorkspaceTabs />{existingToolbarJsx}</>);
```

Tabs land under `TopNavigationBar`, above the toolbar groups, matching §20. No
change to `App.jsx` or the router.

### WorkspaceTabs

dnd-kit `DndContext` + horizontal `SortableContext`, restricted to the
horizontal axis.

- Reorder never changes the active workspace.
- Pinned tabs sort first; a drop is clamped so an unpinned tab cannot land ahead
  of the last pinned one.
- Each tab shows document name, dirty dot, close button. Double-click renames
  inline.
- Wrapped in an error boundary so a tab-bar crash does not take down the canvas.

`WorkspaceTabContextMenu` is a small self-contained DOM popover (outside-click
and Escape dismiss): Rename / Duplicate / Pin / Close / Close Others / Close to
Right. Unrelated to the `cytoscape-context-menus` extension used on the canvas.

**Indicators.** Only the dirty indicator ships this phase. `Run` is currently
`notImplemented()`, so there is no simulation status to display, and validation
state lives in page state on the keep-in-place list. `WorkspaceInstance` leaves
room for both without a later shape change.

### Keyboard shortcuts

Registered **inside the page's existing `keydown` handler** (with its
`isTypingTarget` guard), delegating to `WorkspaceController`. No second global
listener, per §21.

| Shortcut | Action |
|---|---|
| `Ctrl/Cmd + Alt + →` | Next workspace |
| `Ctrl/Cmd + Alt + ←` | Previous workspace |
| `Ctrl/Cmd + W` | Close workspace |
| `Ctrl/Cmd + Shift + T` | Reopen closed workspace |

**`Ctrl/Cmd + Tab` is deliberately not used.** Chrome reserves it for browser
tab switching and the event is not cancelable, so the greenfield spec's
suggested binding cannot work in a browser application.

---

## 11. Changes to `NetworkBuilderPage.jsx`

| # | Location | Change |
|---|---|---|
| 1 | Lines 1624–1652 | **Delete** the `:id` fetch effect; replaced by mount-once `recoverSession(id)` |
| 2 | Line 1135 | `cytoscape({...})` → `canvasController.initialize(containerRef.current)`; cleanup calls `destroy()`. Extensions and handlers register on `getCy()` unchanged |
| 3 | Mount effect | Register the interaction / history / view adapters |
| 4 | Line 633 `scheduleCommit` | Also bail on `canvasController.isRestoring()`; call `notifyDocumentMutated()` |
| 5 | Lines 509, 512, 513 | `showInspector` / `rightPanelTab` / `issuePanelMode` useState → store selectors; ~15 `setRightPanelTab(...)` sites become `inspectorStore.openInspector(tab)` |
| 6 | `syncSelection` | Additionally push ids to `selectionStore`; `selectedEl` unchanged |
| 7 | `setToolbar` call | Prepend `<WorkspaceTabs />` |
| 8 | Save handlers (~line 2797) | On success, `workspaceController.markSaved(...)`, replacing the `navigate()` that currently rewrites the URL |
| 9 | Line 495 `network` state | Derive name / id / description from the active workspace via a `workspaceStore` selector, so renaming a tab updates the page header |

Item 5 is the widest edit but is mechanical: a state read swapped for a store
selector per site, no logic change.

Everything on the keep-in-place list is untouched: toolbar JSX and button
groups, modal components and state, asset editor UI, Details / Config / Results
/ Validation rendering, simulation handlers, domain-specific Cytoscape
handlers, canvas context menus, existing forms, unrelated UI state.

### Dead code removal

Scoped to code these changes render dead — **not** general cleanup of the file:

- `loadedIdRef` — used only by the deleted `:id` effect.
- The `navigate()` call in the save handler superseded by URL mirroring.
- The `showInspector` / `rightPanelTab` / `issuePanelMode` `useState`
  declarations and any setters left with no callers.
- The `network` `useState` and `setNetwork` calls made redundant by item 9.
- Any refs or imports left unreferenced by the above.

Verified by `tsc --noEmit` plus a lint/grep pass for now-unreferenced
identifiers. Unrelated dead code found in passing is reported, not removed.

---

## 12. Testing

All tests run under `node --test` with no DOM. Node 25 strips TypeScript types
natively, so `.test.ts` files run directly and **no new test runner dependency
is required**. The `test` script glob widens to cover `.ts`.

`WorkspaceController` receives its `CanvasController`, adapters and repository
by injection, so the entire switch transaction is testable against fakes.

**Store reducers**

1. Reorder preserves `activeWorkspaceId`
2. Closing the active tab activates the right neighbour, else left
3. Closing the last tab creates a fresh `Untitled`
4. An unpinned tab cannot be dropped ahead of a pinned one

**Switch transaction**

5. A→B→A restores graph, viewport, inspector tab, issues mode and selection exactly
6. Call order asserted: capture → cancelUnsafeInteraction → reset → clearSelection → history.reset → setActive → restore → restoreViewport → viewBridge.apply → restoreSelection → inspector.hydrate
7. Mid edge-insertion, switching calls `cancelUnsafeInteraction()` before any restore
8. `restoreSelection` precedes `inspectorStore.hydrate`, so a workspace left on Issues returns to Issues rather than being forced to Details by the `select` event
9. A switch superseded while fetching discards the stale graph (`#switchToken`)
10. **A→B (B fetching) then →C never writes A's graph into B's snapshot** — the capture-key race. Asserts `snapshots.get('B')` is untouched and C holds C's graph
11. A superseded switch mutates nothing — store, canvas and snapshot map are all byte-identical to before
12. `captureSnapshot()` returning `null` writes no snapshot-map entry and no recovery record

**Dirty state**

13. `notifyDocumentMutated()` → dirty; `markSaved()` → clean; inspector / view / viewport changes leave dirty untouched
14. `renameWorkspace()` → dirty true and a recovery write scheduled

**Recovery** — all against pure `parseRecoveredSession`, no IndexedDB

15. Valid records restore instances, order and active
16. One corrupt record is dropped; the rest still recover
17. A corrupt `session` row falls back to order derived from surviving records
18. A workspace with `loadError` writes no snapshot
19. **Cold start restores the graph**: hydrate with `activeWorkspaceId: null`, activate the recovered id, assert the canvas actually received a restore — the blank-canvas-after-refresh regression
20. The repository degrades cleanly when IndexedDB is unavailable (fake repository asserts the no-op fallback contract)

**Not covered by automated tests.** The dnd-kit drag gesture, inline rename and
the context menu are React/DOM behaviour, and this repository has no DOM test
runner; adding one is outside the agreed dependency scope. These three are
verified manually against the §35 sequence in section 1.

---

## 13. Build order

1. `tsconfig.json`, dependencies, `typecheck` script
2. Domain types + Zod schemas
3. `workspaceStore` (+ reducer tests 1–4)
4. `inspectorStore`, `issuesStore`, `selectionStore`
5. `CanvasController` + `CanvasInteractionController` interface
6. `parseRecoveredSession` (pure, + tests 15–20), then Dexie `canvasDb` +
   `DexieCanvasRepository` shell
7. `WorkspaceController` (+ tests 5–14)
8. `WorkspaceTabs` / `WorkspaceTab` / context menu + CSS
9. `NetworkBuilderPage` integration, items 1–9
10. Dead code removal + typecheck + full test run
11. Manual verification of the §35 sequence
