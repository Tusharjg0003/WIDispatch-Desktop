# Asset Registry: Remove Valves/Pipelines, Redesign Plant & Pump Forms

## Goal

Simplify the Asset Registry down to two asset categories — **Plant** and **Pump
Station** — and give each a purpose-built creation form instead of the current
one-size-fits-all form. Valves and pipelines are removed as registry asset
categories everywhere they appear (Asset Registry, Network Builder, Transmission).

## Scope

Removal is **app-wide**, not just the Asset Registry page:

- Asset Registry: drop the Valves/Pipelines tabs and the `valve`/`pipeline`
  options from asset creation.
- Network Builder canvas: drop `valve`/`pipeline` from the insertable-entity
  toolbar and the asset palette. Free-form pipe drawing is unaffected — the
  toolbar's "Draw Pipe" button already lays ad-hoc edges between two nodes
  without requiring a palette asset (`NetworkBuilderPage.jsx` `draw-pipe`
  mode, toggled independently of `handlePick`'s pipeline-asset branch), so no
  canvas capability is lost.
- Transmission page: drop `valves`/`pipelines` from the asset status matrix
  (`ASSET_COLLECTIONS`).
- `resolveAssetNames` helper: drop `valves`/`pipelines` from the collections
  it searches.

The existing `valves` and `pipelines` MongoDB collections are left in place
(not dropped or migrated) — they simply become unreachable through the app.
No data cleanup script is included in this pass.

## Data model changes

### `backend/src/assetRegistry.js`

- `ASSET_CATEGORIES` shrinks to `{ plant: "plants", pump: "pumps" }`.
- The current `SPEC_FIELDS` allowlist (4 fixed keys, uniform numeric coercion)
  is replaced with a pass-through: `createAsset` stores `body.specifications`
  as given, applying numeric coercion only to keys that are unambiguously
  numeric by name (`*_capacity`, `capex`, `ccr`, `*_om`). This is needed
  because plant/pump specifications now have ~25 possible keys plus a nested
  array (pump configuration), which a fixed allowlist can't express. This is
  an internal admin tool, not a public API, so trusting the shape of
  `specifications` is an acceptable simplification.

### Plant (`plants` collection)

New `specifications` keys:

- `plant_category`: `"production" | "treatment"` — drives which sub-form
  rendered client-side; stored so the detail views know which fields to show.
- `plant_type` (production only): `"seawater_desalination" | "water_purification"`.
- Production fields: `psid`, `dispatch_id`, `production_system`,
  `water_source`, `technology`, `design_capacity`, `maximum_capacity`,
  `contracted_capacity`, `fund_status`, `plant_manager_name`, `phone_number`,
  `source`.
- Production financial fields: `ccr`, `fixed_om`, `variable_om`, `capex`.
  `project_lifetime` is **not stored** — it's computed and displayed as
  `decommissioning_date − commissioning_date` (in years), shown as "—" if
  either date is missing.
- Treatment fields: `maximum_capacity`, `expansion_date`, `treatment_level`,
  `design_capacity`, `expansion_capacity`, `source`.

Fields without a specified format (`fund_status`, `treatment_level`,
`production_system`, `source`) are plain text inputs, consistent with how
`technology`/`water_source`/`entity_type` are handled today — no invented
dropdown option lists.

### Pump (`pumps` collection)

- Common Asset Registry fields apply in full (region, coordinates, entity,
  etc.) — pumps are placed on the map/canvas like plants.
- `status` is restricted to `operational` / `inactive` only, driven by a
  single **Active toggle** in place of the common Status dropdown (no
  separate maintenance/planned/under_construction states for pumps).
- `specifications.pumps`: array of individual physical pumps inside the
  station: `{ id, name, capacity_m3_day, role: "functional" | "backup", active }`.
  Each row has its own on/off toggle independent of the station-level Active
  toggle. The UI offers separate "+ Functional" / "+ Backup" buttons that
  append a row pre-set with that role.

### Coordinates

No schema change — `latitude`/`longitude` stay as the storage fields.
X-Coordinate = longitude, Y-Coordinate = latitude (standard GIS convention).
The map location picker is purely a UI convenience that reads/writes the same
two fields as the numeric inputs (two-way sync).

## Frontend changes

### Asset Registry page

- `AssetRegistryPage.jsx`: `ASSET_TABS` becomes `Plants` / `Pumps` only.
- `CreateAssetForm.jsx` is split for clarity instead of growing into one large
  file:
  - `CreateAssetForm.jsx` — category select (`Plant` / `Pump Station`) +
    Common Asset Registry inputs (External ID, Asset Name EN/AR, Region,
    Cluster, Governorate, City, Operational Status, Entity, Entity Type,
    Activity, Asset Type, Commissioning/Decommissioning Date, X/Y coordinate
    inputs + map picker) + renders `PlantFields` or `PumpStationFields`.
  - `PlantFields.jsx` — Plant Category selector (Production/Treatment) that
    conditionally renders the Production or Treatment field set described
    above, including the Financial subsection and computed Project Lifetime
    for Production plants.
  - `PumpStationFields.jsx` — Active toggle + repeatable Pump Configuration
    list (name, capacity m³/day, role, on/off toggle, add/remove rows).
  - `MapLocationPicker.jsx` — new component, `react-leaflet` (already a
    dependency), click-to-place draggable marker synced two-way with the X/Y
    number inputs.

### Network Builder canvas

- `NetworkBuilderPage.jsx`: `INSERT_ENTITIES` / `ENTITY_ICONS` drop `valve`;
  the pipeline-asset branch inside `handlePick` is deleted.
- `NetworkPalette.jsx`, `cytoscape/buildCyStyle.js`, `cytoscape/nodeCard.js`:
  drop `valve`/`pipeline` from `CATEGORY_ORDER`, `ENTITY_TYPE_COLORS`,
  `ENTITY_TYPE_ABBREVIATIONS`, `ENTITY_TYPE_LABELS`, `CARD_TYPES`, and icon
  maps.
- `AssetMapView.jsx`: the pipeline-as-polyline rendering path (`hasLine`,
  `end_latitude`/`end_longitude` handling) is removed — plants/pumps never
  carry those fields, so this becomes dead code once pipelines are gone.

### Detail views

- `AssetDetailDrawer.jsx` / `NetworkNodeDetails.jsx`: extend the
  specifications `Row` list to surface the new plant fields (plant
  category/type, production or treatment fields, financial figures +
  computed project lifetime) and pump fields (active state, pump
  configuration table).

## Out of scope

- No migration/cleanup of existing `valves`/`pipelines` documents.
- No changes to the existing `financialEntries`/Economics approval workflow
  — the new CCR/Fixed O&M/Variable O&M/CAPEX fields on the plant record are
  a separate, simpler capture at creation time, not wired into that
  workflow.
- No new dropdown option lists invented for free-text-today fields
  (`fund_status`, `treatment_level`, `production_system`, `source`).
