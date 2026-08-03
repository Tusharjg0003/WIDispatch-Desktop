# Simulation Canvas Tab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a fourth "Canvas" tab to the Simulation Config page that draws the network a dispatch plan was solved over, paints the solved per-day flows onto it, and drives the existing trace/isolate tools with real flow.

**Architecture:** Trace, isolate and graph-hydration helpers move out of `NetworkBuilderPage.jsx` into shared `frontend/src/cytoscape/` modules. New pure derivations live in `frontend/src/lib/simulationCanvas.js` (unit tested under `node --test`). A thin adapter `frontend/src/cytoscape/simulationOverlay.js` writes bucket classes and data onto Cytoscape elements; all colour lives in `buildCyStyle.js`. New components under `frontend/src/components/simulation/` compose the tab.

**Tech Stack:** React 18, Vite, Cytoscape 3.30, lucide-react, `node --test` (node's built-in runner, no vitest/jest).

## Global Constraints

- Tests run with `npm test` in `frontend/` → `node --test "src/**/*.test.js"`. Test files are plain `.js`, use `import { test } from "node:test"` and `import assert from "node:assert/strict"`. **No JSX, no DOM, no cytoscape import in any test file.** Anything you want tested must be pure and live in `lib/` or be a cy-shape-agnostic function.
- No new npm dependencies. Cytoscape and lucide-react are already present.
- No backend changes. The engine already emits everything this tab needs.
- The Canvas tab is strictly read-only: it must never mutate, save or autosave a network.
- Comments follow the house style seen in `simulationRows.js` and `capacity.js`: explain *why* a rule exists, not what the line does. Do not add comments that restate code.
- Currency is SAR, volume is m³. Format with `Intl.NumberFormat("en-US")` as `ResultsPanel.jsx:10` does.
- Every task ends with a commit. Run `npm test` from `frontend/` before every commit; it must pass.

## Deviations from the spec

Three, all found while reading the code the spec describes. None change the
feature; implement as written here.

1. **`addGraph` is extracted too** (Task 2, into `cytoscape/graph.js`). The spec's
   extraction table lists only trace and isolate, but the Canvas tab must hydrate
   a saved network document and `addGraph` is the builder's function for exactly
   that. Copying it would have been a third divergent copy of the two-shape
   document parser.
2. **The cause labels live in `lib/simulationRows.js`, not `simulationCanvas.js`**
   (Task 3). The spec proposed a `causeText` mirror in the new file, but
   `ResultsPanel.jsx:18-23` already owns an identical map. One shared
   `causeLabel` in the existing simulation lib beats a second copy in a new one.
3. **`overriddenIds` is part of `dayOverlay`'s return** (Task 5). The spec asks
   for an override marker on every element state; the override flag lives on the
   plan's per-day rows, not on the saved canvas, so the adapter cannot read it
   off the Cytoscape node and the overlay must carry it.

## Reference: exact data shapes you will consume

Read these before Task 3. They come from `backend/src/simulation/dispatch.js`.

`plan.days[i]`:
```js
{
  date: "2026-08-04",
  plants: [{ nodeId, assetId, name, base, maintenanceLoss, outageLoss, available,
             fullOutage, noCapacity, variableOm, variableOmSource, overridden }],
  pumps:  [{ nodeId, assetId, name, base, maintenanceLoss, outageLoss, available,
             fullOutage, limit, unconstrained, overridden }],
  gates:  [{ nodeId, assetId, name, required, intakeCap, intakeLimited, overridden,
             delivered, shortage, cause }],
  plantOutputs: { [canvasNodeId]: number },
  pipeFlows:    { [canvasEdgeId]: number },
  totalRequired, totalDelivered, totalShortage, variableOmCost, satisfactionPct,
  bindingConstraints: [{ kind, label, id, assetId, flow, capacity }]
}
```

`bindingConstraints[].kind` is one of `"plant_supply" | "pump" | "pipe" | "gate_intake"`.
`bindingConstraints[].id` is the **edge** id when `kind === "pipe"`, otherwise the **node** id.
`bindingConstraints[].capacity` is `null` when the arc was unlimited.

`plan.pipes[]` (static across the horizon):
```js
{ id, label, source, target, bidirectional, active, capacity, unconstrained,
  peakFlow, avgFlow, peakUtilisationPct }
```
`capacity` is `null` exactly when `unconstrained === true`.

`plan.network` is `{ id, name }` only — **the plan does not contain the topology.** The tab fetches it with `fetchNetwork(plan.network.id)` from `frontend/src/api/networks.js`.

`gates[].cause` is one of `"isolated" | "insufficient_capacity" | "transmission_bottleneck" | "intake_limited" | null`.

---

### Task 1: Extract trace helpers into `cytoscape/trace.js`

Pure move — no behaviour change. These helpers are already module-scope in `NetworkBuilderPage.jsx` and take `cy` explicitly.

**Files:**
- Create: `frontend/src/cytoscape/trace.js`
- Create: `frontend/src/cytoscape/trace.test.js`
- Modify: `frontend/src/pages/NetworkBuilderPage.jsx` (delete lines 158, 195–341; add an import)

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `TRACE_CLASSES: string`
  - `edgeSpec(edge) -> object`
  - `isBidirectionalPipe(edge) -> boolean`
  - `computeTrace(cy, rootId, { flowByEdge?, mode? }) -> { rootId, down: {nodes:Set, edges:Set}, up: {nodes:Set, edges:Set}, hasFlow, requestedMode, mode, flowAmount(edge) }`
  - `paintTrace(cy, trace) -> void`
  - `clearTraceClasses(cy) -> void`
  - `nodeName(cy, id) -> string`
  - `traceNeighbours(cy, trace) -> { sources: [{id,name,flow}], dests: [{id,name,flow}] }`

- [ ] **Step 1: Create `frontend/src/cytoscape/trace.js` by moving the code verbatim**

Cut these from `NetworkBuilderPage.jsx` and paste into the new file, adding `export` to each: `TRACE_CLASSES` (line 158), `edgeSpec` (195), `isBidirectionalPipe` (197–205), `computeTrace` (246–298), `paintTrace` (300–317), `clearTraceClasses` (319), `nodeName` (321–324), `traceNeighbours` (326–341).

Do **not** move `firstNumeric` (207–214), `extractEdgeFlowValue` (216–235), `buildFlowByEdge` (237–244) or `formatTraceFlow` (343+) — those stay in the builder. `buildFlowByEdge` scrapes static edge data and is builder-specific; the Canvas tab supplies real flow instead.

Header comment for the new file:

```js
// Trace: walking the canvas graph upstream and downstream from a root node.
//
// Shared by the Network Builder (topology reachability) and the Simulation
// Canvas tab (delivery paths over a solved day's flows). `computeTrace` has
// always supported a flow-aware "delivered" mode; the builder feeds it edge
// data that is in practice always empty, so only the Canvas tab exercises it
// with real numbers.
```

- [ ] **Step 2: Write the failing test**

Create `frontend/src/cytoscape/trace.test.js`. `computeTrace` only needs a cy-shaped object, so build a fake rather than importing cytoscape.

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { computeTrace } from "./trace.js";

// Minimal cy stand-in: computeTrace only calls getElementById(id).connectedEdges()
// and, on each edge, id() / source() / target() / data().
function fakeCy(edges) {
  const made = edges.map((e) => ({
    id: () => e.id,
    source: () => ({ id: () => e.source }),
    target: () => ({ id: () => e.target }),
    data: (key) => (key === "bidirectional" ? !!e.bidirectional : { bidirectional: !!e.bidirectional }),
  }));
  return {
    getElementById: (id) => ({
      connectedEdges: () => ({
        forEach: (fn) => made.filter((m) => m.source().id() === id || m.target().id() === id).forEach(fn),
      }),
    }),
  };
}

test("computeTrace: walks downstream along edge direction", () => {
  const cy = fakeCy([
    { id: "e1", source: "plant", target: "j1" },
    { id: "e2", source: "j1", target: "gate" },
  ]);
  const trace = computeTrace(cy, "plant");
  assert.deepEqual([...trace.down.nodes].sort(), ["gate", "j1"]);
  assert.equal(trace.up.nodes.size, 0);
});

test("computeTrace: a bidirectional pipe is walkable in both directions", () => {
  const cy = fakeCy([{ id: "e1", source: "a", target: "b", bidirectional: true }]);
  const trace = computeTrace(cy, "b");
  assert.ok(trace.down.nodes.has("a"), "bidirectional edge should extend downstream");
});

test("computeTrace: delivered mode skips edges with no flow", () => {
  const cy = fakeCy([
    { id: "e1", source: "plant", target: "j1" },
    { id: "e2", source: "j1", target: "gate" },
  ]);
  const trace = computeTrace(cy, "plant", { flowByEdge: { e1: 500, e2: 0 }, mode: "delivered" });
  assert.equal(trace.mode, "delivered");
  assert.ok(trace.down.nodes.has("j1"));
  assert.ok(!trace.down.nodes.has("gate"), "zero-flow edge must not be traversed");
});

test("computeTrace: delivered mode falls back to reachable when no flow is supplied", () => {
  const cy = fakeCy([{ id: "e1", source: "a", target: "b" }]);
  const trace = computeTrace(cy, "a", { flowByEdge: {}, mode: "delivered" });
  assert.equal(trace.requestedMode, "delivered");
  assert.equal(trace.mode, "reachable");
  assert.ok(trace.down.nodes.has("b"));
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `cd frontend && npm test`
Expected: FAIL — `Cannot find module './trace.js'` if Step 1 was skipped, otherwise PASS immediately (this is a pure move, so passing here is the correct outcome and confirms the move preserved behaviour).

- [ ] **Step 4: Rewire `NetworkBuilderPage.jsx`**

Add after the existing `import { applyCardIcon } from "../cytoscape/nodeCard";` line (line 59):

```js
import {
  TRACE_CLASSES,
  clearTraceClasses,
  computeTrace,
  edgeSpec,
  isBidirectionalPipe,
  nodeName,
  paintTrace,
  traceNeighbours,
} from "../cytoscape/trace";
```

`TRANSIENT_CANVAS_CLASSES` (line 159) still interpolates `TRACE_CLASSES` and now reads it from the import — leave that line as-is.

- [ ] **Step 5: Verify nothing dangles**

Run each and confirm the only hits are the import line:

```bash
cd frontend && grep -n "const TRACE_CLASSES\|const edgeSpec\|const isBidirectionalPipe\|const computeTrace\|const paintTrace\|const clearTraceClasses\|const nodeName\|const traceNeighbours" src/pages/NetworkBuilderPage.jsx
```
Expected: no output.

```bash
cd frontend && npm run build
```
Expected: build succeeds. This is the real check that no reference was missed — Vite will fail on an undefined identifier.

- [ ] **Step 6: Run tests**

Run: `cd frontend && npm test`
Expected: PASS, including the four new trace tests.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/cytoscape/trace.js frontend/src/cytoscape/trace.test.js frontend/src/pages/NetworkBuilderPage.jsx
git commit -m "refactor: extract canvas trace helpers into cytoscape/trace.js

Pure move out of NetworkBuilderPage so the Simulation Canvas tab can
share one definition of trace semantics. Adds the first tests for
computeTrace, including the delivered-flow mode."
```

---

### Task 2: Extract isolate and graph-hydration helpers

`isolateCollection` in the builder mixes class manipulation with toasts and page state. Only the class manipulation moves; the state stays.

**Files:**
- Create: `frontend/src/cytoscape/isolate.js`
- Create: `frontend/src/cytoscape/graph.js`
- Modify: `frontend/src/pages/NetworkBuilderPage.jsx` (`addGraph` at 394–428; `clearIsolation` at 1628–1636; `isolateCollection` at 1638–1661)

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `ISOLATE_CLASSES: string` — `"nb-isolate-hidden nb-isolate-dim"`
  - `applyIsolation(cy, elements) -> boolean` — returns `false` and does nothing when `elements` is empty; otherwise hides everything else, selects the kept set, fits to it, returns `true`
  - `clearIsolation(cy) -> void`
  - `isIsolated(cy) -> boolean`
  - `addGraph(cy, doc) -> void` — hydrates nodes and edges from a saved network document

- [ ] **Step 1: Create `frontend/src/cytoscape/isolate.js`**

```js
// Isolate: hide everything on the canvas except a chosen set.
//
// Only the Cytoscape class manipulation lives here. Toast copy and the
// "isolation is active" flag stay with each page, because the Builder and the
// Simulation Canvas word them differently.

export const ISOLATE_CLASSES = "nb-isolate-hidden nb-isolate-dim";

export const isIsolated = (cy) => !!cy && cy.elements(".nb-isolate-hidden, .nb-isolate-dim").length > 0;

export function clearIsolation(cy) {
  if (!cy) return;
  cy.elements().removeClass(ISOLATE_CLASSES);
}

/**
 * Keep `elements` (plus the endpoints of any edges in it) and hide the rest.
 * Returns false when there is nothing to isolate, so the caller can decide what
 * to tell the operator.
 */
export function applyIsolation(cy, elements) {
  if (!cy || !elements || !elements.length) return false;

  let keep = elements;
  const edges = elements.filter((el) => el.isEdge());
  if (edges.length) keep = keep.union(edges.connectedNodes());

  const keepIds = new Set(keep.map((el) => el.id()));
  cy.elements().forEach((el) => {
    if (keepIds.has(el.id())) el.removeClass(ISOLATE_CLASSES);
    else el.addClass("nb-isolate-hidden");
  });

  cy.$(":selected").unselect();
  keep.select();
  cy.fit(keep, 80);
  return true;
}
```

- [ ] **Step 2: Create `frontend/src/cytoscape/graph.js`**

Move `addGraph` (lines 394–428) verbatim, adding `export`:

```js
// Hydrating a saved network document onto a Cytoscape instance.
//
// Saved documents come in two shapes: elements exported straight from
// Cytoscape (already carrying `data`), and the flatter shape the backend
// stores. Both are accepted so a canvas saved by any version still loads.

export const addGraph = (cy, g) => {
  cy.batch(() => {
    (g.nodes || []).forEach((n) => {
      const data = n.data
        ? n.data
        : {
            id: n.id,
            assetId: n.assetId,
            category: n.category,
            type: n.type || n.category,
            label: n.label,
            displayLabel: n.label,
            status: n.status || "",
            meta: n.meta || {},
          };
      cy.add({ group: "nodes", data, position: n.position || { x: 0, y: 0 } });
    });
    (g.edges || []).forEach((e) => {
      const data = e.data
        ? e.data
        : {
            id: e.id,
            source: e.source,
            target: e.target,
            kind: e.kind || "pipe",
            assetId: e.assetId || null,
            label: e.label || "",
            displayLabel: e.label || "",
            status: e.status || "",
            meta: e.meta || {},
          };
      cy.add({ group: "edges", data });
    });
  });
};
```

- [ ] **Step 3: Rewire `NetworkBuilderPage.jsx`**

Delete `addGraph` (394–428). Add to the import block:

```js
import { addGraph } from "../cytoscape/graph";
import { applyIsolation, clearIsolation as clearIsolationClasses, isIsolated } from "../cytoscape/isolate";
```

Replace the body of `clearIsolation` (1628–1636) with:

```js
  const clearIsolation = useCallback((message = "Cleared isolate.") => {
    const cy = cyRef.current;
    if (!cy) return;
    clearIsolationClasses(cy);
    setIsolationActive(false);
    setActiveIsolationLabel("");
    setActiveIsolationKey("");
    setToast(message);
  }, []);
```

Replace the body of `isolateCollection` (1638–1661) with:

```js
  const isolateCollection = useCallback((elements, label = "selection", activeKey = "") => {
    const cy = cyRef.current;
    if (!cy) return;
    if (!applyIsolation(cy, elements)) {
      setToast(`No canvas elements found for ${label}.`);
      return;
    }
    setIsolationActive(true);
    setActiveIsolationLabel(label);
    setActiveIsolationKey(activeKey);
    setToast(`Isolated ${label}.`);
    syncSelection();
  }, [syncSelection]);
```

In `handleToggleIsolation` (1671–1684), replace the inline class check with the helper:

```js
    if (isolationActive || isIsolated(cy)) {
```

`handleClearHighlights` (1701) keeps its own `removeClass` call — leave it; it clears several class families at once and reads clearly as-is.

- [ ] **Step 4: Verify nothing dangles**

```bash
cd frontend && grep -n "const addGraph" src/pages/NetworkBuilderPage.jsx && echo "STILL PRESENT — remove it"
cd frontend && npm run build
```
Expected: no `STILL PRESENT` line; build succeeds.

- [ ] **Step 5: Manually verify the builder still works**

Start the app (`cd frontend && npm run dev`), open Network Builder, load a saved network. Confirm: the canvas hydrates; selecting two nodes and pressing **Isolate / Unisolate** hides everything else and fits; pressing it again restores; **Trace HP** from a handover point still paints upstream/downstream.

- [ ] **Step 6: Run tests and commit**

```bash
cd frontend && npm test
git add frontend/src/cytoscape/isolate.js frontend/src/cytoscape/graph.js frontend/src/pages/NetworkBuilderPage.jsx
git commit -m "refactor: extract isolate and graph hydration into cytoscape modules

Splits the Cytoscape class manipulation out of NetworkBuilderPage's
isolate callbacks, leaving toast copy and page state where they belong,
so the Simulation Canvas tab can reuse the behaviour."
```

---

### Task 3: Share the demand-cause labels

`ResultsPanel.jsx:18-23` owns a `CAUSE_LABEL` map that the Canvas detail panel needs too. Move it into `lib/simulationRows.js`, where the other simulation derivations already live, rather than creating a second copy.

**Files:**
- Modify: `frontend/src/lib/simulationRows.js`
- Modify: `frontend/src/lib/simulationRows.test.js`
- Modify: `frontend/src/components/simulation/ResultsPanel.jsx:18-23,145`

**Interfaces:**
- Produces: `causeLabel(cause) -> string` — prose for a `gates[].cause` code, `"—"` for `null`/unknown.

- [ ] **Step 1: Write the failing test**

Append to `frontend/src/lib/simulationRows.test.js`:

```js
test("causeLabel: maps every cause the engine emits", () => {
  assert.equal(causeLabel("isolated"), "Not connected to a producing plant");
  assert.equal(causeLabel("insufficient_capacity"), "Production capacity exhausted");
  assert.equal(causeLabel("transmission_bottleneck"), "Transmission bottleneck");
  assert.equal(causeLabel("intake_limited"), "Gate intake capacity");
});

test("causeLabel: an absent or unknown cause renders as an em dash", () => {
  assert.equal(causeLabel(null), "—");
  assert.equal(causeLabel(undefined), "—");
  assert.equal(causeLabel("something_new"), "—");
});
```

Add `causeLabel` to the existing import at the top of that test file.

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd frontend && npm test`
Expected: FAIL — `causeLabel is not a function` / import error.

- [ ] **Step 3: Implement**

Add to `frontend/src/lib/simulationRows.js`, near `DEMAND_SEVERITY`:

```js
// Prose for the shortage causes the engine attaches to a gate. Kept here rather
// than in a component so the Results table and the Canvas detail panel cannot
// drift into describing the same cause two different ways.
const CAUSE_LABEL = {
  isolated: "Not connected to a producing plant",
  insufficient_capacity: "Production capacity exhausted",
  transmission_bottleneck: "Transmission bottleneck",
  intake_limited: "Gate intake capacity",
};

export const causeLabel = (cause) => CAUSE_LABEL[cause] || "—";
```

- [ ] **Step 4: Rewire `ResultsPanel.jsx`**

Delete the local `CAUSE_LABEL` (lines 18–23). Add `causeLabel` to the existing import from `../../lib/simulationRows`. Change line 145 from `{CAUSE_LABEL[gate.worstDay?.cause] || "—"}` to `{causeLabel(gate.worstDay?.cause)}`.

- [ ] **Step 5: Run tests and commit**

```bash
cd frontend && npm test && npm run build
git add frontend/src/lib/simulationRows.js frontend/src/lib/simulationRows.test.js frontend/src/components/simulation/ResultsPanel.jsx
git commit -m "refactor: move demand cause labels into simulationRows"
```

---

### Task 4: Element state classification (`lib/simulationCanvas.js`)

The pure heart of the overlay. Deliberately corrects two bugs in the SWIIMS reference: an uncapacitated pipe must not divide by 1, and a bottleneck is known from `bindingConstraints` rather than guessed from utilisation.

**Files:**
- Create: `frontend/src/lib/simulationCanvas.js`
- Create: `frontend/src/lib/simulationCanvas.test.js`

**Interfaces:**
- Produces:
  - `EPS: number` (`1e-6`)
  - `edgeState({ flow, capacity, unconstrained, isBottleneck }) -> "idle"|"bottleneck"|"unconstrained"|"high"|"medium"|"low"`
  - `edgeWidth(state, util) -> number`
  - `plantState(plantRow, allocated) -> "no-capacity"|"idle"|"at-capacity"|"partial"`
  - `gateState(gateRow) -> "no-demand"|"met"|"adjusted"|"shortfall"`
  - `pumpState(pumpRow, isBinding) -> "binding"|"offline"|"unconstrained"|"normal"`

- [ ] **Step 1: Write the failing test**

Create `frontend/src/lib/simulationCanvas.test.js`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { edgeState, edgeWidth, gateState, plantState, pumpState } from "./simulationCanvas.js";

test("edgeState: no flow is idle regardless of capacity", () => {
  assert.equal(edgeState({ flow: 0, capacity: 1000 }), "idle");
  assert.equal(edgeState({ flow: 0, capacity: null, unconstrained: true }), "idle");
});

test("edgeState: utilisation buckets sit on the documented boundaries", () => {
  assert.equal(edgeState({ flow: 699, capacity: 1000 }), "low");
  assert.equal(edgeState({ flow: 700, capacity: 1000 }), "medium");
  assert.equal(edgeState({ flow: 899, capacity: 1000 }), "medium");
  assert.equal(edgeState({ flow: 900, capacity: 1000 }), "high");
  assert.equal(edgeState({ flow: 1000, capacity: 1000 }), "high");
});

// The SWIIMS reference computes `capacity || 1`, so any flow at all on a pipe
// with no capacity on record reads as >=90% critical. It must not.
test("edgeState: an unconstrained pipe is never high or bottleneck", () => {
  assert.equal(edgeState({ flow: 5_000_000, capacity: null, unconstrained: true }), "unconstrained");
  assert.equal(edgeState({ flow: 42, capacity: 0 }), "unconstrained");
});

test("edgeState: a binding constraint outranks its utilisation bucket", () => {
  assert.equal(edgeState({ flow: 100, capacity: 1000, isBottleneck: true }), "bottleneck");
});

test("edgeWidth: scales with utilisation and stays inside 2..6", () => {
  assert.equal(edgeWidth("idle", null), 2);
  assert.equal(edgeWidth("unconstrained", null), 3);
  assert.equal(edgeWidth("low", 0.25), 3);
  assert.equal(edgeWidth("high", 1), 6);
  assert.equal(edgeWidth("high", 5), 6, "utilisation over 100% must still clamp at 6");
});

test("plantState: a plant with no capacity on record is distinct from an idle one", () => {
  assert.equal(plantState({ noCapacity: true, available: 0 }, 0), "no-capacity");
  assert.equal(plantState({ noCapacity: false, available: 1000 }, 0), "idle");
});

test("plantState: running at the day's available capacity reads as at-capacity", () => {
  assert.equal(plantState({ available: 1000 }, 1000), "at-capacity");
  assert.equal(plantState({ available: 1000 }, 400), "partial");
});

test("gateState: reflects delivery against the request", () => {
  assert.equal(gateState({ required: 0, delivered: 0, shortage: 0 }), "no-demand");
  assert.equal(gateState({ required: 500, delivered: 500, shortage: 0 }), "met");
  assert.equal(gateState({ required: 500, delivered: 200, shortage: 300 }), "adjusted");
  assert.equal(gateState({ required: 500, delivered: 0, shortage: 500 }), "shortfall");
});

test("pumpState: binding outranks everything else", () => {
  assert.equal(pumpState({ fullOutage: true, unconstrained: false }, true), "binding");
  assert.equal(pumpState({ fullOutage: true }, false), "offline");
  assert.equal(pumpState({ unconstrained: true }, false), "unconstrained");
  assert.equal(pumpState({}, false), "normal");
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd frontend && npm test`
Expected: FAIL — `Cannot find module './simulationCanvas.js'`.

- [ ] **Step 3: Implement**

Create `frontend/src/lib/simulationCanvas.js`:

```js
// Turning a solved dispatch day into canvas paint.
//
// Everything here is pure so it can be tested under `node --test`; the
// Cytoscape side lives in cytoscape/simulationOverlay.js. Follows the
// simulationRows.js precedent: the page fetches, these functions shape, the
// components only render.

export const EPS = 1e-6;

/**
 * Which visual bucket a pipe falls into on one day.
 *
 * Order matters. A pipe named in the day's bindingConstraints is the reason
 * demand could not be met, so it outranks its own utilisation. A pipe with no
 * capacity on record is reported as unconstrained rather than divided by a
 * stand-in denominator — the reference implementation used `capacity || 1`,
 * which made every uncapacitated pipe carrying any flow read as critical.
 */
export function edgeState({ flow = 0, capacity = null, unconstrained = false, isBottleneck = false } = {}) {
  if (!(flow > EPS)) return "idle";
  if (isBottleneck) return "bottleneck";
  if (unconstrained || !(capacity > 0)) return "unconstrained";

  const util = flow / capacity;
  if (util >= 0.9) return "high";
  if (util >= 0.7) return "medium";
  return "low";
}

/** Line width in px: thicker the harder the pipe is worked. */
export function edgeWidth(state, util) {
  if (state === "idle") return 2;
  if (state === "unconstrained") return 3;
  return Math.max(2, Math.min(6, 2 + (util || 0) * 4));
}

/**
 * A plant with no capacity anywhere on record could not be dispatched at all,
 * which is a different fact from a plant the solver chose not to run. The
 * config screen already warns about these; the canvas must not hide them among
 * the idle ones.
 */
export function plantState(plant = {}, allocated = 0) {
  if (plant.noCapacity) return "no-capacity";
  if (!(allocated > EPS)) return "idle";
  if (plant.available > 0 && allocated >= plant.available - EPS) return "at-capacity";
  return "partial";
}

export function gateState(gate = {}) {
  if (!(gate.required > EPS)) return "no-demand";
  if (gate.shortage <= EPS) return "met";
  return gate.delivered > EPS ? "adjusted" : "shortfall";
}

export function pumpState(pump = {}, isBinding = false) {
  if (isBinding) return "binding";
  if (pump.fullOutage) return "offline";
  if (pump.unconstrained) return "unconstrained";
  return "normal";
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd frontend && npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/simulationCanvas.js frontend/src/lib/simulationCanvas.test.js
git commit -m "feat: add element state classification for the simulation canvas

Buckets pipes, plants, gates and pump stations by how a solved day
treated them. Unlike the reference implementation, an uncapacitated
pipe is reported as such rather than divided by a stand-in capacity,
and bottlenecks come from the solver's min-cut rather than a guess."
```

---

### Task 5: Day overlay, staleness and detail derivations

**Files:**
- Modify: `frontend/src/lib/simulationCanvas.js`
- Modify: `frontend/src/lib/simulationCanvas.test.js`

**Interfaces:**
- Consumes: `edgeState`, `edgeWidth`, `plantState`, `gateState`, `pumpState` from Task 4; `causeLabel` from Task 3.
- Produces:
  - `dayOverlay(plan, dayIdx) -> { date, dayIdx, flowByEdge, utilByEdge, edgeStates, edgeWidths, nodeStates, overriddenIds: string[], bottleneckEdgeIds: string[], bottleneckNodeIds: string[], totals: {required,delivered,shortage,cost} } | null`
  - `canvasStaleness(topology, plan) -> { unknownToRun: string[], missingFromCanvas: string[] }`
  - `edgeDetail(plan, dayIdx, edgeId) -> object | null`
  - `nodeDetail(plan, dayIdx, nodeId) -> object | null`
  - `daySummaries(plan) -> [{ dayIdx, date, required, delivered, shortage, satisfactionPct }]`

- [ ] **Step 1: Write the failing test**

Append to `frontend/src/lib/simulationCanvas.test.js`. Add the new names to the existing import.

```js
// A two-day plan: day 0 is served, day 1 has a pipe bottleneck starving a gate.
const PLAN = {
  network: { id: "net1", name: "Test network" },
  from: "2026-08-04",
  to: "2026-08-05",
  pipes: [
    { id: "p1", label: "P1", capacity: 1000, unconstrained: false, peakFlow: 1000, avgFlow: 750, peakUtilisationPct: 100 },
    { id: "p2", label: "P2", capacity: null, unconstrained: true, peakFlow: 200, avgFlow: 150, peakUtilisationPct: null },
  ],
  days: [
    {
      date: "2026-08-04",
      plants: [{ nodeId: "n_plant", assetId: "PL1", name: "Plant 1", base: 2000, maintenanceLoss: 0, outageLoss: 0, available: 2000, noCapacity: false, variableOm: 2.1, variableOmSource: "economics", overridden: false }],
      pumps: [{ nodeId: "n_pump", assetId: "PU1", name: "Pump 1", base: 900, maintenanceLoss: 0, outageLoss: 0, available: 900, limit: 900, unconstrained: false, overridden: false }],
      gates: [{ nodeId: "n_gate", assetId: "HP1", name: "Gate 1", required: 500, delivered: 500, shortage: 0, cause: null, intakeLimited: false, overridden: false }],
      plantOutputs: { n_plant: 500 },
      pipeFlows: { p1: 500, p2: 100 },
      totalRequired: 500, totalDelivered: 500, totalShortage: 0, variableOmCost: 1050, satisfactionPct: 100,
      bindingConstraints: [],
    },
    {
      date: "2026-08-05",
      plants: [{ nodeId: "n_plant", assetId: "PL1", name: "Plant 1", base: 2000, maintenanceLoss: 0, outageLoss: 0, available: 2000, noCapacity: false, variableOm: 2.1, variableOmSource: "economics", overridden: false }],
      pumps: [{ nodeId: "n_pump", assetId: "PU1", name: "Pump 1", base: 900, maintenanceLoss: 0, outageLoss: 0, available: 900, limit: 900, unconstrained: false, overridden: false }],
      gates: [{ nodeId: "n_gate", assetId: "HP1", name: "Gate 1", required: 1500, delivered: 1000, shortage: 500, cause: "transmission_bottleneck", intakeLimited: false, overridden: false }],
      plantOutputs: { n_plant: 1000 },
      pipeFlows: { p1: 1000, p2: 0 },
      totalRequired: 1500, totalDelivered: 1000, totalShortage: 500, variableOmCost: 2100, satisfactionPct: 66.67,
      bindingConstraints: [{ kind: "pipe", label: "P1", id: "p1", assetId: null, flow: 1000, capacity: 1000 }],
    },
  ],
};

test("dayOverlay: indexes the requested day, not the first", () => {
  const overlay = dayOverlay(PLAN, 1);
  assert.equal(overlay.date, "2026-08-05");
  assert.equal(overlay.flowByEdge.p1, 1000);
  assert.equal(overlay.totals.shortage, 500);
});

test("dayOverlay: an out-of-range day index yields null", () => {
  assert.equal(dayOverlay(PLAN, 9), null);
  assert.equal(dayOverlay(null, 0), null);
});

test("dayOverlay: classifies pipes from that day's flows and constraints", () => {
  const quiet = dayOverlay(PLAN, 0);
  assert.equal(quiet.edgeStates.p1, "low", "500 of 1000 is 50%");
  assert.equal(quiet.edgeStates.p2, "unconstrained");

  const short = dayOverlay(PLAN, 1);
  assert.equal(short.edgeStates.p1, "bottleneck");
  assert.equal(short.edgeStates.p2, "idle", "no flow on day 1");
  assert.deepEqual(short.bottleneckEdgeIds, ["p1"]);
});

test("dayOverlay: a pipe with no entry in pipeFlows is idle, not missing", () => {
  const plan = { ...PLAN, days: [{ ...PLAN.days[0], pipeFlows: {} }] };
  const overlay = dayOverlay(plan, 0);
  assert.equal(overlay.edgeStates.p1, "idle");
  assert.equal(overlay.flowByEdge.p1, 0);
});

test("dayOverlay: classifies every canvas node it has a row for", () => {
  const overlay = dayOverlay(PLAN, 1);
  assert.equal(overlay.nodeStates.n_plant, "partial");
  assert.equal(overlay.nodeStates.n_gate, "adjusted");
  assert.equal(overlay.nodeStates.n_pump, "normal");
});

test("dayOverlay: a pump named in bindingConstraints is marked binding", () => {
  const plan = {
    ...PLAN,
    days: [{ ...PLAN.days[1], bindingConstraints: [{ kind: "pump", label: "Pump 1", id: "n_pump", flow: 900, capacity: 900 }] }],
  };
  const overlay = dayOverlay(plan, 0);
  assert.equal(overlay.nodeStates.n_pump, "binding");
  assert.deepEqual(overlay.bottleneckNodeIds, ["n_pump"]);
});

const TOPOLOGY = {
  nodes: [
    { data: { id: "n_plant", category: "plant" } },
    { data: { id: "n_pump", category: "pump" } },
    { data: { id: "n_gate", category: "handover_point" } },
    { data: { id: "n_junction", category: "node" } },
  ],
  edges: [{ data: { id: "p1" } }, { data: { id: "p2" } }],
};

test("canvasStaleness: a canvas matching its run is clean", () => {
  const stale = canvasStaleness(TOPOLOGY, PLAN);
  assert.deepEqual(stale.unknownToRun, []);
  assert.deepEqual(stale.missingFromCanvas, []);
});

test("canvasStaleness: junctions are never reported as unknown", () => {
  // Junctions carry no per-day row by design, so they must not be mistaken for
  // assets added after the run.
  const stale = canvasStaleness(TOPOLOGY, PLAN);
  assert.ok(!stale.unknownToRun.includes("n_junction"));
});

test("canvasStaleness: reports assets and pipes added since the run", () => {
  const topology = {
    nodes: [...TOPOLOGY.nodes, { data: { id: "n_new", category: "plant" } }],
    edges: [...TOPOLOGY.edges, { data: { id: "p_new" } }],
  };
  const stale = canvasStaleness(topology, PLAN);
  assert.deepEqual(stale.unknownToRun.sort(), ["n_new", "p_new"]);
});

test("canvasStaleness: reports elements the run used that the canvas has lost", () => {
  const topology = { nodes: TOPOLOGY.nodes.filter((n) => n.data.id !== "n_gate"), edges: TOPOLOGY.edges };
  const stale = canvasStaleness(topology, PLAN);
  assert.deepEqual(stale.missingFromCanvas, ["n_gate"]);
});

test("edgeDetail: joins the day's flow with the horizon metadata", () => {
  const detail = edgeDetail(PLAN, 1, "p1");
  assert.equal(detail.flow, 1000);
  assert.equal(detail.capacity, 1000);
  assert.equal(detail.utilisationPct, 100);
  assert.equal(detail.isBottleneck, true);
  assert.equal(detail.peakUtilisationPct, 100);
  assert.equal(detail.inRun, true);
});

test("edgeDetail: an unconstrained pipe reports no utilisation rather than a fake one", () => {
  const detail = edgeDetail(PLAN, 0, "p2");
  assert.equal(detail.capacity, null);
  assert.equal(detail.unconstrained, true);
  assert.equal(detail.utilisationPct, null);
});

test("edgeDetail: an edge the run never saw is flagged, not fabricated", () => {
  const detail = edgeDetail(PLAN, 0, "p_unknown");
  assert.equal(detail.inRun, false);
});

test("nodeDetail: a gate carries prose for its shortage cause", () => {
  const detail = nodeDetail(PLAN, 1, "n_gate");
  assert.equal(detail.kind, "gate");
  assert.equal(detail.shortage, 500);
  assert.equal(detail.causeLabel, "Transmission bottleneck");
});

test("nodeDetail: a plant carries its allocation, provenance and day cost", () => {
  const detail = nodeDetail(PLAN, 1, "n_plant");
  assert.equal(detail.kind, "plant");
  assert.equal(detail.allocated, 1000);
  assert.equal(detail.variableOmSource, "economics");
  assert.equal(detail.costSar, 2100);
});

test("nodeDetail: a node the run never saw is flagged", () => {
  assert.equal(nodeDetail(PLAN, 0, "n_junction").inRun, false);
});

test("daySummaries: one entry per day, in horizon order", () => {
  const summaries = daySummaries(PLAN);
  assert.equal(summaries.length, 2);
  assert.deepEqual(summaries[0], { dayIdx: 0, date: "2026-08-04", required: 500, delivered: 500, shortage: 0, satisfactionPct: 100 });
  assert.equal(summaries[1].shortage, 500);
});
```

Add this test too — the overridden set is what lets the canvas mark operator
what-ifs, and it cannot be read off the Cytoscape node because the override
lives in the plan, not in the saved network document:

```js
test("dayOverlay: collects the nodes carrying a per-run override", () => {
  const plan = {
    ...PLAN,
    days: [{ ...PLAN.days[0], gates: [{ ...PLAN.days[0].gates[0], overridden: true }] }],
  };
  assert.deepEqual(dayOverlay(plan, 0).overriddenIds, ["n_gate"]);
  assert.deepEqual(dayOverlay(PLAN, 0).overriddenIds, []);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd frontend && npm test`
Expected: FAIL — `dayOverlay is not a function`.

- [ ] **Step 3: Implement**

Append to `frontend/src/lib/simulationCanvas.js`:

```js
import { causeLabel } from "./simulationRows.js";

const round = (x) => Math.round(x * 100) / 100;

// Canvas categories that the engine produces a per-day row for. Junctions and
// annotations legitimately have none, so they must never be mistaken for
// elements added to the canvas after the run.
const TRACKED_CATEGORIES = new Set(["plant", "pump", "handover_point"]);

const elData = (el) => el?.data || el || {};

/** Split a day's binding constraints into edge ids and node ids. */
function bottleneckIds(day) {
  const edges = new Set();
  const nodes = new Set();
  for (const c of day.bindingConstraints || []) {
    if (!c.id) continue;
    if (c.kind === "pipe") edges.add(c.id);
    else nodes.add(c.id);
  }
  return { edges, nodes };
}

/**
 * Everything the canvas needs to paint one day. Returns null for a day index
 * outside the horizon so the caller can render an empty state rather than
 * guessing.
 */
export function dayOverlay(plan, dayIdx = 0) {
  const day = plan?.days?.[dayIdx];
  if (!day) return null;

  const { edges: bnEdges, nodes: bnNodes } = bottleneckIds(day);

  const flowByEdge = {};
  const utilByEdge = {};
  const edgeStates = {};
  const edgeWidths = {};
  for (const pipe of plan.pipes || []) {
    const flow = day.pipeFlows?.[pipe.id] || 0;
    const util = pipe.capacity > 0 ? flow / pipe.capacity : null;
    const state = edgeState({
      flow,
      capacity: pipe.capacity,
      unconstrained: pipe.unconstrained,
      isBottleneck: bnEdges.has(pipe.id),
    });
    flowByEdge[pipe.id] = flow;
    utilByEdge[pipe.id] = util;
    edgeStates[pipe.id] = state;
    edgeWidths[pipe.id] = edgeWidth(state, util);
  }

  const nodeStates = {};
  // An override is operator input rather than portal data, so it is surfaced
  // wherever it applies. It lives on the plan row, not on the saved canvas, so
  // it has to be collected here rather than read off the Cytoscape node.
  const overriddenIds = [];
  for (const plant of day.plants || []) {
    nodeStates[plant.nodeId] = plantState(plant, day.plantOutputs?.[plant.nodeId] || 0);
    if (plant.overridden) overriddenIds.push(plant.nodeId);
  }
  for (const pump of day.pumps || []) {
    nodeStates[pump.nodeId] = pumpState(pump, bnNodes.has(pump.nodeId));
    if (pump.overridden) overriddenIds.push(pump.nodeId);
  }
  for (const gate of day.gates || []) {
    nodeStates[gate.nodeId] = gateState(gate);
    if (gate.overridden) overriddenIds.push(gate.nodeId);
  }

  return {
    date: day.date,
    dayIdx,
    flowByEdge,
    utilByEdge,
    edgeStates,
    edgeWidths,
    nodeStates,
    overriddenIds,
    bottleneckEdgeIds: [...bnEdges],
    bottleneckNodeIds: [...bnNodes],
    totals: {
      required: day.totalRequired,
      delivered: day.totalDelivered,
      shortage: day.totalShortage,
      cost: day.variableOmCost,
    },
  };
}

/** Every canvas element id the run produced a result for. */
function planElementIds(plan) {
  const nodes = new Set();
  const edges = new Set((plan?.pipes || []).map((p) => p.id));
  for (const day of plan?.days || []) {
    for (const key of ["plants", "pumps", "gates"]) {
      for (const row of day[key] || []) nodes.add(row.nodeId);
    }
  }
  return { nodes, edges };
}

/**
 * How far the saved canvas has drifted from the run being displayed.
 *
 * A network can be edited after a plan is produced, so the canvas is not
 * guaranteed to match. Rather than paint stale elements with someone else's
 * numbers, name them in both directions and let the UI say so.
 */
export function canvasStaleness(topology, plan) {
  const { nodes: planNodes, edges: planEdges } = planElementIds(plan);

  const canvasNodes = (topology?.nodes || []).map(elData);
  const canvasEdges = (topology?.edges || []).map(elData);

  const unknownToRun = [
    ...canvasNodes
      .filter((n) => TRACKED_CATEGORIES.has(n.category || n.type) && !planNodes.has(n.id))
      .map((n) => n.id),
    ...canvasEdges.filter((e) => !planEdges.has(e.id)).map((e) => e.id),
  ];

  const canvasIds = new Set([...canvasNodes.map((n) => n.id), ...canvasEdges.map((e) => e.id)]);
  const missingFromCanvas = [...planNodes, ...planEdges].filter((id) => !canvasIds.has(id));

  return { unknownToRun, missingFromCanvas };
}

export function edgeDetail(plan, dayIdx, edgeId) {
  const day = plan?.days?.[dayIdx];
  if (!day) return null;

  const pipe = (plan.pipes || []).find((p) => p.id === edgeId);
  if (!pipe) return { id: edgeId, inRun: false };

  const flow = day.pipeFlows?.[edgeId] || 0;
  const { edges: bnEdges } = bottleneckIds(day);
  const util = pipe.capacity > 0 ? flow / pipe.capacity : null;

  return {
    id: edgeId,
    inRun: true,
    label: pipe.label,
    source: pipe.source,
    target: pipe.target,
    bidirectional: pipe.bidirectional,
    flow: round(flow),
    capacity: pipe.capacity,
    unconstrained: pipe.unconstrained,
    utilisationPct: util == null ? null : round(util * 100),
    isBottleneck: bnEdges.has(edgeId),
    peakFlow: pipe.peakFlow,
    avgFlow: pipe.avgFlow,
    peakUtilisationPct: pipe.peakUtilisationPct,
  };
}

export function nodeDetail(plan, dayIdx, nodeId) {
  const day = plan?.days?.[dayIdx];
  if (!day) return null;

  const { nodes: bnNodes } = bottleneckIds(day);
  const isBinding = bnNodes.has(nodeId);

  const plant = (day.plants || []).find((p) => p.nodeId === nodeId);
  if (plant) {
    const allocated = day.plantOutputs?.[nodeId] || 0;
    return {
      kind: "plant",
      inRun: true,
      isBinding,
      ...plant,
      allocated: round(allocated),
      costSar: round(allocated * plant.variableOm),
      state: plantState(plant, allocated),
    };
  }

  const pump = (day.pumps || []).find((p) => p.nodeId === nodeId);
  if (pump) {
    return { kind: "pump", inRun: true, isBinding, ...pump, state: pumpState(pump, isBinding) };
  }

  const gate = (day.gates || []).find((g) => g.nodeId === nodeId);
  if (gate) {
    return {
      kind: "gate",
      inRun: true,
      isBinding,
      ...gate,
      causeLabel: causeLabel(gate.cause),
      state: gateState(gate),
    };
  }

  return { kind: null, inRun: false, id: nodeId };
}

/** One row per day for the scrubber's shortage strip. */
export function daySummaries(plan) {
  return (plan?.days || []).map((day, dayIdx) => ({
    dayIdx,
    date: day.date,
    required: day.totalRequired,
    delivered: day.totalDelivered,
    shortage: day.totalShortage,
    satisfactionPct: day.satisfactionPct,
  }));
}
```

Move the `import { causeLabel }` line to the top of the file with the other imports — it is shown inline above only to keep the diff readable.

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd frontend && npm test`
Expected: PASS, all ~20 `simulationCanvas` tests.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/simulationCanvas.js frontend/src/lib/simulationCanvas.test.js
git commit -m "feat: derive per-day canvas overlay, staleness and element detail

dayOverlay turns one solved day into paint instructions; canvasStaleness
diffs the saved canvas against the run in both directions so a network
edited after a run is never silently painted with stale numbers."
```

---

### Task 6: Overlay stylesheet and the Cytoscape adapter

**Files:**
- Modify: `frontend/src/cytoscape/buildCyStyle.js` (append to the array returned by `buildCyStyle()`, before the closing `];`)
- Create: `frontend/src/cytoscape/simulationOverlay.js`

**Interfaces:**
- Consumes: `dayOverlay`'s return shape from Task 5.
- Produces:
  - `applyOverlay(cy, overlay, { staleIds }) -> void`
  - `clearOverlay(cy) -> void`
  - `startFlowAnimation(cy, flowByEdge) -> handle`
  - `stopFlowAnimation(handle, cy) -> void`

- [ ] **Step 1: Add the simulation selectors to `buildCyStyle.js`**

Append inside the returned array. Keep every colour here — nothing in the adapter hard-codes a colour.

```js
    // ── Simulation overlay ───────────────────────────────────────────────
    // Applied by cytoscape/simulationOverlay.js on the Simulation Canvas tab.
    // Bucket classes carry colour; width is data-driven because it varies
    // continuously with utilisation. Only line-dash-offset is written inline,
    // since it changes ~16x/second to animate flow.
    { selector: "edge[simWidth]", style: { width: "data(simWidth)" } },
    {
      selector: "edge.sim-edge--idle",
      style: { "line-color": "#6b7280", "target-arrow-color": "#6b7280", "line-style": "solid", opacity: 0.55 },
    },
    {
      selector: "edge.sim-edge--low, edge.sim-edge--unconstrained",
      style: {
        "line-color": "#22c55e", "target-arrow-color": "#22c55e",
        "line-style": "dashed", "line-dash-pattern": [10, 6],
      },
    },
    {
      selector: "edge.sim-edge--medium",
      style: {
        "line-color": "#f59e0b", "target-arrow-color": "#f59e0b",
        "line-style": "dashed", "line-dash-pattern": [10, 6],
      },
    },
    {
      selector: "edge.sim-edge--high",
      style: {
        "line-color": "#7c3aed", "target-arrow-color": "#7c3aed",
        "line-style": "dashed", "line-dash-pattern": [10, 6],
      },
    },
    {
      selector: "edge.sim-edge--bottleneck",
      style: {
        "line-color": "#dc2626", "target-arrow-color": "#dc2626",
        "line-style": "dashed", "line-dash-pattern": [10, 6], "z-index": 950,
      },
    },
    // Plants: how hard the solver ran them.
    { selector: "node.sim-plant--idle", style: { "border-color": "#cbd5e1", "border-width": 2 } },
    { selector: "node.sim-plant--partial", style: { "border-color": "#22c55e", "border-width": 3 } },
    { selector: "node.sim-plant--at-capacity", style: { "border-color": "#7c3aed", "border-width": 4 } },
    {
      selector: "node.sim-plant--no-capacity",
      style: { "border-color": "#94a3b8", "border-width": 3, "border-style": "dotted", opacity: 0.7 },
    },
    // City gates: whether they were served.
    { selector: "node.sim-gate--no-demand", style: { "border-color": "#cbd5e1", "border-width": 2, opacity: 0.7 } },
    { selector: "node.sim-gate--met", style: { "border-color": "#22c55e", "border-width": 3 } },
    { selector: "node.sim-gate--adjusted", style: { "border-color": "#f59e0b", "border-width": 4 } },
    {
      selector: "node.sim-gate--shortfall",
      style: {
        "border-color": "#dc2626", "border-width": 4,
        "overlay-color": "#dc2626", "overlay-padding": 5, "overlay-opacity": 0.12,
      },
    },
    // Pump stations.
    { selector: "node.sim-pump--normal", style: { "border-color": "#cbd5e1", "border-width": 2 } },
    { selector: "node.sim-pump--unconstrained", style: { "border-color": "#94a3b8", "border-width": 2, "border-style": "dotted" } },
    { selector: "node.sim-pump--offline", style: { "border-color": "#94a3b8", "border-width": 3, "border-style": "dashed", opacity: 0.6 } },
    {
      selector: "node.sim-pump--binding",
      style: {
        "border-color": "#dc2626", "border-width": 4,
        "overlay-color": "#dc2626", "overlay-padding": 5, "overlay-opacity": 0.12,
      },
    },
    // An element the displayed run never saw, because the canvas was edited
    // after the plan was produced.
    { selector: "edge.sim-stale", style: { opacity: 0.25, "line-style": "dotted", width: 1.5 } },
    { selector: "node.sim-stale", style: { opacity: 0.25, "border-style": "dotted" } },
    // A per-run override is operator input, not portal data — always visible.
    { selector: "node.sim-overridden", style: { "background-color": "#fffbeb" } },
```

- [ ] **Step 2: Create `frontend/src/cytoscape/simulationOverlay.js`**

```js
// Painting a solved dispatch day onto a Cytoscape instance.
//
// Deliberately thin: every decision about *which* bucket an element is in was
// made in lib/simulationCanvas.js, and every colour lives in buildCyStyle.js.
// This file only moves those decisions onto elements, so the whole overlay can
// be lifted again with one clearOverlay call.

const DASH_INTERVAL_MS = 60;
const DASH_STEP = 2;

/** Remove every trace of a previous overlay. */
export function clearOverlay(cy) {
  if (!cy) return;
  cy.batch(() => {
    cy.elements().forEach((el) => {
      const sim = el.classes().filter((cls) => cls.startsWith("sim-"));
      if (sim.length) el.removeClass(sim.join(" "));
      el.removeData("simFlow simUtil simWidth");
    });
  });
  cy.edges().removeStyle("line-dash-offset");
}

/**
 * Apply one day's overlay. Elements the run never saw are marked stale rather
 * than left carrying the previous day's paint.
 */
export function applyOverlay(cy, overlay, { staleIds = [] } = {}) {
  if (!cy || !overlay) return;
  clearOverlay(cy);

  const stale = new Set(staleIds);
  const overridden = new Set(overlay.overriddenIds || []);

  cy.batch(() => {
    cy.edges().forEach((edge) => {
      const id = edge.id();
      const state = overlay.edgeStates[id];
      if (stale.has(id) || !state) {
        edge.addClass("sim-stale");
        return;
      }
      edge.data("simFlow", overlay.flowByEdge[id] || 0);
      edge.data("simUtil", overlay.utilByEdge[id]);
      edge.data("simWidth", overlay.edgeWidths[id]);
      edge.addClass(`sim-edge--${state}`);
    });

    cy.nodes().forEach((node) => {
      const id = node.id();
      if (stale.has(id)) {
        node.addClass("sim-stale");
        return;
      }
      const state = overlay.nodeStates[id];
      // Junctions, notes and group boxes have no per-day result and keep their
      // Network Builder styling.
      if (!state) return;

      const category = node.data("category") || node.data("type");
      const prefix = category === "plant" ? "sim-plant" : category === "pump" ? "sim-pump" : "sim-gate";
      node.addClass(`${prefix}--${state}`);
      if (overridden.has(id)) node.addClass("sim-overridden");
    });
  });
}

/**
 * The moving-flow effect: shift the dash offset on every flowing pipe.
 * Returns a handle for stopFlowAnimation.
 */
export function startFlowAnimation(cy, flowByEdge = {}) {
  if (!cy) return null;
  let offset = 0;
  return setInterval(() => {
    offset -= DASH_STEP;
    cy.batch(() => {
      cy.edges().forEach((edge) => {
        if ((flowByEdge[edge.id()] || 0) > 0) edge.style("line-dash-offset", offset);
      });
    });
  }, DASH_INTERVAL_MS);
}

export function stopFlowAnimation(handle, cy) {
  if (handle) clearInterval(handle);
  if (cy) cy.edges().removeStyle("line-dash-offset");
}
```

- [ ] **Step 3: Verify it builds**

Run: `cd frontend && npm run build && npm test`
Expected: both succeed. Nothing imports the adapter yet, so this only proves it parses.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/cytoscape/buildCyStyle.js frontend/src/cytoscape/simulationOverlay.js
git commit -m "feat: add simulation overlay stylesheet and cytoscape adapter"
```

---

### Task 7: Canvas tab shell — mount, hydrate, staleness

Deliverable: the Canvas tab renders the plan's network. No overlay yet.

**Files:**
- Create: `frontend/src/components/simulation/CanvasPanel.jsx`
- Create: `frontend/src/components/simulation/CanvasPanel.css`
- Modify: `frontend/src/pages/SimulationConfigPage.jsx:17-21` (TABS) and the tab render block at 330-342

**Interfaces:**
- Consumes: `addGraph` (Task 2), `canvasStaleness` (Task 5), `buildCyStyle`, `applyCardIcon`, `fetchNetwork`.
- Produces: `<CanvasPanel plan={plan} />` — default export.

- [ ] **Step 1: Create `CanvasPanel.jsx`**

```jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import cytoscape from "cytoscape";
import { buildCyStyle } from "../../cytoscape/buildCyStyle";
import { applyCardIcon } from "../../cytoscape/nodeCard";
import { addGraph } from "../../cytoscape/graph";
import { canvasStaleness } from "../../lib/simulationCanvas";
import { fetchNetwork } from "../../api/networks";
import "./CanvasPanel.css";

export default function CanvasPanel({ plan }) {
  const containerRef = useRef(null);
  const cyRef = useRef(null);

  const [topology, setTopology] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [cyReady, setCyReady] = useState(false);

  // ── Mount the instance once ───────────────────────────────────────────────
  useEffect(() => {
    const cy = cytoscape({
      container: containerRef.current,
      style: buildCyStyle(),
      layout: { name: "preset" },
      minZoom: 0.05,
      maxZoom: 4,
      boxSelectionEnabled: true,
      wheelSensitivity: 0.2,
      // Read-only: positions come from the saved canvas and stay there.
      autoungrabify: true,
    });
    cyRef.current = cy;
    setCyReady(true);

    return () => {
      cy.destroy();
      cyRef.current = null;
      setCyReady(false);
    };
  }, []);

  // ── Fetch the topology the plan ran against ───────────────────────────────
  useEffect(() => {
    const networkId = plan?.network?.id;
    if (!networkId) {
      setTopology(null);
      return undefined;
    }
    let cancelled = false;
    setLoadError(null);
    fetchNetwork(networkId)
      .then((doc) => !cancelled && setTopology(doc))
      .catch(() => {
        if (!cancelled) {
          setTopology(null);
          setLoadError("The network this plan ran against is no longer available.");
        }
      });
    return () => { cancelled = true; };
  }, [plan?.network?.id]);

  // ── Hydrate ───────────────────────────────────────────────────────────────
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy || !cyReady || !topology) return;
    cy.elements().remove();
    addGraph(cy, topology);
    cy.nodes().forEach(applyCardIcon);
    cy.fit(undefined, 48);
  }, [topology, cyReady]);

  const stale = useMemo(
    () => (topology ? canvasStaleness(topology, plan) : { unknownToRun: [], missingFromCanvas: [] }),
    [topology, plan],
  );

  const emptyRun = plan?.kpis?.totalRequiredM3 === 0;

  return (
    <section className="simcanvas">
      {loadError && <div className="metric__notice metric__notice--error">{loadError}</div>}

      {stale.unknownToRun.length > 0 && (
        <div className="metric__notice metric__notice--warn">
          {stale.unknownToRun.length} element(s) on this canvas were added after the run and carry no
          results. They are shown dimmed. Re-run the simulation to include them.
        </div>
      )}
      {stale.missingFromCanvas.length > 0 && (
        <div className="metric__notice metric__notice--warn">
          {stale.missingFromCanvas.length} element(s) this run used are no longer on the canvas.
        </div>
      )}
      {emptyRun && (
        <div className="metric__notice">
          This run had no demand to dispatch, so every pipe shows as idle. See the Configuration tab
          for why.
        </div>
      )}

      <div className="simcanvas__stage">
        <div ref={containerRef} className="simcanvas__cy" />
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Create `CanvasPanel.css`**

Match the surrounding panels — check `ResultsPanel.css` for the `sheet`/`metric__notice` idiom already in use and stay consistent with it.

```css
.simcanvas {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.simcanvas__stage {
  position: relative;
  height: clamp(420px, 62vh, 760px);
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  background: #f8fafc;
  overflow: hidden;
}

.simcanvas__cy {
  position: absolute;
  inset: 0;
}
```

- [ ] **Step 3: Wire the tab into `SimulationConfigPage.jsx`**

Add the import beside the other panel imports:

```js
import CanvasPanel from "../components/simulation/CanvasPanel";
```

Extend `TABS` (line 17):

```js
const TABS = [
  { key: "configuration", label: "Configuration" },
  { key: "results", label: "Results" },
  { key: "decisions", label: "Decisions" },
  { key: "canvas", label: "Canvas" },
];
```

Add after the `tab === "decisions"` block (line 334-342):

```jsx
              {tab === "canvas" && <CanvasPanel plan={plan} />}
```

- [ ] **Step 4: Verify in the app**

Start the backend and `cd frontend && npm run dev`. Open a simulation config that has a plan, click **Canvas**. Expected: the network draws with node cards and pipes, fitted to the frame; pan and zoom work; dragging a node does nothing (read-only).

- [ ] **Step 5: Commit**

```bash
cd frontend && npm test && npm run build
git add frontend/src/components/simulation/CanvasPanel.jsx frontend/src/components/simulation/CanvasPanel.css frontend/src/pages/SimulationConfigPage.jsx
git commit -m "feat: add Canvas tab shell to the Simulation Config page

Renders the network a plan ran against, and warns when the saved canvas
has drifted from the run being displayed."
```

---

### Task 8: Paint the overlay and animate flow

**Files:**
- Modify: `frontend/src/components/simulation/CanvasPanel.jsx`
- Modify: `frontend/src/components/simulation/CanvasPanel.css`

**Interfaces:**
- Consumes: `dayOverlay` (Task 5), `applyOverlay`/`clearOverlay`/`startFlowAnimation`/`stopFlowAnimation` (Task 6).
- Produces: internal `dayIdx` state and `overlay` memo that Tasks 9–12 read.

- [ ] **Step 1: Add overlay state and effects to `CanvasPanel.jsx`**

Add imports:

```js
import { applyOverlay, clearOverlay, startFlowAnimation, stopFlowAnimation } from "../../cytoscape/simulationOverlay";
import { canvasStaleness, dayOverlay } from "../../lib/simulationCanvas";
```

Add state beside the existing state:

```js
  const [dayIdx, setDayIdx] = useState(0);
  const [animate, setAnimate] = useState(true);
  const animationRef = useRef(null);
```

Reset the day whenever a different plan is shown, so a re-run never lands on a day index the new horizon does not have:

```js
  useEffect(() => { setDayIdx(0); }, [plan?.id]);
```

Add the overlay memo and the two effects, after the `stale` memo:

```js
  const overlay = useMemo(() => dayOverlay(plan, dayIdx), [plan, dayIdx]);

  // Paint. Hydration must have happened first, so this depends on `topology`.
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy || !cyReady || !topology) return;
    if (!overlay) {
      clearOverlay(cy);
      return;
    }
    applyOverlay(cy, overlay, { staleIds: stale.unknownToRun });
  }, [overlay, stale, topology, cyReady]);

  // Animate separately from painting, so toggling the animation off does not
  // repaint and toggling days does not restart from a jarring offset.
  useEffect(() => {
    const cy = cyRef.current;
    stopFlowAnimation(animationRef.current, cy);
    animationRef.current = null;
    if (!cy || !cyReady || !animate || !overlay) return undefined;
    animationRef.current = startFlowAnimation(cy, overlay.flowByEdge);
    return () => {
      stopFlowAnimation(animationRef.current, cyRef.current);
      animationRef.current = null;
    };
  }, [animate, overlay, cyReady]);
```

- [ ] **Step 2: Add the legend**

Add state `const [showLegend, setShowLegend] = useState(true);` and render inside `.simcanvas__stage`, after the `.simcanvas__cy` div:

```jsx
        {showLegend && (
          <div className="simcanvas__legend">
            <span className="simcanvas__legend-title">Pipe utilisation</span>
            {[
              ["low", "Below 70%"],
              ["medium", "70–90%"],
              ["high", "90%+"],
              ["bottleneck", "Binding constraint"],
              ["unconstrained", "No capacity on record"],
              ["idle", "No flow"],
            ].map(([key, label]) => (
              <span key={key} className="simcanvas__legend-row">
                <i className={`simcanvas__swatch simcanvas__swatch--${key}`} />
                {label}
              </span>
            ))}
          </div>
        )}
```

- [ ] **Step 3: Add the legend styles to `CanvasPanel.css`**

```css
.simcanvas__legend {
  position: absolute;
  right: 12px;
  bottom: 12px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 10px 12px;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.94);
  box-shadow: 0 2px 8px rgba(15, 23, 42, 0.12);
  font-size: 11px;
  color: #475569;
}

.simcanvas__legend-title {
  font-weight: 600;
  color: #1e293b;
  margin-bottom: 2px;
}

.simcanvas__legend-row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.simcanvas__swatch {
  width: 18px;
  height: 3px;
  border-radius: 2px;
  background: #6b7280;
}

.simcanvas__swatch--low { background: #22c55e; }
.simcanvas__swatch--medium { background: #f59e0b; }
.simcanvas__swatch--high { background: #7c3aed; }
.simcanvas__swatch--bottleneck { background: #dc2626; }
.simcanvas__swatch--unconstrained { background: repeating-linear-gradient(90deg, #22c55e 0 6px, transparent 6px 10px); }
.simcanvas__swatch--idle { background: #6b7280; }
```

- [ ] **Step 4: Verify in the app**

Reload the Canvas tab on a plan with flow. Expected: pipes carrying flow are coloured and their dashes crawl; idle pipes are solid grey; a gate with a shortfall has a red border; the legend sits bottom-right. Switch to another tab and back — confirm no duplicate animation (the dashes should not speed up, which is what a leaked interval would look like).

- [ ] **Step 5: Commit**

```bash
cd frontend && npm test && npm run build
git add frontend/src/components/simulation/CanvasPanel.jsx frontend/src/components/simulation/CanvasPanel.css
git commit -m "feat: paint solved flows onto the simulation canvas

Colours and animates pipes by utilisation, tints assets by outcome, and
marks binding constraints from the solver's min-cut."
```

---

### Task 9: Day scrubber

**Files:**
- Create: `frontend/src/components/simulation/CanvasDayScrubber.jsx`
- Modify: `frontend/src/components/simulation/CanvasPanel.jsx`
- Modify: `frontend/src/components/simulation/CanvasPanel.css`

**Interfaces:**
- Consumes: `daySummaries(plan)` (Task 5); `dayIdx` / `setDayIdx` from `CanvasPanel`.
- Produces: `<CanvasDayScrubber summaries dayIdx onChange />` — default export.

- [ ] **Step 1: Create `CanvasDayScrubber.jsx`**

```jsx
import React, { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Pause, Play } from "lucide-react";

const nf = new Intl.NumberFormat("en-US");
const fmt = (v) => (v == null ? "—" : nf.format(Math.round(v)));
const STEP_MS = 700;

export default function CanvasDayScrubber({ summaries, dayIdx, onChange }) {
  const [playing, setPlaying] = useState(false);
  const timerRef = useRef(null);

  const last = summaries.length - 1;
  const current = summaries[dayIdx];
  const worstShortage = Math.max(0, ...summaries.map((s) => s.shortage || 0));

  // Stepping lives in an effect keyed on dayIdx so the timer always sees the
  // current day, and stops itself at the end of the horizon.
  useEffect(() => {
    if (!playing) return undefined;
    if (dayIdx >= last) {
      setPlaying(false);
      return undefined;
    }
    timerRef.current = setTimeout(() => onChange(dayIdx + 1), STEP_MS);
    return () => clearTimeout(timerRef.current);
  }, [playing, dayIdx, last, onChange]);

  if (!current) return null;

  return (
    <div className="simscrub">
      <div className="simscrub__controls">
        <button type="button" className="simscrub__btn" title="Previous day"
          disabled={dayIdx <= 0} onClick={() => onChange(dayIdx - 1)}>
          <ChevronLeft size={14} />
        </button>
        <button type="button" className="simscrub__btn" title={playing ? "Pause" : "Play the horizon"}
          onClick={() => setPlaying((v) => !v)}>
          {playing ? <Pause size={14} /> : <Play size={14} />}
        </button>
        <button type="button" className="simscrub__btn" title="Next day"
          disabled={dayIdx >= last} onClick={() => onChange(dayIdx + 1)}>
          <ChevronRight size={14} />
        </button>
      </div>

      <div className="simscrub__track">
        <div className="simscrub__bars">
          {summaries.map((s) => (
            <button
              key={s.date}
              type="button"
              title={`${s.date} — ${fmt(s.shortage)} m³ short`}
              className={`simscrub__bar${s.dayIdx === dayIdx ? " simscrub__bar--active" : ""}`}
              style={{ "--fill": worstShortage > 0 ? `${(s.shortage / worstShortage) * 100}%` : "0%" }}
              onClick={() => onChange(s.dayIdx)}
            />
          ))}
        </div>
        <input
          type="range"
          className="simscrub__range"
          min={0}
          max={last}
          step={1}
          value={dayIdx}
          onChange={(e) => onChange(Number(e.target.value))}
          aria-label="Selected day"
        />
      </div>

      <div className="simscrub__readout">
        <strong>{current.date}</strong>
        <span>Day {dayIdx + 1} of {summaries.length}</span>
        <span>{fmt(current.delivered)} / {fmt(current.required)} m³</span>
        <span className={current.shortage > 0 ? "simscrub__short" : ""}>
          {current.shortage > 0 ? `${fmt(current.shortage)} m³ short` : "Fully served"}
        </span>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Render it from `CanvasPanel.jsx`**

Add the imports:

```js
import CanvasDayScrubber from "./CanvasDayScrubber";
import { canvasStaleness, dayOverlay, daySummaries } from "../../lib/simulationCanvas";
```

Add the memo beside the others:

```js
  const summaries = useMemo(() => daySummaries(plan), [plan]);
```

Render immediately after the closing `</div>` of `.simcanvas__stage`:

```jsx
      <CanvasDayScrubber summaries={summaries} dayIdx={dayIdx} onChange={setDayIdx} />
```

- [ ] **Step 3: Add scrubber styles to `CanvasPanel.css`**

```css
.simscrub {
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: 12px;
  padding: 8px 12px;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  background: #ffffff;
}

.simscrub__controls { display: flex; gap: 4px; }

.simscrub__btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  background: #ffffff;
  color: #475569;
  cursor: pointer;
}

.simscrub__btn:disabled { opacity: 0.4; cursor: default; }
.simscrub__btn:not(:disabled):hover { background: #f1f5f9; }

.simscrub__track { display: flex; flex-direction: column; gap: 2px; }

.simscrub__bars { display: flex; gap: 2px; height: 18px; align-items: flex-end; }

.simscrub__bar {
  flex: 1;
  height: 100%;
  padding: 0;
  border: 0;
  border-radius: 2px 2px 0 0;
  background: linear-gradient(to top, #dc2626 var(--fill), #e2e8f0 var(--fill));
  cursor: pointer;
}

.simscrub__bar--active { outline: 2px solid #1a4a8a; outline-offset: 1px; }

.simscrub__range { width: 100%; accent-color: #1a4a8a; }

.simscrub__readout {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 11px;
  color: #475569;
  white-space: nowrap;
}

.simscrub__short { color: #dc2626; font-weight: 600; }
```

- [ ] **Step 4: Verify in the app**

Open a plan spanning several days with at least one shortage. Expected: dragging the slider repaints the canvas per day; the red bars mark the short days; clicking a bar jumps to it; Play steps forward and stops on the last day; leaving the tab mid-play does not leave a timer running (the day should not advance when you return).

- [ ] **Step 5: Commit**

```bash
cd frontend && npm test && npm run build
git add frontend/src/components/simulation/CanvasDayScrubber.jsx frontend/src/components/simulation/CanvasPanel.jsx frontend/src/components/simulation/CanvasPanel.css
git commit -m "feat: add a day scrubber to the simulation canvas"
```

---

### Task 10: Contextual toolbar — view and overlay controls

Trace and isolate are added in Task 11; this task delivers the bar and its non-analysis buttons.

**Files:**
- Create: `frontend/src/components/simulation/CanvasToolbar.jsx`
- Modify: `frontend/src/components/simulation/CanvasPanel.jsx`
- Modify: `frontend/src/components/simulation/CanvasPanel.css`

**Interfaces:**
- Produces: `<CanvasToolbar groups />` — default export. `groups` is `[{ key, items: [{ key, label, icon, title, onClick, active, disabled }] }]`, rendered as labelled button clusters.

- [ ] **Step 1: Create `CanvasToolbar.jsx`**

```jsx
import React from "react";

// A read-only counterpart to the Network Builder's toolbar: view and analysis
// only, no save, undo, draw or placement. Groups are supplied by the caller so
// the bar stays a pure renderer.
export default function CanvasToolbar({ groups }) {
  return (
    <div className="simtoolbar">
      {groups.map((group) => (
        <div key={group.key} className="simtoolbar__group">
          {group.items.map(({ key, label, icon: Icon, title, onClick, active, disabled }) => (
            <button
              key={key}
              type="button"
              className={`simtoolbar__btn${active ? " simtoolbar__btn--active" : ""}`}
              title={title}
              disabled={disabled}
              onClick={onClick}
            >
              {Icon && <Icon size={13} />}
              <span>{label}</span>
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Wire the view and overlay groups in `CanvasPanel.jsx`**

Add imports:

```js
import { AlertTriangle, Crosshair, Maximize2, RefreshCw, Tag, Waves } from "lucide-react";
import CanvasToolbar from "./CanvasToolbar";
```

Add label state: `const [showLabels, setShowLabels] = useState(true);`

Add the label effect:

```js
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy || !cyReady) return;
    if (showLabels) cy.elements().removeClass("hide-labels");
    else cy.elements().addClass("hide-labels");
  }, [showLabels, cyReady, topology]);
```

Add the handlers:

```js
  const handleFit = () => cyRef.current?.fit(undefined, 48);

  const handleZoomToSelection = () => {
    const cy = cyRef.current;
    if (!cy) return;
    const selected = cy.$(":selected");
    cy.fit(selected.length ? selected : cy.elements(), 60);
  };

  const handleResetView = () => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.zoom(1);
    cy.center();
  };

  // "What is binding today" in one click.
  const handleSelectBottlenecks = () => {
    const cy = cyRef.current;
    if (!cy || !overlay) return;
    const ids = new Set([...overlay.bottleneckEdgeIds, ...overlay.bottleneckNodeIds]);
    cy.$(":selected").unselect();
    const binding = cy.elements().filter((el) => ids.has(el.id()));
    if (!binding.length) {
      setToast("Nothing was binding on this day.");
      return;
    }
    binding.select();
    cy.fit(binding, 80);
  };
```

Add `const [toast, setToast] = useState(null);` and render it inside `.simcanvas__stage`:

```jsx
        {toast && (
          <button type="button" className="simcanvas__toast" onClick={() => setToast(null)}>
            {toast}
          </button>
        )}
```

Auto-dismiss it:

```js
  useEffect(() => {
    if (!toast) return undefined;
    const id = setTimeout(() => setToast(null), 3200);
    return () => clearTimeout(id);
  }, [toast]);
```

Build the groups and render the toolbar directly above `.simcanvas__stage`:

```js
  const toolbarGroups = [
    {
      key: "view",
      items: [
        { key: "fit", label: "Fit", icon: Maximize2, title: "Fit the network to the frame", onClick: handleFit },
        { key: "tosel", label: "To Sel", icon: Crosshair, title: "Zoom to selection (or fit all)", onClick: handleZoomToSelection },
        { key: "labels", label: "Labels", icon: Tag, title: "Toggle labels", active: showLabels, onClick: () => setShowLabels((v) => !v) },
        { key: "reset", label: "Reset", icon: RefreshCw, title: "Reset pan and zoom", onClick: handleResetView },
      ],
    },
    {
      key: "overlay",
      items: [
        { key: "flow", label: "Flow", icon: Waves, title: "Toggle the flow animation", active: animate, onClick: () => setAnimate((v) => !v) },
        { key: "legend", label: "Legend", icon: Tag, title: "Toggle the legend", active: showLegend, onClick: () => setShowLegend((v) => !v) },
        { key: "bottlenecks", label: "Bottlenecks", icon: AlertTriangle, title: "Select everything binding on this day", onClick: handleSelectBottlenecks },
      ],
    },
  ];
```

```jsx
      <CanvasToolbar groups={toolbarGroups} />
```

- [ ] **Step 3: Add toolbar and toast styles to `CanvasPanel.css`**

```css
.simtoolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 6px 8px;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  background: #ffffff;
}

.simtoolbar__group {
  display: flex;
  gap: 4px;
  padding-right: 8px;
  border-right: 1px solid #e2e8f0;
}

.simtoolbar__group:last-child { border-right: 0; padding-right: 0; }

.simtoolbar__btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 5px 9px;
  border: 1px solid transparent;
  border-radius: 6px;
  background: transparent;
  color: #475569;
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
}

.simtoolbar__btn:hover:not(:disabled) { background: #f1f5f9; }
.simtoolbar__btn:disabled { opacity: 0.4; cursor: default; }

.simtoolbar__btn--active {
  border-color: #1a4a8a;
  background: rgba(26, 74, 138, 0.08);
  color: #1a4a8a;
}

.simcanvas__toast {
  position: absolute;
  left: 50%;
  bottom: 16px;
  transform: translateX(-50%);
  padding: 7px 14px;
  border: 0;
  border-radius: 999px;
  background: rgba(15, 23, 42, 0.9);
  color: #ffffff;
  font-size: 11px;
  cursor: pointer;
}
```

- [ ] **Step 4: Verify in the app**

Expected: Fit, To Sel, Labels, Reset and Flow behave as titled; **Bottlenecks** on a day with a shortage selects and zooms to the binding pipe; on a fully-served day it shows the toast instead.

- [ ] **Step 5: Commit**

```bash
cd frontend && npm test && npm run build
git add frontend/src/components/simulation/CanvasToolbar.jsx frontend/src/components/simulation/CanvasPanel.jsx frontend/src/components/simulation/CanvasPanel.css
git commit -m "feat: add the simulation canvas contextual toolbar"
```

---

### Task 11: Trace and isolate on the canvas

**Files:**
- Modify: `frontend/src/components/simulation/CanvasPanel.jsx`

**Interfaces:**
- Consumes: `computeTrace`, `paintTrace`, `clearTraceClasses`, `traceNeighbours` (Task 1); `applyIsolation`, `clearIsolation`, `isIsolated` (Task 2); `overlay.flowByEdge` (Task 8).
- Produces: `traceInfo` state consumed by Task 12's detail panel:
  `{ rootId, rootName, mode, requestedMode, hasFlow, sources, dests, upCount, downCount }`

- [ ] **Step 1: Add trace and isolate state and handlers**

Add imports:

```js
import { GitBranch, Layers, XCircle } from "lucide-react";
import { clearTraceClasses, computeTrace, paintTrace, traceNeighbours } from "../../cytoscape/trace";
import { applyIsolation, clearIsolation, isIsolated } from "../../cytoscape/isolate";
```

Add state:

```js
  const [traceActive, setTraceActive] = useState(false);
  const [traceMode, setTraceMode] = useState("delivered");
  const [traceInfo, setTraceInfo] = useState(null);
  const [isolationActive, setIsolationActive] = useState(false);
```

Add the trace runner. Unlike the builder, any asset node is a valid root: with
real flow available, "where does this plant's output go" is as useful as "where
does this gate's water come from".

```js
  const runTrace = useCallback((node, mode = traceMode) => {
    const cy = cyRef.current;
    if (!cy || !node) return;
    const flowByEdge = overlay?.flowByEdge || {};
    const trace = computeTrace(cy, node.id(), { flowByEdge, mode });
    paintTrace(cy, trace);
    const { sources, dests } = traceNeighbours(cy, trace);
    setTraceInfo({
      rootId: trace.rootId,
      rootName: node.data("label") || node.data("displayLabel") || node.id(),
      mode: trace.mode,
      requestedMode: trace.requestedMode,
      hasFlow: trace.hasFlow,
      sources,
      dests,
      upCount: trace.up.nodes.size,
      downCount: trace.down.nodes.size,
    });
    if (mode === "delivered" && !trace.hasFlow) {
      setToast("No flow on this day, so Trace is showing reachable topology.");
    }
  }, [traceMode, overlay]);
```

`runTrace` needs `useCallback` — add it to the React import at the top of the file.

Add the clear handler and the isolate toggle:

```js
  const clearAnalysis = useCallback(() => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.$(":selected").unselect();
    clearTraceClasses(cy);
    clearIsolation(cy);
    setTraceInfo(null);
    setIsolationActive(false);
    setTraceActive(false);
  }, []);

  const handleToggleIsolation = useCallback(() => {
    const cy = cyRef.current;
    if (!cy) return;
    if (isolationActive || isIsolated(cy)) {
      clearIsolation(cy);
      setIsolationActive(false);
      setToast("Cleared isolate.");
      return;
    }
    if (!applyIsolation(cy, cy.$(":selected"))) {
      setToast("Select something to isolate first.");
      return;
    }
    setIsolationActive(true);
  }, [isolationActive]);
```

- [ ] **Step 2: Bind the canvas tap handler**

Add after the hydration effect. It is bound per-hydration so a re-fetched topology gets a live handler:

```js
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy || !cyReady) return undefined;

    const onNodeTap = (evt) => {
      if (!traceActive) return;
      runTrace(evt.target);
    };
    const onBackgroundTap = (evt) => {
      if (evt.target !== cy) return;
      clearTraceClasses(cy);
      setTraceInfo(null);
    };

    cy.on("tap", "node", onNodeTap);
    cy.on("tap", onBackgroundTap);
    return () => {
      cy.removeListener("tap", "node", onNodeTap);
      cy.removeListener("tap", onBackgroundTap);
    };
  }, [cyReady, traceActive, runTrace]);
```

- [ ] **Step 3: Re-run an active trace when the day changes**

This is what makes a delivery path visibly appear and disappear across the horizon:

```js
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy || !traceInfo?.rootId) return;
    const root = cy.getElementById(traceInfo.rootId);
    if (root.length) runTrace(root, traceMode);
    // Keyed on the day and the mode only. runTrace closes over the overlay this
    // effect already reacts to, so listing it would re-trace on every repaint.
  }, [dayIdx, traceMode]);
```

- [ ] **Step 4: Add the analysis group to the toolbar**

Insert between the `view` and `overlay` groups in `toolbarGroups`:

```js
    {
      key: "analysis",
      items: [
        {
          key: "trace",
          label: "Trace",
          icon: GitBranch,
          title: "Click an asset to trace its upstream and downstream path",
          active: traceActive,
          onClick: () => {
            const next = !traceActive;
            setTraceActive(next);
            if (next) setToast("Trace: click any plant, pump, gate or junction.");
            else { clearTraceClasses(cyRef.current); setTraceInfo(null); }
          },
        },
        {
          key: "tracemode",
          label: traceMode === "delivered" ? "Delivered" : "Reachable",
          title: "Switch between delivered flow paths and topology reachability",
          onClick: () => setTraceMode((m) => (m === "delivered" ? "reachable" : "delivered")),
        },
        { key: "isolate", label: "Isolate", icon: Layers, title: "Isolate the current selection, or clear isolate", active: isolationActive, onClick: handleToggleIsolation },
        { key: "clear", label: "Clear", icon: XCircle, title: "Clear trace, isolate and selection", onClick: clearAnalysis },
      ],
    },
```

- [ ] **Step 5: Verify in the app**

Expected, on a plan with flow: pressing **Trace** then clicking a city gate paints upstream blue and downstream green; with the mode button on **Delivered**, only pipes carrying flow that day are walked, and scrubbing to a day where the gate is isolated visibly shrinks the trace; switching to **Reachable** walks the full topology. Selecting two nodes and pressing **Isolate** hides the rest; **Clear** restores everything.

- [ ] **Step 6: Commit**

```bash
cd frontend && npm test && npm run build
git add frontend/src/components/simulation/CanvasPanel.jsx
git commit -m "feat: trace and isolate on the simulation canvas

Feeds computeTrace the day's real pipe flows, so its delivered mode
walks actual delivery paths rather than degrading to reachability as it
does in the builder."
```

---

### Task 12: Detail panel

**Files:**
- Create: `frontend/src/components/simulation/CanvasDetails.jsx`
- Modify: `frontend/src/components/simulation/CanvasPanel.jsx`
- Modify: `frontend/src/components/simulation/CanvasPanel.css`

**Interfaces:**
- Consumes: `edgeDetail`, `nodeDetail` (Task 5); `causeLabel` (Task 3); `traceInfo` (Task 11).
- Produces: `<CanvasDetails plan dayIdx selectedId selectedKind traceInfo onFocus />` — default export. `onFocus(elementId)` selects and zooms to an element.

- [ ] **Step 1: Create `CanvasDetails.jsx`**

```jsx
import React from "react";
import { edgeDetail, nodeDetail } from "../../lib/simulationCanvas";
import { causeLabel } from "../../lib/simulationRows";

const nf = new Intl.NumberFormat("en-US");
const fmt = (v) => (v == null ? "—" : nf.format(Math.round(v)));
const pct = (v) => (v == null ? "—" : `${Math.round(v)}%`);
const sar = (v) => (v == null ? "—" : `SAR ${nf.format(Math.round(v))}`);

const OM_SOURCE = {
  economics: "from Economics",
  plant_spec: "from the asset record",
  default: "default rate — none on record",
};

function Row({ label, value, tone = "" }) {
  return (
    <div className="simdetail__row">
      <span className="simdetail__label">{label}</span>
      <span className={`simdetail__value ${tone}`.trim()}>{value}</span>
    </div>
  );
}

function PipeDetail({ detail }) {
  if (!detail.inRun) {
    return <p className="simdetail__empty">This pipe was added after the run and carries no results.</p>;
  }
  return (
    <>
      <Row label="Flow" value={`${fmt(detail.flow)} m³`} />
      <Row label="Capacity" value={detail.unconstrained ? "No capacity on record" : `${fmt(detail.capacity)} m³`} />
      <Row label="Utilisation" value={pct(detail.utilisationPct)}
        tone={detail.utilisationPct >= 90 ? "simdetail__value--bad" : ""} />
      <Row label="Direction" value={detail.bidirectional ? "Bidirectional" : `${detail.source} → ${detail.target}`} />
      {detail.isBottleneck && <Row label="Status" value="Binding constraint today" tone="simdetail__value--bad" />}
      <hr className="simdetail__rule" />
      <Row label="Peak flow (horizon)" value={`${fmt(detail.peakFlow)} m³`} />
      <Row label="Average flow" value={`${fmt(detail.avgFlow)} m³`} />
      <Row label="Peak utilisation" value={pct(detail.peakUtilisationPct)} />
    </>
  );
}

function PlantDetail({ detail }) {
  return (
    <>
      <Row label="Allocated" value={`${fmt(detail.allocated)} m³`} />
      <Row label="Available" value={`${fmt(detail.available)} m³`} />
      <Row label="Contracted" value={`${fmt(detail.base)} m³`} />
      {detail.maintenanceLoss > 0 && <Row label="Maintenance loss" value={`−${fmt(detail.maintenanceLoss)} m³`} />}
      {detail.outageLoss > 0 && <Row label="Outage loss" value={`−${fmt(detail.outageLoss)} m³`} />}
      <hr className="simdetail__rule" />
      <Row label="Variable O&M" value={`SAR ${detail.variableOm}/m³`} />
      <Row label="Source" value={OM_SOURCE[detail.variableOmSource] || "—"}
        tone={detail.variableOmSource === "default" ? "simdetail__value--warn" : ""} />
      <Row label="Cost today" value={sar(detail.costSar)} />
      {detail.noCapacity && (
        <p className="simdetail__note simdetail__note--warn">
          No contracted or design capacity on record, so this plant could not be dispatched.
        </p>
      )}
      {detail.overridden && <p className="simdetail__note">Carries a per-run override.</p>}
    </>
  );
}

function GateDetail({ detail }) {
  return (
    <>
      <Row label="Required" value={`${fmt(detail.required)} m³`} />
      <Row label="Delivered" value={`${fmt(detail.delivered)} m³`} />
      <Row label="Shortage" value={`${fmt(detail.shortage)} m³`}
        tone={detail.shortage > 0 ? "simdetail__value--bad" : ""} />
      {detail.shortage > 0 && <Row label="Cause" value={causeLabel(detail.cause)} />}
      {detail.intakeLimited && <p className="simdetail__note">The gate's own intake capacity capped this request.</p>}
      {detail.overridden && <p className="simdetail__note">Carries a per-run override.</p>}
    </>
  );
}

function PumpDetail({ detail }) {
  return (
    <>
      <Row label="Design capacity" value={`${fmt(detail.base)} m³`} />
      <Row label="Limit today" value={detail.unconstrained ? "No capacity on record" : `${fmt(detail.limit)} m³`} />
      {detail.maintenanceLoss > 0 && <Row label="Maintenance loss" value={`−${fmt(detail.maintenanceLoss)} m³`} />}
      {detail.outageLoss > 0 && <Row label="Outage loss" value={`−${fmt(detail.outageLoss)} m³`} />}
      {detail.fullOutage && <Row label="Status" value="Offline" tone="simdetail__value--bad" />}
      {detail.isBinding && <Row label="Status" value="Binding constraint today" tone="simdetail__value--bad" />}
    </>
  );
}

function TraceDetail({ traceInfo, onFocus }) {
  return (
    <>
      <Row label="Mode" value={traceInfo.mode === "delivered" ? "Delivered flow" : "Reachable topology"} />
      <Row label="Upstream" value={`${traceInfo.upCount} node(s)`} />
      <Row label="Downstream" value={`${traceInfo.downCount} node(s)`} />
      {traceInfo.requestedMode === "delivered" && !traceInfo.hasFlow && (
        <p className="simdetail__note">No flow on this day — showing reachable topology instead.</p>
      )}
      {["sources", "dests"].map((key) => (
        <div key={key}>
          <h4 className="simdetail__subhead">{key === "sources" ? "Direct sources" : "Direct destinations"}</h4>
          {traceInfo[key].length === 0 && <p className="simdetail__empty">None.</p>}
          {traceInfo[key].map((n) => (
            <button key={n.id} type="button" className="simdetail__link" onClick={() => onFocus(n.id)}>
              {n.name}
              <span>{fmt(n.flow)} m³</span>
            </button>
          ))}
        </div>
      ))}
    </>
  );
}

function DaySummary({ plan, dayIdx, onFocus }) {
  const day = plan.days[dayIdx];
  const shortGates = (day.gates || []).filter((g) => g.shortage > 0);
  return (
    <>
      <Row label="Required" value={`${fmt(day.totalRequired)} m³`} />
      <Row label="Delivered" value={`${fmt(day.totalDelivered)} m³`} />
      <Row label="Shortage" value={`${fmt(day.totalShortage)} m³`}
        tone={day.totalShortage > 0 ? "simdetail__value--bad" : ""} />
      <Row label="Variable O&M" value={sar(day.variableOmCost)} />

      <h4 className="simdetail__subhead">Binding constraints</h4>
      {day.bindingConstraints.length === 0 && <p className="simdetail__empty">Nothing was binding today.</p>}
      {day.bindingConstraints.map((c) => (
        <button key={`${c.kind}-${c.id}`} type="button" className="simdetail__link" onClick={() => onFocus(c.id)}>
          {c.label}
          <span>{c.capacity == null ? "unlimited" : `${fmt(c.flow)} / ${fmt(c.capacity)}`}</span>
        </button>
      ))}

      <h4 className="simdetail__subhead">Gates short</h4>
      {shortGates.length === 0 && <p className="simdetail__empty">All gates served.</p>}
      {shortGates.map((g) => (
        <button key={g.nodeId} type="button" className="simdetail__link" onClick={() => onFocus(g.nodeId)}>
          {g.name}
          <span>{fmt(g.shortage)} m³ short</span>
        </button>
      ))}
    </>
  );
}

export default function CanvasDetails({ plan, dayIdx, selectedId, selectedKind, traceInfo, onFocus }) {
  if (traceInfo) {
    return (
      <aside className="simdetail">
        <header className="simdetail__head">
          <span className="simdetail__eyebrow">Trace</span>
          <h3>{traceInfo.rootName}</h3>
        </header>
        <TraceDetail traceInfo={traceInfo} onFocus={onFocus} />
      </aside>
    );
  }

  if (!selectedId) {
    return (
      <aside className="simdetail">
        <header className="simdetail__head">
          <span className="simdetail__eyebrow">{plan.days[dayIdx]?.date}</span>
          <h3>Day summary</h3>
        </header>
        <DaySummary plan={plan} dayIdx={dayIdx} onFocus={onFocus} />
      </aside>
    );
  }

  if (selectedKind === "edge") {
    const detail = edgeDetail(plan, dayIdx, selectedId);
    return (
      <aside className="simdetail">
        <header className="simdetail__head">
          <span className="simdetail__eyebrow">Pipe</span>
          <h3>{detail?.label || selectedId}</h3>
        </header>
        {detail && <PipeDetail detail={detail} />}
      </aside>
    );
  }

  const detail = nodeDetail(plan, dayIdx, selectedId);
  if (!detail || !detail.inRun) {
    return (
      <aside className="simdetail">
        <header className="simdetail__head"><h3>Not part of this run</h3></header>
        <p className="simdetail__empty">
          This element carries no results — it is either a junction or was added after the run.
        </p>
      </aside>
    );
  }

  const EYEBROW = { plant: "Plant", pump: "Pump station", gate: "City gate" };
  return (
    <aside className="simdetail">
      <header className="simdetail__head">
        <span className="simdetail__eyebrow">{EYEBROW[detail.kind]}</span>
        <h3>{detail.name}</h3>
      </header>
      {detail.kind === "plant" && <PlantDetail detail={detail} />}
      {detail.kind === "gate" && <GateDetail detail={detail} />}
      {detail.kind === "pump" && <PumpDetail detail={detail} />}
    </aside>
  );
}
```

- [ ] **Step 2: Track selection in `CanvasPanel.jsx`**

Add state:

```js
  const [selection, setSelection] = useState({ id: null, kind: null });
```

Add selection listeners to the tap effect from Task 11, alongside the existing handlers:

```js
    const onSelect = () => {
      const selected = cy.$(":selected");
      if (selected.length !== 1) {
        setSelection({ id: null, kind: null });
        return;
      }
      const el = selected[0];
      setSelection({ id: el.id(), kind: el.isEdge() ? "edge" : "node" });
    };

    cy.on("select unselect", onSelect);
```

and add `cy.removeListener("select unselect", onSelect);` to the cleanup.

Add the focus handler:

```js
  const handleFocus = useCallback((elementId) => {
    const cy = cyRef.current;
    if (!cy) return;
    const el = cy.getElementById(elementId);
    if (!el.length) return;
    cy.$(":selected").unselect();
    el.select();
    cy.fit(el.closedNeighborhood(), 120);
  }, []);
```

- [ ] **Step 3: Render it beside the stage**

Wrap the stage and panel in a row. Replace the `.simcanvas__stage` block with:

```jsx
      <div className="simcanvas__body">
        <div className="simcanvas__stage">
          {/* existing cy div, legend and toast stay here unchanged */}
        </div>
        <CanvasDetails
          plan={plan}
          dayIdx={dayIdx}
          selectedId={selection.id}
          selectedKind={selection.kind}
          traceInfo={traceInfo}
          onFocus={handleFocus}
        />
      </div>
```

Add the import: `import CanvasDetails from "./CanvasDetails";`

- [ ] **Step 4: Add layout and detail styles to `CanvasPanel.css`**

```css
.simcanvas__body {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 280px;
  gap: 10px;
}

@media (max-width: 1100px) {
  .simcanvas__body { grid-template-columns: minmax(0, 1fr); }
}

.simdetail {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 12px 14px;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  background: #ffffff;
  font-size: 12px;
  overflow-y: auto;
  max-height: clamp(420px, 62vh, 760px);
}

.simdetail__head { margin-bottom: 4px; }

.simdetail__eyebrow {
  display: block;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: #94a3b8;
}

.simdetail__head h3 { margin: 2px 0 0; font-size: 14px; color: #1e293b; }

.simdetail__row {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  padding: 3px 0;
}

.simdetail__label { color: #64748b; }
.simdetail__value { font-weight: 600; color: #1e293b; text-align: right; }
.simdetail__value--bad { color: #dc2626; }
.simdetail__value--warn { color: #b45309; }

.simdetail__rule { border: 0; border-top: 1px solid #e2e8f0; margin: 8px 0 4px; }

.simdetail__subhead {
  margin: 10px 0 4px;
  font-size: 11px;
  font-weight: 700;
  color: #475569;
}

.simdetail__empty { margin: 0; color: #94a3b8; font-size: 11px; }

.simdetail__note {
  margin: 6px 0 0;
  padding: 6px 8px;
  border-radius: 6px;
  background: #f1f5f9;
  color: #475569;
  font-size: 11px;
}

.simdetail__note--warn { background: #fffbeb; color: #92400e; }

.simdetail__link {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  width: 100%;
  padding: 5px 7px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: #1e293b;
  font-size: 11px;
  text-align: left;
  cursor: pointer;
}

.simdetail__link:hover { background: #f1f5f9; }
.simdetail__link span { color: #64748b; white-space: nowrap; }
```

- [ ] **Step 5: Verify in the app**

Expected: with nothing selected the panel shows the day summary, and clicking a binding constraint or a short gate selects and zooms to it; clicking a pipe shows its flow, capacity and horizon peaks; clicking a plant shows allocation and the O&M provenance; running a trace switches the panel to the trace summary, and clicking a listed source jumps to it.

- [ ] **Step 6: Commit**

```bash
cd frontend && npm test && npm run build
git add frontend/src/components/simulation/CanvasDetails.jsx frontend/src/components/simulation/CanvasPanel.jsx frontend/src/components/simulation/CanvasPanel.css
git commit -m "feat: add the simulation canvas detail panel

Shows the selected element's numbers for the selected day, the active
trace summary, or the day's roll-up with clickable binding constraints
and short gates."
```

---

## Final verification

- [ ] `cd frontend && npm test` — all suites pass, including `trace.test.js`, `simulationCanvas.test.js` and the extended `simulationRows.test.js`.
- [ ] `cd frontend && npm run build` — succeeds.
- [ ] Network Builder regression: load a saved network, isolate a selection and clear it, trace from a handover point. All unchanged from before Task 1.
- [ ] Simulation Config regression: Configuration, Results and Decisions tabs render as before; Publish still works.
- [ ] Canvas tab on a plan with a shortage: scrub the horizon, watch the bottleneck pipe turn red on the short days, trace the affected gate in Delivered mode, isolate it, and read its cause in the detail panel.
- [ ] Leave the Canvas tab and return several times, then confirm in DevTools that only one dash-animation interval is running (the dashes crawl at a constant speed rather than accelerating).
