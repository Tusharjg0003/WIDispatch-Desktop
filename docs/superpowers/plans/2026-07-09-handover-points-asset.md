# Handover Points Asset Registry Category Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add "Handover Point" as a third Asset Registry category (alongside Plant and Pump Station) — creation form, detail view, list/map/sidebar surfacing, and Network Builder canvas placement — stored in the existing `handover-points` MongoDB collection.

**Architecture:** No generic asset-type framework exists in this codebase — Plant and Pump are each hardcoded as a category with a matching Mongo collection, shared top-level fields (`assetRegistry.js`'s `TOP_LEVEL_FIELDS`), and a category-specific fields component. Handover Point follows this exact convention as a third category. A `handover-points` collection already exists (used today only as thin `{id, name}` reference data by `metrics.js`/`quality.js` joins); this plan extends the same documents with the full field set — those joins only ever project `id`/`name`, so this is additive and safe.

**Tech Stack:** React (Vite, no test runner configured in this repo), Express + MongoDB backend (native driver, no ORM), Cytoscape.js canvas.

## Global Constraints

- No test framework exists anywhere in this repo. Verification is manual: `curl` against the running backend dev server for Task 1, and browser click-through against both running dev servers for Tasks 2-4 (same approach used successfully in prior plans, e.g. `docs/superpowers/plans/2026-07-09-pipeline-variables-redesign.md`).
- Backend dev server requires `MONGODB_URI` in the repo-root `.env.local` — assume configured.
- Design spec: `docs/superpowers/specs/2026-07-09-handover-points-asset-design.md` — read it for the "why" behind field choices.
- Follow existing codebase conventions: `af__*` CSS classes (`AssetRegistryPage.css`), the `Field`/`Toggle`/`Switch` controls from `frontend/src/components/AssetFormControls.jsx`, local constant duplication for small option lists (the codebase already duplicates `STATUSES`/`MATERIALS` across files rather than sharing a module — follow that precedent).
- Do not touch `cityGates` (a separate, unrelated collection used for demand delivery-point joins) or `backend/src/assets.js`'s `ASSET_NAME_COLLECTIONS` — out of scope per the design spec.
- Do not add a canvas-drawing modal for Handover Points (parallel to Pipe's `PipeVariablesModal`) — assets are only created through the Asset Registry form, never drawn inline on the canvas.
- Work happens directly on `main` (no worktree) — the repo has other unrelated uncommitted WIP in various files; touch only what each task specifies.
- Backend dev server: `cd backend && npm run dev` (listens on `http://localhost:4000`, `npm run dev` uses `node --watch`). Frontend dev server: `cd frontend && npm run dev` (Vite, default `http://localhost:5173`).

---

### Task 1: Backend — register Handover Point as an asset category

**Files:**
- Modify: `backend/src/assetRegistry.js:5-8`

**Interfaces:**
- Produces: `ASSET_CATEGORIES.handover_point === "handover-points"`. No other backend code changes — `listAssets`, `getAssetById`, `createAsset`, and the `/api/assets` routes in `server.js` already iterate `ASSET_CATEGORIES` generically, so registering the category here is sufficient to make `GET/POST /api/assets?category=handover_point` and `GET /api/assets/:id` work end-to-end.

- [ ] **Step 1: Add `handover_point` to `ASSET_CATEGORIES`**

In `backend/src/assetRegistry.js`, find:

```js
export const ASSET_CATEGORIES = {
  plant: "plants",
  pump: "pumps",
};
```

Replace with:

```js
export const ASSET_CATEGORIES = {
  plant: "plants",
  pump: "pumps",
  handover_point: "handover-points",
};
```

- [ ] **Step 2: Start the backend dev server and verify**

Run: `cd backend && npm run dev`
Expected: server starts, no MongoDB connection error, logs `WIDispatch API listening on http://localhost:4000`.

```bash
curl -s "http://localhost:4000/api/assets?category=handover_point" | python3 -m json.tool
```

Expected: `200` with `{"kpis": {...}, "assets": [...], "total": N, "returned": N}`. If any thin `{id, name}` documents already exist in the `handover-points` collection (seeded for `metrics.js`/`quality.js`), they now appear here with `"category": "handover_point"`.

```bash
curl -s -X POST http://localhost:4000/api/assets \
  -H "Content-Type: application/json" \
  -d '{"category":"handover_point","name":"Test Handover Point A","region":"Riyadh","status":"planned","activity":"Water distribution","asset_type":"Handover point / city gate","specifications":{"design_capacity":50000,"capacity_limitation_type":"percentage","capacity_limitation_value":80}}' \
  | python3 -m json.tool
```

Expected: `201` with the created doc: `"category":"handover_point"`, `"id":"handover_point_..."`, `"name":"Test Handover Point A"`, `"specifications":{"design_capacity":50000,"capacity_limitation_type":"percentage","capacity_limitation_value":80}` (both `design_capacity` and `capacity_limitation_value` stay numeric — `design_capacity` matches `NUMERIC_SPEC_PATTERN`'s `_capacity$` suffix so it's coerced server-side; `capacity_limitation_value` was already sent as a JSON number so it round-trips as one; `capacity_limitation_type` stays the string `"percentage"`). Note the returned `id` as `HOP_ID` for later tasks' manual testing.

```bash
curl -s "http://localhost:4000/api/assets/$HOP_ID" | python3 -m json.tool
```

Expected: the full document, including `region`, `status`, `activity`, `asset_type`, `specifications`.

- [ ] **Step 3: Commit**

```bash
git add backend/src/assetRegistry.js
git commit -m "$(cat <<'EOF'
Register Handover Point as an Asset Registry category

Reuses the existing thin handover-points Mongo collection (previously
only used for {id, name} joins in metrics/quality) as a full Asset
Registry category, following the same category-map pattern as Plant
and Pump. No route or query-layer changes needed — listAssets/
getAssetById/createAsset already iterate ASSET_CATEGORIES generically.
EOF
)"
```

---

### Task 2: Frontend — Handover Point creation form

**Files:**
- Create: `frontend/src/components/HandoverPointFields.jsx`
- Modify: `frontend/src/components/CreateAssetForm.jsx` (full-file rewrite — see below)
- Modify: `frontend/src/pages/AssetRegistryPage.css`

**Interfaces:**
- Consumes: `Field` from `./AssetFormControls` (existing).
- Produces: `HandoverPointFields` default export, props `{ spec: object, set: (key: string) => (event) => void }` — same shape as `PlantFields`'s props, writes into the parent's `specifications` state under keys `design_capacity`, `capacity_limitation_type` (`"none" | "percentage" | "absolute"`), `capacity_limitation_value`.
- `CreateAssetForm.jsx` gains a third category option `"handover_point"`, wired the same way `"plant"`/`"pump"` are: `isHandover = form.category === "handover_point"` gates conditional rendering.

- [ ] **Step 1: Create `frontend/src/components/HandoverPointFields.jsx`**

```jsx
import React from "react";
import { Field } from "./AssetFormControls";

const LIMITATION_TYPES = [
  { value: "none", label: "None" },
  { value: "percentage", label: "Percentage (%)" },
  { value: "absolute", label: "Absolute (m³/day)" },
];

// Handover-Point-specific fields shown in CreateAssetForm when
// category === "handover_point". `spec` holds the asset's `specifications`
// object; `set(key)` returns an onChange handler that writes into it,
// same contract as PlantFields/PumpStationFields.
export default function HandoverPointFields({ spec, set }) {
  const limitationType = spec.capacity_limitation_type || "none";

  return (
    <>
      <div className="af__section">Capacity</div>
      <div className="af__grid">
        <Field label="Capacity (m³/day)">
          <input
            type="number" min="0" step="any" placeholder="e.g. 50000"
            value={spec.design_capacity ?? ""} onChange={set("design_capacity")}
          />
        </Field>
      </div>

      <div className="af__section">Capacity Limitation</div>
      <div className="af__grid">
        <Field label="Capacity Limitation">
          <div className="af__radio-group">
            {LIMITATION_TYPES.map((t) => (
              <label key={t.value} className="af__radio">
                <input
                  type="radio"
                  name="capacity_limitation_type"
                  value={t.value}
                  checked={limitationType === t.value}
                  onChange={set("capacity_limitation_type")}
                />
                {t.label}
              </label>
            ))}
          </div>
        </Field>
        {limitationType !== "none" && (
          <Field label="Capacity Limitation Value">
            <input
              type="number" step="any"
              value={spec.capacity_limitation_value ?? ""}
              onChange={set("capacity_limitation_value")}
            />
          </Field>
        )}
      </div>
    </>
  );
}
```

- [ ] **Step 2: Rewrite `frontend/src/components/CreateAssetForm.jsx`**

Replace the entire file with:

```jsx
import React, { useState } from "react";
import { createAsset } from "../api/metrics";
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

const STATUSES = ["operational", "maintenance", "under_construction", "planned", "decommissioned"];
const HANDOVER_STATUSES = ["planned", "under_construction", "operational", "decommissioned", "inactive"];
const statusLabel = (s) => s.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());

// Activity -> allowed Asset Type options, for Handover Point's dependent
// dropdowns (freeform text for Plant/Pump, unchanged).
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

export default function CreateAssetForm({ defaultCategory = "plant", onCreated }) {
  const [form, setForm] = useState({ ...EMPTY_FORM, category: defaultCategory });
  const [spec, setSpec] = useState({});
  const [pumps, setPumps] = useState([]);
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
      // Activity/Asset Type/Region switch input widget (freeform text/select)
      // when entering or leaving Handover Point, so reset them then. Plant
      // <-> Pump switches leave these fields untouched, matching existing
      // behavior.
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

  // Handover Point's Activity dropdown: changing it resets Asset Type to
  // the first option of the newly-selected activity's list.
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
      const created = await createAsset(payload);
      setSuccess(`Created “${created.name}” (${created.id}).`);
      setForm({ ...EMPTY_FORM, category });
      setSpec({});
      setPumps([]);
      onCreated?.(created);
    } catch (err) {
      setError(err.message || "Failed to create asset");
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
          <select value={form.category} onChange={changeCategory} required>
            {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
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
          {saving ? "Saving…" : "Create asset"}
        </button>
      </footer>
    </form>
  );
}
```

- [ ] **Step 3: Add radio-group CSS to `frontend/src/pages/AssetRegistryPage.css`**

Find:

```css
.af__toggle-label {
  font-size: 0.78rem;
  font-weight: 600;
  color: var(--ink-dim);
  text-transform: none;
  letter-spacing: 0;
}

/* Pump configuration list */
```

Replace with:

```css
.af__toggle-label {
  font-size: 0.78rem;
  font-weight: 600;
  color: var(--ink-dim);
  text-transform: none;
  letter-spacing: 0;
}

/* Handover Point capacity-limitation radio group */
.af__radio-group {
  display: flex;
  align-items: center;
  gap: 16px;
  height: 32px;
}
.af__radio {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.8rem;
  font-weight: 400;
  text-transform: none;
  letter-spacing: 0;
  color: var(--ink);
  cursor: pointer;
}
.af__radio input[type="radio"] {
  margin: 0;
  accent-color: var(--accent);
}

/* Pump configuration list */
```

- [ ] **Step 4: Manual verification**

Run: `cd backend && npm run dev` and `cd frontend && npm run dev` (skip if already running from Task 1).

In the browser, open the Asset Registry and navigate to the Create Asset tab (`/asset-registry/create`).

Set Category = "Handover Point". Expected:
- Activity becomes a dropdown defaulted to "Water distribution"; Asset Type becomes a dropdown defaulted to "Handover point / city gate" with two other options ("Distribution network", "Filling station").
- Change Activity to "Wastewater collection" — Asset Type dropdown updates to show only "Collection network", auto-selected.
- Region becomes a 13-option dropdown (Riyadh, Makkah, Madinah, Eastern Province, Asir, Tabuk, Qassim, Hail, Northern Borders, Jazan, Najran, Al Bahah, Al Jouf), no option pre-selected.
- Lifecycle section shows an "Operational Status" dropdown with exactly 5 options (Planned, Under construction, Operational, Decommissioned, Inactive — no "Maintenance"), plus a separate "Active" toggle defaulted on.
- Below Lifecycle, a "Capacity" section with a "Capacity (m³/day)" number input, and a "Capacity Limitation" section with three radio buttons (None/Percentage (%)/Absolute (m³/day)) — selecting "Percentage (%)" reveals a "Capacity Limitation Value" number input; selecting "None" hides it again.

Fill in: Activity = "Water distribution" (reselect), Asset Name (EN) = "Test Handover Point B", Region = "Makkah", Capacity = 30000, Capacity Limitation = Absolute, Capacity Limitation Value = 25000. Submit.

Expected: success message "Created "Test Handover Point B" (handover_point_...)." — note the returned id as `HOP_B_ID`.

```bash
curl -s "http://localhost:4000/api/assets/$HOP_B_ID" | python3 -m json.tool
```

Expected: `region: "Makkah"`, `activity: "Water distribution"`, `asset_type: "Handover point / city gate"`, `status: "planned"`, `active: true`, `specifications: {design_capacity: 30000, capacity_limitation_type: "absolute", capacity_limitation_value: 25000}`.

Switch Category to "Plant" and back to "Pump Station" — confirm Asset Type/Activity/Region remain freeform text inputs as before (no regression), and that switching away from/into "Handover Point" doesn't throw a console error.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/HandoverPointFields.jsx frontend/src/components/CreateAssetForm.jsx frontend/src/pages/AssetRegistryPage.css
git commit -m "$(cat <<'EOF'
Add Handover Point creation form to the Asset Registry

Third category alongside Plant/Pump Station: dependent Activity/Asset
Type dropdowns, a fixed Region list, a 5-value status set plus a
separate Active toggle, and Capacity/Capacity Limitation fields in the
new HandoverPointFields component.
EOF
)"
```

---

### Task 3: Frontend — Asset Registry list/detail/sidebar surfacing

**Files:**
- Modify: `frontend/src/pages/AssetRegistryPage.jsx:12-15`
- Modify: `frontend/src/components/AssetRegistrySidebar.jsx:7-8,29`
- Modify: `frontend/src/pages/AssetDetailPage.jsx:10`
- Modify: `frontend/src/components/AssetDetailFields.jsx:125-147`

**Interfaces:**
- Consumes: assets created in Task 2 (`HOP_B_ID`).
- No new exports — these are all leaf UI files with local constants.

- [ ] **Step 1: Add the tab in `frontend/src/pages/AssetRegistryPage.jsx`**

Find:

```js
const ASSET_TABS = [
  { key: "plant", label: "Plants" },
  { key: "pump", label: "Pump Stations" },
];
```

Replace with:

```js
const ASSET_TABS = [
  { key: "plant", label: "Plants" },
  { key: "pump", label: "Pump Stations" },
  { key: "handover_point", label: "Handover Points" },
];
```

- [ ] **Step 2: Add the category in `frontend/src/components/AssetRegistrySidebar.jsx`**

Find:

```js
const CATEGORY_LABEL = { plant: "Plants", pump: "Pump Stations" };
const CATEGORY_ORDER = ["plant", "pump"];
```

Replace with:

```js
const CATEGORY_LABEL = { plant: "Plants", pump: "Pump Stations", handover_point: "Handover Points" };
const CATEGORY_ORDER = ["plant", "pump", "handover_point"];
```

Find:

```js
  const [expandedCategories, setExpandedCategories] = useState({ plant: true, pump: true });
```

Replace with:

```js
  const [expandedCategories, setExpandedCategories] = useState({ plant: true, pump: true, handover_point: true });
```

- [ ] **Step 3: Add the label in `frontend/src/pages/AssetDetailPage.jsx`**

Find:

```js
const CATEGORY_LABEL = { plant: "Plants", pump: "Pump Stations" };
```

Replace with:

```js
const CATEGORY_LABEL = { plant: "Plants", pump: "Pump Stations", handover_point: "Handover Points" };
```

- [ ] **Step 4: Add the specifications section in `frontend/src/components/AssetDetailFields.jsx`**

Find:

```jsx
      {asset.category === "pump" && Array.isArray(spec.pumps) && spec.pumps.length > 0 && (
        <div className="form-section">
          <h3>Pump Configuration</h3>
          <table className="pump-config-table">
            <thead>
              <tr><th>Name</th><th>Capacity (m³/day)</th><th>Role</th><th>State</th></tr>
            </thead>
            <tbody>
              {spec.pumps.map((p) => (
                <tr key={p.id}>
                  <td>{p.name || "—"}</td>
                  <td>{p.capacity_m3_day ?? "—"}</td>
                  <td>{p.role === "backup" ? "Backup" : "Functional"}</td>
                  <td>{p.active ? "On" : "Off"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
```

Replace with:

```jsx
      {asset.category === "pump" && Array.isArray(spec.pumps) && spec.pumps.length > 0 && (
        <div className="form-section">
          <h3>Pump Configuration</h3>
          <table className="pump-config-table">
            <thead>
              <tr><th>Name</th><th>Capacity (m³/day)</th><th>Role</th><th>State</th></tr>
            </thead>
            <tbody>
              {spec.pumps.map((p) => (
                <tr key={p.id}>
                  <td>{p.name || "—"}</td>
                  <td>{p.capacity_m3_day ?? "—"}</td>
                  <td>{p.role === "backup" ? "Backup" : "Functional"}</td>
                  <td>{p.active ? "On" : "Off"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {asset.category === "handover_point" && (
        <div className="form-section">
          <h3>Asset Specifications</h3>
          <div className="form-grid">
            <Field label="Capacity (m³/day)" value={spec.design_capacity} />
            <Field
              label="Capacity Limitation"
              value={
                spec.capacity_limitation_type && spec.capacity_limitation_type !== "none"
                  ? `${spec.capacity_limitation_value ?? "—"}${spec.capacity_limitation_type === "percentage" ? "%" : " m³/day"}`
                  : spec.capacity_limitation_type === "none"
                  ? "None"
                  : null
              }
            />
          </div>
        </div>
      )}
    </>
  );
}
```

- [ ] **Step 5: Manual verification**

With both dev servers running and `HOP_B_ID` ("Test Handover Point B") created in Task 2:

Navigate to `/asset-registry/handover_point`. Expected: a "Handover Points" tab appears alongside "Plants"/"Pump Stations" with a count badge; the map/list view shows "Test Handover Point B" (visible on the map since it has no lat/long set — check list view instead, which doesn't require coordinates).

Switch to list view (if not already) and click "Test Handover Point B". Expected: detail page breadcrumb reads "Asset Registry / Handover Points / Test Handover Point B"; General Information shows Region "Makkah", Activity "Water distribution", Asset Type "Handover point / city gate"; a new "Asset Specifications" section shows "Capacity (m³/day)" = 30000 and "Capacity Limitation" = "25000 m³/day".

In the left sidebar (visible on any Asset Registry page), expand "Handover Points" — expected to show "Handover point / city gate (1)" as a sub-group containing "Test Handover Point B"; clicking it navigates to the same detail page.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/AssetRegistryPage.jsx frontend/src/components/AssetRegistrySidebar.jsx frontend/src/pages/AssetDetailPage.jsx frontend/src/components/AssetDetailFields.jsx
git commit -m "$(cat <<'EOF'
Surface Handover Points across Asset Registry list/detail/sidebar

Adds the category to every place that enumerates Asset Registry
categories for navigation/labeling (tabs, sidebar tree, detail-page
breadcrumb) and renders its Capacity/Capacity Limitation specs on the
read-only detail page. List/map views needed no changes — already
generic over whatever category comes back from /api/assets.
EOF
)"
```

---

### Task 4: Frontend — Network Builder canvas placement

**Files:**
- Modify: `frontend/src/cytoscape/buildCyStyle.js:9-28`
- Modify: `frontend/src/cytoscape/nodeCard.js:7,22-27`
- Modify: `frontend/src/pages/NetworkBuilderPage.css:528-531`
- Modify: `frontend/src/components/NetworkNodeDetails.jsx:349-362`

**Interfaces:**
- Consumes: `HOP_B_ID` asset from Task 2/3. `NetworkPalette.jsx` and `NetworkBuilderPage.jsx`'s placement logic (`type: asset.category`, `applyCardIcon`) already iterate `CATEGORY_ORDER`/`asset.category` generically — confirmed no hardcoded category list exists in either file, so no changes needed there.
- No new exports — extends existing maps/sets keyed by category string `"handover_point"`.

- [ ] **Step 1: Add canvas constants in `frontend/src/cytoscape/buildCyStyle.js`**

Find:

```js
export const ENTITY_TYPE_COLORS = {
  plant: "#567cff",
  pump: "#ec4899",
  node: "#8b93a7",
};

export const ENTITY_TYPE_ABBREVIATIONS = {
  plant: "PL",
  pump: "PU",
  node: "ND",
};

export const ENTITY_TYPE_LABELS = {
  plant: "Plant",
  pump: "Pump Station",
  node: "Junction",
};

// Category order for the palette + any grouped UI.
export const CATEGORY_ORDER = ["plant", "pump"];
```

Replace with:

```js
export const ENTITY_TYPE_COLORS = {
  plant: "#567cff",
  pump: "#ec4899",
  handover_point: "#14b8a6",
  node: "#8b93a7",
};

export const ENTITY_TYPE_ABBREVIATIONS = {
  plant: "PL",
  pump: "PU",
  handover_point: "HP",
  node: "ND",
};

export const ENTITY_TYPE_LABELS = {
  plant: "Plant",
  pump: "Pump Station",
  handover_point: "Handover Point",
  node: "Junction",
};

// Category order for the palette + any grouped UI.
export const CATEGORY_ORDER = ["plant", "pump", "handover_point"];
```

- [ ] **Step 2: Add card type + icon in `frontend/src/cytoscape/nodeCard.js`**

Find:

```js
// Node types rendered as cards (junctions/notes/group-boxes are not).
export const CARD_TYPES = new Set(["plant", "pump"]);
```

Replace with:

```js
// Node types rendered as cards (junctions/notes/group-boxes are not).
export const CARD_TYPES = new Set(["plant", "pump", "handover_point"]);
```

Find:

```js
const ICON = {
  plant:
    '<path d="M12 16h.01"/><path d="M16 16h.01"/><path d="M3 19a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8.5a.5.5 0 0 0-.769-.422l-4.462 2.844A.5.5 0 0 1 15 10.5v-2a.5.5 0 0 0-.769-.422L9.77 10.922A.5.5 0 0 1 9 10.5V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2z"/><path d="M8 16h.01"/>',
  pump:
    '<path d="M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z"/>',
};
```

Replace with:

```js
const ICON = {
  plant:
    '<path d="M12 16h.01"/><path d="M16 16h.01"/><path d="M3 19a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8.5a.5.5 0 0 0-.769-.422l-4.462 2.844A.5.5 0 0 1 15 10.5v-2a.5.5 0 0 0-.769-.422L9.77 10.922A.5.5 0 0 1 9 10.5V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2z"/><path d="M8 16h.01"/>',
  pump:
    '<path d="M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z"/>',
  handover_point:
    '<path d="m16 3 4 4-4 4"/><path d="M20 7H4"/><path d="m8 21-4-4 4-4"/><path d="M4 17h16"/>',
};
```

- [ ] **Step 3: Add the palette dot color in `frontend/src/pages/NetworkBuilderPage.css`**

Find:

```css
.np__dot--plant { background: #567cff; }
.np__dot--pump { background: #ec4899; }
.np__dot--valve { background: #f59e0b; }
.np__dot--pipeline { background: #10b981; }
```

Replace with:

```css
.np__dot--plant { background: #567cff; }
.np__dot--pump { background: #ec4899; }
.np__dot--handover_point { background: #14b8a6; }
.np__dot--valve { background: #f59e0b; }
.np__dot--pipeline { background: #10b981; }
```

- [ ] **Step 4: Add the inspector Specifications branch in `frontend/src/components/NetworkNodeDetails.jsx`**

Find:

```jsx
        {selected.category === "pump" && Array.isArray(spec.pumps) && spec.pumps.length > 0 && (
          <>
            <div className="af__section">Pump Configuration</div>
            <dl className="adr__list">
              {spec.pumps.map((p) => (
                <Row
                  key={p.id}
                  label={p.name || "Pump"}
                  value={`${p.capacity_m3_day ?? "—"} m³/day · ${p.role === "backup" ? "Backup" : "Functional"} · ${p.active ? "On" : "Off"}`}
                />
              ))}
            </dl>
          </>
        )}

        <button className="af__btn nnd__delete" onClick={onDelete}>Delete node</button>
```

Replace with:

```jsx
        {selected.category === "pump" && Array.isArray(spec.pumps) && spec.pumps.length > 0 && (
          <>
            <div className="af__section">Pump Configuration</div>
            <dl className="adr__list">
              {spec.pumps.map((p) => (
                <Row
                  key={p.id}
                  label={p.name || "Pump"}
                  value={`${p.capacity_m3_day ?? "—"} m³/day · ${p.role === "backup" ? "Backup" : "Functional"} · ${p.active ? "On" : "Off"}`}
                />
              ))}
            </dl>
          </>
        )}

        {selected.category === "handover_point" && Object.keys(spec).length > 0 && (
          <>
            <div className="af__section">Specifications</div>
            <dl className="adr__list">
              <Row label="Capacity (m³/day)" value={spec.design_capacity} />
              <Row
                label="Capacity limitation"
                value={
                  spec.capacity_limitation_type && spec.capacity_limitation_type !== "none"
                    ? `${spec.capacity_limitation_value ?? "—"}${spec.capacity_limitation_type === "percentage" ? "%" : " m³/day"}`
                    : spec.capacity_limitation_type === "none"
                    ? "None"
                    : null
                }
              />
            </dl>
          </>
        )}

        <button className="af__btn nnd__delete" onClick={onDelete}>Delete node</button>
```

- [ ] **Step 5: Manual verification**

With both dev servers running and "Test Handover Point B" (`HOP_B_ID`, capacity 30000, absolute limitation 25000) created in Task 2:

Open the Network Builder (`/network-builder` or equivalent route) and look at the left asset palette. Expected: a "Handover Point" group appears (after Plant/Pump groups) with a teal dot, containing "Test Handover Point B" with count `1`.

Click "Test Handover Point B" to arm it, then click an empty area of the canvas to place it. Expected: a white rounded-rectangle card appears with a teal (`#14b8a6`) icon band on the left showing a double-arrow (arrow-right-left) glyph, and the label "Test Handover Point B" to the right — visually consistent with how Plant (blue)/Pump (pink) cards render.

Select the placed node. Expected: the right inspector header shows category "Handover Point"; the "Asset" section shows Region "Makkah" and Active "Yes"; a "Specifications" section shows "Capacity (m³/day)" = 30000 and "Capacity limitation" = "25000 m³/day".

Select a previously-placed Plant or Pump node (if any exist on this canvas from prior testing). Expected: no change in behavior — confirms the new `handover_point` branch didn't affect the existing `plant`/`pump` branches.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/cytoscape/buildCyStyle.js frontend/src/cytoscape/nodeCard.js frontend/src/pages/NetworkBuilderPage.css frontend/src/components/NetworkNodeDetails.jsx
git commit -m "$(cat <<'EOF'
Make Handover Points placeable on the Network Builder canvas

Registers the category in the same constant maps Plant/Pump use for
canvas styling (color, abbreviation, label, card icon) and extends the
canvas inspector with a Specifications branch. NetworkPalette and the
node-placement logic already iterate categories generically, so no
changes were needed there.
EOF
)"
```
