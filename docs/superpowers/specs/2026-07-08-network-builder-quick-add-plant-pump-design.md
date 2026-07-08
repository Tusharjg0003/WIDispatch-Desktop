# Network Builder: Quick-Add Form for Plant / Pump Station

## Goal

Today, clicking "Plant" or "Pump" in the Network Builder's insert toolbar and
then clicking the canvas creates a blank node with no data at all (empty
label, empty `specifications`). This adds a modal form that asks for a
focused set of fields at the moment of placement, and saves the result as a
real Asset Registry record (not just canvas-local data) — consistent with
how picking an existing asset from the palette already works.

This is scoped to the Network Builder's insert-toolbar flow only. The
Asset Registry page's existing "Create asset" form (`CreateAssetForm.jsx`,
`PlantFields.jsx`) is untouched — it keeps its larger production/treatment
field set. The generic "node" annotation type (the third insert-toolbar
option) is also untouched — it still places instantly with no form, since it
isn't an asset.

## Architecture

- New `frontend/src/components/NetworkEntityCreateModal.jsx`, structured
  like the existing `pipeModal` in `NetworkBuilderPage.jsx` (backdrop +
  `af__modal`, cancel-on-backdrop-click).
- `NetworkBuilderPage.jsx` adds `entityModal = { open, type, position }`
  state. In the canvas `tap` handler, when `mode === "place-entity"` and
  `pendingEntityRef.current` is `"plant"` or `"pump"`, it opens
  `entityModal` with the click position instead of creating a blank node
  immediately (the `"node"` type keeps today's instant-placement branch
  unchanged).
- On submit, the modal calls the existing `createAsset` API
  (`frontend/src/api/metrics.js`, same one `CreateAssetForm` uses). On
  success, `NetworkBuilderPage.jsx` adds the cytoscape node using the
  returned asset — `assetId: created.id`, `meta: assetMeta(created)` — at
  the captured position, identical to how the palette's "place-asset" flow
  places existing assets today.
- Placement is **not sticky**: one modal submission places one node, then
  the tool returns to select mode. (Contrast with blank "node" placement,
  which stays sticky for rapid repeat placement — a modal-per-click loop
  would be worse UX than re-clicking the toolbar button.)
- Cancel (backdrop click or Esc) discards the captured position; no asset
  is created; mode returns to select.
- On `createAsset` failure (duplicate id, network error), the error
  displays inline in the modal (same pattern as `CreateAssetForm`'s
  `error` state) and the modal stays open with the user's input intact for
  retry.
- The modal's Pump Configuration section reuses
  `PumpStationFields.jsx` unchanged — its existing shape (name, capacity,
  role Functional/Backup, on/off toggle, +Functional/+Backup buttons)
  already matches what's needed here exactly. All other fields are new,
  built with the shared `Field`/`Toggle`/`Switch` controls from
  `AssetFormControls.jsx`.
- No coordinate fields (latitude/longitude) in this modal — the canvas
  click position is the only placement data, matching the requested field
  list.

## Fields

### Plant

Top-level asset fields: `name` (required), `activity`, `asset_type`,
`status`, `region`, `commissioning_date`, `decommissioning_date`, plus two
new top-level fields:
- `active` (boolean) — a dispatch/participation flag, independent of
  `status`. `status` is the lifecycle stage (Planned / Under Construction
  / Operational / Maintenance / Decommissioned); `active` is a separate
  on/off toggle for whether the plant currently participates in the
  network, regardless of lifecycle stage. Defaults to `true`.
- `entity_category`: `"private" | "public"`.

`specifications`:
- `design_capacity` — the "Capacity (m³/day)" input. Reuses this existing
  key name (already used by `PlantFields.jsx`) so it's automatically
  numeric-coerced and already renders under "Design capacity (m³/day)" in
  `NetworkNodeDetails.jsx`'s inspector without further changes.
- `capacity_limit_mode`: `"none" | "percentage" | "absolute"`. Selecting
  `"percentage"` reveals a `capacity_limit_percentage` number input;
  selecting `"absolute"` reveals a `capacity_limit_absolute` (m³/day)
  number input; `"none"` reveals neither and neither key is sent.
- `plant_type`: `"desalination" | "purification" | "treatment"` — a flat
  3-value enum. Intentionally distinct from `PlantFields.jsx`'s
  production/treatment category + nested plant-type scheme; this modal
  does not use that split.
- `technology`, `water_source` — free text, same key names as the existing
  registry form.
- `variable_om` — "Variable O&M (SAR/m³)", already numeric-coerced by the
  existing `_om` suffix pattern.

### Pump Station

Top-level: `name` (required), `status`, `commissioning_date`,
`decommissioning_date`, `active` (boolean, same semantics as Plant's,
defaults to `true`).

`specifications.pumps`: array of `{ id, name, capacity_m3_day, role:
"functional" | "backup", active }`, unchanged shape from
`PumpStationFields.jsx`, rendered via that existing component.

## Backend changes

`backend/src/assetRegistry.js`:
1. Add `"active"` and `"entity_category"` to `TOP_LEVEL_FIELDS`.
2. Broaden `NUMERIC_SPEC_PATTERN` from `/(_capacity|capex|ccr|_om)$/i` to
   `/(_capacity|_percentage|_absolute|capex|ccr|_om)$/i` so
   `capacity_limit_percentage` and `capacity_limit_absolute` get numeric
   coercion too. Existing keys (`design_capacity`, `maximum_capacity`,
   `contracted_capacity`, `expansion_capacity`) still match under the
   broadened pattern, so this is additive only. (An earlier draft used
   `/capacity|capex|ccr|_om$/i`, a bare substring match rather than a
   suffix-anchored alternation — that would have wrongly matched
   `capacity_limit_mode`, a string enum, and coerced it via
   `Number("percentage")` → `NaN` → `null`.)

No other backend changes — `createAsset` already stores arbitrary
`specifications` keys and already defaults `status` to `"planned"` when
omitted.

## Frontend detail-view changes

`NetworkNodeDetails.jsx`'s inspector gets new read-only Rows:
- Plant: "Capacity limitation" (formatted from `capacity_limit_mode` +
  the relevant value, e.g. "20% of design capacity" / "5,000 m³/day" /
  "None"), "Variable O&M (SAR/m³)", "Entity category", "Active"
  (Yes/No).
- Pump: "Active" (Yes/No), alongside the existing Pump Configuration
  table.

Existing rows for `plant_type`/`water_source`/`technology` require no
changes — they already render whatever string is in `specifications`, so
the new flat `plant_type` enum values display correctly as-is.

## Out of scope

- No changes to `CreateAssetForm.jsx` / `PlantFields.jsx` (the Asset
  Registry page's own creation form keeps its existing, larger field set).
- No changes to how existing registry assets are picked and placed from
  `NetworkPalette.jsx` (`handlePick` / "place-asset" flow).
- No coordinate/lat-long capture in this modal.
- No migration of previously-placed blank nodes (nodes created via the old
  no-form flow, if any exist in saved networks, are left as-is).
