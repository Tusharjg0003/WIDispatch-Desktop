# Production Tab Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the Production tab a tab strip — a permanent "All Plants" list tab plus one tab per opened plant — by extracting a generic, domain-neutral tab core that the remaining main-nav tabs can adopt later.

**Architecture:** A new `frontend/src/tabs/` package holds everything that is not about Cytoscape: pure ordering rules, a store factory, presentational strip components, a shortcuts hook, and localStorage session persistence. Production builds a thin layer on it (types, store, controller, strip adapter). The existing `workspaceStore` and `WorkspaceTabs` are re-pointed at the shared core; `WorkspaceController` and the canvas switch transaction are not touched at all.

**Tech Stack:** React 18, Vite, TypeScript (strict, `erasableSyntaxOnly`, `verbatimModuleSyntax`), Zustand 5 (vanilla stores), Immer 11 (existing stores only), Zod 4, `@dnd-kit/*`, `node:test` + `node:assert/strict`. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-09-05-production-tab-management-design.md`

## Global Constraints

- All commands run from `frontend/`. There is no root `package.json`.
- Tests are `node:test` + `node:assert/strict` files sitting beside the module they cover. There is no linter, no jsdom, and no React test renderer — **never write a test that imports a `.tsx` file or touches `document`.**
- TypeScript is strict with `erasableSyntaxOnly`: **no enums, no namespaces, no parameter properties.** A closed set of strings is a `const` array plus `(typeof ARR)[number]`.
- `verbatimModuleSyntax` is on: type-only imports must use `import type`.
- `allowImportingTsExtensions` is on: relative imports carry their real extension — `./tabOrdering.ts`, `../types/tab.types.ts`. TS importing JS uses `.js`.
- Run `npm run typecheck` (`tsc --noEmit`) after any task that touches a `.ts`/`.tsx` file. It is the only static check in the repo.
- Comments explain *why* a shape was chosen, naming the failure mode it prevents. Do not add comments that restate the code.
- **Regression gate, every task:** `node --test "src/workspace/**/*.test.ts"` and `node --test "src/canvas/**/*.test.ts"` must pass, and `src/workspace/store/workspaceStore.test.ts` and `src/workspace/services/WorkspaceController.test.ts` must remain **unmodified**. If a task seems to require editing them, stop and report — that means the extraction changed behaviour.
- Do not modify `frontend/src/workspace/services/WorkspaceController.ts` or `frontend/src/pages/NetworkBuilderPage.jsx`'s keyboard handler in any task.
- Commit after every task. Branch: `simulation-canvas-tab`.

---

## File Structure

**Created — generic core**

| File | Responsibility |
|---|---|
| `src/tabs/types/tab.types.ts` | `TabInstance`, `ClosedTab`, id generation |
| `src/tabs/store/tabOrdering.ts` | Pure ordering rules shared by both domains |
| `src/tabs/store/createTabStore.ts` | Zustand store factory for snapshot-free domains |
| `src/tabs/persistence/tabSession.schemas.ts` | Zod schemas for the stored session |
| `src/tabs/persistence/parseTabSession.ts` | Pure validation/reconciliation of a stored session |
| `src/tabs/persistence/tabSessionStorage.ts` | localStorage shell + in-memory double |
| `src/tabs/components/Tab.tsx` | One tab button: rename field, close, drag handle |
| `src/tabs/components/TabContextMenu.tsx` | Right-click popover, capability-gated |
| `src/tabs/components/TabStrip.tsx` | The strip: dnd-kit wiring, menu state, `+` button |
| `src/tabs/components/TabStripBoundary.tsx` | Error boundary so a strip crash spares the content |
| `src/tabs/components/tabs.css` | Strip styling under generic class names |
| `src/tabs/hooks/useTabShortcuts.ts` | Keyboard shortcuts against a controller shape |

**Created — Production layer**

| File | Responsibility |
|---|---|
| `src/production/tabs/productionTab.types.ts` | Sub-tab union, `ProductionTabState`, list-tab constants |
| `src/production/tabs/productionTabStore.ts` | The store instance + React hook |
| `src/production/tabs/ProductionTabController.ts` | All Production tab operations, URL mirroring, persistence |
| `src/production/tabs/productionTabControllerInstance.ts` | The app's singleton controller |
| `src/production/tabs/ProductionTabs.tsx` | Store → `TabStrip` adapter |

**Modified**

| File | Change |
|---|---|
| `src/workspace/store/workspaceStore.ts` | Re-export ordering helpers from the core; use `clampReorder` |
| `src/workspace/components/WorkspaceTabs.tsx` | Becomes a `TabStrip` adapter |
| `src/workspace/components/WorkspaceTab.tsx` | Deleted (replaced by `tabs/components/Tab.tsx`) |
| `src/workspace/components/WorkspaceTabContextMenu.tsx` | Deleted |
| `src/workspace/components/WorkspaceTabsBoundary.tsx` | Deleted |
| `src/workspace/components/WorkspaceTabs.css` | Deleted; `.nb-chrome` moves to `NetworkBuilderPage.css` |
| `src/pages/NetworkBuilderPage.jsx` | Import path for the boundary component only |
| `src/pages/NetworkBuilderPage.css` | Gains the `.nb-chrome` block |
| `src/pages/ProductionPage.jsx` | Becomes the strip + active-tab shell |
| `src/pages/ProductionPlantDetail.jsx` | Becomes a controlled component |
| `src/pages/ProductionPlantList.jsx` | Gains `onOpenPlant` |
| `src/App.jsx` | `/production/:plantId` renders `ProductionPage` |

---

### Task 1: Extract the pure ordering rules

Lift the ordering helpers out of `workspaceStore.ts` into the shared core, extending them with a third region for permanent tabs. The Network Builder has no permanent tabs, so its behaviour must not change — the existing, unmodified tests are the proof.

**Files:**
- Create: `frontend/src/tabs/store/tabOrdering.ts`
- Test: `frontend/src/tabs/store/tabOrdering.test.ts`
- Modify: `frontend/src/workspace/store/workspaceStore.ts` (lines 58-82 helpers, and `reorderWorkspaces`)

**Interfaces:**
- Consumes: nothing.
- Produces: `permanentCount(order, tabs)`, `pinnedCount(order, tabs)`, `regionBounds(order, tabs, movingId)`, `clampReorder(order, tabs, from, to)`, `neighbourAfterClose(order, closingId)`, and the `OrderableTab` / `TabLookup` types. `pinnedCount` counts leading tabs that are permanent **or** pinned, so it doubles as the pin/unpin re-seat index.

- [ ] **Step 1: Write the failing test**

Create `frontend/src/tabs/store/tabOrdering.test.ts`:

```ts
import test from "node:test";
import assert from "node:assert/strict";

import {
  clampReorder,
  neighbourAfterClose,
  permanentCount,
  pinnedCount,
  regionBounds,
} from "./tabOrdering.ts";
import type { TabLookup } from "./tabOrdering.ts";

/** Builds an order + lookup from a compact spec: "!" permanent, "*" pinned. */
const build = (spec: string[]): { order: string[]; tabs: TabLookup } => {
  const tabs: TabLookup = {};
  const order = spec.map((entry) => {
    const id = entry.replace(/[!*]/g, "");
    tabs[id] = { permanent: entry.includes("!"), pinned: entry.includes("*") };
    return id;
  });
  return { order, tabs };
};

test("counts the leading permanent region", () => {
  const { order, tabs } = build(["list!", "a*", "b"]);
  assert.equal(permanentCount(order, tabs), 1);
});

test("pinnedCount spans permanent and pinned, so it is the re-seat index", () => {
  const { order, tabs } = build(["list!", "a*", "b*", "c"]);
  assert.equal(pinnedCount(order, tabs), 3);
});

test("pinnedCount keeps its original meaning when nothing is permanent", () => {
  const { order, tabs } = build(["a*", "b", "c"]);
  assert.equal(pinnedCount(order, tabs), 1);
});

test("each tab is bounded by its own region", () => {
  const { order, tabs } = build(["list!", "a*", "b", "c"]);
  assert.deepEqual(regionBounds(order, tabs, "list"), [0, 0]);
  assert.deepEqual(regionBounds(order, tabs, "a"), [1, 1]);
  assert.deepEqual(regionBounds(order, tabs, "b"), [2, 3]);
});

test("an unpinned tab cannot be dragged ahead of a pinned or permanent one", () => {
  const { order, tabs } = build(["list!", "a*", "b", "c"]);
  // Drag c (index 3) to the very front.
  assert.equal(clampReorder(order, tabs, 3, 0), 2);
});

test("a permanent tab cannot be dragged out of first position", () => {
  const { order, tabs } = build(["list!", "a", "b"]);
  assert.equal(clampReorder(order, tabs, 0, 2), 0);
});

test("clampReorder rejects an out-of-range source", () => {
  const { order, tabs } = build(["a", "b"]);
  assert.equal(clampReorder(order, tabs, 5, 0), null);
});

test("closing picks the right neighbour, else the left", () => {
  const { order } = build(["a", "b", "c"]);
  assert.equal(neighbourAfterClose(order, "b"), "c");
  assert.equal(neighbourAfterClose(order, "c"), "b");
  assert.equal(neighbourAfterClose(order, "a"), "b");
});

test("closing the only tab leaves no successor", () => {
  const { order } = build(["only"]);
  assert.equal(neighbourAfterClose(order, "only"), null);
  assert.equal(neighbourAfterClose(order, "missing"), null);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd frontend && node --test src/tabs/store/tabOrdering.test.ts`
Expected: FAIL — cannot find module `./tabOrdering.ts`.

- [ ] **Step 3: Write the implementation**

Create `frontend/src/tabs/store/tabOrdering.ts`:

```ts
// Pure ordering rules for every tab strip in the app.
//
// A strip is three regions in fixed sequence: permanent tabs, then pinned
// tabs, then the rest. Keeping the rules here — with no store, no React and no
// domain types — is what lets the canvas workspaces and the Production tabs
// share behaviour without sharing a data shape.

export interface OrderableTab {
  pinned?: boolean;
  /** Unclosable, and always first. At most one per strip. */
  permanent?: boolean;
}

export type TabLookup = Record<string, OrderableTab | undefined>;

/** Size of the leading permanent region. */
export const permanentCount = (order: string[], tabs: TabLookup): number => {
  let count = 0;
  for (const id of order) {
    if (!tabs[id]?.permanent) break;
    count += 1;
  }
  return count;
};

/**
 * Index where the unpinned region starts — i.e. the count of leading tabs that
 * are permanent or pinned. Toggling a pin re-seats the tab at exactly this
 * index in both directions, because with the tab already spliced out, the end
 * of the pinned block and the start of the unpinned block are the same place.
 */
export const pinnedCount = (order: string[], tabs: TabLookup): number => {
  let count = 0;
  for (const id of order) {
    const tab = tabs[id];
    if (!tab?.permanent && !tab?.pinned) break;
    count += 1;
  }
  return count;
};

/** Inclusive [lower, upper] index range a tab may be dragged within. */
export const regionBounds = (
  order: string[],
  tabs: TabLookup,
  movingId: string
): [number, number] => {
  const tab = tabs[movingId];
  const permanent = permanentCount(order, tabs);
  const fixed = pinnedCount(order, tabs);
  if (tab?.permanent) return [0, Math.max(0, permanent - 1)];
  if (tab?.pinned) return [permanent, Math.max(permanent, fixed - 1)];
  return [fixed, Math.max(fixed, order.length - 1)];
};

/**
 * Target index for a drag, clamped into the mover's own region so no drag can
 * break the region sequence. Returns null when the source index is invalid.
 */
export const clampReorder = (
  order: string[],
  tabs: TabLookup,
  from: number,
  to: number
): number | null => {
  if (from < 0 || from >= order.length) return null;
  const [lower, upper] = regionBounds(order, tabs, order[from]);
  return Math.max(lower, Math.min(to, upper));
};

/** Which tab becomes active when `closingId` closes: right neighbour, else left. */
export const neighbourAfterClose = (
  order: string[],
  closingId: string
): string | null => {
  const index = order.indexOf(closingId);
  if (index === -1) return null;
  const remaining = order.filter((id) => id !== closingId);
  if (!remaining.length) return null;
  // The element that shifted into this index is the right neighbour.
  return remaining[Math.min(index, remaining.length - 1)];
};
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd frontend && node --test src/tabs/store/tabOrdering.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 5: Re-point `workspaceStore` at the shared helpers**

In `frontend/src/workspace/store/workspaceStore.ts`, delete the local `pinnedCount` and `neighbourAfterClose` definitions (the two exported consts with their doc comments) and add, next to the existing imports:

```ts
import { clampReorder, pinnedCount } from "../../tabs/store/tabOrdering.ts";

// Re-exported so existing importers (WorkspaceController, the store's own
// tests) keep their import path while the rules themselves live in the
// shared tab core.
export { neighbourAfterClose, pinnedCount } from "../../tabs/store/tabOrdering.ts";
```

Then replace the body of `reorderWorkspaces` with:

```ts
  reorderWorkspaces(from, to) {
    set(
      produce((state: WorkspaceStoreState) => {
        const { order, instances } = state;
        const target = clampReorder(order, instances, from, to);
        if (target === null || target === from) return;
        const [movingId] = order.splice(from, 1);
        order.splice(target, 0, movingId);
        // activeWorkspaceId is deliberately untouched: reordering must never
        // change which workspace is active.
      })
    );
  },
```

`togglePin` keeps calling `pinnedCount` — it now resolves to the imported one.

- [ ] **Step 6: Verify the Network Builder is unchanged**

Run: `cd frontend && node --test src/workspace/store/workspaceStore.test.ts && node --test src/workspace/services/WorkspaceController.test.ts && npm run typecheck`
Expected: all PASS, typecheck clean, and `git diff --stat` shows no change to either test file.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/tabs/store/tabOrdering.ts frontend/src/tabs/store/tabOrdering.test.ts frontend/src/workspace/store/workspaceStore.ts
git commit -m "Extract tab ordering rules into a shared core"
```

---

### Task 2: Generic tab store factory

**Files:**
- Create: `frontend/src/tabs/types/tab.types.ts`, `frontend/src/tabs/store/createTabStore.ts`
- Test: `frontend/src/tabs/store/createTabStore.test.ts`

**Interfaces:**
- Consumes: `clampReorder`, `pinnedCount` from `tabs/store/tabOrdering.ts`.
- Produces: `TabInstance<TState>`, `ClosedTab<TState>`, `createTabInstance(options)`, `resetTabIdSequence()`, `createTabStore<TState>(options?)` returning a vanilla Zustand store whose state is `TabStoreState<TState>` with actions `addTab`, `setActive`, `removeTab`, `renameTab`, `setTabState`, `togglePin`, `reorderTabs`, `popRecentlyClosed`, `hydrate`, `reset`.

**Note on Immer:** the spec describes these as Immer reducers. Use **plain immutable updates instead** — `produce` over a generic `TState` drags `Draft<T>` through every assignment and produces variance errors that would force casts at each reducer. The discipline the spec actually cares about is preserved exactly: every reducer stays pure and synchronous. `workspaceStore` keeps Immer, as its state is concrete.

- [ ] **Step 1: Write the failing test**

Create `frontend/src/tabs/store/createTabStore.test.ts`:

```ts
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

test("pinning re-seats behind the permanent tab, unpinning returns to the boundary", () => {
  const [list, a, b] = seed([
    { title: "All Plants", permanent: true },
    { title: "A" },
    { title: "B" },
  ]);

  state().togglePin(b.id);
  assert.deepEqual(state().order, [list.id, b.id, a.id]);

  state().togglePin(b.id);
  assert.deepEqual(state().order, [list.id, a.id, b.id]);
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd frontend && node --test src/tabs/store/createTabStore.test.ts`
Expected: FAIL — cannot find module `./createTabStore.ts`.

- [ ] **Step 3: Write the types**

Create `frontend/src/tabs/types/tab.types.ts`:

```ts
// Domain-neutral tab types.
//
// A tab is one open thing plus the UI state of the person viewing it. Tab
// identity is deliberately separate from domain identity: `id` addresses the
// tab, `key` addresses what it shows, and a tab with no domain entity behind
// it (a list view) has `key === null`.

export interface TabInstance<TState> {
  /** Tab id. Never the domain entity id. */
  id: string;
  /** Domain identity, used to avoid opening the same thing twice. */
  key: string | null;
  title: string;
  pinned: boolean;
  /** Unclosable and always first. At most one per strip. */
  permanent: boolean;
  state: TState;
  createdAt: number;
  updatedAt: number;
}

export interface ClosedTab<TState> {
  tab: TabInstance<TState>;
  /** Index the tab occupied, so reopening puts it back where it was. */
  index: number;
}

export interface CreateTabOptions<TState> {
  title: string;
  state: TState;
  key?: string | null;
  pinned?: boolean;
  permanent?: boolean;
}

let tabSeq = 0;

/** Test seam: keeps generated ids deterministic across runs. */
export const resetTabIdSequence = (): void => {
  tabSeq = 0;
};

export const createTabId = (): string => {
  tabSeq += 1;
  return `tab-${Date.now().toString(36)}-${tabSeq}`;
};

export const createTabInstance = <TState>(
  options: CreateTabOptions<TState>
): TabInstance<TState> => {
  const now = Date.now();
  return {
    id: createTabId(),
    key: options.key ?? null,
    title: options.title,
    pinned: options.pinned ?? false,
    permanent: options.permanent ?? false,
    state: options.state,
    createdAt: now,
    updatedAt: now,
  };
};
```

- [ ] **Step 4: Write the store factory**

Create `frontend/src/tabs/store/createTabStore.ts`:

```ts
// Tab metadata store factory for snapshot-free domains.
//
// PURE, SYNCHRONOUS state only. Anything async or cross-module — loading,
// persisting, URL mirroring — belongs in a domain controller. A store that
// cannot perform a transaction cannot have one driven from a React effect.
//
// Unlike workspaceStore this uses plain immutable updates rather than Immer:
// `produce` over a generic TState drags Draft<T> through every assignment and
// costs a cast per reducer for no behavioural gain.

import { createStore } from "zustand/vanilla";
import type { StoreApi } from "zustand/vanilla";
import { useStore } from "zustand";

import { clampReorder, pinnedCount } from "./tabOrdering.ts";
import type { ClosedTab, TabInstance } from "../types/tab.types.ts";

const DEFAULT_RECENTLY_CLOSED_LIMIT = 10;

export interface TabStoreState<TState> {
  activeTabId: string | null;
  tabs: Record<string, TabInstance<TState>>;
  order: string[];
  recentlyClosed: ClosedTab<TState>[];

  addTab(tab: TabInstance<TState>, index?: number): void;
  setActive(id: string | null): void;
  removeTab(id: string): void;
  renameTab(id: string, title: string): void;
  setTabState(id: string, patch: Partial<TState>): void;
  togglePin(id: string): void;
  reorderTabs(from: number, to: number): void;
  popRecentlyClosed(): ClosedTab<TState> | null;
  hydrate(input: {
    tabs: TabInstance<TState>[];
    order: string[];
    activeTabId: string | null;
  }): void;
  reset(): void;
}

export interface CreateTabStoreOptions {
  recentlyClosedLimit?: number;
}

export const createTabStore = <TState>(options: CreateTabStoreOptions = {}) => {
  const limit = options.recentlyClosedLimit ?? DEFAULT_RECENTLY_CLOSED_LIMIT;

  return createStore<TabStoreState<TState>>((set, get) => ({
    activeTabId: null,
    tabs: {},
    order: [],
    recentlyClosed: [],

    addTab(tab, index) {
      set((prev) => {
        const at = index === undefined ? prev.order.length : index;
        const order = [...prev.order];
        order.splice(Math.max(0, Math.min(at, order.length)), 0, tab.id);
        return { tabs: { ...prev.tabs, [tab.id]: tab }, order };
      });
    },

    setActive(id) {
      set({ activeTabId: id });
    },

    removeTab(id) {
      set((prev) => {
        const tab = prev.tabs[id];
        // Refusal lives here rather than in callers so no code path can close
        // the one tab that gives a domain something to show.
        if (!tab || tab.permanent) return prev;

        const index = prev.order.indexOf(id);
        const tabs = { ...prev.tabs };
        delete tabs[id];

        return {
          tabs,
          order: prev.order.filter((other) => other !== id),
          activeTabId: prev.activeTabId === id ? null : prev.activeTabId,
          recentlyClosed: [{ tab, index }, ...prev.recentlyClosed].slice(0, limit),
        };
      });
    },

    renameTab(id, title) {
      set((prev) => {
        const tab = prev.tabs[id];
        if (!tab) return prev;
        return {
          tabs: { ...prev.tabs, [id]: { ...tab, title, updatedAt: Date.now() } },
        };
      });
    },

    setTabState(id, patch) {
      set((prev) => {
        const tab = prev.tabs[id];
        if (!tab) return prev;
        return {
          tabs: {
            ...prev.tabs,
            [id]: { ...tab, state: { ...tab.state, ...patch }, updatedAt: Date.now() },
          },
        };
      });
    },

    togglePin(id) {
      set((prev) => {
        const tab = prev.tabs[id];
        if (!tab || tab.permanent) return prev;

        const pinned = { ...tab, pinned: !tab.pinned, updatedAt: Date.now() };
        const tabs = { ...prev.tabs, [id]: pinned };
        const order = prev.order.filter((other) => other !== id);
        // Re-seat at the pinned/unpinned boundary, which is the same index in
        // both directions once `id` is out of the array.
        order.splice(pinnedCount(order, tabs), 0, id);
        return { tabs, order };
      });
    },

    reorderTabs(from, to) {
      set((prev) => {
        const target = clampReorder(prev.order, prev.tabs, from, to);
        if (target === null || target === from) return prev;
        const order = [...prev.order];
        const [movingId] = order.splice(from, 1);
        order.splice(target, 0, movingId);
        // activeTabId is deliberately untouched: reordering must never change
        // which tab is active.
        return { order };
      });
    },

    popRecentlyClosed() {
      const entry = get().recentlyClosed[0] ?? null;
      if (entry) set((prev) => ({ recentlyClosed: prev.recentlyClosed.slice(1) }));
      return entry;
    },

    hydrate({ tabs, order, activeTabId }) {
      const byId: Record<string, TabInstance<TState>> = {};
      tabs.forEach((tab) => {
        byId[tab.id] = tab;
      });
      set({
        tabs: byId,
        order: order.filter((id) => byId[id]),
        activeTabId: activeTabId && byId[activeTabId] ? activeTabId : null,
        recentlyClosed: [],
      });
    },

    reset() {
      set({ activeTabId: null, tabs: {}, order: [], recentlyClosed: [] });
    },
  }));
};

// Written as StoreApi rather than ReturnType<typeof createTabStore>: a
// conditional type is not inferable, so callers of useTabStore below would
// fail to infer TState from the store they pass.
export type TabStore<TState> = StoreApi<TabStoreState<TState>>;

/** React binding for a store built by the factory. */
export const useTabStore = <TState, TSelected>(
  store: TabStore<TState>,
  selector: (state: TabStoreState<TState>) => TSelected
): TSelected => useStore(store, selector);
```

- [ ] **Step 5: Run the tests and typecheck**

Run: `cd frontend && node --test src/tabs/store/createTabStore.test.ts && npm run typecheck`
Expected: PASS, 9 tests, typecheck clean.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/tabs/types/tab.types.ts frontend/src/tabs/store/createTabStore.ts frontend/src/tabs/store/createTabStore.test.ts
git commit -m "Add a generic tab store factory"
```

---

### Task 3: Session persistence

A stored session is tens of bytes — ids, titles, a sub-tab key. All branching lives in a pure parser; the storage shell only reads and writes strings, swallowing errors so a quota failure or private-mode restriction can never break the page.

**Files:**
- Create: `frontend/src/tabs/persistence/tabSession.schemas.ts`, `frontend/src/tabs/persistence/parseTabSession.ts`, `frontend/src/tabs/persistence/tabSessionStorage.ts`
- Test: `frontend/src/tabs/persistence/parseTabSession.test.ts`

**Interfaces:**
- Consumes: `TabInstance` from `tabs/types/tab.types.ts`.
- Produces: `TAB_SESSION_VERSION`, `TabSessionSchema`, `parseTabSession<TState>(raw, diagnostics?) → ParsedTabSession<TState> | null` where `ParsedTabSession` is `{ tabs, order, activeTabId }`, `TabSessionStorage` interface `{ read(): unknown; write(value: unknown): void; clear(): void }`, `createTabSessionStorage(domain)`, `MemoryTabSessionStorage`.

- [ ] **Step 1: Write the failing test**

Create `frontend/src/tabs/persistence/parseTabSession.test.ts`:

```ts
import test from "node:test";
import assert from "node:assert/strict";

import { parseTabSession } from "./parseTabSession.ts";
import { TAB_SESSION_VERSION } from "./tabSession.schemas.ts";

interface DemoState {
  subTab: string;
}

const tab = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  key: `plant-${id}`,
  title: id.toUpperCase(),
  pinned: false,
  permanent: false,
  state: { subTab: "overview" },
  createdAt: 1,
  updatedAt: 1,
  ...extra,
});

const session = (extra: Record<string, unknown> = {}) => ({
  version: TAB_SESSION_VERSION,
  activeTabId: "a",
  order: ["a", "b"],
  tabs: [tab("a"), tab("b")],
  ...extra,
});

test("parses a valid session", () => {
  const parsed = parseTabSession<DemoState>(session());
  assert.equal(parsed?.tabs.length, 2);
  assert.deepEqual(parsed?.order, ["a", "b"]);
  assert.equal(parsed?.activeTabId, "a");
});

test("returns null for a payload that is not a session", () => {
  assert.equal(parseTabSession<DemoState>(null), null);
  assert.equal(parseTabSession<DemoState>({ nope: true }), null);
});

test("returns null for an unknown version rather than guessing at the shape", () => {
  assert.equal(parseTabSession<DemoState>(session({ version: 99 })), null);
});

test("drops order entries with no surviving tab and appends unlisted tabs", () => {
  const parsed = parseTabSession<DemoState>(
    session({ order: ["ghost", "b"], tabs: [tab("a"), tab("b")] })
  );
  assert.deepEqual(parsed?.order, ["b", "a"]);
});

test("permanent tabs are seated in front however they were stored", () => {
  const parsed = parseTabSession<DemoState>(
    session({
      order: ["a", "list"],
      activeTabId: "a",
      tabs: [tab("a"), tab("list", { permanent: true, key: null })],
    })
  );
  assert.deepEqual(parsed?.order, ["list", "a"]);
});

test("an active id that did not survive falls back to the first tab", () => {
  const parsed = parseTabSession<DemoState>(session({ activeTabId: "ghost" }));
  assert.equal(parsed?.activeTabId, "a");
});

test("a single malformed tab is dropped, not the whole session", () => {
  const diagnostics: string[] = [];
  const parsed = parseTabSession<DemoState>(
    session({ order: ["a", "b"], tabs: [tab("a"), { id: "b" }] }),
    { onDroppedTab: (index) => diagnostics.push(String(index)) }
  );
  assert.deepEqual(parsed?.order, ["a"]);
  assert.deepEqual(diagnostics, ["1"]);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd frontend && node --test src/tabs/persistence/parseTabSession.test.ts`
Expected: FAIL — cannot find module `./parseTabSession.ts`.

- [ ] **Step 3: Write the schemas**

Create `frontend/src/tabs/persistence/tabSession.schemas.ts`:

```ts
// Zod boundary for stored tab sessions. Everything read back from storage was
// written by a possibly older version of this schema, so it arrives unknown.

import { z } from "zod";

export const TAB_SESSION_VERSION = 1;

export const StoredTabSchema = z.object({
  id: z.string().min(1),
  key: z.string().nullable(),
  title: z.string(),
  pinned: z.boolean(),
  permanent: z.boolean(),
  state: z.unknown(),
  createdAt: z.number(),
  updatedAt: z.number(),
});

export const TabSessionSchema = z.object({
  // A literal, not a minimum: an unrecognised version means the shape is
  // unknown, and starting fresh beats guessing.
  version: z.literal(TAB_SESSION_VERSION),
  activeTabId: z.string().nullable(),
  order: z.array(z.string()),
  tabs: z.array(z.unknown()),
});
```

- [ ] **Step 4: Write the parser**

Create `frontend/src/tabs/persistence/parseTabSession.ts`:

```ts
// Pure parsing of a stored tab session — no storage, no async.
//
// Degradation is one-way and deliberate: a tab that fails validation is
// dropped, never thrown. One malformed entry from an older schema must not
// stop the remaining tabs from coming back.

import { StoredTabSchema, TabSessionSchema } from "./tabSession.schemas.ts";
import type { TabInstance } from "../types/tab.types.ts";

export interface ParsedTabSession<TState> {
  tabs: TabInstance<TState>[];
  order: string[];
  activeTabId: string | null;
}

export interface TabSessionDiagnostics {
  onDroppedTab?(index: number, reason: string): void;
  onDroppedSession?(reason: string): void;
}

export const parseTabSession = <TState>(
  raw: unknown,
  diagnostics: TabSessionDiagnostics = {}
): ParsedTabSession<TState> | null => {
  const session = TabSessionSchema.safeParse(raw);
  if (!session.success) {
    if (raw != null) diagnostics.onDroppedSession?.(session.error.message);
    return null;
  }

  const tabs: TabInstance<TState>[] = [];
  session.data.tabs.forEach((row, index) => {
    const parsed = StoredTabSchema.safeParse(row);
    if (!parsed.success) {
      diagnostics.onDroppedTab?.(index, parsed.error.message);
      return;
    }
    tabs.push(parsed.data as TabInstance<TState>);
  });

  if (!tabs.length) return null;

  const byId = new Map(tabs.map((tab) => [tab.id, tab]));
  const listed = session.data.order.filter((id) => byId.has(id));
  const unlisted = tabs
    .filter((tab) => !listed.includes(tab.id))
    .sort((a, b) => a.createdAt - b.createdAt)
    .map((tab) => tab.id);

  // Re-seat the regions rather than trusting stored order: a session written
  // by an older build could place a permanent tab anywhere, and the strip's
  // whole contract is that the permanent tab comes first.
  const order = [...listed, ...unlisted].sort((a, b) => {
    const rank = (id: string): number => {
      const tab = byId.get(id);
      if (tab?.permanent) return 0;
      if (tab?.pinned) return 1;
      return 2;
    };
    return rank(a) - rank(b);
  });

  const stored = session.data.activeTabId;
  const activeTabId = stored && byId.has(stored) ? stored : order[0] ?? null;

  return { tabs, order, activeTabId };
};
```

Note: `Array.prototype.sort` is stable in every engine this app targets, so equal-rank tabs keep their listed order.

- [ ] **Step 5: Write the storage shell**

Create `frontend/src/tabs/persistence/tabSessionStorage.ts`:

```ts
// Storage boundary for tab sessions.
//
// localStorage rather than IndexedDB: a session is ids, titles and a sub-tab
// key. It reads synchronously at mount so the strip never flashes empty, and
// it keeps canvas-shaped data out of a database named for the canvas.

export interface TabSessionStorage {
  read(): unknown;
  write(value: unknown): void;
  clear(): void;
}

/** Used in tests and wherever localStorage is unavailable. */
export class MemoryTabSessionStorage implements TabSessionStorage {
  #value: unknown = null;

  read(): unknown {
    return this.#value;
  }

  write(value: unknown): void {
    this.#value = value;
  }

  clear(): void {
    this.#value = null;
  }
}

/**
 * Every method swallows storage errors. Recovery is a convenience; a quota
 * failure or a browser configured to block site data must never break tabs.
 */
export const createTabSessionStorage = (domain: string): TabSessionStorage => {
  const key = `widispatch.tabs.${domain}`;

  const available = (): boolean => {
    try {
      return typeof localStorage !== "undefined" && localStorage !== null;
    } catch {
      return false;
    }
  };

  if (!available()) {
    console.warn(
      `[tabs] localStorage unavailable — ${domain} tabs will work, ` +
        "but will not survive a refresh."
    );
    return new MemoryTabSessionStorage();
  }

  return {
    read() {
      try {
        const raw = localStorage.getItem(key);
        return raw === null ? null : JSON.parse(raw);
      } catch (error) {
        console.warn(`[tabs] could not read the ${domain} session`, error);
        return null;
      }
    },
    write(value) {
      try {
        localStorage.setItem(key, JSON.stringify(value));
      } catch (error) {
        console.warn(`[tabs] could not save the ${domain} session`, error);
      }
    },
    clear() {
      try {
        localStorage.removeItem(key);
      } catch (error) {
        console.warn(`[tabs] could not clear the ${domain} session`, error);
      }
    },
  };
};
```

- [ ] **Step 6: Run the tests and typecheck**

Run: `cd frontend && node --test src/tabs/persistence/parseTabSession.test.ts && npm run typecheck`
Expected: PASS, 7 tests, typecheck clean.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/tabs/persistence
git commit -m "Add validated localStorage persistence for tab sessions"
```

---

### Task 4: Extract the strip components

Move the tab UI to generic, prop-driven components and re-point the Network Builder at them. Nothing about the canvas strip may look or behave differently afterwards.

There are no component tests in this repo — no jsdom, no React test renderer — so this task is verified by `npm run typecheck` plus the manual pass in Step 7. **Do not add a test that imports a `.tsx` file; it will fail under `node --test`.**

**Files:**
- Create: `frontend/src/tabs/components/Tab.tsx`, `TabContextMenu.tsx`, `TabStrip.tsx`, `TabStripBoundary.tsx`, `tabs.css`
- Delete: `frontend/src/workspace/components/WorkspaceTab.tsx`, `WorkspaceTabContextMenu.tsx`, `WorkspaceTabsBoundary.tsx`, `WorkspaceTabs.css`
- Modify: `frontend/src/workspace/components/WorkspaceTabs.tsx`, `frontend/src/pages/NetworkBuilderPage.jsx` (import line only), `frontend/src/pages/NetworkBuilderPage.css`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `TabView` `{ id, title, pinned, permanent, dirty?, warning? }`, `TabCapabilities` `{ rename, duplicate, pin, create }`, and `TabStrip` with props `{ tabs, activeId, pendingId?, capabilities, ariaLabel, className?, newTabLabel?, onActivate, onClose, onReorder, onCloseOthers, onCloseToRight, onRename?, onDuplicate?, onTogglePin?, onCreate? }`.

- [ ] **Step 1: Create the CSS under generic names**

Create `frontend/src/tabs/components/tabs.css` as a copy of `frontend/src/workspace/components/WorkspaceTabs.css` with these substitutions applied throughout, and **without** the trailing `.nb-chrome` block:

| Old | New |
|---|---|
| `.ws-tabs` | `.tab-strip` |
| `.ws-tabs__strip` | `.tab-strip__list` |
| `.ws-tabs__new` | `.tab-strip__new` |
| `.ws-tabs--failed` | `.tab-strip--failed` |
| `.ws-tab` | `.tab` |
| `.ws-tab--active` / `--dragging` / `--pending` / `--pinned` | `.tab--active` / `--dragging` / `--pending` / `--pinned` |
| `.ws-tab__label` / `__name` / `__pin` / `__dirty` / `__warn` / `__close` / `__rename` | `.tab__label` / `__name` / `__pin` / `__dirty` / `__warn` / `__close` / `__rename` |
| `.ws-menu` | `.tab-menu` |
| `.ws-menu__item` / `--danger` / `__separator` | `.tab-menu__item` / `--danger` / `__separator` |

Change the file's opening comment to: `/* Tab strip styling. Domain-neutral: a strip carries a modifier class (e.g. .tab-strip--workspace) for any per-domain adjustment. */`

Then move the `.nb-chrome` block verbatim, with its comment, to the end of `frontend/src/pages/NetworkBuilderPage.css` — it is page layout, not tab styling.

- [ ] **Step 2: Create `Tab.tsx`**

Create `frontend/src/tabs/components/Tab.tsx`:

```tsx
import { useCallback } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

export interface TabView {
  id: string;
  title: string;
  pinned: boolean;
  permanent: boolean;
  /** Unsaved-changes dot. Domains without drafts omit it. */
  dirty?: boolean;
  /** Warning glyph plus tooltip, e.g. a document that failed to load. */
  warning?: string | null;
}

export interface TabProps {
  tab: TabView;
  active: boolean;
  pending: boolean;
  renaming: boolean;
  onActivate(): void;
  onClose(): void;
  onStartRename(): void;
  onCommitRename(title: string): void;
  onCancelRename(): void;
  onContextMenu(event: React.MouseEvent): void;
}

export default function Tab({
  tab,
  active,
  pending,
  renaming,
  onActivate,
  onClose,
  onStartRename,
  onCommitRename,
  onCancelRename,
  onContextMenu,
}: TabProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: tab.id, disabled: renaming });

  // Focus from a callback ref rather than an effect: it runs synchronously the
  // moment the input mounts, so there is no frame to miss. An effect scheduling
  // requestAnimationFrame does miss it — StrictMode's mount/cleanup/mount cycle
  // cancels the frame and the field opens unfocused.
  const focusOnMount = useCallback((el: HTMLInputElement | null) => {
    if (!el) return;
    el.focus();
    el.select();
  }, []);

  // Uncontrolled: the field seeds from the current title every time it mounts,
  // so a draft can never go stale against a rename made elsewhere.
  const commit = (value: string) => {
    const next = value.trim();
    if (!next || next === tab.title) onCancelRename();
    else onCommitRename(next);
  };

  const className = [
    "tab",
    active ? "tab--active" : "",
    isDragging ? "tab--dragging" : "",
    pending ? "tab--pending" : "",
    tab.pinned || tab.permanent ? "tab--pinned" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      ref={setNodeRef}
      className={className}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      onContextMenu={onContextMenu}
      onDoubleClick={onStartRename}
      onAuxClick={(event) => {
        // Middle-click closes, matching editor and browser tab conventions.
        if (event.button === 1 && !tab.permanent) {
          event.preventDefault();
          onClose();
        }
      }}
      title={tab.warning ? `${tab.title} — ${tab.warning}` : tab.title}
    >
      {renaming ? (
        <input
          ref={focusOnMount}
          className="tab__rename"
          defaultValue={tab.title}
          onBlur={(event) => commit(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") commit(event.currentTarget.value);
            else if (event.key === "Escape") onCancelRename();
            // Pages bind global shortcuts; without this, typing "w" in a tab
            // name would try to close the tab.
            event.stopPropagation();
          }}
        />
      ) : (
        <button
          type="button"
          className="tab__label"
          onClick={onActivate}
          {...attributes}
          {...listeners}
        >
          {(tab.pinned || tab.permanent) && (
            <span className="tab__pin" aria-hidden="true" />
          )}
          <span className="tab__name">{tab.title}</span>
          {tab.warning && (
            <span className="tab__warn" title={tab.warning}>
              !
            </span>
          )}
          {tab.dirty && <span className="tab__dirty" title="Unsaved changes" />}
        </button>
      )}

      {!tab.permanent && (
        <button
          type="button"
          className="tab__close"
          aria-label={`Close ${tab.title}`}
          title="Close"
          onClick={(event) => {
            event.stopPropagation();
            onClose();
          }}
        >
          ×
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Create `TabContextMenu.tsx`**

Create `frontend/src/tabs/components/TabContextMenu.tsx`:

```tsx
import { useEffect, useRef } from "react";

export interface TabCapabilities {
  rename: boolean;
  duplicate: boolean;
  pin: boolean;
  /** Whether the strip offers a "+" button for a blank new tab. */
  create: boolean;
}

export interface TabContextMenuProps {
  x: number;
  y: number;
  capabilities: TabCapabilities;
  pinned: boolean;
  permanent: boolean;
  canCloseOthers: boolean;
  canCloseToRight: boolean;
  onRename(): void;
  onDuplicate(): void;
  onTogglePin(): void;
  onClose(): void;
  onCloseOthers(): void;
  onCloseToRight(): void;
  onDismiss(): void;
}

/**
 * A plain DOM popover — unrelated to the cytoscape-context-menus extension
 * used on the canvas itself.
 */
export default function TabContextMenu({
  x,
  y,
  capabilities,
  pinned,
  permanent,
  canCloseOthers,
  canCloseToRight,
  onRename,
  onDuplicate,
  onTogglePin,
  onClose,
  onCloseOthers,
  onCloseToRight,
  onDismiss,
}: TabContextMenuProps) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) onDismiss();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onDismiss();
    };
    // Capture phase: the canvas stops propagation on some pointer events, so a
    // bubbling listener would leave the menu stuck open.
    document.addEventListener("mousedown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [onDismiss]);

  const item = (
    label: string,
    action: () => void,
    disabled = false,
    danger = false
  ) => (
    <button
      type="button"
      className={`tab-menu__item${danger ? " tab-menu__item--danger" : ""}`}
      disabled={disabled}
      onClick={() => {
        onDismiss();
        action();
      }}
    >
      {label}
    </button>
  );

  return (
    <div ref={ref} className="tab-menu" style={{ left: x, top: y }} role="menu">
      {capabilities.rename && !permanent && item("Rename", onRename)}
      {capabilities.duplicate && !permanent && item("Duplicate", onDuplicate)}
      {capabilities.pin && !permanent && item(pinned ? "Unpin" : "Pin", onTogglePin)}
      <div className="tab-menu__separator" />
      {item("Close", onClose, permanent)}
      {item("Close Others", onCloseOthers, !canCloseOthers)}
      {item("Close Tabs to the Right", onCloseToRight, !canCloseToRight)}
    </div>
  );
}
```

- [ ] **Step 4: Create `TabStrip.tsx` and `TabStripBoundary.tsx`**

Create `frontend/src/tabs/components/TabStrip.tsx`:

```tsx
import { useCallback, useState } from "react";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import type { DragEndEvent } from "@dnd-kit/core";
import {
  restrictToHorizontalAxis,
  restrictToParentElement,
} from "@dnd-kit/modifiers";
import {
  SortableContext,
  horizontalListSortingStrategy,
} from "@dnd-kit/sortable";

import Tab from "./Tab.tsx";
import TabContextMenu from "./TabContextMenu.tsx";
import type { TabView } from "./Tab.tsx";
import type { TabCapabilities } from "./TabContextMenu.tsx";
import "./tabs.css";

export type { TabView } from "./Tab.tsx";
export type { TabCapabilities } from "./TabContextMenu.tsx";

interface MenuState {
  tabId: string;
  x: number;
  y: number;
}

export interface TabStripProps {
  tabs: TabView[];
  activeId: string | null;
  /** A tab whose content is still resolving. Domains without async switching pass null. */
  pendingId?: string | null;
  capabilities: TabCapabilities;
  ariaLabel: string;
  /** Domain modifier class, e.g. "tab-strip--production". */
  className?: string;
  newTabLabel?: string;
  onActivate(id: string): void;
  onClose(id: string): void;
  onReorder(from: number, to: number): void;
  onCloseOthers(id: string): void;
  onCloseToRight(id: string): void;
  onRename?(id: string, title: string): void;
  onDuplicate?(id: string): void;
  onTogglePin?(id: string): void;
  onCreate?(): void;
}

export default function TabStrip({
  tabs,
  activeId,
  pendingId = null,
  capabilities,
  ariaLabel,
  className,
  newTabLabel = "New tab",
  onActivate,
  onClose,
  onReorder,
  onCloseOthers,
  onCloseToRight,
  onRename,
  onDuplicate,
  onTogglePin,
  onCreate,
}: TabStripProps) {
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      // Without a small threshold every click would begin a drag and the tab
      // would never activate.
      activationConstraint: { distance: 4 },
    })
  );

  const ids = tabs.map((tab) => tab.id);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      const from = ids.indexOf(String(active.id));
      const to = ids.indexOf(String(over.id));
      if (from === -1 || to === -1) return;
      onReorder(from, to);
    },
    [ids, onReorder]
  );

  const dismissMenu = useCallback(() => setMenu(null), []);

  if (!tabs.length) return null;

  const menuIndex = menu ? ids.indexOf(menu.tabId) : -1;
  const menuTab = menuIndex === -1 ? null : tabs[menuIndex];

  return (
    <div
      className={["tab-strip", className].filter(Boolean).join(" ")}
      role="tablist"
      aria-label={ariaLabel}
    >
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        modifiers={[restrictToHorizontalAxis, restrictToParentElement]}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={ids} strategy={horizontalListSortingStrategy}>
          <div className="tab-strip__list">
            {tabs.map((tab) => (
              <Tab
                key={tab.id}
                tab={tab}
                active={tab.id === activeId}
                pending={tab.id === pendingId}
                renaming={tab.id === renamingId}
                onActivate={() => onActivate(tab.id)}
                onClose={() => onClose(tab.id)}
                onStartRename={() => {
                  if (capabilities.rename && !tab.permanent) setRenamingId(tab.id);
                }}
                onCommitRename={(title) => {
                  onRename?.(tab.id, title);
                  setRenamingId(null);
                }}
                onCancelRename={() => setRenamingId(null)}
                onContextMenu={(event) => {
                  event.preventDefault();
                  setMenu({ tabId: tab.id, x: event.clientX, y: event.clientY });
                }}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      {capabilities.create && onCreate && (
        <button
          type="button"
          className="tab-strip__new"
          title={newTabLabel}
          aria-label={newTabLabel}
          onClick={onCreate}
        >
          +
        </button>
      )}

      {menu && menuTab && (
        <TabContextMenu
          x={menu.x}
          y={menu.y}
          capabilities={capabilities}
          pinned={menuTab.pinned}
          permanent={menuTab.permanent}
          canCloseOthers={tabs.some(
            (tab) => tab.id !== menu.tabId && !tab.pinned && !tab.permanent
          )}
          canCloseToRight={tabs
            .slice(menuIndex + 1)
            .some((tab) => !tab.pinned && !tab.permanent)}
          onRename={() => setRenamingId(menu.tabId)}
          onDuplicate={() => onDuplicate?.(menu.tabId)}
          onTogglePin={() => onTogglePin?.(menu.tabId)}
          onClose={() => onClose(menu.tabId)}
          onCloseOthers={() => onCloseOthers(menu.tabId)}
          onCloseToRight={() => onCloseToRight(menu.tabId)}
          onDismiss={dismissMenu}
        />
      )}
    </div>
  );
}
```

Create `frontend/src/tabs/components/TabStripBoundary.tsx` as a copy of the current `WorkspaceTabsBoundary.tsx` with the class renamed to `tab-strip tab-strip--failed`, the log prefix changed to `[tabs] strip render failed`, and the message generalised to: `Tabs failed to render. Your content is unaffected; reload to restore the tab bar.`

- [ ] **Step 5: Re-point `WorkspaceTabs` as an adapter**

Replace the body of `frontend/src/workspace/components/WorkspaceTabs.tsx` with:

```tsx
import TabStrip from "../../tabs/components/TabStrip.tsx";
import type { TabCapabilities, TabView } from "../../tabs/components/TabStrip.tsx";
import { useWorkspaceStore } from "../store/workspaceStore.ts";
import { workspaceController } from "../services/workspaceControllerInstance.ts";

const CAPABILITIES: TabCapabilities = {
  rename: true,
  duplicate: true,
  pin: true,
  create: true,
};

export default function WorkspaceTabs() {
  const order = useWorkspaceStore((state) => state.order);
  const instances = useWorkspaceStore((state) => state.instances);
  const activeWorkspaceId = useWorkspaceStore((state) => state.activeWorkspaceId);
  const pendingWorkspaceId = useWorkspaceStore((state) => state.pendingWorkspaceId);

  // The workspace shape is richer than the strip's view model; mapping it here
  // keeps the strip domain-neutral and leaves the canvas store untouched.
  const tabs: TabView[] = order.flatMap((id) => {
    const workspace = instances[id];
    if (!workspace) return [];
    return [
      {
        id,
        title: workspace.document.name,
        pinned: workspace.pinned,
        permanent: false,
        dirty: workspace.dirty,
        warning: workspace.loadError ? "couldn't load" : null,
      },
    ];
  });

  return (
    <TabStrip
      tabs={tabs}
      activeId={activeWorkspaceId}
      pendingId={pendingWorkspaceId}
      capabilities={CAPABILITIES}
      ariaLabel="Open networks"
      className="tab-strip--workspace"
      newTabLabel="New network (Ctrl/Cmd+Alt+N)"
      onActivate={(id) => void workspaceController.activateWorkspace(id)}
      onClose={(id) => void workspaceController.closeWorkspace(id)}
      onReorder={(from, to) => workspaceController.reorderWorkspaces(from, to)}
      onCloseOthers={(id) => void workspaceController.closeOthers(id)}
      onCloseToRight={(id) => void workspaceController.closeToRight(id)}
      onRename={(id, title) => workspaceController.renameWorkspace(id, title)}
      onDuplicate={(id) => void workspaceController.duplicateWorkspace(id)}
      onTogglePin={(id) => workspaceController.togglePin(id)}
      onCreate={() => void workspaceController.createWorkspace()}
    />
  );
}
```

Then delete the three superseded files and update the boundary import in `frontend/src/pages/NetworkBuilderPage.jsx` (line 4) from `../workspace/components/WorkspaceTabsBoundary` to `../tabs/components/TabStripBoundary`, renaming the imported symbol and its two JSX usages to `TabStripBoundary`:

```bash
git rm frontend/src/workspace/components/WorkspaceTab.tsx \
       frontend/src/workspace/components/WorkspaceTabContextMenu.tsx \
       frontend/src/workspace/components/WorkspaceTabsBoundary.tsx \
       frontend/src/workspace/components/WorkspaceTabs.css
```

- [ ] **Step 6: Typecheck and confirm no stale references**

Run: `cd frontend && npm run typecheck && grep -rn "ws-tab\|ws-menu\|WorkspaceTabsBoundary\|WorkspaceTabContextMenu" src/ || echo "no stale references"`
Expected: typecheck clean; the grep prints only `no stale references`.

- [ ] **Step 7: Verify the canvas strip by hand**

Run `npm run dev`, open `http://localhost:5173/network-builder`, and confirm: tabs render with the same styling; clicking activates; double-click renames and the field is focused and selected; right-click shows Rename / Duplicate / Pin / Close / Close Others / Close Tabs to the Right; middle-click closes; dragging reorders and a pinned tab stays in front; the `+` button opens a new workspace; the dirty dot appears after an edit.

- [ ] **Step 8: Commit**

```bash
git add -A frontend/src/tabs frontend/src/workspace/components frontend/src/pages/NetworkBuilderPage.jsx frontend/src/pages/NetworkBuilderPage.css
git commit -m "Extract the tab strip UI into domain-neutral components"
```

---

### Task 5: Production tab types, store and controller

**Files:**
- Create: `frontend/src/production/tabs/productionTab.types.ts`, `productionTabStore.ts`, `ProductionTabController.ts`
- Test: `frontend/src/production/tabs/ProductionTabController.test.ts`

**Interfaces:**
- Consumes: `createTabStore`, `useTabStore`, `TabStore` (Task 2); `createTabInstance`, `TabInstance` (Task 2); `neighbourAfterClose` (Task 1); `TabSessionStorage`, `MemoryTabSessionStorage`, `parseTabSession`, `TAB_SESSION_VERSION` (Task 3).
- Produces: `PLANT_SUB_TABS`, `PlantSubTab`, `ProductionTabState`, `LIST_TAB_TITLE`, `isPlantSubTab(value)`; `productionTabStore`, `useProductionTabStore`; `ProductionTabController` with `registerNavigator`, `restoreSession`, `openPlant`, `activateTab`, `closeTab`, `closeOthers`, `closeToRight`, `setSubTab`, `adoptTitle`, `togglePin`, `reorderTabs`, `reopenLastClosed`, `activateRelative`, `getActiveTab`.

Persistence is wired in this task (the controller writes after every mutation); the deep-link restore path is exercised here too, so Task 6 can be purely about the UI.

- [ ] **Step 1: Write the failing test**

Create `frontend/src/production/tabs/ProductionTabController.test.ts`:

```ts
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd frontend && node --test src/production/tabs/ProductionTabController.test.ts`
Expected: FAIL — cannot find module `./ProductionTabController.ts`.

- [ ] **Step 3: Write the types**

Create `frontend/src/production/tabs/productionTab.types.ts`:

```ts
// Production tab domain types.
//
// A plant tab's `key` is the plant id, which is what makes opening the same
// plant twice impossible. The list tab has no key: it shows no single entity.

// A const array rather than an enum: tsconfig sets erasableSyntaxOnly, so
// Node can strip types instead of compiling them.
export const PLANT_SUB_TABS = [
  "overview",
  "production",
  "quality",
  "maintenance",
  "outages",
] as const;

export type PlantSubTab = (typeof PLANT_SUB_TABS)[number];

export const DEFAULT_SUB_TAB: PlantSubTab = "overview";

export interface ProductionTabState {
  subTab: PlantSubTab;
}

export const LIST_TAB_TITLE = "All Plants";

export const isPlantSubTab = (value: unknown): value is PlantSubTab =>
  typeof value === "string" && (PLANT_SUB_TABS as readonly string[]).includes(value);
```

- [ ] **Step 4: Write the store**

Create `frontend/src/production/tabs/productionTabStore.ts`:

```ts
// The Production strip's tab store. Metadata only, as the factory requires:
// every operation that touches storage or the URL lives in
// ProductionTabController.

import { createTabStore, useTabStore } from "../../tabs/store/createTabStore.ts";
import type { TabStoreState } from "../../tabs/store/createTabStore.ts";
import type { ProductionTabState } from "./productionTab.types.ts";

export const productionTabStore = createTabStore<ProductionTabState>();

export const useProductionTabStore = <T,>(
  selector: (state: TabStoreState<ProductionTabState>) => T
): T => useTabStore(productionTabStore, selector);
```

- [ ] **Step 5: Write the controller**

Create `frontend/src/production/tabs/ProductionTabController.ts`:

```ts
// Production tab operations as one explicit owner.
//
// Framework-independent by design — no React, no react-router — so the whole
// thing is testable against a fake navigator and fake storage. The navigator
// arrives through an interface for the same reason it does in
// WorkspaceController.
//
// Unlike the canvas there is no two-phase switch: the detail view fetches its
// own bundle keyed by plant id, so activation is synchronous throughout and
// there is no pending state to track.

import { productionTabStore } from "./productionTabStore.ts";
import {
  DEFAULT_SUB_TAB,
  LIST_TAB_TITLE,
  isPlantSubTab,
} from "./productionTab.types.ts";
import type { PlantSubTab, ProductionTabState } from "./productionTab.types.ts";
import { createTabInstance } from "../../tabs/types/tab.types.ts";
import type { TabInstance } from "../../tabs/types/tab.types.ts";
import { neighbourAfterClose } from "../../tabs/store/tabOrdering.ts";
import { parseTabSession } from "../../tabs/persistence/parseTabSession.ts";
import { TAB_SESSION_VERSION } from "../../tabs/persistence/tabSession.schemas.ts";
import type { TabSessionStorage } from "../../tabs/persistence/tabSessionStorage.ts";

export interface TabNavigator {
  replace(path: string): void;
}

const noopNavigator: TabNavigator = { replace: () => {} };

export interface ProductionTabControllerDeps {
  storage: TabSessionStorage;
}

export class ProductionTabController {
  #storage: TabSessionStorage;
  #navigator: TabNavigator = noopNavigator;

  constructor(deps: ProductionTabControllerDeps) {
    this.#storage = deps.storage;
  }

  registerNavigator(navigator: TabNavigator): void {
    this.#navigator = navigator;
  }

  detach(): void {
    this.#navigator = noopNavigator;
  }

  getActiveTab(): TabInstance<ProductionTabState> | null {
    const { activeTabId, tabs } = productionTabStore.getState();
    return activeTabId ? tabs[activeTabId] ?? null : null;
  }

  // ── startup ───────────────────────────────────────────────────────────────

  /**
   * Hydrates from storage, then honours the route as deep-link INTENT — read
   * once, never as a live data source, so switching tabs cannot re-trigger it.
   */
  restoreSession(
    deepLinkPlantId?: string | null,
    deepLinkSubTab?: string | null
  ): void {
    const parsed = parseTabSession<ProductionTabState>(this.#storage.read(), {
      onDroppedTab: (index, reason) =>
        console.warn(`[tabs] dropped production tab ${index}: ${reason}`),
      onDroppedSession: (reason) =>
        console.warn(`[tabs] production session invalid, starting fresh: ${reason}`),
    });

    if (parsed) {
      productionTabStore.getState().hydrate(parsed);
    }
    const listId = this.#ensureListTab();

    if (deepLinkPlantId) {
      const id = this.openPlant(deepLinkPlantId, deepLinkPlantId);
      if (isPlantSubTab(deepLinkSubTab)) this.setSubTab(id, deepLinkSubTab);
      return;
    }

    const { activeTabId } = productionTabStore.getState();
    this.activateTab(activeTabId ?? listId);
  }

  /** The strip must always have its permanent home tab, whatever storage held. */
  #ensureListTab(): string {
    const store = productionTabStore.getState();
    const existing = store.order.find((id) => store.tabs[id]?.permanent);
    if (existing) return existing;

    const tab = createTabInstance<ProductionTabState>({
      title: LIST_TAB_TITLE,
      key: null,
      permanent: true,
      state: { subTab: DEFAULT_SUB_TAB },
    });
    store.addTab(tab, 0);
    return tab.id;
  }

  // ── lifecycle ─────────────────────────────────────────────────────────────

  openPlant(plantId: string, name?: string): string {
    const store = productionTabStore.getState();
    const existing = store.order.find((id) => store.tabs[id]?.key === plantId);
    if (existing) {
      this.activateTab(existing);
      return existing;
    }

    const tab = createTabInstance<ProductionTabState>({
      title: name ?? plantId,
      key: plantId,
      state: { subTab: DEFAULT_SUB_TAB },
    });
    store.addTab(tab);
    this.activateTab(tab.id);
    return tab.id;
  }

  activateTab(id: string): void {
    const store = productionTabStore.getState();
    if (!store.tabs[id]) return;
    store.setActive(id);
    this.#mirrorUrl();
    this.#persist();
  }

  closeTab(id: string): void {
    const store = productionTabStore.getState();
    const tab = store.tabs[id];
    // The permanent tab is refused by the store too; returning early here just
    // avoids pointlessly recomputing a successor.
    if (!tab || tab.permanent) return;

    const wasActive = store.activeTabId === id;
    const successor = wasActive ? neighbourAfterClose(store.order, id) : null;
    store.removeTab(id);
    // The list tab can never close, so the strip cannot be emptied and there is
    // no "never leave an empty tab bar" fallback to write.
    if (successor) this.activateTab(successor);
    else this.#afterMutation();
  }

  closeOthers(id: string): void {
    const store = productionTabStore.getState();
    const doomed = store.order.filter(
      (other) =>
        other !== id && !store.tabs[other]?.pinned && !store.tabs[other]?.permanent
    );
    this.#closeMany(doomed, id);
  }

  closeToRight(id: string): void {
    const store = productionTabStore.getState();
    const index = store.order.indexOf(id);
    if (index === -1) return;
    const doomed = store.order
      .slice(index + 1)
      .filter((other) => !store.tabs[other]?.pinned && !store.tabs[other]?.permanent);
    this.#closeMany(doomed, id);
  }

  #closeMany(doomed: string[], survivorId: string): void {
    if (!doomed.length) return;
    // Activate the survivor first, so no removal has to pick a successor.
    this.activateTab(survivorId);
    doomed.forEach((id) => productionTabStore.getState().removeTab(id));
    this.#afterMutation();
  }

  reopenLastClosed(): string | null {
    const entry = productionTabStore.getState().popRecentlyClosed();
    if (!entry) return null;
    productionTabStore.getState().addTab(entry.tab, entry.index);
    this.activateTab(entry.tab.id);
    return entry.tab.id;
  }

  activateRelative(offset: number): void {
    const { order, activeTabId } = productionTabStore.getState();
    if (order.length < 2 || !activeTabId) return;
    const index = order.indexOf(activeTabId);
    if (index === -1) return;
    this.activateTab(order[(index + offset + order.length) % order.length]);
  }

  // ── mutations ─────────────────────────────────────────────────────────────

  setSubTab(tabId: string, subTab: PlantSubTab): void {
    productionTabStore.getState().setTabState(tabId, { subTab });
    this.#afterMutation();
  }

  /**
   * The loaded plant record is the authority on its own name, so a tab restored
   * with a stale stored title corrects itself once the bundle arrives.
   */
  adoptTitle(tabId: string, name: string): void {
    const tab = productionTabStore.getState().tabs[tabId];
    if (!tab || !name || tab.title === name) return;
    productionTabStore.getState().renameTab(tabId, name);
    this.#persist();
  }

  togglePin(id: string): void {
    productionTabStore.getState().togglePin(id);
    this.#persist();
  }

  reorderTabs(from: number, to: number): void {
    productionTabStore.getState().reorderTabs(from, to);
    this.#persist();
  }

  // ── url + storage ─────────────────────────────────────────────────────────

  #afterMutation(): void {
    this.#mirrorUrl();
    this.#persist();
  }

  #mirrorUrl(): void {
    const tab = this.getActiveTab();
    if (!tab) return;
    if (!tab.key) {
      this.#navigator.replace("/production");
      return;
    }
    // encodeURIComponent because plant ids come from imported records and are
    // not guaranteed to be path-safe.
    const path = `/production/${encodeURIComponent(tab.key)}`;
    this.#navigator.replace(
      tab.state.subTab === DEFAULT_SUB_TAB ? path : `${path}?tab=${tab.state.subTab}`
    );
  }

  #persist(): void {
    const { activeTabId, order, tabs } = productionTabStore.getState();
    this.#storage.write({
      version: TAB_SESSION_VERSION,
      activeTabId,
      order,
      tabs: order.flatMap((id) => (tabs[id] ? [tabs[id]] : [])),
    });
  }
}
```

- [ ] **Step 6: Run the tests and typecheck**

Run: `cd frontend && node --test src/production/tabs/ProductionTabController.test.ts && npm run typecheck`
Expected: PASS, 15 tests, typecheck clean.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/production/tabs
git commit -m "Add the Production tab store and controller"
```

---

### Task 6: Wire the Production page

Turn `ProductionPage` into the shell, make the detail view controlled, and give the list an open callback. Nothing here has automated coverage — verify with typecheck plus the manual pass in Step 7.

**Files:**
- Create: `frontend/src/production/tabs/productionTabControllerInstance.ts`, `frontend/src/production/tabs/ProductionTabs.tsx`
- Modify: `frontend/src/pages/ProductionPage.jsx`, `frontend/src/pages/ProductionPlantDetail.jsx`, `frontend/src/pages/ProductionPlantList.jsx`, `frontend/src/App.jsx`

**Interfaces:**
- Consumes: everything produced by Task 5, plus `TabStrip`/`TabView`/`TabCapabilities` from Task 4.
- Produces: `productionTabController` singleton; `ProductionTabs` component; `ProductionPlantList` prop `onOpenPlant(plant)`; `ProductionPlantDetail` props `{ plantId, subTab, onSubTabChange, onPlantLoaded }`.

- [ ] **Step 1: Create the controller singleton**

Create `frontend/src/production/tabs/productionTabControllerInstance.ts`:

```ts
// The application's ProductionTabController.
//
// Wired here rather than in a component so tab state has a lifetime
// independent of React mounting: open plants survive navigating to another
// section and back.

import { ProductionTabController } from "./ProductionTabController.ts";
import { createTabSessionStorage } from "../../tabs/persistence/tabSessionStorage.ts";

export const productionTabController = new ProductionTabController({
  storage: createTabSessionStorage("production"),
});
```

- [ ] **Step 2: Create the strip adapter**

Create `frontend/src/production/tabs/ProductionTabs.tsx`:

```tsx
import TabStrip from "../../tabs/components/TabStrip.tsx";
import type { TabCapabilities, TabView } from "../../tabs/components/TabStrip.tsx";
import { useProductionTabStore } from "./productionTabStore.ts";
import { productionTabController } from "./productionTabControllerInstance.ts";

// A plant tab is named after its plant and there is no blank new plant, so
// renaming, duplicating and "+" have no meaning here.
const CAPABILITIES: TabCapabilities = {
  rename: false,
  duplicate: false,
  pin: true,
  create: false,
};

export default function ProductionTabs() {
  const order = useProductionTabStore((state) => state.order);
  const tabs = useProductionTabStore((state) => state.tabs);
  const activeTabId = useProductionTabStore((state) => state.activeTabId);

  const views: TabView[] = order.flatMap((id) => {
    const tab = tabs[id];
    if (!tab) return [];
    return [
      { id, title: tab.title, pinned: tab.pinned, permanent: tab.permanent },
    ];
  });

  return (
    <TabStrip
      tabs={views}
      activeId={activeTabId}
      capabilities={CAPABILITIES}
      ariaLabel="Open plants"
      className="tab-strip--production"
      onActivate={(id) => productionTabController.activateTab(id)}
      onClose={(id) => productionTabController.closeTab(id)}
      onReorder={(from, to) => productionTabController.reorderTabs(from, to)}
      onCloseOthers={(id) => productionTabController.closeOthers(id)}
      onCloseToRight={(id) => productionTabController.closeToRight(id)}
      onTogglePin={(id) => productionTabController.togglePin(id)}
    />
  );
}
```

- [ ] **Step 3: Give the list an open callback**

In `frontend/src/pages/ProductionPlantList.jsx`, change the signature and the row handler. Replace the component's opening line and its comment with:

```jsx
// `basePath` lets the Economics tab reuse this table with its own detail route.
// `onOpenPlant` lets a tabbed host open a row in place instead; it defaults to
// navigation so Economics, Demand and Transmission are unaffected.
export default function ProductionPlantList({ basePath = "/production", onOpenPlant }) {
```

and replace the row's `onClick` with:

```jsx
                <tr
                  key={p.id}
                  onClick={() =>
                    onOpenPlant
                      ? onOpenPlant(p)
                      : navigate(`${basePath}/${encodeURIComponent(p.id)}`)
                  }
                >
```

- [ ] **Step 4: Make the detail view controlled**

In `frontend/src/pages/ProductionPlantDetail.jsx`: delete the `useParams`/`useSearchParams`/`Link`/`ArrowLeft` imports and the `TAB_KEYS`, `requestedTab`, `activeTab` state, the tab-sync effect and `selectTab`. Replace the component signature and head with:

```jsx
export default function ProductionPlantDetail({
  plantId,
  subTab = "overview",
  onSubTabChange,
  onPlantLoaded,
}) {
  const [bundle, setBundle] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    setBundle(null);
    fetchPlantBundle(plantId)
      .then((b) => {
        if (!alive) return;
        setBundle(b);
        setLoading(false);
        // The plant record is the authority on its own name, so a tab restored
        // with a stale title corrects itself here.
        if (b?.plant?.name) onPlantLoaded?.(b.plant);
      })
      .catch((e) => { if (alive) { setError(e.message); setLoading(false); } });
    return () => { alive = false; };
  }, [plantId, onPlantLoaded]);

  const plant = bundle?.plant;
```

Remove the `<Link>` back arrow from the header. In the tab list and panel, replace every `activeTab` with `subTab` and change the tab button's handler to `onClick={() => onSubTabChange?.(t.key)}`.

- [ ] **Step 5: Turn the page into the shell**

Replace `frontend/src/pages/ProductionPage.jsx` entirely:

```jsx
import React, { useCallback, useEffect, useRef } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";

import ProductionPlantList from "./ProductionPlantList";
import ProductionPlantDetail from "./ProductionPlantDetail";
import ProductionTabs from "../production/tabs/ProductionTabs";
import TabStripBoundary from "../tabs/components/TabStripBoundary";
import { useProductionTabStore } from "../production/tabs/productionTabStore";
import { productionTabController } from "../production/tabs/productionTabControllerInstance";

export default function ProductionPage() {
  const navigate = useNavigate();
  const { plantId } = useParams();
  const [searchParams] = useSearchParams();

  const activeTabId = useProductionTabStore((state) => state.activeTabId);
  const activeTab = useProductionTabStore((state) =>
    state.activeTabId ? state.tabs[state.activeTabId] ?? null : null
  );

  useEffect(() => {
    productionTabController.registerNavigator({
      replace: (path) => navigate(path, { replace: true }),
    });
  }, [navigate]);

  // The route is deep-link INTENT, read once. Keeping it out of the dependency
  // list is what stops a tab switch — which rewrites the URL — from restarting
  // the session it just mirrored.
  const startedRef = useRef(false);
  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    productionTabController.restoreSession(
      plantId ? decodeURIComponent(plantId) : null,
      searchParams.get("tab")
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openPlant = useCallback((plant) => {
    productionTabController.openPlant(plant.id, plant.name || plant.id);
  }, []);

  const changeSubTab = useCallback(
    (next) => {
      if (activeTabId) productionTabController.setSubTab(activeTabId, next);
    },
    [activeTabId]
  );

  const adoptTitle = useCallback(
    (plant) => {
      if (activeTabId && plant?.name) {
        productionTabController.adoptTitle(activeTabId, plant.name);
      }
    },
    [activeTabId]
  );

  return (
    <div className="production-shell">
      <TabStripBoundary>
        <ProductionTabs />
      </TabStripBoundary>

      {/* Only the active tab renders: keeping every plant mounted would hold N
          bundles and issue N fetches to preserve state we deliberately do not
          preserve. */}
      {activeTab?.key ? (
        <ProductionPlantDetail
          key={activeTab.id}
          plantId={activeTab.key}
          subTab={activeTab.state.subTab}
          onSubTabChange={changeSubTab}
          onPlantLoaded={adoptTitle}
        />
      ) : (
        <ProductionPlantList onOpenPlant={openPlant} />
      )}
    </div>
  );
}
```

- [ ] **Step 6: Point the detail route at the shell**

In `frontend/src/App.jsx`, remove the `ProductionPlantDetail` import and change line 43 to:

```jsx
            <Route path="/production/:plantId" element={<ProductionPage />} />
```

- [ ] **Step 7: Verify**

Run: `cd frontend && npm run typecheck && node --test "src/**/*.test.ts"`
Expected: typecheck clean, all tests pass.

Then run `npm run dev` and walk the spec's success criterion at `http://localhost:5173/production`: open a plant from the table (new tab appears, list tab stays); switch its sub-tab; open a second plant; switch back and confirm the first is still on its sub-tab; click an open plant's row again and confirm no duplicate; close a tab and confirm the neighbour activates; confirm the list tab has no close button and that Close Others leaves it alone; reload and confirm the tabs come back with their sub-tabs; paste `/production/<id>?tab=quality` into the address bar and confirm it focuses or opens that plant on Quality. Finally open `/economics` and confirm its table still navigates to `/economics/:plantId`.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/production frontend/src/pages/ProductionPage.jsx frontend/src/pages/ProductionPlantDetail.jsx frontend/src/pages/ProductionPlantList.jsx frontend/src/App.jsx
git commit -m "Open Production plants in their own tabs"
```

---

### Task 7: Keyboard shortcuts

**Files:**
- Create: `frontend/src/tabs/hooks/useTabShortcuts.ts`
- Modify: `frontend/src/pages/ProductionPage.jsx`

**Interfaces:**
- Consumes: `ProductionTabController` (Task 5).
- Produces: `useTabShortcuts(controller, options?)` where `controller` satisfies `TabShortcutTarget` — `{ activateRelative(offset): void; closeActive(): void; reopenLastClosed(): unknown }`.

The Network Builder keeps its own inline handler; it is entangled with canvas shortcuts and rewriting it serves nothing here.

- [ ] **Step 1: Write the hook**

Create `frontend/src/tabs/hooks/useTabShortcuts.ts`:

```ts
// Tab keyboard shortcuts for any strip whose controller exposes this shape.
//
// Ctrl/Cmd+Tab is deliberately absent: Chrome reserves it for browser tab
// switching and the event is not cancelable, so binding it would silently do
// nothing.

import { useEffect } from "react";

export interface TabShortcutTarget {
  activateRelative(offset: number): void;
  closeActive(): void;
  reopenLastClosed(): unknown;
}

const isTypingTarget = (target: EventTarget | null): boolean => {
  const el = target as HTMLElement | null;
  if (!el || typeof el.closest !== "function") return false;
  const tag = el.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (el.isContentEditable) return true;
  // A modal owns the keyboard while it is open.
  return Boolean(el.closest('[role="dialog"]'));
};

export const useTabShortcuts = (
  target: TabShortcutTarget,
  enabled = true
): void => {
  useEffect(() => {
    if (!enabled) return;

    const onKey = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target)) return;
      const mod = event.metaKey || event.ctrlKey;
      if (!mod) return;
      const lower = event.key.toLowerCase();

      if (event.altKey && event.key === "ArrowRight") {
        event.preventDefault();
        target.activateRelative(1);
      } else if (event.altKey && event.key === "ArrowLeft") {
        event.preventDefault();
        target.activateRelative(-1);
      } else if (event.shiftKey && lower === "t") {
        event.preventDefault();
        target.reopenLastClosed();
      } else if (!event.shiftKey && lower === "w") {
        // Closing is undoable via Ctrl/Cmd+Shift+T, so no confirmation prompt.
        event.preventDefault();
        target.closeActive();
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [target, enabled]);
};
```

- [ ] **Step 2: Give the controller `closeActive`**

Add to `ProductionTabController` in `frontend/src/production/tabs/ProductionTabController.ts`, directly after `closeTab`:

```ts
  /** Convenience for the keyboard shortcut, which has no id to hand. */
  closeActive(): void {
    const { activeTabId } = productionTabStore.getState();
    if (activeTabId) this.closeTab(activeTabId);
  }
```

- [ ] **Step 3: Add the covering test**

Append to `frontend/src/production/tabs/ProductionTabController.test.ts`:

```ts
test("closeActive closes the active tab, and is a no-op on the list tab", () => {
  const { controller } = setup();
  const listId = state().order[0];
  const a = controller.openPlant("plant-1", "A");

  controller.closeActive();
  assert.deepEqual(state().order, [listId]);

  controller.closeActive();
  assert.deepEqual(state().order, [listId]);
  assert.ok(!state().tabs[a]);
});
```

- [ ] **Step 4: Run the tests**

Run: `cd frontend && node --test src/production/tabs/ProductionTabController.test.ts`
Expected: PASS, 16 tests.

- [ ] **Step 5: Wire the hook into the page**

In `frontend/src/pages/ProductionPage.jsx`, add the import:

```jsx
import { useTabShortcuts } from "../tabs/hooks/useTabShortcuts";
```

and call it inside the component, after the `restoreSession` effect:

```jsx
  useTabShortcuts(productionTabController);
```

- [ ] **Step 6: Verify**

Run: `cd frontend && npm run typecheck && node --test "src/**/*.test.ts"`
Expected: typecheck clean, all tests pass.

Then in `npm run dev` at `/production`: Ctrl/Cmd+Alt+→ and ← move between tabs, Ctrl/Cmd+W closes the active plant tab (and does nothing on the list tab), Ctrl/Cmd+Shift+T reopens it. Type in the list's search box and confirm Ctrl/Cmd+W there does not close a tab.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/tabs/hooks/useTabShortcuts.ts frontend/src/production/tabs frontend/src/pages/ProductionPage.jsx
git commit -m "Add keyboard shortcuts to the Production tab strip"
```

---

### Task 8: Final verification

- [ ] **Step 1: Run the full frontend suite**

Run: `cd frontend && npm test && npm run typecheck && npm run build`
Expected: all tests pass, typecheck clean, build succeeds.

- [ ] **Step 2: Confirm the Network Builder is untouched where it matters**

Run: `git diff main --stat -- frontend/src/workspace/services/WorkspaceController.ts frontend/src/workspace/store/workspaceStore.test.ts frontend/src/workspace/services/WorkspaceController.test.ts`
Expected: `WorkspaceController.ts` and both test files show **no changes**.

- [ ] **Step 3: Walk both strips once more**

With `npm run dev` running, exercise the canvas strip (create, rename, duplicate, pin, drag, close, reopen, refresh recovery) and the Production strip (the full success-criterion sequence from the spec). Both must behave as described.

- [ ] **Step 4: Commit any fixes and report**

Report which spec requirements are met, and anything deferred, with the verification output that supports the claim.
