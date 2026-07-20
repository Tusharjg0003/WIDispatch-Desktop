# Demand Tab — City Gates Integration

**Date:** 2026-07-21
**Status:** Approved design, pending spec review

## Goal

Bring the demand website's City Gates experience into the WIDispatch desktop app,
mirroring how the Production and Transmission tabs already work. The Demand top-nav
tab becomes a searchable/filterable **City Gates table**; clicking a gate opens a
detail page with five tabs (Overview, Demand, Quality, Maintenance, Outages).

This replaces the current Demand landing (a `MetricDashboard` rollup) with the
list → detail flow used by Production and Transmission.

## Context / Data Model

The desktop backend and the demand website connect to the **same** MongoDB
(`mongodb://localhost:27017/water_management_system`). Relevant collections:

| Collection          | Role                                                        |
|---------------------|-------------------------------------------------------------|
| `cityGates`         | 836 city-gate / handover-point assets (same shape as `plants`) |
| `demandInputs`      | Daily demand records, keyed by `plant_id` → cityGate `id`; value field `required_m3` |
| `maintenanceRecords`| Shared with production; keyed by `plant_id`                  |
| `outages`           | Shared; keyed by `plant_id`                                  |
| `qualityRecords`    | Shared; keyed by `plant_id`                                  |
| `qualityLimits`     | Shared; per-parameter min/max                               |
| `contractedCapacity`| Shared; effective-dated contracted capacity                 |

City-gate documents carry `specifications.contracted_capacity`,
`specifications.design_capacity`, `specifications.maximum_capacity`, plus
`external_id`, `name`, `asset_type` ("Handover point / city gate"), `entity`,
`region`, `city`, `latitude`, `longitude`, `status`, commissioning/decommissioning
dates — identical field layout to production plants.

`demandInputs` records: `{ id, plant_id, date, required_m3, data_source, comments,
submission_status, submitted_by, submitted_at, approved_by, approved_at }`. Only
`submission_status: "approved"` records are shown in the desktop (consistent with
the existing demand summary and the "only website-approved rows shown in desktop"
rule).

Existing backend already wires a demand *summary* domain in `metrics.js`
(`DOMAINS.demand`: collection `demandInputs`, valueField `required_m3`,
groupCollection `cityGates`). That stays; we are adding the list + bundle endpoints.

## Approach

Mirror the Transmission integration: add demand-specific list and detail pages,
**reuse** the shared record components, and add new demand-only components only where
the data model diverges from production (demand has `required_m3` only — no
delivered/loss/availability). Production and transmission code is left untouched, so
there is no regression surface in those tabs.

## Backend

### New: `backend/src/demand.js` (modeled on `production.js`)

- `CITY_GATE_PROJECTION` — same field list as `PLANT_PROJECTION`.
- `listCityGates()`:
  - Load `cityGates` (projected), plus `demandInputs` (`plant_id`, `date`) and
    `qualityRecords` (`plant_id`, `sampling_datetime`).
  - Fold into a `Map<plant_id, latestIsoDate>` and derive
    `{ ...gate, hasData, latestDataDate }` per gate (reuse the `deriveDataStatus`
    logic from `production.js`; extract/share if convenient, otherwise replicate).
- `getCityGateBundle(id)`:
  - `cityGate = cityGates.findOne({ id })`; 404 (`err.statusCode = 404`) if missing.
  - Parallel load: `demandInputs` (approved, `plant_id: id`), `qualityRecords`
    (`plant_id: id`), `maintenanceRecords` (`plant_id: id`, mapped to `id: String(_id)`),
    `outages` (`plant_id: id`), `qualityLimits` (folded newest-first into
    `{ [parameter]: { min, max } }`), `contractedCapacity` (sorted `effective_from: -1`),
    `users`.
  - Return `{ cityGate, demandInputs, qualityRecords, maintenanceRecords, outages,
    qualityLimits, contractedCapacities, users }`. Use `publicUsersForRecords` (share
    the helper — extract from `production.js` or replicate) to expose only referenced
    submitters/approvers.

### Routes in `backend/src/server.js`

- `GET /api/demand/city-gates` → `listCityGates()`.
- `GET /api/demand/city-gate/:id/bundle` → `getCityGateBundle(id)` (propagate
  `err.statusCode` like the production/transmission bundle routes).

Existing `/api/demand/summary` and `/api/demand/records` are unchanged.

## Frontend

### API — `frontend/src/api/demand.js` (new)

```js
export function fetchCityGates()          // GET /api/demand/city-gates
export function fetchCityGateBundle(id)   // GET /api/demand/city-gate/:id/bundle
```

Same `getJson` helper / `API_BASE` convention as `api/production.js`.

### `pages/DemandPage.jsx` (rewrite)

Replace the `MetricDashboard` config with `return <DemandCityGateList />;`
(parallel to `ProductionPage` → `ProductionPlantList`). The `MetricDashboard`
component and `/api/demand/summary` remain in the codebase but are no longer the
Demand landing.

### `pages/DemandCityGateList.jsx` + `.css` (new — modeled on `ProductionPlantList`)

- Fetch `fetchCityGates()`.
- Search box (name / external_id / city / region / entity / asset_type) and
  filter selects for **Type** (`asset_type`), **Entity**, **Region**.
- Table columns: Asset ID, Name (+ city subline), Type (badge), Entity, Region,
  Status, Contracted (m³/day) = `specifications.contracted_capacity`, Data badge
  (`Reporting · <date>` / `Pending`).
- Row click → `navigate('/demand/' + encodeURIComponent(gate.id))`.
- Reuses `ProductionPlantList.css` classes (`ppl*`); add a `DemandCityGateList.css`
  only for any demand-specific tweaks.

### `pages/DemandCityGateDetail.jsx` + `.css` (new — modeled on `ProductionPlantDetail`)

- `useParams` → `cityGateId`; fetch `fetchCityGateBundle`.
- Tabs: `overview`, `demand`, `quality`, `maintenance`, `outages`; `?tab=` URL sync
  with `overview` as the default (drops the param), exactly like `ProductionPlantDetail`.
- Header: back link to `/demand`, gate name, meta (`asset_type · region`).
- Tab panels:
  - `overview` → `<DemandOverview cityGate={gate} cityGateId={id} bundle={bundle} />`
  - `demand` → `<DemandInputTable cityGate={gate} cityGateId={id} bundle={bundle} />`
  - `quality` → `<QualityRecordList plantId={id} bundle={bundle} />` (reused as-is)
  - `maintenance` → `<MaintenanceRecordList plantId={id} bundle={bundle} />` (reused)
  - `outages` → `<OutageRecordList plantId={id} bundle={bundle} />` (reused)
- Reuses `ProductionPlantDetail.css` (`ppd*`).

### New demand components (`frontend/src/components/demand/`)

1. **`DemandOverview.jsx`** (modeled on `PlantOverview`):
   - Basic Information card: Asset ID, City Gate Name, Gate Type, Entity,
     Contracted Capacity, Design Capacity, Maximum Capacity, Commissioning Date,
     Decommissioning Date.
   - Location card: `<SinglePlantMap ... />` (reused).
   - "Demand & Capacity" card: `<DemandCapacityChart ... />`.
   - "Water Quality Parameters" card: `<QualityParameterCharts plantId cityGateId
     bundle />` (reused — reads `bundle.qualityRecords` / `bundle.qualityLimits`).

2. **`DemandInputTable.jsx`** + `.css` (view-only; demand has only `required_m3`):
   - Date-range filter (default rolling 30 days) + submission-status filter.
   - Rows from `bundle.demandInputs`: Date, Required (m³), Data Source, Comments,
     Submission Status, Submitted By, Approved By (resolve names via `bundle.users`).
   - KPI strip: Total Required (m³), Avg/day (m³), Peak day (m³), Days reporting.
   - CSV export via the shared `toCsv`/`csvCell` helpers in `frontend/src/lib`.
   - No add/edit/import forms — desktop is view-only, matching Production/Transmission.

3. **`DemandCapacityChart.jsx`** (adapted from `ProductionCapacityChart` +
   the demand website's `production-capacity-chart.tsx`):
   - X axis: days in range. Series: Required demand (`demandInputs.required_m3`)
     against Contracted / Design / Maximum capacity reference lines, with
     maintenance + outage impact reflected the way the website chart does
     (per-day loss: full outage removes the day's contracted capacity, otherwise
     `daily_losses` entry / legacy total). Empty state when no demand data.

Optional supporting lib: a `frontend/src/lib/demandRows.js` (+ test) to build the
per-day demand rows/totals if `DemandInputTable` and `DemandCapacityChart` share the
derivation — following the `productionRows.js` precedent. Decide during planning
whether the shared derivation is worth extracting.

### Routing & nav

- `App.jsx`: add `<Route path="/demand/:cityGateId" element={<DemandCityGateDetail />} />`.
  Keep `/demand` → `DemandPage`.
- `TopNavigationBar.jsx`: no change needed — the Demand item already points at
  `/demand`, and `isActive` matches `/demand/...` via `startsWith`.

## Reused components (no changes)

`SinglePlantMap`, `MaintenanceRecordList`, `OutageRecordList`, `QualityRecordList`,
`QualityParameterCharts` — all key on `plantId` / `bundle.*` and work unchanged for
city gates, since the underlying records are the shared `maintenanceRecords`,
`outages`, `qualityRecords`, `qualityLimits` collections keyed by `plant_id`.

## Testing

- **Backend**: unit-test `listCityGates` data-status folding and
  `getCityGateBundle` shape (mirroring `production.test.js`), including the 404 path.
- **Frontend lib**: if `demandRows.js` is introduced, unit-test row building,
  filtering, totals (total/avg/peak) and CSV output, mirroring the
  `productionRows`/`productionCsv` tests.
- **Manual**: Demand tab lists city gates; filters/search work; a gate with
  `demandInputs` (e.g. `EP - WD - HP - 0000056`) shows demand rows, KPIs, and the
  capacity chart; maintenance/outage/quality tabs render via the shared components;
  `?tab=` deep-links work; a gate with no records shows clean empty states.

## Out of scope

- Editing / creating / approving demand records from the desktop (view-only).
- Changes to Production or Transmission tabs.
- The existing `/api/demand/summary` rollup dashboard (kept in code, no longer the
  Demand landing).
- Auth/RBAC (the desktop app is unauthenticated view-only).

## Risks / Notes

- City gates currently have sparse records (4 `demandInputs`, 1 maintenance, 0
  outages/quality). Components must render clean empty states — verify against a
  gate that has data and one that does not.
- City-gate `id` values contain spaces (e.g. `EP - WD - HP - 0000056`); always
  `encodeURIComponent` in routes/links (the pattern already does this).
