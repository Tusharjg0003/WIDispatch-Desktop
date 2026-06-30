# Production Tab — Design Spec

**Date:** 2026-06-30
**Status:** Approved for planning
**Module:** WIDispatch Desktop — Production (dispatching)

## Purpose

The website-side submission flow lets operators submit plant production data
into the `productionInputs` collection. Once a submission is **approved**
(`submission_status: "approved"`), it must surface in this desktop app's
**Production** tab as a dispatching view: how much water each plant produced,
whether production met required demand, how much spare (dispatchable) capacity
remains, and whether the data is current enough to trust for dispatch decisions.

Only `submission_status: "approved"` records are ever shown.

## Data Model (existing MongoDB — `water_management_system`)

### `productionInputs` (source)
| Field | Type | Notes |
|-------|------|-------|
| `id` | string | business id, e.g. `prod_<ts>_<rand>` |
| `plant_id` | string | → `plants.id` |
| `handover_point_id` | string | → `handover-points.id` |
| `date` | string `YYYY-MM-DD` | reporting day |
| `actual_m3` | number | volume produced |
| `required_m3` | number \| null | demand target (null in ~64% of current rows) |
| `data_source` | string | e.g. `manual` |
| `comments` | string \| null | |
| `submission_status` | string | **filter = `approved`** |
| `submitted_by` / `approved_by` | string | → `users._id` (string form) |
| `submitted_at` / `approved_at` / `created_at` / `updated_at` | ISO string | |

### Referenced collections
- **`plants`** — join on `plants.id == productionInputs.plant_id`. Uses:
  `name`, `region`, `cluster`, `asset_type`, `entity`, `status`,
  `specifications.design_capacity`, `specifications.contracted_capacity`.
- **`handover-points`** — join on `id == handover_point_id`. Uses: `name`, `location`.
- **`users`** — join on `_id == approved_by` for the approver name (table only).

**Important:** relationships are **string-id based on custom fields**, not
Mongoose `_id` refs. Joins are done with aggregation `$lookup` on those fields.

## Architecture (Approach A)

```
Browser (Vite React)  ──HTTP──►  Express API (backend/)  ──►  MongoDB
   /production page                /api/production/*            (approved only)
```

- **Backend:** Express + native `mongodb` driver. Reads `MONGODB_URI` from the
  repo-root `.env.local`. CORS enabled for the Vite dev origin
  (`http://localhost:5173`). All queries hard-filter `submission_status:"approved"`.
- **Why native driver, not Mongoose:** joins are string-id `$lookup`s, and the
  app is read-only here, so Mongoose `populate`/write-validation add no value.
- KPIs and breakdowns are computed **server-side** via aggregation; the frontend
  renders ready-made JSON.

### Endpoints

**`GET /api/production/summary?from=&to=&plant=`**
Returns the KPI block, daily trend series, and breakdowns. All params optional;
default range = all approved data.

```jsonc
{
  "range": { "from": "2026-03-01", "to": "2026-03-13" },
  "kpis": {
    "totalProductionM3": 1950000,
    "avgDailyM3": 150000,
    "demandFulfillmentPct": 98.2,        // Σactual/Σrequired over rows with required_m3
    "rowsWithRequired": 5,                // denominator transparency
    "dispatchableHeadroomM3": 0,          // Σ(design_capacity - actual) for reporting plants
    "capacityUtilizationPct": 100.0,      // Σactual / Σdesign_capacity
    "plantsReporting": 1,
    "plantsOperationalTotal": 512,
    "latestDate": "2026-03-13",
    "isStale": false                      // latestDate older than STALE_DAYS threshold
  },
  "trend": [ { "date": "2026-03-01", "actualM3": 150000, "requiredM3": null } ],
  "byPlant": [ { "plantId": "...", "plantName": "Shoaiba Exp. I IWP",
                 "actualM3": 1950000, "designCapacityM3": 150000,
                 "utilizationPct": 100.0 } ],
  "byHandoverPoint": [ { "handoverPointId": "hp-021", "name": "...",
                         "actualM3": 1950000 } ]
}
```

**`GET /api/production/records?from=&to=&plant=`**
Table rows, joined for display:

```jsonc
[
  {
    "id": "prod_1772999763582_lqiswa",
    "date": "2026-03-01",
    "plantId": "MK - WP - DS - 0000003",
    "plantName": "Shoaiba Exp. I IWP",
    "handoverPointId": "hp-021",
    "handoverPointName": "...",
    "actualM3": 150000,
    "requiredM3": null,
    "varianceM3": null,                 // actual - required (null if no required)
    "varianceStatus": "unknown",        // "surplus" | "shortfall" | "met" | "unknown"
    "designCapacityM3": 150000,
    "utilizationPct": 100.0,
    "dataSource": "manual",
    "approvedBy": "Mohammed Al-Rashid",
    "approvedAt": "2026-03-08T19:58:34.570Z"
  }
]
```

### KPI definitions
| KPI | Formula | Null handling |
|-----|---------|---------------|
| Total Approved Production | Σ `actual_m3` | — |
| Avg Daily | Σ`actual_m3` ÷ distinct `date` count | — |
| Demand Fulfillment % | Σ`actual_m3` ÷ Σ`required_m3` over rows where `required_m3 != null` | exclude null `required_m3`; expose `rowsWithRequired` |
| Dispatchable Headroom | Σ(`design_capacity` − `actual_m3`) per reporting plant (clamped ≥ 0) | skip plants with missing/NaN `design_capacity` |
| Capacity Utilization % | Σ`actual_m3` ÷ Σ`design_capacity` | skip NaN capacities |
| Plants Reporting | distinct `plant_id` in approved set | — |
| Data Freshness | max `date`; `isStale` if older than `STALE_DAYS` (default 2) | — |

**Edge cases:** `plants.specifications.design_capacity` can be `NaN`/missing →
excluded from headroom/utilization sums (never divide by zero; return `null`
for a pct when its denominator is 0). `required_m3` null → excluded from
fulfillment, shown as "—"/"N/A" in the table.

## Frontend (`/production` route)

New page `src/pages/ProductionPage.jsx` (+ `ProductionPage.css`), reachable from
the existing Top Navigation "Production" item. Layout, top to bottom:

1. **Header + filters** — title, date-range picker, plant selector. Default range
   = all approved data.
2. **KPI cards row** — Total Production, Demand Fulfillment %, Dispatchable
   Headroom, Capacity Utilization %, Plants Reporting, Data Freshness (with a
   stale badge when `isStale`).
3. **Daily trend** — compact line/bar of `actualM3` vs `requiredM3` over the range.
4. **Breakdown** — production by plant and by handover point (bars + values).
5. **Dispatch ledger table** — date, plant, HOP, actual, required, variance
   (color-coded surplus/shortfall/met), utilization %, approved at. Sortable;
   honors the active filters.

**States:** loading skeletons; empty state ("No approved production data for the
selected range"); error state with retry. Numbers formatted with thousands
separators and `m³` unit.

**Data fetching:** a small `src/api/production.js` client wrapping the two
endpoints, base URL from `VITE_API_BASE_URL`, default `http://localhost:4000`.
The Express API listens on port `4000` (configurable via `PORT`).

## Out of scope (YAGNI)
- Editing/approving submissions in the desktop app (approval happens on the website).
- Non-approved (pending/rejected) views.
- Auth wiring (uses the existing static user shell for now).
- Real-time push; data is fetched on load and on filter change.

## Testing
- Backend: aggregation unit tests against a seeded fixture (covers null
  `required_m3`, NaN `design_capacity`, multi-plant, stale date).
- Frontend: render tests for KPI formatting, empty/error states, variance color
  logic.
