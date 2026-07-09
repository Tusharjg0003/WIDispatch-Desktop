# Network Builder Quick-Add Plant/Pump Modal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a user clicks "Plant" or "Pump" in the Network Builder's insert toolbar and then clicks the canvas, show a focused input modal instead of dropping a blank node, and create a real Asset Registry record from the submitted data.

**Architecture:** A new `NetworkEntityCreateModal.jsx` component (rendered from `NetworkBuilderPage.jsx`, styled like the existing `pipeModal`) collects the fields, calls the existing `createAsset` API, and hands the created asset back to `NetworkBuilderPage.jsx`, which places a canvas node for it exactly the way picking an existing asset from the palette already works. The Plant-specific "Plant-specific section" is split into its own `PlantQuickFields.jsx`; the Pump Configuration section reuses the existing `PumpStationFields.jsx` unchanged.

**Tech Stack:** React (Vite, no test runner configured in this repo), Express + MongoDB backend, Cytoscape.js canvas.

## Global Constraints

- No test framework exists anywhere in this repo (`frontend/package.json` and `backend/package.json` have no test script, and there are no `*.test.*`/`*.spec.*` files). Verification in this plan is manual: `curl` against the running backend dev server, and click-through in the running frontend dev server (`npm run dev` in both `backend/` and `frontend/`).
- Backend dev server requires `MONGODB_URI` in the repo-root `.env.local` (see `backend/src/db.js`) — assume it's already configured, as the rest of the app depends on it too.
- Follow existing codebase conventions exactly: `af__*` CSS classes (defined in `frontend/src/pages/AssetRegistryPage.css`, loaded globally once any page importing it is in the route bundle — already relied on by the existing `pipeModal` in `NetworkBuilderPage.jsx` with no extra import), the `Field`/`Toggle`/`Switch` controls from `frontend/src/components/AssetFormControls.jsx`, and the `STATUSES`/`statusLabel` local-duplication pattern already used in `CreateAssetForm.jsx` and `NetworkNodeDetails.jsx`.
- This is scoped to the Network Builder insert-toolbar flow only. Do not modify `CreateAssetForm.jsx`, `PlantFields.jsx`, or the palette's "pick existing asset" flow (`handlePick` / `NetworkPalette.jsx`).

---

### Task 1: Backend — support `active`/`entity_category` and broaden numeric coercion

**Files:**
- Modify: `backend/src/assetRegistry.js:18-22` (`TOP_LEVEL_FIELDS`), `backend/src/assetRegistry.js:28` (`NUMERIC_SPEC_PATTERN`)

**Interfaces:**
- Consumes: nothing new — `createAsset(category, body)` keeps its existing signature.
- Produces: `POST /api/assets` now persists a top-level `active` (boolean) and `entity_category` (string) field when present in the request body, and numerically coerces any `specifications` key containing `capacity` anywhere in its name (not just as a `_capacity` suffix), in addition to the existing `capex`/`ccr`/`_om` suffix matches.

- [ ] **Step 1: Update `TOP_LEVEL_FIELDS`**

In `backend/src/assetRegistry.js`, change:

```js
const TOP_LEVEL_FIELDS = [
  "external_id", "name", "asset_name_ar", "entity", "entity_type", "activity",
  "asset_type", "region", "cluster", "governorate", "city", "status",
  "commissioning_date", "decommissioning_date",
];
```

to:

```js
const TOP_LEVEL_FIELDS = [
  "external_id", "name", "asset_name_ar", "entity", "entity_type", "activity",
  "asset_type", "region", "cluster", "governorate", "city", "status",
  "commissioning_date", "decommissioning_date", "active", "entity_category",
];
```

- [ ] **Step 2: Broaden `NUMERIC_SPEC_PATTERN`**

In the same file, change:

```js
const NUMERIC_SPEC_PATTERN = /(_capacity|capex|ccr|_om)$/i;
```

to:

```js
const NUMERIC_SPEC_PATTERN = /(_capacity|_percentage|_absolute|capex|ccr|_om)$/i;
```

This adds `_percentage`/`_absolute` suffixes (for `capacity_limit_percentage`/
`capacity_limit_absolute`) without matching "capacity" as a bare substring —
`capacity_limit_mode` must NOT match, since it holds the string enum
`"none" | "percentage" | "absolute"`, not a number. A pattern like
`/capacity|capex|ccr|_om$/i` (matching "capacity" anywhere) would wrongly
coerce `capacity_limit_mode` via `Number("percentage")` → `NaN` → `null`,
silently corrupting the field. Verify: `capacity_limit_mode` must NOT match
the pattern; `capacity_limit_percentage`, `capacity_limit_absolute`,
`design_capacity`, `maximum_capacity`, `contracted_capacity`,
`expansion_capacity`, `capex`, `ccr`, `fixed_om`, `variable_om` all must
match it.

- [ ] **Step 3: Start the backend dev server**

Run: `cd backend && npm run dev`
Expected: log line indicating the server is listening (e.g. `Server running on port 4000` or similar — check `backend/src/server.js` for the exact message), no MongoDB connection error.

- [ ] **Step 4: Verify plant creation with the new fields via curl**

Run:

```bash
curl -s -X POST http://localhost:4000/api/assets \
  -H "Content-Type: application/json" \
  -d '{
    "category": "plant",
    "name": "Quick Add Test Plant",
    "status": "planned",
    "active": true,
    "entity_category": "private",
    "region": "Riyadh",
    "activity": "Water production",
    "asset_type": "Desalination",
    "specifications": {
      "design_capacity": "1200",
      "capacity_limit_mode": "percentage",
      "capacity_limit_percentage": "85",
      "plant_type": "desalination",
      "variable_om": "0.42"
    }
  }' | python3 -m json.tool
```

Expected: JSON response with `"active": true`, `"entity_category": "private"`, and inside `"specifications"`: `"design_capacity": 1200` (number, not string), `"capacity_limit_percentage": 85` (number), `"variable_om": 0.42` (number), `"capacity_limit_mode": "percentage"` (string, unchanged), `"plant_type": "desalination"` (string, unchanged).

- [ ] **Step 5: Verify pump creation with `active` via curl**

Run:

```bash
curl -s -X POST http://localhost:4000/api/assets \
  -H "Content-Type: application/json" \
  -d '{
    "category": "pump",
    "name": "Quick Add Test Pump",
    "status": "planned",
    "active": false,
    "specifications": { "pumps": [{ "id": "p_1", "name": "Pump 1", "capacity_m3_day": 500, "role": "functional", "active": true }] }
  }' | python3 -m json.tool
```

Expected: JSON response with `"active": false` at the top level, and `"specifications.pumps"` containing the one pump object unchanged.

- [ ] **Step 6: Leave the test records in place**

`backend/src/server.js` has no `DELETE /api/assets/:id` route (only `GET /api/assets`, `GET /api/assets/:id`, `POST /api/assets`), so there's no API to remove the two records created in Steps 4-5. Leave them — they're harmless, clearly named "Quick Add Test …", and won't be mistaken for real assets.

- [ ] **Step 7: Commit**

```bash
git add backend/src/assetRegistry.js
git commit -m "$(cat <<'EOF'
Support active/entity_category fields and broaden capacity coercion

Network Builder's upcoming quick-add modal needs a dispatch-flag `active`
field distinct from lifecycle `status`, an `entity_category` field, and
numeric coercion for capacity-limit spec keys that don't end in
`_capacity`.
EOF
)"
```

---

### Task 2: Frontend — quick-add modal, wired into the Network Builder canvas

**Files:**
- Create: `frontend/src/components/PlantQuickFields.jsx`
- Create: `frontend/src/components/NetworkEntityCreateModal.jsx`
- Modify: `frontend/src/pages/NetworkBuilderPage.jsx`

**Interfaces:**
- Consumes: `createAsset(payload)` from `frontend/src/api/metrics.js` (existing, returns `Promise<{ id, category, name, status, ... }>` or throws `Error`); `Field`, `Toggle` from `frontend/src/components/AssetFormControls.jsx` (existing); `PumpStationFields` default export, props `{ pumps: Array, setPumps: (Array) => void }` (existing, unchanged).
- Produces: `PlantQuickFields` default export, props `{ spec: object, set: (key: string) => (event) => void }` — mirrors the existing `PlantFields.jsx` calling convention. `NetworkEntityCreateModal` default export, props `{ type: "plant" | "pump", onCancel: () => void, onCreated: (asset: object) => void }`. `NetworkBuilderPage.jsx` gets new state `entityModal = { open: boolean, type: "plant" | "pump" | null, position: { x: number, y: number } | null }` and callbacks `closeEntityModal()`, `handleEntityCreated(asset)` used later by Task 3 (not directly, but any future extension should reuse this same modal rather than adding a second one).

- [ ] **Step 1: Create `PlantQuickFields.jsx`**

Create `frontend/src/components/PlantQuickFields.jsx`:

```jsx
import React from "react";
import { Field } from "./AssetFormControls";

const PLANT_TYPES = [
  { value: "desalination", label: "Desalination" },
  { value: "purification", label: "Purification" },
  { value: "treatment", label: "Treatment" },
];

// The "Plant-specific" section of NetworkEntityCreateModal (the Network
// Builder quick-add flow). `spec` holds the plant's `specifications`
// object; `set(key)` returns an onChange handler that writes into it —
// same calling convention as PlantFields.jsx.
export default function PlantQuickFields({ spec, set }) {
  return (
    <>
      <div className="af__section">Plant-specific</div>
      <div className="af__grid">
        <Field label="Plant Type">
          <select value={spec.plant_type || ""} onChange={set("plant_type")}>
            <option value="">—</option>
            {PLANT_TYPES.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </Field>
        <Field label="Technology">
          <input value={spec.technology || ""} onChange={set("technology")} placeholder="e.g. RO" />
        </Field>
        <Field label="Water Source">
          <input value={spec.water_source || ""} onChange={set("water_source")} placeholder="e.g. Seawater" />
        </Field>
        <Field label="Variable O&M (SAR/m³)">
          <input type="number" step="any" value={spec.variable_om ?? ""} onChange={set("variable_om")} />
        </Field>
      </div>
    </>
  );
}
```

- [ ] **Step 2: Create `NetworkEntityCreateModal.jsx`**

Create `frontend/src/components/NetworkEntityCreateModal.jsx`:

```jsx
import React, { useState } from "react";
import { createAsset } from "../api/metrics";
import { Field, Toggle } from "./AssetFormControls";
import PlantQuickFields from "./PlantQuickFields";
import PumpStationFields from "./PumpStationFields";

const STATUSES = ["operational", "maintenance", "under_construction", "planned", "decommissioned"];
const statusLabel = (s) => s.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
const TITLES = { plant: "Add Plant", pump: "Add Pump Station" };

const EMPTY_FORM = {
  name: "", status: "planned", commissioning_date: "", decommissioning_date: "", active: true,
  activity: "", asset_type: "", region: "", entity_category: "",
  design_capacity: "", capacity_limit_mode: "none", capacity_limit_percentage: "", capacity_limit_absolute: "",
};

// Quick-add modal for the Network Builder's "Plant"/"Pump" insert-toolbar
// flow. Unlike CreateAssetForm (the Asset Registry page's full form), this
// asks a deliberately short field set. Always creates a real Asset
// Registry record via the same createAsset API the registry form uses;
// `onCreated` hands the created asset back to the caller, which is
// responsible for placing a canvas node for it.
export default function NetworkEntityCreateModal({ type, onCancel, onCreated }) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [spec, setSpec] = useState({});
  const [pumps, setPumps] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const setSpecField = (k) => (e) => setSpec((s) => ({ ...s, [k]: e.target.value }));
  const isPlant = type === "plant";

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError(null);

    const specifications = isPlant
      ? {
          ...spec,
          design_capacity: form.design_capacity,
          capacity_limit_mode: form.capacity_limit_mode,
          ...(form.capacity_limit_mode === "percentage"
            ? { capacity_limit_percentage: form.capacity_limit_percentage }
            : {}),
          ...(form.capacity_limit_mode === "absolute"
            ? { capacity_limit_absolute: form.capacity_limit_absolute }
            : {}),
        }
      : {
          pumps: pumps.map((p) => ({
            ...p,
            capacity_m3_day: p.capacity_m3_day === "" ? null : Number(p.capacity_m3_day),
          })),
        };

    const payload = {
      category: type,
      name: form.name,
      status: form.status,
      commissioning_date: form.commissioning_date,
      decommissioning_date: form.decommissioning_date,
      active: form.active,
      ...(isPlant
        ? { activity: form.activity, asset_type: form.asset_type, region: form.region, entity_category: form.entity_category }
        : {}),
      specifications,
    };

    try {
      const created = await createAsset(payload);
      onCreated(created);
    } catch (err) {
      setError(err.message || "Failed to create asset");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="af__overlay" onMouseDown={onCancel}>
      <div className="af__modal nb-entity-modal" onMouseDown={(e) => e.stopPropagation()}>
        <header className="af__head">
          <h2 className="af__title">{TITLES[type] || "Add asset"}</h2>
          <button className="af__close" onClick={onCancel} aria-label="Close">×</button>
        </header>
        <form className="af__body" onSubmit={submit}>
          <div className="af__grid">
            <Field label="Name *">
              <input type="text" value={form.name} onChange={set("name")} required autoFocus />
            </Field>
            {isPlant && (
              <>
                <Field label="Activity"><input value={form.activity} onChange={set("activity")} /></Field>
                <Field label="Asset Type"><input value={form.asset_type} onChange={set("asset_type")} /></Field>
              </>
            )}
            <Field label="Status">
              <select value={form.status} onChange={set("status")}>
                {STATUSES.map((s) => <option key={s} value={s}>{statusLabel(s)}</option>)}
              </select>
            </Field>
            {isPlant && (
              <>
                <Field label="Capacity (m³/day)">
                  <input type="number" step="any" value={form.design_capacity} onChange={set("design_capacity")} />
                </Field>
                <Field label="Capacity Limitation">
                  <select value={form.capacity_limit_mode} onChange={set("capacity_limit_mode")}>
                    <option value="none">None</option>
                    <option value="percentage">Percentage (%)</option>
                    <option value="absolute">Absolute (m³/day)</option>
                  </select>
                </Field>
                {form.capacity_limit_mode === "percentage" && (
                  <Field label="Percentage (%)">
                    <input type="number" step="any" min="0" max="100" value={form.capacity_limit_percentage} onChange={set("capacity_limit_percentage")} />
                  </Field>
                )}
                {form.capacity_limit_mode === "absolute" && (
                  <Field label="Absolute (m³/day)">
                    <input type="number" step="any" value={form.capacity_limit_absolute} onChange={set("capacity_limit_absolute")} />
                  </Field>
                )}
                <Field label="Region"><input value={form.region} onChange={set("region")} /></Field>
                <Field label="Entity Category">
                  <select value={form.entity_category} onChange={set("entity_category")}>
                    <option value="">—</option>
                    <option value="private">Private</option>
                    <option value="public">Public</option>
                  </select>
                </Field>
              </>
            )}
            <Field label="Commissioning Date">
              <input type="date" value={form.commissioning_date} onChange={set("commissioning_date")} />
            </Field>
            <Field label="Decommissioning Date">
              <input type="date" value={form.decommissioning_date} onChange={set("decommissioning_date")} />
            </Field>
            <Toggle
              label="Active"
              checked={form.active}
              onChange={(v) => setForm((f) => ({ ...f, active: v }))}
            />
          </div>

          {isPlant && <PlantQuickFields spec={spec} set={setSpecField} />}
          {!isPlant && <PumpStationFields pumps={pumps} setPumps={setPumps} />}

          {error && <div className="af__error">{error}</div>}

          <div className="af__footer">
            <button type="button" className="af__btn af__btn--ghost" onClick={onCancel}>Cancel</button>
            <button type="submit" className="af__btn af__btn--primary" disabled={saving}>
              {saving ? "Saving…" : `Add ${isPlant ? "plant" : "pump station"}`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Import the new modal in `NetworkBuilderPage.jsx`**

In `frontend/src/pages/NetworkBuilderPage.jsx`, find:

```js
import NetworkPalette from "../components/NetworkPalette";
import NetworkNodeDetails from "../components/NetworkNodeDetails";
import WorkspaceRecordSidebar from "../components/WorkspaceRecordSidebar";
```

Replace with:

```js
import NetworkPalette from "../components/NetworkPalette";
import NetworkNodeDetails from "../components/NetworkNodeDetails";
import WorkspaceRecordSidebar from "../components/WorkspaceRecordSidebar";
import NetworkEntityCreateModal from "../components/NetworkEntityCreateModal";
```

- [ ] **Step 4: Snapshot `active`/`entity_category` onto placed nodes' meta**

In the same file, find `assetMeta`:

```js
const assetMeta = (a) => ({
  region: a.region,
  cluster: a.cluster,
  asset_type: a.asset_type,
  latitude: a.latitude,
  longitude: a.longitude,
  specifications: a.specifications || {},
});
```

Replace with:

```js
const assetMeta = (a) => ({
  region: a.region,
  cluster: a.cluster,
  asset_type: a.asset_type,
  latitude: a.latitude,
  longitude: a.longitude,
  active: a.active,
  entity_category: a.entity_category,
  specifications: a.specifications || {},
});
```

- [ ] **Step 5: Add `entityModal` state**

Find:

```js
  const [pipeModal, setPipeModal] = useState({ open: false, source: null, target: null });
  const [pipeForm, setPipeForm] = useState(EMPTY_PIPE_FORM);
```

Replace with:

```js
  const [pipeModal, setPipeModal] = useState({ open: false, source: null, target: null });
  const [pipeForm, setPipeForm] = useState(EMPTY_PIPE_FORM);
  const [entityModal, setEntityModal] = useState({ open: false, type: null, position: null });
```

- [ ] **Step 6: Branch the canvas tap handler for plant/pump**

Find (inside the `cy.on("tap", (evt) => { ... })` background-tap handler):

```js
      if (m === "place-entity" && pendingEntityRef.current) {
        const type = pendingEntityRef.current;
        const label = type === "node" ? "" : `New ${ENTITY_TYPE_LABELS[type] || type}`;
        const node = cy.add({
          group: "nodes",
          data: { id: rid("n"), type, category: type, label, displayLabel: label, status: "", meta: { specifications: {} } },
          position: { x: evt.position.x, y: evt.position.y },
        });
        cy.$(":selected").unselect();
        node.select();
        return; // sticky — keep placing
      }
```

Replace with:

```js
      if (m === "place-entity" && pendingEntityRef.current) {
        const type = pendingEntityRef.current;
        if (type === "plant" || type === "pump") {
          pendingEntityRef.current = null;
          setPendingEntity(null);
          setEntityModal({ open: true, type, position: { x: evt.position.x, y: evt.position.y } });
          backToSelect();
          return;
        }
        const node = cy.add({
          group: "nodes",
          data: { id: rid("n"), type, category: type, label: "", displayLabel: "", status: "", meta: { specifications: {} } },
          position: { x: evt.position.x, y: evt.position.y },
        });
        cy.$(":selected").unselect();
        node.select();
        return; // sticky — keep placing
      }
```

(`backToSelect` is already defined a few lines above this handler in the same `useEffect`, so it's in scope.)

- [ ] **Step 7: Add `closeEntityModal`/`handleEntityCreated` callbacks**

Find `handlePick`:

```js
  const handlePick = useCallback((asset) => {
    pendingEntityRef.current = null;
    setPendingEntity(null);
    pendingRef.current = asset;
    setPendingAsset(asset);
    modeRef.current = "place-asset";
    setMode("place-asset");
    setToast(`Click the canvas to place "${asset.name || asset.id}".`);
  }, []);
```

Add immediately after it:

```js

  const closeEntityModal = useCallback(() => {
    setEntityModal({ open: false, type: null, position: null });
  }, []);

  const handleEntityCreated = useCallback((asset) => {
    const cy = cyRef.current;
    if (cy && entityModal.position) {
      const node = cy.add({
        group: "nodes",
        data: {
          id: rid("n"),
          assetId: asset.id,
          category: asset.category,
          type: asset.category,
          label: asset.name || asset.id,
          displayLabel: asset.name || asset.id,
          status: asset.status || "",
          meta: assetMeta(asset),
        },
        position: entityModal.position,
      });
      cy.$(":selected").unselect();
      node.select();
    }
    setEntityModal({ open: false, type: null, position: null });
  }, [entityModal.position]);
```

- [ ] **Step 8: Render the modal**

Find the `pipeModal.open && ( ... )` block's closing, i.e.:

```jsx
      {pipeModal.open && (
        <div className="af__overlay" onMouseDown={() => setPipeModal({ open: false, source: null, target: null })}>
```

Insert immediately before this line:

```jsx
      {entityModal.open && (
        <NetworkEntityCreateModal
          type={entityModal.type}
          onCancel={closeEntityModal}
          onCreated={handleEntityCreated}
        />
      )}

```

- [ ] **Step 9: Manual verification — Plant**

Run: `cd frontend && npm run dev` (with the Task 1 backend dev server still running).

In the browser: open the Network Builder, click "Plant" in the insert toolbar, click the canvas.

Expected: the "Add Plant" modal opens (not a blank node). Leave Name empty and try to submit — browser's native required-field validation blocks it. Fill Name = "Test Desal Plant", Capacity = 1000, Capacity Limitation = Percentage, Percentage = 90, Plant Type = Desalination, click "Add plant".

Expected: modal closes, a new node labeled "Test Desal Plant" appears at the clicked position and is selected. Reload the Network Builder's Asset Registry page (or `GET /api/assets?category=plant`) and confirm "Test Desal Plant" is listed there — proving it was persisted as a real asset, not just canvas-local data.

- [ ] **Step 10: Manual verification — Pump**

In the browser: click "Pump" in the insert toolbar, click the canvas.

Expected: the "Add Pump Station" modal opens. Fill Name = "Test Pump Station", click "+ Functional", fill that row's name/capacity, toggle Active off, click "Add pump station".

Expected: modal closes, a new node labeled "Test Pump Station" appears and is selected.

- [ ] **Step 11: Manual verification — cancel**

Click "Plant" in the insert toolbar, click the canvas, then click the modal's backdrop (outside the modal box).

Expected: modal closes, no node is added to the canvas, no asset is created (`GET /api/assets?category=plant` count unchanged from before this step).

- [ ] **Step 12: Manual verification — generic "node" placement unaffected**

Click "Node" (the third `INSERT_ENTITIES` toolbar option) and click the canvas twice at two different spots.

Expected: two blank nodes are placed instantly with no modal, exactly like before this change (this branch was untouched).

- [ ] **Step 13: Commit**

```bash
git add frontend/src/components/PlantQuickFields.jsx frontend/src/components/NetworkEntityCreateModal.jsx frontend/src/pages/NetworkBuilderPage.jsx
git commit -m "$(cat <<'EOF'
Add quick-add modal for Plant/Pump insertion in Network Builder

Clicking Plant/Pump in the insert toolbar and then the canvas now opens a
focused input modal and creates a real Asset Registry record, instead of
dropping a blank, data-less node.
EOF
)"
```

---

### Task 3: Frontend — surface the new fields in the node inspector

**Files:**
- Modify: `frontend/src/components/NetworkNodeDetails.jsx`

**Interfaces:**
- Consumes: `selected.meta.active`, `selected.meta.entity_category` (added to node `meta` by Task 2's `assetMeta()` change), `selected.meta.specifications.{capacity_limit_mode,capacity_limit_percentage,capacity_limit_absolute,variable_om}` (added by Task 2's modal).
- Produces: no new exports — this task only adds display rows to the existing inspector.

- [ ] **Step 1: Add a `capacityLimitLabel` helper**

In `frontend/src/components/NetworkNodeDetails.jsx`, find:

```js
const statusLabel = (s) =>
  s ? s.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase()) : "—";
const clean = (v) => (v == null || v === "" || v === "NULL" ? null : v);
```

Replace with:

```js
const statusLabel = (s) =>
  s ? s.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase()) : "—";
const clean = (v) => (v == null || v === "" || v === "NULL" ? null : v);

function capacityLimitLabel(spec) {
  const mode = spec.capacity_limit_mode;
  if (!mode || mode === "none") return mode === "none" ? "None" : null;
  if (mode === "percentage") {
    return spec.capacity_limit_percentage != null ? `${spec.capacity_limit_percentage}% of design capacity` : null;
  }
  if (mode === "absolute") {
    return spec.capacity_limit_absolute != null ? `${spec.capacity_limit_absolute} m³/day` : null;
  }
  return null;
}

const yesNo = (v) => (v == null ? null : v ? "Yes" : "No");
```

- [ ] **Step 2: Add Entity category / Active to the shared Asset section**

Find:

```jsx
        <div className="af__section">Asset</div>
        <dl className="adr__list">
          <Row label="Asset ID" value={selected.assetId} />
          <Row label="Category" value={ENTITY_TYPE_LABELS[selected.category] || selected.category} />
          <Row label="Region" value={meta.region} />
          <Row label="Cluster" value={meta.cluster} />
          <Row label="Asset type" value={meta.asset_type} />
          <Row label="Coordinates" value={coords} />
        </dl>
```

Replace with:

```jsx
        <div className="af__section">Asset</div>
        <dl className="adr__list">
          <Row label="Asset ID" value={selected.assetId} />
          <Row label="Category" value={ENTITY_TYPE_LABELS[selected.category] || selected.category} />
          <Row label="Region" value={meta.region} />
          <Row label="Cluster" value={meta.cluster} />
          <Row label="Asset type" value={meta.asset_type} />
          <Row label="Entity category" value={meta.entity_category} />
          <Row label="Active" value={yesNo(meta.active)} />
          <Row label="Coordinates" value={coords} />
        </dl>
```

(This single change covers both Plant and Pump, since this "Asset" block renders unconditionally for any non-annotation node.)

- [ ] **Step 3: Add Capacity limitation / Variable O&M to the Plant specifications block**

Find:

```jsx
        {selected.category === "plant" && Object.keys(spec).length > 0 && (
          <>
            <div className="af__section">Specifications</div>
            <dl className="adr__list">
              <Row label="Plant type" value={spec.plant_type} />
              <Row label="Water source" value={spec.water_source} />
              <Row label="Technology" value={spec.technology} />
              <Row label="Design capacity (m³/day)" value={spec.design_capacity} />
              <Row label="Maximum capacity (m³/day)" value={spec.maximum_capacity} />
              <Row label="Contracted capacity (m³/day)" value={spec.contracted_capacity} />
              <Row label="Treatment level" value={spec.treatment_level} />
            </dl>
          </>
        )}
```

Replace with:

```jsx
        {selected.category === "plant" && Object.keys(spec).length > 0 && (
          <>
            <div className="af__section">Specifications</div>
            <dl className="adr__list">
              <Row label="Plant type" value={spec.plant_type} />
              <Row label="Water source" value={spec.water_source} />
              <Row label="Technology" value={spec.technology} />
              <Row label="Design capacity (m³/day)" value={spec.design_capacity} />
              <Row label="Maximum capacity (m³/day)" value={spec.maximum_capacity} />
              <Row label="Contracted capacity (m³/day)" value={spec.contracted_capacity} />
              <Row label="Treatment level" value={spec.treatment_level} />
              <Row label="Capacity limitation" value={capacityLimitLabel(spec)} />
              <Row label="Variable O&M (SAR/m³)" value={spec.variable_om} />
            </dl>
          </>
        )}
```

- [ ] **Step 4: Manual verification**

With both dev servers still running from Task 2, in the browser select the "Test Desal Plant" node placed in Task 2 Step 9.

Expected: the right-side inspector now shows, in the "Asset" block, "Entity category" (blank, since it wasn't set in that test) and "Active — Yes"; and in "Specifications", "Capacity limitation — 90% of design capacity" and "Variable O&M (SAR/m³)" (blank, not set in that test).

Select the "Test Pump Station" node placed in Task 2 Step 10.

Expected: the "Asset" block shows "Active — No" (it was toggled off before submitting).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/NetworkNodeDetails.jsx
git commit -m "$(cat <<'EOF'
Show active/entity-category/capacity-limit fields in node inspector

Surfaces the fields captured by the new Network Builder quick-add modal
(Task: Network Builder Quick-Add Plant/Pump Modal) in the canvas
right-panel inspector.
EOF
)"
```
