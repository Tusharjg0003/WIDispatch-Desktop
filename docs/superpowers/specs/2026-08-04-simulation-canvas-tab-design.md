# Simulation Canvas tab — design

Date: 2026-08-04
Status: approved, ready for implementation planning

## Problem

The Simulation Config page reports a dispatch run as three tables: Configuration,
Results and Decisions. Every number the engine produces is there, but the network
itself is not. An operator reading "gate X was short 40,000 m³ —
transmission_bottleneck" has to hold the canvas in their head to work out *which*
pipe bound, and where the water that did arrive came from.

Add a fourth tab, **Canvas**, that draws the network the run was solved over and
paints the solved flows onto it: pipes coloured and animated by utilisation,
assets tinted by how they fared, a day scrubber across the horizon, and the
existing trace / isolate tools driven by real flow for the first time.

## What already exists

- `plan.days[i]` carries a complete per-day slice: `pipeFlows` (edge id → m³),
  `plantOutputs` (canvas node id → m³), `gates[]`, `pumps[]`, `plants[]`,
  `bindingConstraints[]`, and the day totals.
- `plan.pipes[]` carries static pipe metadata for the horizon: `capacity`,
  `unconstrained`, `peakFlow`, `avgFlow`, `peakUtilisationPct`.
- `frontend/src/cytoscape/buildCyStyle.js` and `nodeCard.js` already render this
  app's node cards and pipes.
- `NetworkBuilderPage.jsx` already implements trace and isolate over a Cytoscape
  instance.

The reference implementation (SWIIMS `NetworkSimulation2Page.js`) transposes a
`daily_series` object of parallel arrays into a day slice via an `atDay()` helper.
**This repo needs no equivalent** — `plan.days[dayIdx]` *is* the day slice.

## Two corrections to the reference behaviour

1. **Uncapacitated pipes.** SWIIMS computes
   `const cap = Number(edge.data('capacity') || 1)`, so a pipe with no capacity on
   record divides by 1 and any flow at all reads as ≥90% critical. Our
   `plan.pipes[]` marks these `unconstrained: true, capacity: null`; they render as
   a distinct "flowing, no limit on record" state instead of fake-critical.
2. **Bottlenecks are known, not inferred.** SWIIMS colours a bottleneck red from a
   separate `bottlenecks` list. Our engine emits `bindingConstraints[]` per day
   from the min-cut, so red is exact rather than heuristic.

## Approach

Extract the reusable canvas machinery out of `NetworkBuilderPage.jsx` into shared
modules, then compose a read-only viewer from them. Rejected alternatives:
duplicating trace/isolate into the new component (two definitions of graph-walking
semantics that will drift), and reusing `NetworkBuilderPage` itself in a
`readOnly` mode (threads conditionals through a 3369-line component that owns
history, autosave, placement and eight interaction modes).

## Architecture

### Extracted from `NetworkBuilderPage.jsx`

Behaviour unchanged; these helpers are already module-scope and take `cy`
explicitly, so the move is mechanical.

| New file | Moves |
|---|---|
| `frontend/src/cytoscape/trace.js` | `TRACE_CLASSES`, `isBidirectionalPipe`, `computeTrace`, `paintTrace`, `clearTraceClasses`, `nodeName`, `traceNeighbours` |
| `frontend/src/cytoscape/isolate.js` | `applyIsolation(cy, elements)`, `clearIsolation(cy)` — class manipulation only |

`applyIsolation`/`clearIsolation` take and return nothing but Cytoscape state. The
toast text, `isolationActive`, `activeIsolationLabel` and `activeIsolationKey`
remain page-level state in each consumer. The builder's `runTrace`,
`isolateCollection`, `clearIsolation` and `handleToggleIsolation` keep their
signatures and their state; their bodies shrink to a call plus `setState`.

No change to the builder's UX. `edgeSpec` has exactly one caller
(`isBidirectionalPipe`), so it moves into `trace.js` with it.

### New — pure logic (`node --test` clean, no cytoscape or JSX import)

`frontend/src/lib/simulationCanvas.js`

- `dayOverlay(plan, dayIdx)` → `{ date, flowByEdge, utilByEdge, edgeStates, nodeStates, bottleneckIds, totals }`
- `edgeState({ flow, capacity, unconstrained, isBottleneck })` → bucket string
- `plantState(plantRow, allocated)`, `gateState(gateRow)`, `pumpState(pumpRow, isBinding)`
- `canvasStaleness(topology, plan)` → `{ unknownToRun: string[], missingFromCanvas: string[] }`
- `edgeDetail(plan, dayIdx, edgeId)`, `nodeDetail(plan, dayIdx, nodeId)`
- `causeText(cause)` — frontend mirror of the backend string, so the panel shows
  prose rather than a raw enum

### New — Cytoscape adapter (impure, thin, not unit tested)

`frontend/src/cytoscape/simulationOverlay.js`

- `applyOverlay(cy, overlay)` — inside `cy.batch()`, writes `simFlow`, `simUtil`,
  `simWidth` into element **data** and adds one bucket **class** per element
- `clearOverlay(cy)` — removes every `sim-*` class and datum
- `startFlowAnimation(cy, flowByEdge)` → handle; `stopFlowAnimation(handle)`

Styling goes through the stylesheet, not inline `.style()` calls as in SWIIMS.
Bucket classes carry colour; continuous width comes from a
`width: 'data(simWidth)'` mapper. Only `line-dash-offset` is written inline,
because it changes ~16×/second. This keeps `buildCyStyle.js` the single source of
visual truth and makes the whole overlay removable with one `removeClass`.

### New — components (`frontend/src/components/simulation/`)

- `CanvasPanel.jsx` — owns the Cytoscape instance, hydration, day index, selection
- `CanvasToolbar.jsx` — the contextual toolbar
- `CanvasDayScrubber.jsx` — day slider, stepper, play/pause, per-day shortage bars
- `CanvasDetails.jsx` — right-hand detail panel
- `CanvasPanel.css`

### Modified

- `frontend/src/cytoscape/buildCyStyle.js` — add a simulation selector block
- `frontend/src/pages/SimulationConfigPage.jsx` — fourth tab entry in `TABS`,
  rendered after Decisions
- `frontend/src/pages/NetworkBuilderPage.jsx` — import the extracted helpers

## Data flow

```
plan (already in SimulationConfigPage state)
  │
  ├─ plan.network.id ──> fetchNetwork(id) ──> topology doc ──> cy.add(...)   [once per plan]
  │                                                  │
  │                                            applyCardIcon per node
  │
  └─ plan.days[dayIdx] ─┬─ pipeFlows          ┐
     plan.pipes[]       ├─ plantOutputs       ├─> dayOverlay() ─> applyOverlay(cy, …)
                        ├─ gates[] / pumps[]  │                        │
                        ├─ plants[]           │                  startFlowAnimation
                        └─ bindingConstraints ┘
```

The plan stores only `network: { id, name }`, not the topology, so the tab fetches
the network document itself and joins by element id.

Hydration runs once per `plan.network.id`, with `layout: { name: "preset" }` so
positions come from the saved document exactly as in the builder. A day change
recomputes the overlay and re-applies classes and data only — no element re-add,
no layout, no camera move.

## Visual language

### Pipes

| condition (evaluated in order) | bucket | colour | line |
|---|---|---|---|
| `flow <= 0` | idle | `#6b7280` | solid, 2px |
| in the day's `bindingConstraints` and flowing | bottleneck | `#dc2626` | dashed, animated |
| `unconstrained` | unconstrained | `#22c55e` | dashed, animated, fixed 3px |
| `util >= 0.9` | high | `#7c3aed` | dashed, animated |
| `util >= 0.7` | medium | `#f59e0b` | dashed, animated |
| otherwise | low | `#22c55e` | dashed, animated |

Flowing, capacity-bearing pipes get `width = clamp(2, 6, 2 + util * 4)`,
`line-dash-pattern: [10, 6]`, and an animated `line-dash-offset` decremented by 2
every 60ms — the moving-flow effect.

### Nodes

- **Plant** — by `allocated / available`: idle, partial, at-capacity. A plant with
  `noCapacity` gets its own state (it could not be dispatched at all, which is a
  different fact from being idle).
- **City gate** — by `shortage`: met, adjusted, shortfall. Tint reflects `cause`.
- **Pump station** — flagged when it appears in the day's `bindingConstraints`.
- **Junction** — unchanged.

Overridden elements (`overridden: true`) carry a marker in every state, so an
operator never mistakes a what-if for portal data.

## Contextual toolbar

A compact floating bar over the canvas, following the builder's `Btn` idiom.
Nothing here mutates the network — no save, undo, draw or placement.

- **View:** `Fit` · `To Sel` · `Labels` · `Reset`
- **Analysis:** `Trace` (mode toggle) · `Isolate / Unisolate` · `Clear`
- **Overlay:** `Flow` (animation on/off) · `Legend` · `Bottlenecks`

`Clear` drops trace classes, isolation and selection in one action.
`Bottlenecks` selects every element in the current day's `bindingConstraints`.

### Trace

Reuses `computeTrace`'s existing two modes via the existing `traceMode` state:

- **Reachable** — topology only, ignoring flow. What the builder does today.
- **Delivered** — walks only edges with `pipeFlows[id] > 0` on the selected day.

`computeTrace` already accepts `flowByEdge` and a `mode: "delivered"` branch, but
the builder feeds it `buildFlowByEdge()`, which scrapes static edge data that is
in practice always empty — so delivered mode silently degrades to reachability
there. The Canvas tab supplies real flow, which is the first time that code path
has had data.

Unlike the builder, which restricts trace roots to handover points, the Canvas tab
allows tracing from any asset node: with real flow available, "where does this
plant's output go" is as useful as "where does this gate's water come from".

Changing the day re-runs an active trace, so a delivery path can be watched
appearing and disappearing across the horizon.

### Isolate

Behaves exactly as in the builder: hide everything except the selection plus the
endpoints of any selected edges, then fit to what remains. The overlay stays
applied to the survivors.

## Day scrubber

A strip beneath the canvas:

- `‹` / `›` steppers and a range slider across `plan.days`
- play/pause stepping one day per 700ms, stopping at the end of the horizon
- the selected date with that day's `totalRequired`, `totalDelivered`,
  `totalShortage`
- behind the slider, one thin bar per day coloured by that day's shortage, so the
  days worth visiting are visible before scrubbing; clicking a bar jumps to it

Opens on day 0 (`plan.from`) and plays forward chronologically.

## Detail panel

A right-hand panel driven by Cytoscape selection, showing the selected element for
the selected day. All values come from `lib/simulationCanvas.js`.

- **Pipe** — flow, capacity (or "no capacity on record"), utilisation %,
  bidirectional flag, whether it is binding today; plus horizon context from
  `plan.pipes[]`: peak flow, peak utilisation, average flow.
- **Plant** — allocated, available, contracted; the day's maintenance and outage
  loss; Variable O&M with a provenance badge from `variableOmSource`
  (`economics` / `plant_spec` / `default`); the day's cost; `noCapacity` and
  `overridden` flags.
- **City gate** — required, delivered, shortage, status, and the prose form of
  `cause`.
- **Pump station** — design capacity, the day's limit, losses, `unconstrained`,
  whether binding.
- **Trace active** — the panel switches to the trace summary (upstream sources,
  downstream destinations, counts), as the builder's right panel does.

With nothing selected it shows the day's roll-up: totals, the binding-constraints
list, and the gates short that day. Each row is clickable to select and zoom to
that element.

## Failure modes

- **No plan yet** — the tab is not rendered, matching Results and Decisions.
- **`fetchNetwork` fails, or the network was deleted after the run** — a
  panel-level notice ("The network this plan ran against is no longer available"),
  no canvas. The other tabs are unaffected.
- **The canvas was edited after the run** — `canvasStaleness()` diffs topology ids
  against the plan's. Elements the run never saw render dimmed with no overlay and
  read "not part of this run" in the detail panel. If the plan references ids the
  canvas no longer has, a banner reports how many. Non-blocking, never silently
  wrong.
- **Empty run** (`kpis.totalRequiredM3 === 0`) — the canvas renders all-idle with a
  notice pointing at the same explanation `validateConfig` already produces.
- **Animation lifecycle** — the interval is cleared on tab switch, plan change and
  unmount, and is not started while the tab is not the active one.

## Testing

`frontend/src/lib/simulationCanvas.test.js`, `node --test`, in the style of
`simulationRows.test.js`:

- bucket boundaries at 0.699 / 0.7 / 0.899 / 0.9
- unconstrained pipes never classified as high or bottleneck
- bottleneck taking precedence over utilisation
- `dayOverlay` selecting the correct day and tolerating a missing `pipeFlows` entry
- `canvasStaleness` diffing in both directions
- `edgeDetail` / `nodeDetail` derivations, including `noCapacity` and `overridden`

`frontend/src/cytoscape/trace.test.js` — new, enabled by the extraction.
`computeTrace` needs only a cy-shaped object, so this covers directed versus
bidirectional walking and delivered-mode filtering. The builder's trace has no
tests today; this is a side benefit of the move.

Components and `simulationOverlay.js` are not unit tested — there is no DOM
harness in this repo and this work does not add one.

## Out of scope

- Editing the network from the Canvas tab
- Persisting canvas view state (zoom, isolation, selected day) across sessions
- Exporting the canvas as an image
- Any backend change: the engine already emits everything this tab needs
