# Asset Registry: Add Handover Points

## Goal

Add "Handover Point" as a third Asset Registry category (alongside Plant and
Pump Station), stored in MongoDB, with its own creation form, detail view,
list/map support, and Network Builder canvas placement.

## Data model

### Reuse the existing `handover-points` collection

A `handover-points` collection already exists in Mongo but is only used
today as thin `{id, name}` reference data by `metrics.js` and `quality.js`
(joined via `handover_point_id` on production/quality records). Those joins
only ever project `id`/`name`, so extending the same documents with the
full Asset Registry field set is safe — no migration needed, existing joins
keep working unchanged.

### `backend/src/assetRegistry.js`

- `ASSET_CATEGORIES` gains `handover_point: "handover-points"`.
- No other backend change: `listAssets`/`getAssetById`/`createAsset` and the
  `/api/assets` routes already iterate `ASSET_CATEGORIES` generically.

### Top-level fields

Handover Points use the same shared `TOP_LEVEL_FIELDS` as Plant/Pump
(external_id, name, asset_name_ar, entity, entity_type, activity,
asset_type, region, cluster, governorate, city, status, commissioning_date,
decommissioning_date, active, entity_category) plus latitude/longitude —
with two fields getting category-specific input widgets (see Frontend
below): Activity/Asset Type become dependent dropdowns, and Region becomes
a dropdown, only when `category === "handover_point"`. Plant/Pump keep
their existing freeform text inputs for these fields — no regression risk
to their existing data.

`active` is a new boolean toggle in the Lifecycle section, defaulting to
checked (`true`). This uses a `TOP_LEVEL_FIELDS` slot that already exists in
the schema but has never been surfaced in the create form for any category;
since `EMPTY_FORM.active` defaults to `true` for all categories, Plant/Pump
asset creation will now also start sending `active: true` — a harmless,
additive default consistent with the schema, not a behavior regression.

### `specifications` fields (new `HandoverPointFields.jsx`)

- `design_capacity` (number, m³/day, min 0) — named to match the existing
  `*_capacity` numeric-coercion pattern in `assetRegistry.js`
  (`NUMERIC_SPEC_PATTERN`), so it's auto-coerced to a number server-side
  like Plant's `design_capacity`.
- `capacity_limitation_type`: `"none" | "percentage" | "absolute"`, radio
  group (per the user's spec — Pipe's equivalent field uses a `<select>`,
  Handover Point uses radio buttons instead).
- `capacity_limitation_value`: number, shown only when
  `capacity_limitation_type !== "none"`. Explicitly coerced to `Number` (or
  `null` if empty) client-side before submit, mirroring how
  `CreateAssetForm.jsx` already coerces `PumpStationFields`' pump array —
  its field name doesn't match `NUMERIC_SPEC_PATTERN` so it needs the same
  manual treatment.

### Status values

Five values, reusing the existing "operational" status: `planned`,
`under_construction`, `operational`, `decommissioned`, `inactive`. No
separate "maintenance" state (unlike Plant/Pump's status list) and no
separate "in_operation" state — `operational` already displays as "In
Operation" via the existing `statusBadgeText` helper in
`AssetDetailFields.jsx`, so a Handover-Point-specific `HANDOVER_STATUSES`
list is used in place of the shared `STATUSES` array for this category only.

### Activity → Asset Type dependent dropdown

```
Water distribution   → Handover point / city gate, Distribution network, Filling station
Wastewater collection → Collection network
TSE reuse             → Filling station
```

Default Activity: "Water distribution". Default Asset Type: "Handover
point / city gate". Changing Activity resets Asset Type to the first option
of the new list.

### Region dropdown

Fixed list (Saudi regions), used only for `category === "handover_point"`:
Riyadh, Makkah, Madinah, Eastern Province, Asir, Tabuk, Qassim, Hail,
Northern Borders, Jazan, Najran, Al Bahah, Al Jouf.

## Frontend changes

### `CreateAssetForm.jsx`

- Add `{ value: "handover_point", label: "Handover Point" }` to `CATEGORIES`.
- Classification section: when category is `handover_point`, render the
  Activity/Asset Type dependent dropdowns in place of the current freeform
  text inputs.
- Location section: when category is `handover_point`, render Region as a
  `<select>` from the fixed list instead of freeform text.
- Lifecycle section: when category is `handover_point`, use
  `HANDOVER_STATUSES` instead of `STATUSES` for the status `<select>`, and
  add an Active `Toggle` (reusing the existing `Toggle` control already
  imported for Pump).
- Render `<HandoverPointFields spec={spec} set={setSpecField} />` when
  `category === "handover_point"`, alongside the existing
  `PlantFields`/`PumpStationFields` branches.
- In `submit`, coerce `spec.capacity_limitation_value` to `Number`/`null`
  for this category before building the payload (same treatment as the pump
  array coercion already done for `isPump`).

### `HandoverPointFields.jsx` (new, mirrors `PlantFields.jsx`)

Renders the Capacity and Capacity Limitation fields described above.

### `AssetDetailFields.jsx`

Add an `isHandoverPoint = asset.category === "handover_point"` branch in
the Asset Specifications section showing Capacity and Capacity Limitation
(reusing the existing `capacityLimitLabel`-style formatting already used
for Plant, or a local equivalent if that helper is Plant-specific).

### `AssetRegistrySidebar.jsx`

- `CATEGORY_LABEL` gains `handover_point: "Handover Points"`.
- `CATEGORY_ORDER` gains `"handover_point"`.
- `expandedCategories` initial state includes `handover_point: true`.

### List/Map views

`AssetListView.jsx` and `AssetMapView.jsx` are already generic over
whatever the `/api/assets` category returns — no changes needed.

## Network Builder canvas

Per the approved scope, Handover Points are also placeable/drawable nodes
on the canvas, styled like Plant/Pump. Assets are still only *created*
through the Asset Registry form — canvas support means existing Handover
Point assets become visible in the palette and render correctly once
placed, not a new canvas-side creation modal (unlike Pipes' dedicated
drawing modal).

### `frontend/src/cytoscape/buildCyStyle.js`

- `ENTITY_TYPE_COLORS.handover_point` — a new color distinct from plant
  blue (`#567cff`) and pump pink (`#ec4899`); implementer picks a
  clearly-distinct hue from the existing palette (e.g. a teal/green).
- `ENTITY_TYPE_ABBREVIATIONS.handover_point = "HP"`.
- `ENTITY_TYPE_LABELS.handover_point = "Handover Point"`.
- `CATEGORY_ORDER` gains `"handover_point"`.

### `NetworkNodeDetails.jsx`

Add a `selected.category === "handover_point"` branch in the Specifications
section (alongside the existing `plant`/`pump` branches) showing Capacity
and Capacity Limitation.

### `NetworkPalette.jsx`

Expected to work unchanged since it iterates `CATEGORY_ORDER` and fetches
assets per category — verify during implementation that there's no
hardcoded category list that would silently exclude the new type.

## Out of scope

- No changes to `cityGates` (a separate, distinct collection used for demand
  delivery-point joins) — not part of this request.
- No changes to `assets.js`'s `ASSET_NAME_COLLECTIONS` — the existing
  `metrics.js`/`quality.js` joins to `handover-points` are direct, not
  through `resolveAssetNames`, so they're unaffected either way.
- No data migration/backfill script for existing thin `{id, name}`
  `handover-points` documents — they'll simply show as Handover Points with
  most fields blank until edited (no edit UI exists yet for any asset
  category, matching Plant/Pump today).
- No dedicated canvas-drawing modal for Handover Points (parallel to Pipe's
  `PipeVariablesModal`) — out of scope, not requested.
