# Unified Asset Registry — Design Spec

**Date:** 2026-07-10
**Status:** Approved, ready for planning
**Scope:** Restructure the Asset Registry page to mirror the reference `AssetsTaggingPage` (single unified list with cascading filters, richer list/map/help markup), scoped to the three existing categories — `plant`, `pump`, `handover_point`. Add an edit route (form + backend update endpoint). The user will supply CSS matching the reference's class names.

---

## 1. Goals & Non-Goals

### Goals
- Replace the current per-category **tab** navigation with a **single unified list** of all `plant` + `pump` + `handover_point` assets.
- Adopt the reference page's **markup and class names** so the incoming CSS lands correctly.
- Provide cascading **Activity → Asset Type → Region → Governorate** filters plus search, computed **client-side** from the loaded assets.
- Per-category **KPI strip** (Plants / Pump Stations / Handover Points / Total) with status-breakdown ribbons.
- **Map** view with markers + tooltip + popup (View / Edit buttons).
- **List** view as the reference's `professional-table` with per-row View / Edit actions.
- Full **Help modal** (SWA Tagging Codes reference).
- **CSV export** of the currently-filtered set.
- New **create** and **edit** routes backed by a single dual-mode form and a new backend update endpoint.

### Non-Goals
- **No Delete** action (the reference exposed it via a `useLayout` toolbar that is not being ported).
- No changes to the SWA activity-based KPI grouping (we use per-category grouping instead).
- No new asset categories beyond the existing three.
- No changes to `AssetDetailPage` beyond it remaining the View target.

---

## 2. Architecture Overview

Keep the app's existing shell. The sidebar rail and `WorkspaceHeader` stay; the inner content area is restructured to the reference's markup.

```
<div className="ar-shell">
  <aside className="ar-rail">
    <AssetRegistrySidebar view onShowMap onShowList onCreate onShowHelp />
  </aside>

  <div className="metric ar-page assets-tagging-page page-transition">
    <WorkspaceHeader title="Asset Registry" ... />

    {/* list mode (default) */}
    <view-kpis>            → AssetKpiCards (per-category + Total)
    <filter row>          → Activity / Asset Type / Region / Governorate / Search
    <map-view-container>  OR  <list-wrapper><professional-table>
    <help-modal-overlay>  (conditional)

    {/* create / edit modes */}
    <section className="sheet"> → AssetForm (create or edit)
  </div>
</div>
```

### Routing

| Route | Renders |
|-------|---------|
| `/asset-registry` | Unified list page (list/map + filters + KPIs + help) |
| `/asset-registry/create` | `AssetForm` (create mode) in a `sheet` |
| `/asset-registry/edit/:id` | `AssetForm` (edit mode) in a `sheet`, seeded from fetched asset |
| `/asset-registry/view/:id` | `AssetDetailPage` (unchanged) |

`AssetRegistryPage` handles `/asset-registry`, `/asset-registry/create`, and `/asset-registry/edit/:id` by inspecting the route (param/path). The `create` and `edit` modes render the form sheet in place of the list/map; the default mode renders the unified list. The old `:tab` param and `ASSET_TABS`/`VALID_TABS` machinery is removed.

---

## 3. Data Flow (client-side filtering)

Mirrors the reference: fetch once, filter in memory.

1. On mount, `fetchAssets({ limit: 5000 })` loads **all** plant+pump+handover assets (`data.assets`) and `data.kpis` is ignored in favor of client-computed KPIs over the filtered set (so KPI cards react to filters).
2. Filter state: `{ activity, assetType, region, governorate, q }`.
3. **Cascade reset** (reference effect chain):
   - changing `activity` → clear `assetType` and `region` (and `governorate`)
   - changing `assetType` → clear `region` (and `governorate`)
   - changing `region` → clear `governorate`
4. **Filter options** derived from loaded assets:
   - `activities` = distinct `activity` values.
   - `assetTypes` = distinct `asset_type` values, narrowed to the selected activity when one is set.
   - `regions` = distinct `region` values, narrowed to the selected activity when set.
   - `governorates` = distinct `governorate` values for the selected region (+ activity), empty until a region is chosen.
5. `filteredData` applies activity/assetType/region/governorate; `searchedData` further filters by `q` against name / id / region (case-insensitive).
6. KPIs, map, and list all render from `searchedData`.

No server refetch on filter change. `fetchAssets` is still called only on mount (and after a successful create/edit via a reload key).

---

## 4. Components

### 4.1 `AssetRegistryPage.jsx` (rewrite)
Owns fetch, filter state, view mode (`map` | `list`), help-modal visibility, and mode routing (list / create / edit). Renders KPI strip, filter row, active view, help modal, and the CSV export handler. Reuses the existing `ar-shell`/`ar-rail` layout and `WorkspaceHeader`.

### 4.2 `AssetKpiCards.jsx` (extend)
- Add `handover_point: "Handover Points"` to `CATEGORY_LABEL`.
- Add a **Total** card (sum across categories) with an aggregate status breakdown.
- Accept the **filtered assets** (or pre-computed per-category counts from them) rather than the server `kpis`, so cards reflect active filters. Keeps `view-kpis` / `card` / `card-status-breakdown` / `status-indicator` markup.

### 4.3 Filter row (in `AssetRegistryPage`)
Four selects (Activity, Asset Type, Region, Governorate) + a search input, using the reference's filter markup/classes. Governorate select disabled/empty until a region is selected.

### 4.4 List view — `professional-table`
Replaces `AssetListView`'s `ledger` table (or `AssetListView` is rewritten to emit the reference markup). Columns: **Generated ID · Asset Name · Activity · Asset Type · Region · Governorate · Status · Actions**. Status rendered as `status-badge <status>`. Actions: `asset-table-action-btn--view` (→ view) and `asset-table-action-btn--edit` (→ edit). Empty state uses `no-data`.

### 4.5 Map view — `map-view-container`
Rewrite/adapt `AssetMapView` to the reference's container markup: `map-header` (title + "Showing N assets with location data") and `map-container`. Keep `CircleMarker` (status-colored) — no icon-asset dependency — with `Tooltip` and a `Popup` containing asset fields and **View** / **Edit** buttons (`popup-btn view-btn` / `edit-btn`). Assets without valid coordinates are excluded from the map (existing `validCoord` logic retained).

### 4.6 Help modal
Full port of the reference `help-modal-overlay` / `help-modal` structure: region codes, activity codes, asset-type codes, and the ID-format example. The tagging-code maps are copied verbatim from the reference. Triggered by a Help control in the sidebar toolbar (`onShowHelp`).

### 4.7 `AssetRegistrySidebar.jsx` (light edit)
Add `onShowHelp` wiring to the existing Help toolbar action and keep the Map/List toggle. Add an **Export** control (CSV) if it fits the toolbar; otherwise export is triggered from the page. `onCreate` navigates to `/asset-registry/create`.

### 4.8 `AssetForm.jsx` (refactor of `CreateAssetForm`)
Dual-mode:
- **Props:** `mode` (`"create"` | `"edit"`), `initialAsset` (edit only), `onSaved`.
- **Create mode:** current behavior unchanged (category selectable, empty form, `createAsset`).
- **Edit mode:** seed `form`/`spec`/`pumps` from `initialAsset`; **category is locked** (read-only display, not a select); submit calls `updateAsset(id, payload)`; success message says "Updated".
- Preserve all existing category-specific logic (`PlantFields`, `PumpStationFields`, `HandoverPointFields`, activity/asset-type cascades, pump specifications, handover `capacity_limitation_value` coercion).
- Seeding `specifications`: split `initialAsset.specifications` back into `spec` (plant/handover) or `pumps` (pump) as appropriate.

The `create` and `edit` routes render this form inside a `sheet` (as the current create tab does).

---

## 5. Backend Changes

### 5.1 `assetRegistry.js` — `updateAsset(id, patch)`
- Locate the asset across the three collections (like `getAssetById`).
- Build an update from `TOP_LEVEL_FIELDS` + coerced `latitude`/`longitude` + `specifications` (same numeric coercion as `createAsset` via `NUMERIC_SPEC_PATTERN`).
- Category is immutable; ignore any `category`/`id` in the patch.
- Set `updated_at`; do **not** touch `created_at`.
- 404 if not found. Return the updated document (`{ category, ...doc }`).

### 5.2 `server.js` — route
```
app.put("/api/assets/:id", async (req, res) => {
  try {
    const updated = await updateAsset(req.params.id, req.body || {});
    if (!updated) return res.status(404).json({ error: "Asset not found" });
    res.json(updated);
  } catch (err) {
    console.error("asset update error:", err);
    res.status(err.statusCode || 500).json({ error: err.message || "Failed to update asset" });
  }
});
```

### 5.3 `api/metrics.js` — client
```
export async function updateAsset(id, payload) {
  const res = await fetch(`${API_BASE}/api/assets/${encodeURIComponent(id)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}
```

---

## 6. CSV Export

Client-side, over the currently-filtered/searched set. Columns: `generated_id, name, activity, asset_type, region, governorate, status`. `papaparse` is **not** a project dependency, so use a **small manual CSV serializer** (escape quotes/commas/newlines) — no new dependency. Download filename `asset-registry-filtered.csv`.

---

## 7. Frontend Routing Changes (`App.jsx`)
- Add `/asset-registry/create` → `AssetRegistryPage`.
- Add `/asset-registry/edit/:id` → `AssetRegistryPage`.
- Keep `/asset-registry/view/:id` → `AssetDetailPage`.
- Remove the generic `/asset-registry/:tab` route. **Known dependent:** `AssetDetailPage.jsx:58` builds `backTo = /asset-registry/${asset.category}`. Update that back-link to point to `/asset-registry` (the unified list) so removing the `:tab` route does not break the detail page's Back action.

---

## 8. Class-name Contract (for incoming CSS)

The following reference class names must appear exactly so the user's CSS applies:

- Page: `assets-tagging-page`
- KPIs: `view-kpis`, `card`, `card-title`, `card-value`, `card-subtitle`, `card-status-breakdown`, `status-item`, `status-indicator` (+ `operational` / `planned` / `under-construction` / `decommissioned` / `maintenance`)
- Map: `map-view-container`, `map-header`, `map-container`, `map-loading`, `asset-tooltip`, `asset-popup`, `popup-actions`, `popup-btn`, `view-btn`, `edit-btn`
- List: `list-wrapper`, `asset-list-surface`, `list-content`, `no-data`, `professional-table`, `table-header`, `table-body`, `table-row`, `table-cell`, `header`, `generated-id`, `asset-name`, `status-badge`, `action-buttons`, `asset-table-action-btn`, `asset-table-action-btn--view`, `asset-table-action-btn--edit`
- Help modal: `help-modal-overlay`, `help-modal`, `help-modal-header`, `help-modal-close`, `help-modal-content`, `help-section`, `help-codes-grid`, `help-code-item`, `help-code`, `help-label`, `help-format`

---

## 9. Testing / Verification
- Manual: load `/asset-registry`, confirm all three categories appear in one list; exercise each cascade filter and confirm dependent filters reset and options narrow; toggle map/list; open a marker popup; open the help modal.
- Create flow unchanged; new **edit** flow: open `/asset-registry/edit/:id`, confirm fields seed correctly (including specs/pumps), category is locked, save persists via `PUT`, and the list reflects the change.
- CSV export downloads the filtered rows.
- Backend: `updateAsset` on a known id returns the merged doc; unknown id → 404; category/id in body ignored.

---

## 10. Open Items (resolve at plan time)
- Exact placement of the Export/Help controls within `SidebarActionToolbar` (existing `extraActions` array vs. a page-level control).

_Resolved during self-review:_ `papaparse` is not a dependency → manual CSV serializer. `/asset-registry/:tab` is referenced only by `AssetDetailPage.jsx:58`'s back-link → repoint to `/asset-registry`.
