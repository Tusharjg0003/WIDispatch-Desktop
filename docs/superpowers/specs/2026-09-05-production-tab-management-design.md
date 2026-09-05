# Production Tab Management — Generic Tab Core, First Domain

**Date:** 2026-09-05
**Status:** Approved for planning
**Predecessor:** `docs/superpowers/specs/2026-09-04-workspace-tab-management-design.md`
**Branch context:** `simulation-canvas-tab`

---

## 1. Purpose and scope

Bring the tab experience built for the Network Builder to the Production tab,
and in doing so extract the parts of it that are not about Cytoscape into a
generic core that the remaining main-nav tabs (Demand, Transmission,
Economics, Asset Registry) can adopt one at a time.

Production is the first domain, not a special case. Every decision below is
taken with the second and third adoption in mind: the domain-specific code for
a new tab must be a types file, a store constructed from a factory, a small
controller, and a strip adapter — nothing more.

### The behaviour being added

The Production list stops being a page you navigate away from. It becomes a
permanent first tab. Choosing a plant from the table opens that plant's detail
view in its own tab beside it. The user can hold several plants open, switch
between them, and return to a list that is still there.

### In scope

- A generic tab core under `frontend/src/tabs/`: pure ordering rules, a store
  factory, presentational strip components, a shortcuts hook, and
  localStorage-backed session persistence.
- A Production tab layer: store, controller, strip adapter.
- `ProductionPage` becomes a shell rendering the strip plus the active tab.
- `ProductionPlantDetail` becomes a controlled component.
- `ProductionPlantList` gains an `onOpenPlant` callback.
- URL mirroring and deep-link restore for `/production/:plantId`.
- Re-pointing `workspaceStore` and `WorkspaceTabs` at the shared core, with no
  visible change to the Network Builder.

### Explicitly out of scope

- Adopting the system in Demand, Transmission, Economics or Asset Registry.
  The core is built so those are cheap; doing them is separate work.
- Folding `workspaceStore` into the generic store factory (see §3).
- Any change to `WorkspaceController`, the canvas switch transaction, canvas
  persistence, or `NetworkBuilderPage.jsx`'s inline shortcut handler.
- A global, cross-domain tab bar. Each domain owns its own strip and session.
- Preserving list filters or scroll position across tab switches.

### Success criterion

This sequence must work, and no part of it may regress the Network Builder:

```text
Open Production → filter the table → open plant A
→ A opens in a new tab, list tab remains → switch A to the Quality sub-tab
→ open plant B from the list tab → switch back to A
→ A is still on Quality → click A's row in the list again
→ the existing A tab is focused, not duplicated
→ close A → B becomes active → Ctrl/Cmd+Shift+T reopens A in its old position
→ refresh → the list tab, A and B are all restored, A still on Quality
→ the list tab cannot be closed, by button, menu, or Close Others
```

---

## 2. Decisions taken

| Decision | Choice | Rationale |
|---|---|---|
| Tab scope | One strip per domain, own session | Tabs stay where the work is; a plant tab cannot clutter the canvas strip |
| Sharing strategy | Extract a generic core; each domain keeps a thin store + controller | Lightweight and replicable, which is the point of the exercise |
| Canvas store | Left in place, shares ordering helpers only | Unifying two genuinely different instance shapes risks the canvas transaction for no gain here |
| Persistence | localStorage, Zod-validated | Tens of bytes, no blobs; synchronous read avoids an empty-strip flash; no Dexie migration |
| Duplicate opens | Focus the existing tab | One tab per plant, matching `WorkspaceController.openNetwork` |
| List tab | Permanent and unclosable | It is the home of the domain, not a document |
| Preserved per-tab state | The plant's active sub-tab, and nothing else | Filters and scroll already reset on today's back-navigation |
| Rendering | Active tab only | No N concurrent bundle fetches; matches the preserved-state decision |
| Async switching | None | The detail view fetches its own bundle, as it does today |

### No new dependencies

Everything needed is already installed for the workspace phase: `zustand`,
`immer`, `zod`, and `@dnd-kit/{core,sortable,utilities,modifiers}`. Dexie is
not used by this feature.

---

## 3. Why the canvas store is not folded into the factory

The obvious-looking move — one store type, one controller, a `type`
discriminant, adapters per document kind — is deliberately rejected.

A workspace instance carries `document` (a backend network id, name and
description), `dirty`, `loadError`, and a `ui` block holding viewport,
selection and view toggles. A production tab carries a plant id, a title and a
sub-tab key. Forcing one shape over both means either the production tab grows
fields that are permanently null, or the workspace shape is loosened and the
canvas transaction starts reading optional fields it currently relies on.

`WorkspaceController` is the most delicate code in the frontend: a two-phase
switch guarded by a token, capturing against `#displayedWorkspaceId` rather
than the store's `activeWorkspaceId`, with a strictly ordered commit tail.
Generalising it in service of a domain that needs none of it converts every
future Production bug into a possible canvas bug.

What the two systems genuinely share is the *ordering rules* and the *strip
UI*. Those, and only those, are extracted. The test that this was the right
line: after the extraction, `workspaceStore.test.ts` and
`WorkspaceController.test.ts` pass unmodified.

---

## 4. Module layout

```text
frontend/src/tabs/
  types/tab.types.ts
  store/tabOrdering.ts              + tabOrdering.test.ts
  store/createTabStore.ts           + createTabStore.test.ts
  persistence/parseTabSession.ts    + parseTabSession.test.ts
  persistence/tabSession.schemas.ts
  persistence/tabSessionStorage.ts
  hooks/useTabShortcuts.ts
  components/TabStrip.tsx
  components/Tab.tsx
  components/TabContextMenu.tsx
  components/TabStripBoundary.tsx
  components/tabs.css

frontend/src/production/tabs/
  productionTab.types.ts
  productionTabStore.ts
  ProductionTabController.ts        + ProductionTabController.test.ts
  ProductionTabs.tsx
```

TypeScript conventions are the repo's existing ones: strict,
`erasableSyntaxOnly` (no enums — sub-tab keys are a union type over a
`const` array), `verbatimModuleSyntax` (`import type`), and relative imports
carrying their real extension.

---

## 5. Generic core

### 5.1 `tabOrdering.ts`

Pure functions, no state, shared by both domains:

- `permanentCount(order, tabs)` — leading unclosable tabs.
- `pinnedCount(order, tabs)` — leading pinned tabs, as today.
- `boundaryIndexFor(order, tabs, pinned)` — the re-seat index used by pin
  toggling.
- `clampReorderWithinRegion(order, tabs, from, to)` — the drag clamp, extended
  to three regions instead of two.
- `neighbourAfterClose(order, closingId)` — right neighbour, else left.

The order invariant becomes **permanent tabs, then pinned tabs, then the
rest**. `workspaceStore` has no permanent tabs, so `permanentCount` returns 0
there and its behaviour is unchanged; this is what lets the existing tests
serve as the regression proof.

### 5.2 `createTabStore.ts`

```ts
export interface TabInstance<TState> {
  /** Tab id. Never the domain entity id. */
  id: string;
  /** Domain identity used for de-duplication; null for a tab with no entity. */
  key: string | null;
  title: string;
  pinned: boolean;
  /** Unclosable and always first. Never more than one per strip. */
  permanent: boolean;
  state: TState;
  createdAt: number;
  updatedAt: number;
}
```

The factory returns a vanilla Zustand store holding `activeTabId`, `tabs`,
`order` and `recentlyClosed`, with Immer reducers: `addTab`, `setActive`,
`removeTab`, `renameTab`, `setTabState`, `togglePin`, `reorderTabs`,
`popRecentlyClosed`, `hydrate`, `reset`.

The same discipline as `workspaceStore` applies and is the reason the factory
is worth having: **pure and synchronous, Immer only.** Anything async or
cross-module belongs in a domain controller. A store that cannot perform a
transaction cannot have one driven from a React effect.

`permanent` is enforced in the reducers, not by callers: `removeTab` ignores a
permanent tab, `togglePin` ignores it, and `reorderTabs` clamps around it.

**No `pendingTabId`.** The canvas needs a pending state because
`WorkspaceController` awaits a network fetch before committing a switch.
Production's detail view fetches its own bundle keyed by plant id, so
activation is synchronous and loading state belongs to the view. Domains that
later need async activation can add it; nothing here presumes it.

### 5.3 Strip components

`Tab.tsx`, `TabStrip.tsx`, `TabContextMenu.tsx` and `TabStripBoundary.tsx` are
today's `WorkspaceTab*` components with the `workspaceController` import and
the `WorkspaceInstance` type removed. They render from a view model and call
back:

```ts
export interface TabView {
  id: string;
  title: string;
  pinned: boolean;
  permanent: boolean;
  /** Unsaved-changes dot. Domains without drafts omit it. */
  dirty?: boolean;
  /** Warning glyph and tooltip, e.g. a failed load. */
  warning?: string | null;
}

export interface TabCapabilities {
  rename: boolean;
  duplicate: boolean;
  pin: boolean;
  create: boolean;
}
```

The context menu renders only the capabilities a domain declares. Production
declares `{ rename: false, duplicate: false, pin: true, create: false }`: a
plant tab's name is the plant's name, duplicating one is meaningless under
one-tab-per-plant, and there is no such thing as a blank new plant, so the
strip shows no `+` button.

Every behaviour already tuned in these components is preserved deliberately:
the callback-ref focus on the rename field (an effect plus
`requestAnimationFrame` loses focus under StrictMode's mount/cleanup/mount
cycle), the 4px pointer activation constraint (without it a click never
activates a tab), capture-phase dismissal of the context menu, middle-click to
close, and `stopPropagation` on rename keystrokes so typing cannot fire a
global shortcut.

CSS class names move from `ws-tab*` / `ws-menu*` to `tab-strip*`, with a domain
modifier hook (`tab-strip--workspace`, `tab-strip--production`) for any strip
that later needs to look different.

### 5.4 `useTabShortcuts.ts`

Binds Ctrl/Cmd+Alt+←/→ (previous/next), Ctrl/Cmd+W (close active), and
Ctrl/Cmd+Shift+T (reopen last closed) against any controller exposing that
shape, ignoring events from typing targets and open dialogs. Ctrl/Cmd+Tab is
not bound: Chrome reserves it and the event is not cancelable.

`NetworkBuilderPage.jsx` keeps its own inline handler. It is entangled with
canvas shortcuts, and rewriting it serves nothing in this feature.

### 5.5 Session persistence

```ts
interface TabSessionRecord<TState> {
  version: number;
  activeTabId: string | null;
  order: string[];
  tabs: TabInstance<TState>[];
}
```

Stored under `widispatch.tabs.<domain>` and validated with Zod on read.
Degradation is one-way and matches `parseRecoveredSession`: a corrupt, partial
or older payload is dropped rather than thrown, and the domain falls back to
its default tab set. All branching lives in the pure `parseTabSession.ts`;
`tabSessionStorage.ts` is a try/catch shell so a storage quota failure or
private-mode restriction can never break the page.

localStorage rather than IndexedDB, because a production tab is an id, a title
and a sub-tab key. It reads synchronously at mount, so the strip never flashes
empty, and it avoids version-bumping a Dexie database named for the canvas to
hold data unrelated to it.

---

## 6. Production layer

### 6.1 Types and store

```ts
export const PLANT_SUB_TABS = ["overview", "production", "quality",
  "maintenance", "outages"] as const;
export type PlantSubTab = (typeof PLANT_SUB_TABS)[number];
export interface ProductionTabState { subTab: PlantSubTab; }
```

`productionTabStore` is `createTabStore<ProductionTabState>()`. The list tab is
seeded as `{ key: null, title: "All Plants", permanent: true }`; a plant tab
has `key: plantId`.

### 6.2 `ProductionTabController`

Framework-independent, as `WorkspaceController` is: no React, no router.
The navigator arrives through an interface, so the whole controller is testable
against fakes.

- `openPlant(plantId, name)` — if a tab already has `key === plantId`, activate
  it; otherwise append one and activate. Never duplicates.
- `activateTab(id)` — set active, mirror the URL. Synchronous throughout.
- `closeTab(id)` — refuses the permanent tab; successor from
  `neighbourAfterClose`; persists. The strip cannot be emptied, so unlike the
  canvas there is no "never leave an empty tab bar" fallback to write.
- `closeOthers(id)` / `closeToRight(id)` — skip permanent and pinned tabs.
- `setSubTab(tabId, subTab)` — records the sub-tab and mirrors `?tab=`.
- `togglePin`, `reorderTabs`, `reopenLastClosed`, `activateRelative`.
- `adoptTitle(tabId, name)` — called by the detail view once its bundle loads,
  so a restored tab whose plant was renamed in the registry corrects itself.
  The backend record is the authority, exactly as in `adoptDocumentIdentity`.
- `registerNavigator({ replace })`.
- `restoreSession(deepLinkPlantId)` — hydrate from storage, then focus a
  restored tab matching the deep link or open one for it.

### 6.3 Routing and the page shell

`/production` and `/production/:plantId` both render `ProductionPage`, which
becomes a shell: the strip, then the active tab's view — `ProductionPlantList`
when `key === null`, otherwise `ProductionPlantDetail`.

The URL mirrors the active tab through history replace, keeping today's shape
including `?tab=` for a non-overview sub-tab, so existing deep links continue
to resolve. As in the Network Builder, the route becomes deep-link *intent*
read once at startup, not a live data source — switching tabs must not
re-trigger a route-driven fetch.

Only the active tab renders. Keeping every tab mounted and hidden would hold N
plants' worth of bundles and issue N fetches on load, to preserve state the
design has already decided not to preserve.

### 6.4 Component changes

`ProductionPlantDetail` becomes controlled: `plantId`, `subTab` and
`onSubTabChange` as props, replacing `useParams` and `useSearchParams`. Its
back arrow is removed, since the list is now a tab rather than a previous page.
Its data fetching is untouched.

`ProductionPlantList` gains `onOpenPlant(plant)`, defaulting to today's
``navigate(`${basePath}/${id}`)``. This default matters: `EconomicsPage`
renders the same list with `basePath="/economics"`, and `DemandCityGateList`
and `TransmissionPage` import its stylesheet. With the default in place,
**Economics, Demand and Transmission are untouched by this work**, and
Economics becomes a one-line adoption when its own strip is built.

---

## 7. Testing

All tests are `node:test` + `node:assert` files beside the module they cover,
consistent with the repo.

| File | Covers |
|---|---|
| `tabOrdering.test.ts` | permanent-first invariant, pin boundary, three-region reorder clamp, successor selection |
| `createTabStore.test.ts` | add, activate, close, reopen at original index, permanent refusal by remove/pin/reorder, recently-closed limit |
| `parseTabSession.test.ts` | valid payload, corrupt payload dropped, unknown version dropped, order reconciled against surviving tabs |
| `ProductionTabController.test.ts` | de-duplication on reopening a plant, successor after close, deep-link focusing an existing tab, `closeOthers` sparing the list tab, sub-tab surviving a switch, URL mirroring against a fake navigator |

Regression proof for the extraction: `workspaceStore.test.ts` and
`WorkspaceController.test.ts` must pass **unmodified**. `npm run typecheck`
must be clean, as every new module is TypeScript.

---

## 8. Build order

Steps 1–3 are pure refactor and are independently verifiable before any
Production behaviour exists.

1. Extract `tabOrdering.ts`; re-point `workspaceStore` at it. Existing tests
   green, no behaviour change.
2. `createTabStore.ts` with tests.
3. Extract the strip components and CSS; re-point `WorkspaceTabs` as an
   adapter. The Network Builder is visually and behaviourally identical.
4. Production types, store and controller with tests.
5. `ProductionPage` shell; controlled `ProductionPlantDetail`; `onOpenPlant`
   on the list.
6. Session persistence and deep-link restore.
7. `useTabShortcuts` on the Production strip.

---

## 9. Risks

| Risk | Mitigation |
|---|---|
| The strip extraction silently changes canvas tab behaviour | Step 3 lands alone, with `workspaceStore` and `WorkspaceController` tests unmodified and a manual pass over the canvas strip |
| CSS rename breaks canvas tab styling | Class rename and adapter land in the same step; the workspace strip carries a `tab-strip--workspace` modifier so any divergence has a home |
| A stale stored title after a plant is renamed | `adoptTitle` corrects it from the loaded bundle |
| localStorage unavailable (private mode) | Storage shell swallows errors; tabs work for the session, only recovery is lost, and the same warning pattern as the canvas repository is logged once |
| Shared list component regressing Economics | `onOpenPlant` defaults to current navigation; Economics is not modified |
