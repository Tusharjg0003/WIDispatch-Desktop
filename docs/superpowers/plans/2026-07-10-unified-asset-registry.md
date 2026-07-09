# Unified Asset Registry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructure the Asset Registry into a single unified list (plant + pump + handover_point) mirroring the reference `AssetsTaggingPage` markup, with cascading client-side filters, a professional-table list, map popups, a Help modal, CSV export, and new create/edit routes backed by a `PUT /api/assets/:id` endpoint.

**Architecture:** Keep the existing `ar-shell` → `ar-rail` (sidebar) + content layout and `WorkspaceHeader`. The content area gains the reference's class hooks so the user's incoming CSS applies. Assets are fetched once (`fetchAssets({ limit: 5000 })`) and filtered in-memory. Pure logic (filter/option derivation, KPI aggregation, CSV serialization, backend update-field mapping) lives in small dependency-free modules unit-tested with Node's built-in `node --test`. Components are verified with `vite build` + an explicit browser walkthrough; the update endpoint with a `curl` smoke check.

**Tech Stack:** React 18 + Vite (frontend, ESM), react-router-dom, react-leaflet + leaflet, lucide-react icons, Express + MongoDB (backend, ESM), Node v25 built-in test runner.

## Global Constraints

- **No new npm dependencies.** `papaparse` is NOT installed — CSV export uses a hand-written serializer. Tests use Node's built-in `node --test` (no vitest/jest).
- **Scope = three categories only:** `plant`, `pump`, `handover_point`. No new categories.
- **No Delete** action anywhere.
- **Class-name contract:** emit these reference class names verbatim so the user's CSS lands — `assets-tagging-page`; `view-kpis`/`card`/`card-title`/`card-value`/`card-subtitle`/`card-status-breakdown`/`status-item`/`status-indicator` (+ `operational`/`planned`/`under-construction`/`decommissioned`/`maintenance`); `map-view-container`/`map-header`/`map-container`/`map-loading`/`asset-tooltip`/`tooltip-id`/`tooltip-status`/`tooltip-location`/`asset-popup`/`popup-actions`/`popup-btn`/`view-btn`/`edit-btn`; `list-wrapper`/`asset-list-surface`/`list-content`/`no-data`/`professional-table`/`table-header`/`table-body`/`table-row`/`table-cell`/`header`/`generated-id`/`asset-name`/`status-badge`/`action-buttons`/`asset-table-action-btn`/`asset-table-action-btn--view`/`asset-table-action-btn--edit`; `help-modal-overlay`/`help-modal`/`help-modal-header`/`help-modal-close`/`help-modal-content`/`help-section`/`help-codes-grid`/`help-code-item`/`help-code`/`help-label`/`help-format`.
- **Backend field rules (existing, reused):** top-level fields limited to `TOP_LEVEL_FIELDS`; `specifications` values coerced to Number only when the key matches `/(_capacity|_percentage|_absolute|capex|ccr|_om)$/i`; `id` and `category` are immutable on update.
- **Status vocabulary:** `operational`, `maintenance`, `under_construction`, `planned`, `decommissioned` (plus `inactive` for pumps/handover). Class names replace `_` with `-`.
- **Run commands from the correct package dir:** frontend cmds from `frontend/`, backend cmds from `backend/`.

---

## File Structure

**Create:**
- `frontend/src/lib/assetFilters.js` — pure: `deriveFilterOptions`, `applyAssetFilters`, `computeCategoryKpis`.
- `frontend/src/lib/assetFilters.test.js` — `node --test` for the above.
- `frontend/src/lib/exportCsv.js` — pure `assetsToCsv` + DOM `downloadCsv`.
- `frontend/src/lib/exportCsv.test.js` — `node --test` for `assetsToCsv`.
- `frontend/src/components/AssetHelpModal.jsx` — SWA tagging-codes modal.
- `backend/src/assetUpdate.test.js` — `node --test` for `buildAssetUpdate`.

**Modify:**
- `backend/src/assetRegistry.js` — add `buildAssetUpdate` + `updateAsset`.
- `backend/src/server.js` — add `PUT /api/assets/:id`.
- `frontend/src/api/metrics.js` — add `updateAsset`.
- `frontend/src/components/CreateAssetForm.jsx` → **rename** to `frontend/src/components/AssetForm.jsx`, made dual-mode.
- `frontend/src/components/AssetKpiCards.jsx` — add Handover label + Total card.
- `frontend/src/components/AssetListView.jsx` — professional-table markup + view/edit actions.
- `frontend/src/components/AssetMapView.jsx` — `map-view-container` markup + tooltip/popup with view/edit.
- `frontend/src/components/AssetRegistrySidebar.jsx` — wire `onShowHelp` + `onExport`, `onCreate` → `/asset-registry/create`.
- `frontend/src/pages/AssetRegistryPage.jsx` — full rewrite: unified list + create/edit modes.
- `frontend/src/pages/AssetDetailPage.jsx` — back-link → `/asset-registry`.
- `frontend/src/App.jsx` — routes for list/create/edit; remove `:tab` route.

---

## Task 1: Pure filter, option-derivation, and KPI logic

**Files:**
- Create: `frontend/src/lib/assetFilters.js`
- Test: `frontend/src/lib/assetFilters.test.js`

**Interfaces:**
- Produces:
  - `deriveFilterOptions(assets, { activity?, assetType?, region? }) → { activities: string[], assetTypes: string[], regions: string[], governorates: string[] }` — distinct, sorted, honoring the cascade (assetTypes narrowed by activity; regions by activity+assetType; governorates empty unless region set).
  - `applyAssetFilters(assets, { activity?, assetType?, region?, governorate?, q? }) → asset[]` — exact match on activity/assetType/region, substring on governorate, and `q` substring over name/id/region.
  - `computeCategoryKpis(assets) → { byCategory: {plant,pump,handover_point}, statusByCategory: {cat: {status: n}}, total: number, totalStatus: {status: n} }`.
- Consumes: asset objects with fields `category, id, name, activity, asset_type, region, governorate, status`.

- [ ] **Step 1: Write the failing test**

Create `frontend/src/lib/assetFilters.test.js`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { deriveFilterOptions, applyAssetFilters, computeCategoryKpis } from "./assetFilters.js";

const SAMPLE = [
  { category: "plant", id: "P1", name: "Alpha Plant", activity: "Water production", asset_type: "Seawater desalination", region: "Riyadh", governorate: "Riyadh City", status: "operational" },
  { category: "plant", id: "P2", name: "Beta Plant", activity: "Water production", asset_type: "Water Purification", region: "Makkah", governorate: "Jeddah", status: "planned" },
  { category: "pump", id: "PS1", name: "Pump One", activity: "Water transmission", asset_type: "Transmission pipeline", region: "Riyadh", governorate: "NULL", status: "operational" },
  { category: "handover_point", id: "H1", name: "Gate One", activity: "Water distribution", asset_type: "Handover point / city gate", region: "Riyadh", governorate: "Diriyah", status: "under_construction" },
];

test("deriveFilterOptions: activities are distinct and sorted", () => {
  const { activities } = deriveFilterOptions(SAMPLE, {});
  assert.deepEqual(activities, ["Water distribution", "Water production", "Water transmission"]);
});

test("deriveFilterOptions: assetTypes narrow to selected activity", () => {
  const { assetTypes } = deriveFilterOptions(SAMPLE, { activity: "Water production" });
  assert.deepEqual(assetTypes, ["Seawater desalination", "Water Purification"]);
});

test("deriveFilterOptions: regions narrow to activity + assetType", () => {
  const { regions } = deriveFilterOptions(SAMPLE, { activity: "Water production", assetType: "Water Purification" });
  assert.deepEqual(regions, ["Makkah"]);
});

test("deriveFilterOptions: governorates empty until region chosen, excludes NULL", () => {
  assert.deepEqual(deriveFilterOptions(SAMPLE, {}).governorates, []);
  const withRegion = deriveFilterOptions(SAMPLE, { region: "Riyadh" }).governorates;
  assert.deepEqual(withRegion, ["Diriyah", "Riyadh City"]);
});

test("applyAssetFilters: activity exact match", () => {
  const out = applyAssetFilters(SAMPLE, { activity: "Water production" });
  assert.deepEqual(out.map(a => a.id), ["P1", "P2"]);
});

test("applyAssetFilters: search matches name, id, or region case-insensitively", () => {
  assert.deepEqual(applyAssetFilters(SAMPLE, { q: "beta" }).map(a => a.id), ["P2"]);
  assert.deepEqual(applyAssetFilters(SAMPLE, { q: "ps1" }).map(a => a.id), ["PS1"]);
  assert.deepEqual(applyAssetFilters(SAMPLE, { q: "makkah" }).map(a => a.id), ["P2"]);
});

test("applyAssetFilters: governorate substring match", () => {
  assert.deepEqual(applyAssetFilters(SAMPLE, { governorate: "jed" }).map(a => a.id), ["P2"]);
});

test("computeCategoryKpis: per-category counts, status breakdown, and totals", () => {
  const k = computeCategoryKpis(SAMPLE);
  assert.deepEqual(k.byCategory, { plant: 2, pump: 1, handover_point: 1 });
  assert.equal(k.total, 4);
  assert.deepEqual(k.statusByCategory.plant, { operational: 1, planned: 1 });
  assert.deepEqual(k.totalStatus, { operational: 2, planned: 1, under_construction: 1 });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && node --test src/lib/assetFilters.test.js`
Expected: FAIL — `Cannot find module './assetFilters.js'` / import error.

- [ ] **Step 3: Write the implementation**

Create `frontend/src/lib/assetFilters.js`:

```js
// Pure helpers for the Asset Registry's client-side filtering, cascade-aware
// filter option lists, and per-category KPI aggregation. No React / no
// import.meta so these can be unit-tested with `node --test`.

const uniqSorted = (values) => [...new Set(values.filter(Boolean))].sort();

export function deriveFilterOptions(assets, { activity = "", assetType = "", region = "" } = {}) {
  const activities = uniqSorted(assets.map((a) => a.activity));

  const assetTypes = uniqSorted(
    assets
      .filter((a) => !activity || a.activity === activity)
      .map((a) => a.asset_type)
  );

  const regions = uniqSorted(
    assets
      .filter((a) => (!activity || a.activity === activity) && (!assetType || a.asset_type === assetType))
      .map((a) => a.region)
  );

  const governorates = region
    ? uniqSorted(
        assets
          .filter(
            (a) =>
              a.region === region &&
              (!activity || a.activity === activity) &&
              (!assetType || a.asset_type === assetType)
          )
          .map((a) => a.governorate)
          .filter((g) => g && g !== "NULL")
      )
    : [];

  return { activities, assetTypes, regions, governorates };
}

export function applyAssetFilters(assets, { activity = "", assetType = "", region = "", governorate = "", q = "" } = {}) {
  let data = assets;
  if (activity) data = data.filter((a) => a.activity === activity);
  if (assetType) data = data.filter((a) => a.asset_type === assetType);
  if (region) data = data.filter((a) => a.region === region);
  if (governorate) {
    const g = governorate.toLowerCase();
    data = data.filter((a) => (a.governorate || "").toLowerCase().includes(g));
  }
  if (q) {
    const term = q.toLowerCase();
    data = data.filter(
      (a) =>
        (a.name || "").toLowerCase().includes(term) ||
        (a.id || "").toLowerCase().includes(term) ||
        (a.region || "").toLowerCase().includes(term)
    );
  }
  return data;
}

const KPI_CATEGORIES = ["plant", "pump", "handover_point"];

export function computeCategoryKpis(assets) {
  const byCategory = {};
  const statusByCategory = {};
  for (const cat of KPI_CATEGORIES) {
    byCategory[cat] = 0;
    statusByCategory[cat] = {};
  }
  const totalStatus = {};
  for (const a of assets) {
    if (byCategory[a.category] == null) continue;
    byCategory[a.category] += 1;
    const st = a.status || "unknown";
    statusByCategory[a.category][st] = (statusByCategory[a.category][st] || 0) + 1;
    totalStatus[st] = (totalStatus[st] || 0) + 1;
  }
  const total = KPI_CATEGORIES.reduce((sum, cat) => sum + byCategory[cat], 0);
  return { byCategory, statusByCategory, total, totalStatus };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && node --test src/lib/assetFilters.test.js`
Expected: PASS — all 8 tests pass.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/assetFilters.js frontend/src/lib/assetFilters.test.js
git commit -m "feat: add pure asset filter, option, and KPI helpers"
```

---

## Task 2: CSV export utility

**Files:**
- Create: `frontend/src/lib/exportCsv.js`
- Test: `frontend/src/lib/exportCsv.test.js`

**Interfaces:**
- Produces:
  - `assetsToCsv(assets) → string` — header + rows for columns `generated_id,name,activity,asset_type,region,governorate,status`; cells with `"`, `,`, or newline are quoted/escaped.
  - `downloadCsv(filename, csv) → void` — triggers a browser download (DOM; not unit-tested).

- [ ] **Step 1: Write the failing test**

Create `frontend/src/lib/exportCsv.test.js`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { assetsToCsv } from "./exportCsv.js";

test("assetsToCsv: header + one row in column order", () => {
  const csv = assetsToCsv([
    { id: "P1", name: "Alpha", activity: "Water production", asset_type: "Seawater desalination", region: "Riyadh", governorate: "Riyadh City", status: "operational" },
  ]);
  assert.equal(
    csv,
    "generated_id,name,activity,asset_type,region,governorate,status\n" +
      "P1,Alpha,Water production,Seawater desalination,Riyadh,Riyadh City,operational"
  );
});

test("assetsToCsv: escapes commas, quotes, and treats NULL governorate as blank", () => {
  const csv = assetsToCsv([
    { id: "H1", name: 'Gate "A", North', activity: "", asset_type: "", region: "", governorate: "NULL", status: "" },
  ]);
  const dataRow = csv.split("\n")[1];
  assert.equal(dataRow, 'H1,"Gate ""A"", North",,,,,');
});

test("assetsToCsv: empty list yields header only", () => {
  assert.equal(assetsToCsv([]), "generated_id,name,activity,asset_type,region,governorate,status");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && node --test src/lib/exportCsv.test.js`
Expected: FAIL — cannot find `./exportCsv.js`.

- [ ] **Step 3: Write the implementation**

Create `frontend/src/lib/exportCsv.js`:

```js
// Hand-written CSV serializer for the filtered Asset Registry export.
// (papaparse is intentionally NOT a dependency.)

const COLUMNS = [
  ["generated_id", (a) => a.id || ""],
  ["name", (a) => a.name || a.asset_name_ar || ""],
  ["activity", (a) => a.activity || ""],
  ["asset_type", (a) => a.asset_type || ""],
  ["region", (a) => a.region || ""],
  ["governorate", (a) => (a.governorate && a.governorate !== "NULL" ? a.governorate : "")],
  ["status", (a) => a.status || ""],
];

function escapeCell(value) {
  const s = String(value ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function assetsToCsv(assets) {
  const header = COLUMNS.map(([name]) => name).join(",");
  const rows = assets.map((a) => COLUMNS.map(([, get]) => escapeCell(get(a))).join(","));
  return [header, ...rows].join("\n");
}

export function downloadCsv(filename, csv) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && node --test src/lib/exportCsv.test.js`
Expected: PASS — all 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/exportCsv.js frontend/src/lib/exportCsv.test.js
git commit -m "feat: add CSV export utility for filtered assets"
```

---

## Task 3: Backend update endpoint + API client

**Files:**
- Modify: `backend/src/assetRegistry.js` (add `buildAssetUpdate` + `updateAsset`)
- Modify: `backend/src/server.js` (add `PUT /api/assets/:id`)
- Modify: `frontend/src/api/metrics.js` (add `updateAsset`)
- Test: `backend/src/assetUpdate.test.js` (`node --test` for `buildAssetUpdate`)

**Interfaces:**
- Consumes: existing `ASSET_CATEGORIES`, `TOP_LEVEL_FIELDS`, `NUMERIC_SPEC_PATTERN`, `finite`, `getDb` in `assetRegistry.js`.
- Produces:
  - `buildAssetUpdate(patch) → object` — the `$set` payload: only `TOP_LEVEL_FIELDS` present in patch, coerced `latitude`/`longitude`, coerced `specifications`, and `updated_at`. Ignores `id`/`category`.
  - `updateAsset(id, patch) → { category, ...doc } | null` — locates the asset across the 3 collections, applies `buildAssetUpdate`, returns the refreshed doc or `null` if not found.
  - `PUT /api/assets/:id` → 200 with updated doc, 404 if not found, 4xx/500 on error.
  - `updateAsset(id, payload) → Promise<doc>` (frontend, `api/metrics.js`).

- [ ] **Step 1: Write the failing test**

Create `backend/src/assetUpdate.test.js`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildAssetUpdate } from "./assetRegistry.js";

test("buildAssetUpdate: keeps allowed top-level fields, ignores id/category", () => {
  const out = buildAssetUpdate({ name: "New Name", region: "Makkah", id: "X", category: "pump" });
  assert.equal(out.name, "New Name");
  assert.equal(out.region, "Makkah");
  assert.equal("id" in out, false);
  assert.equal("category" in out, false);
});

test("buildAssetUpdate: coerces coordinates, blank -> null", () => {
  assert.equal(buildAssetUpdate({ latitude: "24.5" }).latitude, 24.5);
  assert.equal(buildAssetUpdate({ longitude: "" }).longitude, null);
});

test("buildAssetUpdate: coerces numeric-by-name spec keys, keeps others as-is, drops blanks", () => {
  const out = buildAssetUpdate({
    specifications: { design_capacity: "1000", plant_kind: "RO", note: "" },
  });
  assert.deepEqual(out.specifications, { design_capacity: 1000, plant_kind: "RO" });
});

test("buildAssetUpdate: always stamps updated_at", () => {
  assert.equal(typeof buildAssetUpdate({}).updated_at, "string");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && node --test src/assetUpdate.test.js`
Expected: FAIL — `buildAssetUpdate` is not exported / not a function.

- [ ] **Step 3: Implement `buildAssetUpdate` + `updateAsset`**

In `backend/src/assetRegistry.js`, append after `createAsset` (end of file):

```js
// Build the $set payload for an update: only allowed top-level fields present
// in the patch, coerced coordinates and specifications, plus updated_at.
// id and category are immutable, so they are never emitted.
export function buildAssetUpdate(patch = {}) {
  const update = {};
  for (const f of TOP_LEVEL_FIELDS) {
    if (patch[f] !== undefined) update[f] = patch[f];
  }
  if (patch.latitude !== undefined) {
    update.latitude = patch.latitude === "" || patch.latitude == null ? null : finite(Number(patch.latitude));
  }
  if (patch.longitude !== undefined) {
    update.longitude = patch.longitude === "" || patch.longitude == null ? null : finite(Number(patch.longitude));
  }
  if (patch.specifications && typeof patch.specifications === "object") {
    const spec = {};
    for (const [f, v] of Object.entries(patch.specifications)) {
      if (v == null || v === "") continue;
      spec[f] = NUMERIC_SPEC_PATTERN.test(f) ? finite(Number(v)) : v;
    }
    update.specifications = spec;
  }
  update.updated_at = new Date().toISOString();
  return update;
}

export async function updateAsset(id, patch = {}) {
  const db = await getDb();
  let found = null;
  for (const [cat, collection] of Object.entries(ASSET_CATEGORIES)) {
    const doc = await db.collection(collection).findOne({ id }, { projection: { _id: 0, id: 1 } });
    if (doc) {
      found = { category: cat, collection };
      break;
    }
  }
  if (!found) return null;

  await db.collection(found.collection).updateOne({ id }, { $set: buildAssetUpdate(patch) });
  const updated = await db.collection(found.collection).findOne({ id }, { projection: { _id: 0 } });
  return { category: found.category, ...updated };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && node --test src/assetUpdate.test.js`
Expected: PASS — all 4 tests pass.

- [ ] **Step 5: Add the PUT route**

In `backend/src/server.js`, update the `assetRegistry` import (currently line 7) to include `updateAsset`. Change:

```js
import { listAssets, createAsset, getAssetById } from "./assetRegistry.js";
```

to:

```js
import { listAssets, createAsset, getAssetById, updateAsset } from "./assetRegistry.js";
```

Then add this route immediately after the `app.post("/api/assets", ...)` handler (after its closing `});`):

```js
app.put("/api/assets/:id", async (req, res) => {
  try {
    const { category, id, ...patch } = req.body || {};
    const updated = await updateAsset(req.params.id, patch);
    if (!updated) return res.status(404).json({ error: "Asset not found" });
    res.json(updated);
  } catch (err) {
    console.error("asset update error:", err);
    res.status(err.statusCode || 500).json({ error: err.message || "Failed to update asset" });
  }
});
```

- [ ] **Step 6: Add the frontend API client**

In `frontend/src/api/metrics.js`, add after the existing `createAsset` export:

```js
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

- [ ] **Step 7: Smoke-test the endpoint (requires dev backend + Mongo running)**

Start the backend in one shell: `cd backend && npm run dev`

In another shell, pick a real asset id and round-trip an update (replace `<ID>`):

```bash
ID=$(curl -s "http://localhost:4000/api/assets?limit=1" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.parse(s).assets[0].id))")
echo "Using id: $ID"
curl -s -X PUT "http://localhost:4000/api/assets/$ID" -H "Content-Type: application/json" -d '{"city":"SmokeTest City"}' | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const a=JSON.parse(s);console.log('city =>',a.city,'| updated_at =>',a.updated_at)})"
```

Expected: prints `city => SmokeTest City` and a fresh `updated_at`. Also verify a bad id 404s:

```bash
curl -s -o /dev/null -w "%{http_code}\n" -X PUT "http://localhost:4000/api/assets/does-not-exist" -H "Content-Type: application/json" -d '{"city":"x"}'
```

Expected: `404`.

- [ ] **Step 8: Commit**

```bash
git add backend/src/assetRegistry.js backend/src/assetUpdate.test.js backend/src/server.js frontend/src/api/metrics.js
git commit -m "feat: add PUT /api/assets/:id update endpoint and client"
```

---

## Task 4: Dual-mode AssetForm (rename CreateAssetForm)

**Files:**
- Rename: `frontend/src/components/CreateAssetForm.jsx` → `frontend/src/components/AssetForm.jsx` (via `git mv`), then modify.
- Modify: `frontend/src/pages/AssetRegistryPage.jsx` (only the import + the create-tab usage, to keep the build green; full rewrite happens in Task 9).

**Interfaces:**
- Consumes: `createAsset`, `updateAsset` from `../api/metrics`; existing `Field`, `Toggle`, `MapLocationPicker`, `PlantFields`, `PumpStationFields`, `HandoverPointFields`.
- Produces: `AssetForm({ mode = "create", defaultCategory = "plant", initialAsset = null, onSaved })` — create mode identical to today's behavior; edit mode seeds all fields from `initialAsset`, locks the category, and submits via `updateAsset(initialAsset.id, payload)`. Calls `onSaved(savedDoc)` after success.

- [ ] **Step 1: Rename the file**

```bash
cd /Users/tushar/Desktop/WIDispatch-Desktop
git mv frontend/src/components/CreateAssetForm.jsx frontend/src/components/AssetForm.jsx
```

- [ ] **Step 2: Convert to dual-mode**

Replace the entire contents of `frontend/src/components/AssetForm.jsx` with:

```jsx
import React, { useState } from "react";
import { createAsset, updateAsset } from "../api/metrics";
import { Field, Toggle } from "./AssetFormControls";
import MapLocationPicker from "./MapLocationPicker";
import PlantFields from "./PlantFields";
import PumpStationFields from "./PumpStationFields";
import HandoverPointFields from "./HandoverPointFields";

const CATEGORIES = [
  { value: "plant", label: "Plant" },
  { value: "pump", label: "Pump Station" },
  { value: "handover_point", label: "Handover Point" },
];
const CATEGORY_LABEL = Object.fromEntries(CATEGORIES.map((c) => [c.value, c.label]));

const STATUSES = ["operational", "maintenance", "under_construction", "planned", "decommissioned"];
const HANDOVER_STATUSES = ["planned", "under_construction", "operational", "decommissioned", "inactive"];
const statusLabel = (s) => s.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());

const ACTIVITY_ASSET_TYPES = {
  "Water distribution": ["Handover point / city gate", "Distribution network", "Filling station"],
  "Wastewater collection": ["Collection network"],
  "TSE reuse": ["Filling station"],
};
const DEFAULT_ACTIVITY = "Water distribution";

const REGIONS = [
  "Riyadh", "Makkah", "Madinah", "Eastern Province", "Asir", "Tabuk", "Qassim",
  "Hail", "Northern Borders", "Jazan", "Najran", "Al Bahah", "Al Jouf",
];

const EMPTY_FORM = {
  category: "plant", name: "", external_id: "", asset_name_ar: "",
  entity: "", entity_type: "", activity: "", asset_type: "", region: "",
  cluster: "", governorate: "", city: "", latitude: "", longitude: "",
  status: "planned", commissioning_date: "", decommissioning_date: "", active: true,
};

// Map a fetched asset document back into the flat form shape.
function formFromAsset(asset) {
  return {
    category: asset.category || "plant",
    name: asset.name || "",
    external_id: asset.external_id || "",
    asset_name_ar: asset.asset_name_ar || "",
    entity: asset.entity || "",
    entity_type: asset.entity_type || "",
    activity: asset.activity || "",
    asset_type: asset.asset_type || "",
    region: asset.region || "",
    cluster: asset.cluster || "",
    governorate: asset.governorate && asset.governorate !== "NULL" ? asset.governorate : "",
    city: asset.city || "",
    latitude: asset.latitude ?? "",
    longitude: asset.longitude ?? "",
    status: asset.status || "planned",
    commissioning_date: asset.commissioning_date || "",
    decommissioning_date: asset.decommissioning_date || "",
    active: asset.active ?? true,
  };
}

export default function AssetForm({ mode = "create", defaultCategory = "plant", initialAsset = null, onSaved }) {
  const isEdit = mode === "edit";
  const [form, setForm] = useState(
    isEdit && initialAsset ? formFromAsset(initialAsset) : { ...EMPTY_FORM, category: defaultCategory }
  );
  const [spec, setSpec] = useState(
    isEdit && initialAsset && initialAsset.category !== "pump" ? { ...(initialAsset.specifications || {}) } : {}
  );
  const [pumps, setPumps] = useState(
    isEdit && initialAsset && initialAsset.category === "pump" ? [...(initialAsset.specifications?.pumps || [])] : []
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const setSpecField = (k) => (e) => setSpec((s) => ({ ...s, [k]: e.target.value }));

  const changeCategory = (e) => {
    const category = e.target.value;
    const wasHandover = form.category === "handover_point";
    const isHandover = category === "handover_point";
    setForm((f) => ({
      ...f,
      category,
      status: category === "pump" ? "inactive" : "planned",
      ...(isHandover && {
        activity: DEFAULT_ACTIVITY,
        asset_type: ACTIVITY_ASSET_TYPES[DEFAULT_ACTIVITY][0],
        region: "",
      }),
      ...(wasHandover && !isHandover && { activity: "", asset_type: "", region: "" }),
    }));
    setSpec({});
    setPumps([]);
  };

  const changeActivity = (e) => {
    const activity = e.target.value;
    const types = ACTIVITY_ASSET_TYPES[activity] || [];
    setForm((f) => ({ ...f, activity, asset_type: types[0] || "" }));
  };

  const setCoords = (lat, lng) => setForm((f) => ({ ...f, latitude: lat, longitude: lng }));

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(null);
    const { category, latitude, longitude, ...top } = form;
    const specifications = category === "pump"
      ? { pumps: pumps.map((p) => ({ ...p, capacity_m3_day: p.capacity_m3_day === "" ? null : Number(p.capacity_m3_day) })) }
      : category === "handover_point"
      ? {
          ...spec,
          capacity_limitation_value:
            spec.capacity_limitation_value === "" || spec.capacity_limitation_value == null
              ? null
              : Number(spec.capacity_limitation_value),
        }
      : spec;
    const payload = { category, ...top, latitude, longitude, specifications };
    try {
      if (isEdit) {
        const updated = await updateAsset(initialAsset.id, payload);
        setSuccess(`Updated “${updated.name}” (${updated.id}).`);
        onSaved?.(updated);
      } else {
        const created = await createAsset(payload);
        setSuccess(`Created “${created.name}” (${created.id}).`);
        setForm({
          ...EMPTY_FORM,
          category,
          ...(category === "handover_point" && {
            activity: DEFAULT_ACTIVITY,
            asset_type: ACTIVITY_ASSET_TYPES[DEFAULT_ACTIVITY][0],
          }),
        });
        setSpec({});
        setPumps([]);
        onSaved?.(created);
      }
    } catch (err) {
      setError(err.message || (isEdit ? "Failed to update asset" : "Failed to create asset"));
    } finally {
      setSaving(false);
    }
  };

  const isPump = form.category === "pump";
  const isHandover = form.category === "handover_point";

  return (
    <form className="af__body af__body--page" onSubmit={submit}>
      <div className="af__section">Classification</div>
      <div className="af__grid">
        <Field label="Category *">
          {isEdit ? (
            <input value={CATEGORY_LABEL[form.category] || form.category} readOnly disabled />
          ) : (
            <select value={form.category} onChange={changeCategory} required>
              {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          )}
        </Field>
        {isHandover ? (
          <>
            <Field label="Activity *">
              <select value={form.activity} onChange={changeActivity} required>
                {Object.keys(ACTIVITY_ASSET_TYPES).map((a) => <option key={a} value={a}>{a}</option>)}
              </select>
            </Field>
            <Field label="Asset Type *">
              <select value={form.asset_type} onChange={set("asset_type")} required>
                {(ACTIVITY_ASSET_TYPES[form.activity] || []).map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </Field>
          </>
        ) : (
          <>
            <Field label="Asset Type *">
              <input value={form.asset_type} onChange={set("asset_type")} required placeholder="e.g. Seawater desalination" />
            </Field>
            <Field label="Activity *">
              <input value={form.activity} onChange={set("activity")} required placeholder="e.g. Water production" />
            </Field>
          </>
        )}
      </div>

      <div className="af__section">Identity</div>
      <div className="af__grid">
        <Field label="External ID"><input value={form.external_id} onChange={set("external_id")} /></Field>
        <Field label="Asset Name (EN) *"><input value={form.name} onChange={set("name")} required placeholder="Asset name" /></Field>
        <Field label="Asset Name (AR)"><input value={form.asset_name_ar} onChange={set("asset_name_ar")} dir="rtl" /></Field>
        <Field label="Entity"><input value={form.entity} onChange={set("entity")} /></Field>
        <Field label="Entity Type"><input value={form.entity_type} onChange={set("entity_type")} placeholder="e.g. Private" /></Field>
      </div>

      <div className="af__section">Location</div>
      <div className="af__grid">
        <Field label="Region *">
          {isHandover ? (
            <select value={form.region} onChange={set("region")} required>
              <option value="" disabled>Select region</option>
              {REGIONS.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          ) : (
            <input value={form.region} onChange={set("region")} required />
          )}
        </Field>
        <Field label="Cluster"><input value={form.cluster} onChange={set("cluster")} /></Field>
        <Field label="Governorate"><input value={form.governorate} onChange={set("governorate")} /></Field>
        <Field label="City"><input value={form.city} onChange={set("city")} /></Field>
        <Field label="X-Coordinate (Longitude)"><input type="number" step="any" value={form.longitude} onChange={set("longitude")} /></Field>
        <Field label="Y-Coordinate (Latitude)"><input type="number" step="any" value={form.latitude} onChange={set("latitude")} /></Field>
      </div>
      <MapLocationPicker latitude={form.latitude} longitude={form.longitude} onChange={setCoords} />

      <div className="af__section">Lifecycle</div>
      <div className="af__grid">
        {isPump ? (
          <Toggle
            label="Active"
            checked={form.status === "operational"}
            onChange={(v) => setForm((f) => ({ ...f, status: v ? "operational" : "inactive" }))}
          />
        ) : (
          <Field label="Operational Status">
            <select value={form.status} onChange={set("status")}>
              {(isHandover ? HANDOVER_STATUSES : STATUSES).map((s) => <option key={s} value={s}>{statusLabel(s)}</option>)}
            </select>
          </Field>
        )}
        {isHandover && (
          <Toggle
            label="Active"
            checked={form.active}
            onChange={(v) => setForm((f) => ({ ...f, active: v }))}
          />
        )}
        <Field label="Commissioning Date"><input type="date" value={form.commissioning_date} onChange={set("commissioning_date")} /></Field>
        <Field label="Decommissioning Date"><input type="date" value={form.decommissioning_date} onChange={set("decommissioning_date")} /></Field>
      </div>

      {form.category === "plant" && (
        <PlantFields
          spec={spec}
          set={setSpecField}
          commissioningDate={form.commissioning_date}
          decommissioningDate={form.decommissioning_date}
        />
      )}
      {isPump && <PumpStationFields pumps={pumps} setPumps={setPumps} />}
      {isHandover && <HandoverPointFields spec={spec} set={setSpecField} />}

      {error && <div className="af__error">{error}</div>}
      {success && <div className="af__success">{success}</div>}

      <footer className="af__footer">
        <button type="submit" className="af__btn af__btn--primary" disabled={saving}>
          {saving ? "Saving…" : isEdit ? "Save changes" : "Create asset"}
        </button>
      </footer>
    </form>
  );
}
```

- [ ] **Step 3: Keep the current page building**

In `frontend/src/pages/AssetRegistryPage.jsx`, update the import and the create-tab usage so the build stays green (this file is fully rewritten in Task 9):

Change:
```jsx
import CreateAssetForm from "../components/CreateAssetForm";
```
to:
```jsx
import AssetForm from "../components/AssetForm";
```

Change:
```jsx
            <CreateAssetForm onCreated={() => setReloadKey((n) => n + 1)} />
```
to:
```jsx
            <AssetForm mode="create" onSaved={() => setReloadKey((n) => n + 1)} />
```

- [ ] **Step 4: Verify the build compiles**

Run: `cd frontend && npm run build`
Expected: build succeeds (no unresolved import / no reference to `CreateAssetForm`).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/AssetForm.jsx frontend/src/pages/AssetRegistryPage.jsx
git commit -m "refactor: make asset form dual-mode (create + edit)"
```

---

## Task 5: Per-category + Total KPI cards

**Files:**
- Modify: `frontend/src/components/AssetKpiCards.jsx`

**Interfaces:**
- Consumes: `kpis` shaped as `computeCategoryKpis` output (`byCategory`, `statusByCategory`, `total`, `totalStatus`).
- Produces: `<AssetKpiCards kpis={...} />` rendering `view-kpis` with Plants / Pump Stations / Handover Points cards + a Total Assets card, each with a status-breakdown ribbon.

- [ ] **Step 1: Replace the component**

Replace the entire contents of `frontend/src/components/AssetKpiCards.jsx` with:

```jsx
import React from "react";

const STATUS_ORDER = ["operational", "maintenance", "under_construction", "planned", "decommissioned"];
const STATUS_LABEL = {
  operational: "Operational",
  maintenance: "Maintenance",
  under_construction: "Under Construction",
  planned: "Planned",
  decommissioned: "Decommissioned",
};
const CATEGORY_LABEL = { plant: "Plants", pump: "Pump Stations", handover_point: "Handover Points" };

function Breakdown({ statuses }) {
  const breakdown = STATUS_ORDER.filter((s) => statuses[s] > 0);
  if (breakdown.length === 0) return null;
  return (
    <div className="card-status-breakdown">
      {breakdown.map((s) => (
        <div className="status-item" key={s}>
          <span className={`status-indicator ${s.replace(/_/g, "-")}`} />
          <span>{STATUS_LABEL[s]} {statuses[s]}</span>
        </div>
      ))}
    </div>
  );
}

// Per-category KPI strip (Plants / Pump Stations / Handover Points) plus a
// Total card, styled after the reference "view-kpis" strip. Counts come from
// the currently-filtered asset set so cards react to the filters.
export default function AssetKpiCards({ kpis }) {
  if (!kpis) return null;
  return (
    <div className="view-kpis">
      {Object.keys(CATEGORY_LABEL).map((cat) => (
        <div className="card" key={cat}>
          <div className="card-title">{CATEGORY_LABEL[cat]}</div>
          <div className="card-value">{kpis.byCategory?.[cat] || 0}</div>
          <div className="card-subtitle">Total assets</div>
          <Breakdown statuses={kpis.statusByCategory?.[cat] || {}} />
        </div>
      ))}
      <div className="card">
        <div className="card-title">Total Assets</div>
        <div className="card-value">{kpis.total || 0}</div>
        <div className="card-subtitle">All categories</div>
        <Breakdown statuses={kpis.totalStatus || {}} />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify the build compiles**

Run: `cd frontend && npm run build`
Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/AssetKpiCards.jsx
git commit -m "feat: add handover + total KPI cards from filtered set"
```

---

## Task 6: Professional-table list view

**Files:**
- Modify: `frontend/src/components/AssetListView.jsx`

**Interfaces:**
- Produces: `<AssetListView assets={asset[]} onView={(a)=>void} onEdit={(a)=>void} />` rendering the reference `professional-table` with a `no-data` empty state and per-row `asset-table-action-btn--view` / `--edit` buttons.

- [ ] **Step 1: Replace the component**

Replace the entire contents of `frontend/src/components/AssetListView.jsx` with:

```jsx
import React from "react";
import { ArrowUpRight, Edit3 } from "lucide-react";

const statusLabel = (s) => (s ? s.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase()) : "Unknown");
const gov = (a) => (a.governorate && a.governorate !== "NULL" ? a.governorate : "N/A");

export default function AssetListView({ assets, onView, onEdit }) {
  return (
    <div className="list-wrapper asset-list-surface">
      <div className="list-content">
        {assets.length === 0 ? (
          <div className="no-data"><p>No entities found for the selected filters.</p></div>
        ) : (
          <div className="professional-table">
            <div className="table-header">
              <div className="table-cell header">Generated ID</div>
              <div className="table-cell header">Asset Name</div>
              <div className="table-cell header">Activity</div>
              <div className="table-cell header">Asset Type</div>
              <div className="table-cell header">Region</div>
              <div className="table-cell header">Governorate</div>
              <div className="table-cell header">Status</div>
              <div className="table-cell header">Actions</div>
            </div>
            <div className="table-body">
              {assets.map((item) => {
                const status = item.status || "unknown";
                return (
                  <div key={`${item.category}-${item.id}`} className="table-row">
                    <div className="table-cell"><span className="generated-id">{item.id || "N/A"}</span></div>
                    <div className="table-cell"><span className="asset-name">{item.name || item.asset_name_ar || "Unnamed Asset"}</span></div>
                    <div className="table-cell">{item.activity || "N/A"}</div>
                    <div className="table-cell">{item.asset_type || "N/A"}</div>
                    <div className="table-cell">{item.region || "N/A"}</div>
                    <div className="table-cell">{gov(item)}</div>
                    <div className="table-cell"><span className={`status-badge ${status}`}>{statusLabel(status)}</span></div>
                    <div className="table-cell">
                      <div className="action-buttons">
                        <button
                          className="asset-table-action-btn asset-table-action-btn--view"
                          onClick={() => onView(item)}
                          title="View Details"
                        >
                          <ArrowUpRight size={13} />
                        </button>
                        <button
                          className="asset-table-action-btn asset-table-action-btn--edit"
                          onClick={() => onEdit(item)}
                          title="Edit"
                        >
                          <Edit3 size={13} />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify the build compiles**

Run: `cd frontend && npm run build`
Expected: build succeeds (`ArrowUpRight`, `Edit3` exist in lucide-react).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/AssetListView.jsx
git commit -m "feat: professional-table list view with view/edit actions"
```

---

## Task 7: Map view with reference container + popups

**Files:**
- Modify: `frontend/src/components/AssetMapView.jsx`

**Interfaces:**
- Produces: `<AssetMapView assets={asset[]} onView={(a)=>void} onEdit={(a)=>void} />` rendering `map-view-container` (header count + `map-container`), status-colored `CircleMarker`s with a `Tooltip` and a `Popup` carrying View / Edit buttons.

- [ ] **Step 1: Replace the component**

Replace the entire contents of `frontend/src/components/AssetMapView.jsx` with:

```jsx
import React, { useEffect, useMemo } from "react";
import { MapContainer, TileLayer, CircleMarker, Tooltip, Popup, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";

const STATUS_COLOR = {
  operational: "#10b981",
  maintenance: "#f59e0b",
  under_construction: "#3b82f6",
  planned: "#3b82f6",
  decommissioned: "#ef4444",
};
const statusLabel = (s) => (s ? s.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase()) : "Unknown");
const gov = (a) => (a.governorate && a.governorate !== "NULL" ? a.governorate : "Unknown");

const validCoord = (lat, lng) =>
  Number.isFinite(lat) && Number.isFinite(lng) &&
  Math.abs(lat) <= 90 && Math.abs(lng) <= 180 &&
  !(lat === 0 && lng === 0);

function FitBounds({ points }) {
  const map = useMap();
  useEffect(() => {
    if (points.length === 0) return;
    if (points.length === 1) map.setView(points[0], 9);
    else map.fitBounds(points, { padding: [40, 40] });
  }, [map, points]);
  return null;
}

export default function AssetMapView({ assets, onView, onEdit }) {
  const located = useMemo(() => assets.filter((a) => validCoord(a.latitude, a.longitude)), [assets]);
  const points = useMemo(() => located.map((a) => [a.latitude, a.longitude]), [located]);

  return (
    <div className="map-view-container">
      <div className="map-header">
        <h3>Asset Locations</h3>
        <p>Showing {located.length} assets with location data</p>
      </div>
      <div className="map-container">
        {located.length === 0 ? (
          <div className="map-loading"><p>None of these assets have valid coordinates to map.</p></div>
        ) : (
          <MapContainer center={[24, 45]} zoom={5} style={{ height: "100%", width: "100%" }} scrollWheelZoom>
            <TileLayer
              attribution="&copy; OpenStreetMap contributors"
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            <FitBounds points={points} />
            {located.map((a) => {
              const color = STATUS_COLOR[a.status] || "#3b82f6";
              return (
                <CircleMarker
                  key={`${a.category}-${a.id}`}
                  center={[a.latitude, a.longitude]}
                  radius={6}
                  pathOptions={{ color, fillColor: color, fillOpacity: 0.8, weight: 1.5 }}
                >
                  <Tooltip direction="top" offset={[0, -6]} sticky>
                    <div className="asset-tooltip">
                      <strong>{a.name || a.id}</strong><br />
                      <span className="tooltip-id">ID: {a.id}</span><br />
                      <span className="tooltip-status">Status: {statusLabel(a.status)}</span><br />
                      <span className="tooltip-location">{a.region || "Unknown"}, {gov(a)}</span>
                    </div>
                  </Tooltip>
                  <Popup>
                    <div className="asset-popup">
                      <h4>{a.name || a.id}</h4>
                      <p><strong>ID:</strong> {a.id}</p>
                      <p><strong>Status:</strong> {statusLabel(a.status)}</p>
                      <p><strong>Region:</strong> {a.region || "Unknown"}</p>
                      <p><strong>Governorate:</strong> {gov(a)}</p>
                      <div className="popup-actions">
                        <button className="popup-btn view-btn" onClick={() => onView(a)}>View Details</button>
                        <button className="popup-btn edit-btn" onClick={() => onEdit(a)}>Edit</button>
                      </div>
                    </div>
                  </Popup>
                </CircleMarker>
              );
            })}
          </MapContainer>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify the build compiles**

Run: `cd frontend && npm run build`
Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/AssetMapView.jsx
git commit -m "feat: map view with reference container, tooltip, and popup"
```

---

## Task 8: Help modal (SWA tagging codes)

**Files:**
- Create: `frontend/src/components/AssetHelpModal.jsx`

**Interfaces:**
- Produces: `<AssetHelpModal onClose={()=>void} />` rendering the reference `help-modal-overlay` / `help-modal` structure with region, activity, and asset-type code tables + ID-format section. Overlay click and close button both call `onClose`; inner click is stopped.

- [ ] **Step 1: Create the component**

Create `frontend/src/components/AssetHelpModal.jsx`:

```jsx
import React from "react";
import { X } from "lucide-react";

const REGION_CODES = {
  "Al Baha": "BA", "Eastern Province": "EP", "Madinah": "MD", "Northern Borders": "NB",
  "Tabuk": "TA", "Al Jawf": "JW", "Hail": "HA", "Makkah": "MK", "Qassim": "QS",
  "Asir": "AS", "Jizan": "JZ", "Najran": "NJ", "Riyadh": "RI",
};
const ACTIVITY_CODES = {
  "Water resources": "WR", "Water production": "WP", "Water transmission": "WT",
  "Strategic storage": "SS", "Water distribution": "WD", "Wastewater collection": "SC",
  "Wastewater treatment": "ST", "TSE reuse": "TR",
};
const ASSET_TYPE_CODES = {
  "Groundwater wells": "GW", "Surface water dams": "SW", "Seawater desalination": "DS",
  "Water Purification": "PR", "Transmission pipeline": "TP", "Operational storage": "OS",
  "Strategic storage": "SS", "Handover point / city gate": "HP", "Distribution network": "DR",
  "Filling station": "FS", "Collection network": "CL", "Treatment plant": "TR",
};

function CodeSection({ title, codes }) {
  return (
    <div className="help-section">
      <h4>{title}</h4>
      <div className="help-codes-grid">
        {Object.entries(codes).map(([label, code]) => (
          <div key={label} className="help-code-item">
            <span className="help-code">{code}</span>
            <span className="help-label">{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function AssetHelpModal({ onClose }) {
  return (
    <div className="help-modal-overlay" onClick={onClose}>
      <div className="help-modal" onClick={(e) => e.stopPropagation()}>
        <div className="help-modal-header">
          <h3>SWA Tagging Codes Reference</h3>
          <button className="help-modal-close" onClick={onClose}><X size={20} /></button>
        </div>
        <div className="help-modal-content">
          <CodeSection title="Region Codes" codes={REGION_CODES} />
          <CodeSection title="Activity Codes" codes={ACTIVITY_CODES} />
          <CodeSection title="Asset Type Codes" codes={ASSET_TYPE_CODES} />
          <div className="help-section">
            <h4>Asset ID Format</h4>
            <div className="help-format">
              <code>REGION - ACTIVITY - ASSET_TYPE - SEQUENCE</code>
              <p>Example: <strong>RI - WP - DS - 0000001</strong></p>
              <p>This represents: Riyadh - Water Production - Seawater Desalination - Asset #0000001</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify the build compiles**

Run: `cd frontend && npm run build`
Expected: build succeeds (`X` exists in lucide-react).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/AssetHelpModal.jsx
git commit -m "feat: add SWA tagging codes help modal"
```

---

## Task 9: Sidebar wiring + AssetRegistryPage rewrite (integration)

**Files:**
- Modify: `frontend/src/components/AssetRegistrySidebar.jsx`
- Modify: `frontend/src/pages/AssetRegistryPage.jsx` (full rewrite)

**Interfaces:**
- Consumes: `deriveFilterOptions`, `applyAssetFilters`, `computeCategoryKpis` (`../lib/assetFilters`); `assetsToCsv`, `downloadCsv` (`../lib/exportCsv`); `fetchAssets`, `fetchAsset` (`../api/metrics`); `AssetKpiCards`, `AssetListView`, `AssetMapView`, `AssetHelpModal`, `AssetForm`, `AssetRegistrySidebar`, `WorkspaceHeader`.
- Produces:
  - `AssetRegistrySidebar` gains `onShowHelp` and `onExport` props (wired to the Help + Export toolbar actions); `onCreate` navigates via the page.
  - `AssetRegistryPage({ mode })` where `mode` ∈ `"list" | "create" | "edit"`.

- [ ] **Step 1: Wire Help + Export into the sidebar**

In `frontend/src/components/AssetRegistrySidebar.jsx`, change the component signature:

```jsx
export default function AssetRegistrySidebar({ view, onShowMap, onShowList, onCreate, onShowHelp, onExport }) {
```

Then replace the `extraActions` array passed to `SidebarActionToolbar` with:

```jsx
          extraActions={[
            { title: view === "list" ? "List View (active)" : "List View", iconSrc: LIST_ICON, active: view === "list", onClick: onShowList },
            { title: view === "map" ? "Map View (active)" : "Map View", iconSrc: MAP_ICON, active: view === "map", onClick: onShowMap },
            { title: "Export CSV", iconSrc: DOCUMENT_ICON, onClick: onExport },
            { title: "Help", iconSrc: HELP_ICON, onClick: onShowHelp },
          ]}
```

(The `DOCUMENT_ICON` / `HELP_ICON` constants already exist in the file.)

- [ ] **Step 2: Rewrite the page**

Replace the entire contents of `frontend/src/pages/AssetRegistryPage.jsx` with:

```jsx
import React, { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Archive } from "lucide-react";
import { fetchAssets, fetchAsset } from "../api/metrics";
import { deriveFilterOptions, applyAssetFilters, computeCategoryKpis } from "../lib/assetFilters";
import { assetsToCsv, downloadCsv } from "../lib/exportCsv";
import AssetListView from "../components/AssetListView";
import AssetMapView from "../components/AssetMapView";
import AssetKpiCards from "../components/AssetKpiCards";
import AssetHelpModal from "../components/AssetHelpModal";
import AssetRegistrySidebar from "../components/AssetRegistrySidebar";
import AssetForm from "../components/AssetForm";
import WorkspaceHeader from "../components/WorkspaceHeader";
import "../components/MetricDashboard.css";
import "./AssetRegistryPage.css";

const EMPTY_FILTERS = { activity: "", assetType: "", region: "", governorate: "", q: "" };

export default function AssetRegistryPage({ mode = "list" }) {
  const { id } = useParams();
  const navigate = useNavigate();

  const [view, setView] = useState("map"); // "list" | "map"
  const [assets, setAssets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [showHelp, setShowHelp] = useState(false);
  const [filters, setFilters] = useState(EMPTY_FILTERS);

  const [editAsset, setEditAsset] = useState(null);
  const [editError, setEditError] = useState(null);

  // Load the full registry (all three categories) once; filtering is client-side.
  useEffect(() => {
    if (mode !== "list") return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchAssets({ limit: 5000 })
      .then((d) => !cancelled && setAssets(d.assets || []))
      .catch((e) => !cancelled && setError(e.message || "Couldn't load assets"))
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [mode, reloadKey]);

  // Edit mode: fetch the single asset to seed the form.
  useEffect(() => {
    if (mode !== "edit" || !id) return;
    let cancelled = false;
    setEditAsset(null);
    setEditError(null);
    fetchAsset(id)
      .then((a) => !cancelled && setEditAsset(a))
      .catch((e) => !cancelled && setEditError(e.message || "Couldn't load asset"));
    return () => { cancelled = true; };
  }, [mode, id]);

  // Cascade resets: changing a filter clears everything downstream of it.
  const onActivity = (v) => setFilters((f) => ({ ...f, activity: v, assetType: "", region: "", governorate: "" }));
  const onAssetType = (v) => setFilters((f) => ({ ...f, assetType: v, region: "", governorate: "" }));
  const onRegion = (v) => setFilters((f) => ({ ...f, region: v, governorate: "" }));
  const onGovernorate = (v) => setFilters((f) => ({ ...f, governorate: v }));
  const onSearch = (v) => setFilters((f) => ({ ...f, q: v }));

  const options = useMemo(() => deriveFilterOptions(assets, filters), [assets, filters]);
  const filtered = useMemo(() => applyAssetFilters(assets, filters), [assets, filters]);
  const kpis = useMemo(() => computeCategoryKpis(filtered), [filtered]);

  const openView = (a) => navigate(`/asset-registry/view/${encodeURIComponent(a.id)}`);
  const openEdit = (a) => navigate(`/asset-registry/edit/${encodeURIComponent(a.id)}`);
  const exportCsv = () => downloadCsv("asset-registry-filtered.csv", assetsToCsv(filtered));

  const statusText = mode === "create" ? "Create" : mode === "edit" ? "Edit" : `${filtered.length} assets`;

  return (
    <div className="ar-shell">
      <aside className="ar-rail">
        <AssetRegistrySidebar
          view={view}
          onShowMap={() => setView("map")}
          onShowList={() => setView("list")}
          onCreate={() => navigate("/asset-registry/create")}
          onShowHelp={() => setShowHelp(true)}
          onExport={exportCsv}
        />
      </aside>

      <div className="metric ar-page assets-tagging-page page-transition">
        <WorkspaceHeader
          title="Asset Registry"
          subtitle="Dispatch · Registry"
          icon={Archive}
          status={statusText}
          statusTone={mode === "list" ? "green" : "blue"}
        />

        {mode === "create" && (
          <section className="sheet">
            <header className="sheet__head sheet__head--simple">
              <h2 className="sheet__name sheet__name--sm">New Asset</h2>
            </header>
            <AssetForm mode="create" onSaved={() => navigate("/asset-registry")} />
          </section>
        )}

        {mode === "edit" && (
          <section className="sheet">
            <header className="sheet__head sheet__head--simple">
              <h2 className="sheet__name sheet__name--sm">Edit Asset</h2>
            </header>
            {editError && <div className="metric__notice metric__notice--error">{editError}</div>}
            {!editAsset && !editError && <div className="metric__notice">Loading asset…</div>}
            {editAsset && <AssetForm mode="edit" initialAsset={editAsset} onSaved={() => navigate("/asset-registry")} />}
          </section>
        )}

        {mode === "list" && (
          <>
            <AssetKpiCards kpis={kpis} />

            <div className="ar-toolbar">
              <div className="metric__filters">
                <label>
                  <span>Activity</span>
                  <select value={filters.activity} onChange={(e) => onActivity(e.target.value)}>
                    <option value="">All</option>
                    {options.activities.map((a) => <option key={a} value={a}>{a}</option>)}
                  </select>
                </label>
                <label>
                  <span>Asset Type</span>
                  <select value={filters.assetType} onChange={(e) => onAssetType(e.target.value)}>
                    <option value="">All</option>
                    {options.assetTypes.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </label>
                <label>
                  <span>Region</span>
                  <select value={filters.region} onChange={(e) => onRegion(e.target.value)}>
                    <option value="">All</option>
                    {options.regions.map((r) => <option key={r} value={r}>{r}</option>)}
                  </select>
                </label>
                <label>
                  <span>Governorate</span>
                  <select value={filters.governorate} onChange={(e) => onGovernorate(e.target.value)} disabled={!filters.region}>
                    <option value="">All</option>
                    {options.governorates.map((g) => <option key={g} value={g}>{g}</option>)}
                  </select>
                </label>
                <label>
                  <span>Search</span>
                  <input type="search" value={filters.q} placeholder="Name or ID" onChange={(e) => onSearch(e.target.value)} />
                </label>
              </div>
            </div>

            {error && <div className="metric__notice metric__notice--error">{error}</div>}
            {loading && <div className="metric__notice">Loading assets…</div>}

            {!loading && !error && (
              view === "list"
                ? <AssetListView assets={filtered} onView={openView} onEdit={openEdit} />
                : <AssetMapView assets={filtered} onView={openView} onEdit={openEdit} />
            )}
          </>
        )}

        {showHelp && <AssetHelpModal onClose={() => setShowHelp(false)} />}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Verify the build compiles**

Run: `cd frontend && npm run build`
Expected: build succeeds. (`AssetRegistryPage` no longer references tabs, `fetchAssets` filter refetch, or `CreateAssetForm`.)

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/AssetRegistrySidebar.jsx frontend/src/pages/AssetRegistryPage.jsx
git commit -m "feat: unified asset registry list with cascading filters, help, export"
```

---

## Task 10: Routes, detail back-link, and end-to-end verification

**Files:**
- Modify: `frontend/src/App.jsx`
- Modify: `frontend/src/pages/AssetDetailPage.jsx`

**Interfaces:**
- Consumes: `AssetRegistryPage` (now accepts `mode`), `AssetDetailPage`.
- Produces: routes `/asset-registry` (list), `/asset-registry/create`, `/asset-registry/edit/:id`, `/asset-registry/view/:id`.

- [ ] **Step 1: Update the routes**

In `frontend/src/App.jsx`, replace the three asset-registry routes:

```jsx
            <Route path="/asset-registry" element={<AssetRegistryPage />} />
            <Route path="/asset-registry/view/:id" element={<AssetDetailPage />} />
            <Route path="/asset-registry/:tab" element={<AssetRegistryPage />} />
```

with:

```jsx
            <Route path="/asset-registry" element={<AssetRegistryPage mode="list" />} />
            <Route path="/asset-registry/create" element={<AssetRegistryPage mode="create" />} />
            <Route path="/asset-registry/edit/:id" element={<AssetRegistryPage mode="edit" />} />
            <Route path="/asset-registry/view/:id" element={<AssetDetailPage />} />
```

- [ ] **Step 2: Repoint the detail page's back-link**

In `frontend/src/pages/AssetDetailPage.jsx`, change line ~58:

```jsx
  const backTo = `/asset-registry/${asset.category}`;
```

to:

```jsx
  const backTo = "/asset-registry";
```

- [ ] **Step 3: Verify the build compiles**

Run: `cd frontend && npm run build`
Expected: build succeeds.

- [ ] **Step 4: Confirm no dangling references remain**

Run: `cd frontend && grep -rn "CreateAssetForm\|asset-registry/\${" src`
Expected: no matches (the old component and the `:tab`-style template link are gone).

- [ ] **Step 5: Run all unit tests**

Run: `cd frontend && node --test src/lib/*.test.js` then `cd ../backend && node --test src/*.test.js`
Expected: all tests PASS.

- [ ] **Step 6: Browser walkthrough (dev servers running)**

Start backend (`cd backend && npm run dev`) and frontend (`cd frontend && npm run dev`), open the app, and confirm:
- `/asset-registry` shows one unified list with plant + pump + handover assets; KPI cards show Plants / Pump Stations / Handover Points / Total with status ribbons.
- Selecting **Activity** narrows Asset Type; selecting Asset Type narrows Region; selecting Region enables Governorate; each upstream change clears downstream selections. Search filters by name/ID/region. KPI counts track the filtered set.
- Toggle **List** / **Map** from the sidebar. In list, a row's **View** opens the detail page and **Edit** opens `/asset-registry/edit/:id`. In map, a marker popup's **View** / **Edit** do the same.
- Sidebar **Help** opens the SWA codes modal; overlay click and the × both close it.
- Sidebar **Export CSV** downloads `asset-registry-filtered.csv` matching the current filtered rows.
- Sidebar **New Asset** opens `/asset-registry/create`; creating navigates back to the list with the new asset present.
- **Edit** an asset: fields (including specifications/pumps) are pre-filled, Category is read-only, saving persists and returns to the list with the change visible.
- From a detail page, **Back** returns to `/asset-registry`.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/App.jsx frontend/src/pages/AssetDetailPage.jsx
git commit -m "feat: wire create/edit routes and unified back-link"
```

---

## Self-Review Notes (for the implementer)

- **CSS is provided separately.** This plan emits the reference class names (see Global Constraints) but does not add styling — the user supplies the CSS that targets these classes. Visual polish is out of scope here.
- **`node --test` runs pure modules only.** DOM/React pieces (`downloadCsv`, components) and the Mongo-backed `updateAsset` are verified by build + the Task 3 curl smoke + the Task 10 browser walkthrough, matching this repo's existing (test-framework-free) conventions.
- **Marker style note:** map uses `CircleMarker` (status-colored), intentionally diverging from the reference's `L.DivIcon`, to avoid the leaflet default-icon asset shimming the reference required.
