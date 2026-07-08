# Network Builder: Redesigned Pipeline Variables Modal

## Goal

Replace the Network Builder's "Pipeline variables" modal (shown when drawing
a pipe between two nodes) — currently 5 fields (Name/label, Status, Length,
Diameter, Material) — with a larger, specific field set, including two new
shared reference entities (Transmission Systems and Transmission Lines) that
pipes can be tagged with.

## Scope

- The pipe modal itself: `NetworkBuilderPage.jsx`'s `pipeModal`/`pipeForm`
  state and inline JSX (currently rendered directly in
  `NetworkBuilderPage.jsx`, not a separate component).
- Two new backend-persisted entities, Transmission Systems and Transmission
  Lines, that exist solely to be picked/created from this modal. No other
  page manages them; this is explicitly out of scope (confirmed with the
  user — not a full registry/management page).
- Pipe data itself stays **canvas-local**, exactly as today — pipes are not
  Asset Registry records (pipelines were already removed as a registry
  category in the earlier redesign). Pipe fields live in the edge's
  `meta.specifications`, persisted only as part of the saved network
  document (`serializeGraph`/`addGraph` in `NetworkBuilderPage.jsx`).

## Fields

Replaces the current pipe modal's 5 fields entirely. Top-level edge fields
(matching how `NetworkEntityCreateModal`/`assetMeta` already separate
top-level vs. `specifications` fields):

- **Pipe Name*** → `name` (required, top-level, same as today's Name/label)
- **Active** → `active` (toggle, top-level — new; today's pipe has no active
  flag, only `status`, which this replaces per the field list below)
- **Commissioning Date** → `commissioningDate`, **Decommissioning Date** →
  `decommissioningDate` (top-level, new — pipes have no dates today)

`specifications`:

- **Capacity (m³/day)** → `capacity`
- **Length (km)** → `pipelineLength` (replaces today's `length_km` key)
- **Diameter (mm)** → `pipelineDiameter` (replaces today's `diameter_mm` key)
- **Material** → `pipelineMaterial` (dropdown: Steel / Ductile Iron / HDPE /
  Concrete / PVC — replaces today's free-text `material` key with a fixed
  option list)
- **Design Capacity (m³/day)** → `designCapacity`
- **Max Capacity (m³/day)** → `maximumCapacity`
- **Source** → `infraSource` (free text)
- **Bidirectional** → `bidirectional` (toggle)
- **Transmission System** → `transmissionSystemId` (see below)
- **Transmission Lines** → `lineGroupIds` (array, see below)
- **Capacity Limitation** → `capacityLimitationType` (`"none" | "percentage"
  | "absolute"`) + **Capacity Limitation Value** → `capacityLimitationValue`
  — one shared numeric field for both percentage and absolute modes (unlike
  the Plant quick-add modal's two separate value fields — this matches the
  literal field list given, which names only one value field). Hidden
  entirely when type is `"none"`.

Today's `status` dropdown and free-text `material` field are removed from
the modal (status is replaced by the `active` toggle; material becomes the
fixed dropdown above). The edge's `status` data property, used elsewhere for
the status color band on canvas, is left in place internally but no longer
user-editable from this modal — it's derived from `active`
(`active ? "operational" : "inactive"`), mirroring how the Pump quick-add
flow derives status from its own Active toggle.

## Transmission Systems & Transmission Lines

New, minimal, shared reference entities — not Asset Registry records, not
tied to any one network. Both are created and selected inline from the pipe
modal; no other page reads or manages them.

- **Transmission System**: `{ id, name }`. The modal offers a `<select>` of
  existing systems plus a separate "Create new system" text input
  (`newTransmissionSystemName`). A plain `<select>` + text input, not a
  combobox — matches every other select in this codebase and avoids
  introducing a new UI pattern/library.
- **Transmission Line**: `{ id, name, isBranch, parentLineId, branchName }`.
  The modal offers a multi-select `<select multiple>` of existing lines
  (`lineGroupIds`) plus a separate "New Transmission Line" text input
  (`newLineName`). Typing a name into that input reveals **This line is a
  branch** (`isBranch`, toggle); turning it on reveals **Branch Of Line**
  (`parentLineId`, a `<select>` of existing lines) and **Branch Name**
  (`branchName`, free text — a separate label for the branch, distinct from
  the parent line's own name, e.g. parent "Main Trunk", branch "North
  Spur"). Both branch fields are hidden when "This line is a branch" is off
  or when the new-line-name input is empty.
- Systems and Lines are independent of each other (not nested) — a pipe
  picks one System and any number of Lines from the same flat, global list,
  with no filtering of Lines by System.

### Submit-time creation logic

On submit, before building the pipe's `specifications`:

1. If `newTransmissionSystemName` is non-empty: `POST` a new system, and use
   its returned `id` as `transmissionSystemId` (overriding any `<select>`
   choice — the create-new text field wins if both are filled).
2. If `newLineName` is non-empty: `POST` a new line (including `isBranch`/
   `parentLineId`/`branchName` if branch fields are set), and add its
   returned `id` to whatever `lineGroupIds` were already multi-selected.
3. Build `specifications` with the resolved `transmissionSystemId` and
   `lineGroupIds`, same as every other field.

If either creation `POST` fails, the whole submit fails with an inline
error (same pattern as `NetworkEntityCreateModal`'s `createAsset` error
handling) — the modal stays open with input intact, nothing partially
created is silently lost from the form (though a system/line created before
a later failure will already exist in the backend list for next time,
matching normal create-then-fail semantics).

## Pipe inspector updates

`NetworkNodeDetails.jsx`'s edge branch (`selected._group === "edge"`) is
updated to match, so a placed pipe stays editable after creation instead of
going stale:

- Scalar/toggle fields get inputs wired to `onSpecChange`/a new
  `onFieldChange`-style handler, replacing the current Length (km)/Diameter
  (mm)/Material inputs: Capacity, Length (km) (now `pipelineLength`),
  Diameter (mm) (now `pipelineDiameter`), Material (now a dropdown, same 5
  options as the create modal), Design Capacity, Max Capacity, Source,
  Bidirectional, Capacity Limitation type + value, plus the top-level Name,
  Active, Commissioning Date, Decommissioning Date (replacing the current
  Label input and Status dropdown).
- **Transmission System / Transmission Lines are editable, but select-only**
  in the inspector — a `<select>` for System and a `<select multiple>` for
  Lines, populated from the same fetched lists, letting a pipe be
  reassigned to different existing System/Lines after creation. No
  "create new" text inputs in the inspector — creating a brand new System
  or Line still only happens from the pipe-drawing modal; the inspector
  only lets you pick among what already exists. This keeps the inspector
  from duplicating the modal's create-new-and-select logic while still
  letting reassignment happen without recreating the pipe.
- This requires the inspector to also fetch the Systems/Lines lists (to
  resolve `transmissionSystemId`/`lineGroupIds` to display names) — done
  the same way the modal does, via the new `fetchTransmissionSystems`/
  `fetchTransmissionLines` functions.

## Backend changes

New file `backend/src/transmissionRegistry.js`, parallel to
`assetRegistry.js`:

- `listTransmissionSystems()` → all `{id, name}` from the `transmissionSystems`
  collection.
- `createTransmissionSystem({ name })` → validates `name` is non-empty
  (mirrors `createAsset`'s name check), inserts `{ id, name, created_at }`,
  returns the created doc.
- `listTransmissionLines()` → all `{id, name, isBranch, parentLineId,
  branchName}` from the `transmissionLines` collection.
- `createTransmissionLine({ name, isBranch, parentLineId, branchName })` →
  validates `name` non-empty, inserts `{ id, name, isBranch: !!isBranch,
  parentLineId: parentLineId || null, branchName: branchName || null,
  created_at }`, returns the created doc.

`backend/src/server.js` adds four routes:

```
GET  /api/transmission-systems
POST /api/transmission-systems
GET  /api/transmission-lines
POST /api/transmission-lines
```

Naming note: this is deliberately distinct from the existing
`GET /api/transmission/summary` route (the Transmission dashboard page's
aggregated KPI endpoint, in `backend/src/transmission.js` — an unrelated,
pre-existing concern). `transmission-systems`/`transmission-lines` (hyphenated,
plural nouns) vs. `transmission/summary` (nested path) avoids any route
collision and keeps the two concerns visually distinct in the route list.

## Frontend changes

`frontend/src/api/metrics.js` gets four new functions alongside the
existing `fetchAssets`/`createAsset`: `fetchTransmissionSystems`,
`createTransmissionSystem`, `fetchTransmissionLines`,
`createTransmissionLine`.

`NetworkBuilderPage.jsx`:
- `pipeForm` state's shape changes to match the new field list (replacing
  `EMPTY_PIPE_FORM`'s `{label, length_km, diameter_mm, material, status}`).
- The modal loads Systems and Lines (via the two new fetch functions) when
  it opens, into new state (e.g. `systems`, `lines`).
- `submitPipe` gains the create-new-System/Line logic described above
  before calling the existing `createPipeEdge`.
- The modal's JSX (currently ~50 lines inline in `NetworkBuilderPage.jsx`)
  grows substantially with the new field count. Given the precedent set by
  `NetworkEntityCreateModal.jsx` (extracted to its own file for the same
  reason — inline modals in `NetworkBuilderPage.jsx` were fine at ~5 fields,
  not at ~20), this modal is extracted too: new
  `frontend/src/components/PipeVariablesModal.jsx`, following the same
  props pattern (`onCancel`, `onSubmit` receiving the resolved
  `{top-level fields, specifications}` — mirroring how
  `NetworkEntityCreateModal` calls `onCreated`).

## Out of scope

- No changes to how pipes/edges are stored in saved networks beyond the
  field names inside `meta.specifications` (still just JSON inside the
  network document).
- No management page for Transmission Systems/Lines — create-only from this
  modal, list-only for the dropdowns.
- No migration of existing saved networks' pipe edges. A previously-saved
  edge still has the old keys (`length_km`/`diameter_mm`/`material`/
  `status`) in its `meta.specifications`; the new inspector fields
  (`pipelineLength`/`pipelineDiameter`/`pipelineMaterial`/etc.) will read as
  unset/blank for such an edge until a value is entered through the
  updated inspector, which then writes the new keys going forward. The old
  keys are left in place, unread by the new UI, not deleted.
- No validation that a Line's `parentLineId` isn't itself a branch (no
  multi-level branch-of-branch prevention) — out of scope for this pass.
