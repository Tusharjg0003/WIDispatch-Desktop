# Production Tab → Plant List + Plant Detail (mirror of production website)

**Date:** 2026-07-12
**Status:** Approved design, pending implementation plan

## Goal

Mirror the **plant page** of the production website (in `Production_website_code/`)
inside this repo's **Production tab**, read-only. Show the same data: a per-plant
**production input table** and the two charts — **Production & Capacity** (plant)
and **Water Quality Parameters** (quality). No import, data entry, approvals, or
submission workflow.

## Key facts

- Both apps use the **same MongoDB**: `mongodb://localhost:27017/water_management_system`.
  This repo's Express backend already connects to it (`backend/src/db.js`).
- Data today is real but sparse: 519 `plants`, 24 `productionInputs`, 1 `qualityRecords`,
  3 `maintenanceRecords`, 1 `outages`, 0 `qualityLimits`, 0 `contractedCapacity`.
  Charts fall back to plant `specifications` when `qualityLimits`/`contractedCapacity`
  are empty — matching the website's own fallback behavior.
- Stack difference: website is Next.js + TS + Zustand + shadcn/Tailwind + Recharts,
  routed per-plant at `/plants/[id]`. This repo is Vite + plain JSX + react-router +
  plain CSS + an Express backend.

## Architecture

### Backend (Express, port 4000, read-only, no auth)

Add two endpoints in `backend/src/` (new module `production.js`, wired in `server.js`),
querying the same collections the website uses:

- `GET /api/production/plants`
  Returns operational plants with the fields the list needs plus a computed data
  status: `{ id, external_id, name, city, entity, region, asset_type, status,
  specifications, hasData, latestDataDate }`.
  `hasData`/`latestDataDate` come from aggregating which `plant_id`s appear in
  `productionInputs` and `qualityRecords`.

- `GET /api/production/plant/:id/bundle`
  One round trip mirroring what the website store loads for a plant:
  `{ plant, productionInputs, qualityRecords, maintenanceRecords, outages,
  qualityLimits, contractedCapacities, users }`.
  `users` is trimmed to `{ id, name, email }` for "Responsible User" resolution.
  Records are scoped to the plant server-side; `_id` stripped.

Business ids align across collections: `plant.id` (e.g. `"MK - WP - DS - 0000003"`)
matches `productionInput.plant_id`, so no id remapping is needed.

### Frontend (Vite + JSX, plain CSS)

Replace the current `MetricDashboard`-based Production page. Two routes:

- `/production` — **plant list table** (mirrors `components/plants/plant-list.tsx`):
  columns Asset ID, Plant Name (+ city), Type, Entity, Region, Status,
  Contracted Capacity, **+ Data** = "Reporting" (with `latestDataDate`) or "Pending".
  Operational plants only. Top search box (name / id / city / region / entity).
  Row click → `/production/:plantId`.

- `/production/:plantId` — **plant detail**, header (plant name + back link) plus the
  three ported pieces:
  1. **Production input table** (from `production-input-table.tsx`): KPI strip
     (Contracted / Available / Delivered / Total Loss / Avg Availability),
     start/end date + Delivered/Requested status filters, per-day rows (Date,
     Contracted, Maint Loss, Outage Loss, Variance, Available, Requested,
     Delivered + status badge, Responsible User, Submitted At, Approved At).
     The maintenance/outage per-day loss math (`dayLoss`, `getContractedCapacityForDate`)
     is reproduced client-side exactly as the website computes it.
     **Export CSV kept.** Record / Import / Edit / View actions dropped.
  2. **Production & Capacity chart** (from `production-capacity-chart.tsx`):
     ComposedChart with contracted/design/maximum reference lines, capacity-lost
     band, effective-capacity line, delivered/requested lines with status-colored
     dots, out-of-spec quality diamond markers, Today reference line.
  3. **Water Quality Parameters** (from `quality-parameter-charts.tsx`): 7 per-parameter
     line charts with shaded limit range and out-of-spec dots.

### Component / file plan (frontend)

- `pages/ProductionPage.jsx` — rewritten: routes between list and detail (or a
  parent that renders `ProductionPlantList` / `ProductionPlantDetail` by param).
- `pages/ProductionPlantList.jsx` (+ styling in `ProductionPage.css`)
- `pages/ProductionPlantDetail.jsx`
- `components/production/ProductionInputTable.jsx`
- `components/production/ProductionCapacityChart.jsx`
- `components/production/QualityParameterCharts.jsx`
- `lib/productionCapacity.js` — ported `dayLoss` + `getContractedCapacityForDate` helpers.
- `api/production.js` — `fetchProductionPlants()`, `fetchPlantBundle(id)`.
- Routing in `App.jsx`: `/production` and `/production/:plantId`.

Zustand store usage → local `useState`/`useEffect` fetching the bundle endpoint.
shadcn `Table/Card/Badge/Select/Popover` → plain elements + repo CSS.
`ChartContainer` → thin wrapper div providing CSS-var chart theming for Recharts.

### Dependencies (frontend)

- `recharts` (no chart lib exists today)
- `date-fns` (components use it heavily; simpler than reimplementing)

### Styling

Match **this repo's existing light "government-card" theme**, not the website's dark
theme. Source of truth: `pages/ProductionPage.css` / `AssetRegistryPage.css` — white
cards, `#f8fafc` background, `#d0d7de` 1px borders, 2px radius, accent `#003eb1`,
bold-black KPI cards, `.ledger` tables.

- KPI strip → boxy KPI card treatment.
- Tables → white `.ledger`-style rows.
- Recharts → **light mode**: light grid, dark-ink (`#111827`) axes/labels, white
  tooltip. Keep the *semantic* series colors (green = delivered, indigo = requested,
  amber = capacity, purple = design, cyan = maximum, red = out-of-spec) because they
  encode meaning; retheme only the chrome.
- Date pickers → `<input type="date">` instead of shadcn calendar popovers.
- Status badges → boxy pill matching the repo.

## Out of scope

Import Excel, Record/Add/Edit production, approvals/submissions, maintenance & outage
tabs, the quality *record list* table (only the quality *charts* are in scope),
authentication / RBAC.

## Testing / verification

- Backend: hit both endpoints against the live DB; confirm shapes and that
  `hasData`/`latestDataDate` are correct.
- Frontend: load `/production`, confirm the list renders with Reporting/Pending;
  open a plant with data (`MK - WP - DS - 0000003`) and confirm KPI strip, per-day
  table, capacity chart, and quality charts all render; open a Pending plant and
  confirm empty-but-graceful states.
- Export CSV downloads the visible rows.
