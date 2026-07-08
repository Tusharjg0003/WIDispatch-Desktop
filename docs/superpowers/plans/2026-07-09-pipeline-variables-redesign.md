# Pipeline Variables Modal Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Network Builder's 5-field "Pipeline variables" pipe-drawing modal with the full field set from the design spec (capacity/length/diameter/material/dates/active/bidirectional/capacity-limitation, plus two new shared reference entities — Transmission Systems and Transmission Lines, creatable inline), and keep the canvas inspector in sync so placed pipes stay editable.

**Architecture:** Pipe data stays canvas-local (no Asset Registry record), written into the edge's top-level fields + `meta.specifications`, exactly like today. Transmission Systems/Lines are new, minimal, backend-persisted `{id, name}`-shaped entities (Lines also carry branch info), fetched once by `NetworkBuilderPage.jsx` on mount and passed as props to both the new `PipeVariablesModal.jsx` (creation) and the updated `NetworkNodeDetails.jsx` (reassignment) — a single shared list avoids the modal creating a system inline and the inspector not knowing its name yet.

**Tech Stack:** React (Vite, no test runner configured in this repo — same as the prior plan), Express + MongoDB backend, Cytoscape.js canvas.

## Global Constraints

- No test framework exists anywhere in this repo. Verification is manual: `curl` against the running backend dev server for Task 1, and browser/Playwright-style click-through against both running dev servers for Tasks 2-3 (same approach used successfully in the prior Network Builder quick-add plan — `docs/superpowers/plans/2026-07-08-network-builder-quick-add-plant-pump.md`).
- Backend dev server requires `MONGODB_URI` in the repo-root `.env.local` — assume configured.
- Follow existing codebase conventions: `af__*` CSS classes (global once any page importing `AssetRegistryPage.css` is in the route bundle — no new import needed, same as the existing `pipeModal`/`NetworkEntityCreateModal`), the `Field`/`Toggle`/`Switch` controls from `frontend/src/components/AssetFormControls.jsx`, local constant duplication for small option lists (`STATUSES` is already duplicated in two files — follow that precedent rather than sharing a module for `MATERIALS`).
- Design spec: `docs/superpowers/specs/2026-07-09-pipeline-variables-redesign-design.md` — read it for the "why" behind field choices (e.g. why `capacityLimitationValue` is a single shared field, why Transmission Lines are independent of Systems, why branch fields only show when creating a new line).
- This is scoped to the Network Builder's pipe-drawing flow only (two-click `draw-pipe` mode → `pipeModal`) and its inspector counterpart. Do not touch `NetworkEntityCreateModal.jsx`, `PlantQuickFields.jsx`, `PumpStationFields.jsx`, or the plant/pump branches of `NetworkNodeDetails.jsx`.
- Work happens directly on `main` (no worktree), consistent with the prior plan — the repo has other unrelated uncommitted WIP in various files; touch only what each task specifies.

---

### Task 1: Backend — Transmission Systems & Lines registry

**Files:**
- Create: `backend/src/transmissionRegistry.js`
- Modify: `backend/src/server.js`

**Interfaces:**
- Produces: `listTransmissionSystems(): Promise<{systems: Array<{id, name}>}>`, `createTransmissionSystem({name}): Promise<{id, name}>` (throws `Error` with `.statusCode = 400` if name missing/blank), `listTransmissionLines(): Promise<{lines: Array<{id, name, isBranch, parentLineId, branchName}>}>`, `createTransmissionLine({name, isBranch, parentLineId, branchName}): Promise<{id, name, isBranch, parentLineId, branchName}>` (same name validation). Routes: `GET/POST /api/transmission-systems`, `GET/POST /api/transmission-lines`.

- [ ] **Step 1: Create `backend/src/transmissionRegistry.js`**

```js
import { getDb } from "./db.js";

const SYSTEMS_COLLECTION = "transmissionSystems";
const LINES_COLLECTION = "transmissionLines";

const SYSTEM_PROJECTION = { _id: 0, id: 1, name: 1 };
const LINE_PROJECTION = { _id: 0, id: 1, name: 1, isBranch: 1, parentLineId: 1, branchName: 1 };

function requireName(name) {
  if (!name || !String(name).trim()) {
    const err = new Error("Name is required");
    err.statusCode = 400;
    throw err;
  }
}

export async function listTransmissionSystems() {
  const db = await getDb();
  const systems = await db
    .collection(SYSTEMS_COLLECTION)
    .find({}, { projection: SYSTEM_PROJECTION })
    .sort({ name: 1 })
    .toArray();
  return { systems };
}

export async function createTransmissionSystem(body = {}) {
  requireName(body.name);
  const db = await getDb();
  const doc = {
    id: `system_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    name: String(body.name).trim(),
    created_at: new Date().toISOString(),
  };
  await db.collection(SYSTEMS_COLLECTION).insertOne(doc);
  const { created_at, ...system } = doc;
  return system;
}

export async function listTransmissionLines() {
  const db = await getDb();
  const lines = await db
    .collection(LINES_COLLECTION)
    .find({}, { projection: LINE_PROJECTION })
    .sort({ name: 1 })
    .toArray();
  return { lines };
}

export async function createTransmissionLine(body = {}) {
  requireName(body.name);
  const db = await getDb();
  const doc = {
    id: `line_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    name: String(body.name).trim(),
    isBranch: !!body.isBranch,
    parentLineId: body.parentLineId || null,
    branchName: body.branchName || null,
    created_at: new Date().toISOString(),
  };
  await db.collection(LINES_COLLECTION).insertOne(doc);
  const { created_at, ...line } = doc;
  return line;
}
```

- [ ] **Step 2: Wire up routes in `backend/src/server.js`**

Find:

```js
import { listAssets, createAsset, getAssetById } from "./assetRegistry.js";
import { listNetworks, getNetwork, createNetwork, updateNetwork, deleteNetwork } from "./networks.js";
```

Replace with:

```js
import { listAssets, createAsset, getAssetById } from "./assetRegistry.js";
import {
  listTransmissionSystems, createTransmissionSystem,
  listTransmissionLines, createTransmissionLine,
} from "./transmissionRegistry.js";
import { listNetworks, getNetwork, createNetwork, updateNetwork, deleteNetwork } from "./networks.js";
```

Find:

```js
app.get("/api/transmission/summary", async (req, res) => {
  try {
    res.json(await buildTransmission(filtersFrom(req)));
  } catch (err) {
    console.error("transmission error:", err);
    res.status(500).json({ error: "Failed to build transmission summary" });
  }
});
```

Insert immediately after it:

```js

app.get("/api/transmission-systems", async (_req, res) => {
  try {
    res.json(await listTransmissionSystems());
  } catch (err) {
    console.error("transmission systems list error:", err);
    res.status(500).json({ error: "Failed to list transmission systems" });
  }
});

app.post("/api/transmission-systems", async (req, res) => {
  try {
    const created = await createTransmissionSystem(req.body || {});
    res.status(201).json(created);
  } catch (err) {
    console.error("transmission system create error:", err);
    res.status(err.statusCode || 500).json({ error: err.message || "Failed to create transmission system" });
  }
});

app.get("/api/transmission-lines", async (_req, res) => {
  try {
    res.json(await listTransmissionLines());
  } catch (err) {
    console.error("transmission lines list error:", err);
    res.status(500).json({ error: "Failed to list transmission lines" });
  }
});

app.post("/api/transmission-lines", async (req, res) => {
  try {
    const created = await createTransmissionLine(req.body || {});
    res.status(201).json(created);
  } catch (err) {
    console.error("transmission line create error:", err);
    res.status(err.statusCode || 500).json({ error: err.message || "Failed to create transmission line" });
  }
});
```

- [ ] **Step 3: Start the backend dev server and verify**

Run: `cd backend && npm run dev`
Expected: server starts, no MongoDB connection error.

```bash
curl -s http://localhost:4000/api/transmission-systems | python3 -m json.tool
curl -s -X POST http://localhost:4000/api/transmission-systems \
  -H "Content-Type: application/json" -d '{"name":"Riyadh Main System"}' | python3 -m json.tool
curl -s http://localhost:4000/api/transmission-systems | python3 -m json.tool
```

Expected: first call returns `{"systems": []}` (or existing systems if any). Second call returns `201` with `{"id": "system_...", "name": "Riyadh Main System"}` (no `created_at` in the response — it's stripped before returning). Third call's `systems` array now includes it.

```bash
curl -s -X POST http://localhost:4000/api/transmission-lines \
  -H "Content-Type: application/json" -d '{"name":"Main Trunk"}' | python3 -m json.tool
```

Save the returned `id` as `PARENT_ID`, then:

```bash
curl -s -X POST http://localhost:4000/api/transmission-lines \
  -H "Content-Type: application/json" \
  -d "{\"name\":\"North Spur\",\"isBranch\":true,\"parentLineId\":\"$PARENT_ID\",\"branchName\":\"North Spur\"}" | python3 -m json.tool
curl -s http://localhost:4000/api/transmission-lines | python3 -m json.tool
```

Expected: both lines created; the second has `"isBranch": true`, `"parentLineId"` matching the first's `id`, `"branchName": "North Spur"`. The list endpoint shows both, sorted by name.

```bash
curl -s -X POST http://localhost:4000/api/transmission-systems \
  -H "Content-Type: application/json" -d '{"name":""}'
```

Expected: `400` with `{"error": "Name is required"}`.

- [ ] **Step 4: Commit**

```bash
git add backend/src/transmissionRegistry.js backend/src/server.js
git commit -m "$(cat <<'EOF'
Add Transmission Systems/Lines registry endpoints

New minimal reference entities the redesigned pipe-drawing modal will let
users pick or create inline — not Asset Registry records, no other page
manages them.
EOF
)"
```

---

### Task 2: Frontend — redesigned pipe-drawing modal

**Files:**
- Create: `frontend/src/components/PipeVariablesModal.jsx`
- Modify: `frontend/src/api/metrics.js`
- Modify: `frontend/src/pages/NetworkBuilderPage.jsx`

**Interfaces:**
- Consumes: `fetchTransmissionSystems()`, `createTransmissionSystem({name})`, `fetchTransmissionLines()`, `createTransmissionLine({name, isBranch, parentLineId, branchName})` (added to `frontend/src/api/metrics.js` in this task); `Field`, `Toggle` from `AssetFormControls.jsx` (existing).
- Produces: `PipeVariablesModal` default export, props `{ systems: Array<{id,name}>, lines: Array<{id,name,isBranch,parentLineId,branchName}>, onCancel: () => void, onSubmit: (rawForm) => Promise<void> }` where `rawForm` has keys `name, capacity, pipelineLength, pipelineDiameter, pipelineMaterial, designCapacity, maximumCapacity, infraSource, commissioningDate, decommissioningDate, active, bidirectional, transmissionSystemId, newTransmissionSystemName, lineGroupIds, newLineName, isBranch, parentLineId, branchName, capacityLimitationType, capacityLimitationValue`. If the returned promise rejects, the modal shows the error inline and stays open with input intact (does not call `onCancel`).
- `NetworkBuilderPage.jsx` gets new state `transmissionSystems`, `transmissionLines` (both `Array`, fetched once on mount) — Task 3 reuses these same two pieces of state for the inspector, so their shape here is load-bearing for that later task.

- [ ] **Step 1: Add API functions to `frontend/src/api/metrics.js`**

Find:

```js
export async function createAsset(payload) {
  const res = await fetch(`${API_BASE}/api/assets`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}
```

Replace with:

```js
export async function createAsset(payload) {
  const res = await fetch(`${API_BASE}/api/assets`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

async function postJson(path, payload) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

export function fetchTransmissionSystems() {
  return getJson("/api/transmission-systems");
}

export function createTransmissionSystem(payload) {
  return postJson("/api/transmission-systems", payload);
}

export function fetchTransmissionLines() {
  return getJson("/api/transmission-lines");
}

export function createTransmissionLine(payload) {
  return postJson("/api/transmission-lines", payload);
}
```

- [ ] **Step 2: Create `frontend/src/components/PipeVariablesModal.jsx`**

```jsx
import React, { useState } from "react";
import { Field, Toggle } from "./AssetFormControls";

const MATERIALS = [
  { value: "steel", label: "Steel" },
  { value: "ductile_iron", label: "Ductile Iron" },
  { value: "hdpe", label: "HDPE" },
  { value: "concrete", label: "Concrete" },
  { value: "pvc", label: "PVC" },
];

const EMPTY_FORM = {
  name: "", capacity: "", pipelineLength: "", pipelineDiameter: "", pipelineMaterial: "",
  designCapacity: "", maximumCapacity: "", infraSource: "",
  commissioningDate: "", decommissioningDate: "", active: true, bidirectional: false,
  transmissionSystemId: "", newTransmissionSystemName: "",
  lineGroupIds: [], newLineName: "", isBranch: false, parentLineId: "", branchName: "",
  capacityLimitationType: "none", capacityLimitationValue: "",
};

// Pipe-drawing modal for the Network Builder canvas (shown after connecting
// two nodes in draw-pipe mode). Self-contained form state, like
// NetworkEntityCreateModal, but `onSubmit` receives the raw, unresolved
// form values rather than an already-created result — the parent
// (NetworkBuilderPage's submitPipe) owns creating any new Transmission
// System/Line so it can keep its own shared systems/lines state in sync
// for the canvas inspector. `systems`/`lines` are the current known lists,
// for the existing-item selects.
export default function PipeVariablesModal({ systems, lines, onCancel, onSubmit }) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const setChecked = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));
  const setLineGroupIds = (e) => {
    const ids = Array.from(e.target.selectedOptions, (o) => o.value);
    setForm((f) => ({ ...f, lineGroupIds: ids }));
  };

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await onSubmit(form);
    } catch (err) {
      setError(err.message || "Failed to add pipe");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="af__overlay" onMouseDown={onCancel}>
      <div className="af__modal nb-pipe-modal" onMouseDown={(e) => e.stopPropagation()}>
        <header className="af__head">
          <h2 className="af__title">Pipeline variables</h2>
          <button className="af__close" onClick={onCancel} aria-label="Close">×</button>
        </header>
        <form className="af__body" onSubmit={submit}>
          <div className="af__grid">
            <Field label="Pipe Name *">
              <input
                type="text" value={form.name} placeholder="e.g. West trunk main"
                onChange={set("name")} required autoFocus
              />
            </Field>
            <Field label="Capacity (m³/day)">
              <input type="number" step="any" value={form.capacity} onChange={set("capacity")} />
            </Field>
            <Field label="Length (km)">
              <input type="number" step="any" value={form.pipelineLength} onChange={set("pipelineLength")} />
            </Field>
            <Field label="Diameter (mm)">
              <input type="number" step="any" value={form.pipelineDiameter} onChange={set("pipelineDiameter")} />
            </Field>
            <Field label="Material">
              <select value={form.pipelineMaterial} onChange={set("pipelineMaterial")}>
                <option value="">—</option>
                {MATERIALS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
            </Field>
            <Field label="Design Capacity (m³/day)">
              <input type="number" step="any" value={form.designCapacity} onChange={set("designCapacity")} />
            </Field>
            <Field label="Max Capacity (m³/day)">
              <input type="number" step="any" value={form.maximumCapacity} onChange={set("maximumCapacity")} />
            </Field>
            <Field label="Source">
              <input type="text" value={form.infraSource} onChange={set("infraSource")} />
            </Field>
            <Field label="Commissioning Date">
              <input type="date" value={form.commissioningDate} onChange={set("commissioningDate")} />
            </Field>
            <Field label="Decommissioning Date">
              <input type="date" value={form.decommissioningDate} onChange={set("decommissioningDate")} />
            </Field>
            <Toggle label="Active" checked={form.active} onChange={setChecked("active")} />
            <Toggle label="Bidirectional" checked={form.bidirectional} onChange={setChecked("bidirectional")} />
          </div>

          <div className="af__section">Transmission System</div>
          <div className="af__grid">
            <Field label="Transmission System">
              <select value={form.transmissionSystemId} onChange={set("transmissionSystemId")}>
                <option value="">—</option>
                {systems.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </Field>
            <Field label="Create new system">
              <input
                type="text" value={form.newTransmissionSystemName}
                placeholder="e.g. Riyadh Main System"
                onChange={set("newTransmissionSystemName")}
              />
            </Field>
          </div>

          <div className="af__section">Transmission Lines</div>
          <div className="af__grid">
            <Field label="Transmission Lines">
              <select multiple value={form.lineGroupIds} onChange={setLineGroupIds}>
                {lines.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </Field>
            <Field label="New Transmission Line">
              <input
                type="text" value={form.newLineName} placeholder="e.g. Line 3"
                onChange={set("newLineName")}
              />
            </Field>
            {form.newLineName.trim() !== "" && (
              <>
                <Toggle label="This line is a branch" checked={form.isBranch} onChange={setChecked("isBranch")} />
                {form.isBranch && (
                  <>
                    <Field label="Branch Of Line">
                      <select value={form.parentLineId} onChange={set("parentLineId")}>
                        <option value="">—</option>
                        {lines.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                      </select>
                    </Field>
                    <Field label="Branch Name">
                      <input type="text" value={form.branchName} onChange={set("branchName")} />
                    </Field>
                  </>
                )}
              </>
            )}
          </div>

          <div className="af__section">Capacity Limitation</div>
          <div className="af__grid">
            <Field label="Capacity Limitation">
              <select value={form.capacityLimitationType} onChange={set("capacityLimitationType")}>
                <option value="none">None</option>
                <option value="percentage">Percentage (%)</option>
                <option value="absolute">Absolute (m³/day)</option>
              </select>
            </Field>
            {form.capacityLimitationType !== "none" && (
              <Field label="Capacity Limitation Value">
                <input
                  type="number" step="any" value={form.capacityLimitationValue}
                  onChange={set("capacityLimitationValue")}
                />
              </Field>
            )}
          </div>

          {error && <div className="af__error">{error}</div>}

          <div className="af__footer">
            <button type="button" className="af__btn af__btn--ghost" onClick={onCancel}>Cancel</button>
            <button type="submit" className="af__btn af__btn--primary" disabled={saving}>
              {saving ? "Saving…" : "Add pipe"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Update imports in `NetworkBuilderPage.jsx`**

Find:

```js
import { fetchNetwork, fetchNetworks, saveNetwork, updateNetwork, deleteNetwork } from "../api/networks";
import NetworkPalette from "../components/NetworkPalette";
import NetworkNodeDetails from "../components/NetworkNodeDetails";
import WorkspaceRecordSidebar from "../components/WorkspaceRecordSidebar";
import NetworkEntityCreateModal from "../components/NetworkEntityCreateModal";
```

Replace with:

```js
import { fetchNetwork, fetchNetworks, saveNetwork, updateNetwork, deleteNetwork } from "../api/networks";
import {
  fetchTransmissionSystems, createTransmissionSystem,
  fetchTransmissionLines, createTransmissionLine,
} from "../api/metrics";
import NetworkPalette from "../components/NetworkPalette";
import NetworkNodeDetails from "../components/NetworkNodeDetails";
import WorkspaceRecordSidebar from "../components/WorkspaceRecordSidebar";
import NetworkEntityCreateModal from "../components/NetworkEntityCreateModal";
import PipeVariablesModal from "../components/PipeVariablesModal";
```

- [ ] **Step 4: Remove `EMPTY_PIPE_FORM`**

Find:

```js
const rid = (p) => `${p}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
const EMPTY_PIPE_FORM = { label: "", length_km: "", diameter_mm: "", material: "", status: "operational" };
const INSERT_ENTITIES = ["plant", "pump", "node"];
```

Replace with:

```js
const rid = (p) => `${p}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
const INSERT_ENTITIES = ["plant", "pump", "node"];
```

- [ ] **Step 5: Replace `pipeForm` state with `transmissionSystems`/`transmissionLines` state**

Find:

```js
  const [pipeModal, setPipeModal] = useState({ open: false, source: null, target: null });
  const [pipeForm, setPipeForm] = useState(EMPTY_PIPE_FORM);
  const [entityModal, setEntityModal] = useState({ open: false, type: null, position: null });
```

Replace with:

```js
  const [pipeModal, setPipeModal] = useState({ open: false, source: null, target: null });
  const [transmissionSystems, setTransmissionSystems] = useState([]);
  const [transmissionLines, setTransmissionLines] = useState([]);
  const [entityModal, setEntityModal] = useState({ open: false, type: null, position: null });
```

- [ ] **Step 6: Fetch Transmission Systems/Lines once on mount**

Find (the closing of the "Hydrate from a saved network" `useEffect`, immediately followed by the "Mode / placement" section comment):

```js
      .catch((e) => setToast(e.message || "Couldn't load network"));
    return () => {
      cancelled = true;
    };
  }, [id, cyReady, syncGraph, resetHistory]);

  // ── Mode / placement ─────────────────────────────────────────────────────────
```

Replace with:

```js
      .catch((e) => setToast(e.message || "Couldn't load network"));
    return () => {
      cancelled = true;
    };
  }, [id, cyReady, syncGraph, resetHistory]);

  // ── Transmission Systems/Lines: fetched once, shared by the pipe modal and
  // the canvas inspector so a newly-created system/line is immediately known
  // to both (see submitPipe, which appends to this state on creation). ──────────
  useEffect(() => {
    let cancelled = false;
    fetchTransmissionSystems()
      .then((data) => { if (!cancelled) setTransmissionSystems(data.systems || []); })
      .catch(() => {});
    fetchTransmissionLines()
      .then((data) => { if (!cancelled) setTransmissionLines(data.lines || []); })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // ── Mode / placement ─────────────────────────────────────────────────────────
```

- [ ] **Step 7: Update `createPipeEdge` to accept the new top-level fields**

Find:

```js
  // Create an ad-hoc pipe edge between two nodes.
  const createPipeEdge = useCallback(({ source, target, label, status, specs }) => {
    const cy = cyRef.current;
    if (!cy) return;
    const name = (label && label.trim()) || "Pipe";
    const edge = cy.add({
      group: "edges",
      data: {
        id: rid("e"),
        source,
        target,
        kind: "pipe",
        assetId: null,
        label: name,
        displayLabel: name,
        status: status || "",
        meta: { specifications: specs || {} },
      },
    });
    cy.$(":selected").unselect();
    edge.select();
  }, []);
```

Replace with:

```js
  // Create an ad-hoc pipe edge between two nodes. `active` drives the derived
  // `status` (used for the canvas status color band) since the pipe modal has
  // no separate Status field, only Active.
  const createPipeEdge = useCallback(({ source, target, label, active, commissioningDate, decommissioningDate, specs }) => {
    const cy = cyRef.current;
    if (!cy) return;
    const name = (label && label.trim()) || "Pipe";
    const edge = cy.add({
      group: "edges",
      data: {
        id: rid("e"),
        source,
        target,
        kind: "pipe",
        assetId: null,
        label: name,
        displayLabel: name,
        status: active ? "operational" : "inactive",
        active: !!active,
        commissioningDate: commissioningDate || "",
        decommissioningDate: decommissioningDate || "",
        meta: { specifications: specs || {} },
      },
    });
    cy.$(":selected").unselect();
    edge.select();
  }, []);
```

- [ ] **Step 8: Remove the stale `setPipeForm` reset call**

Find:

```js
      clearDrawSource();
      setPipeForm(EMPTY_PIPE_FORM);
      setPipeModal({ open: true, source, target });
      backToSelect();
    });
```

Replace with:

```js
      clearDrawSource();
      setPipeModal({ open: true, source, target });
      backToSelect();
    });
```

(No replacement reset needed — `PipeVariablesModal` only mounts while `pipeModal.open` is true, so its internal `useState(EMPTY_FORM)` starts fresh every time it opens.)

- [ ] **Step 9: Rewrite `submitPipe`**

Find:

```js
  const submitPipe = useCallback(() => {
    const specs = {};
    if (pipeForm.length_km !== "") specs.length_km = Number(pipeForm.length_km);
    if (pipeForm.diameter_mm !== "") specs.diameter_mm = Number(pipeForm.diameter_mm);
    if (pipeForm.material.trim()) specs.material = pipeForm.material.trim();
    createPipeEdge({
      source: pipeModal.source,
      target: pipeModal.target,
      asset: null,
      label: pipeForm.label,
      status: pipeForm.status,
      specs,
    });
    setPipeModal({ open: false, source: null, target: null });
  }, [pipeForm, pipeModal, createPipeEdge]);
```

Replace with:

```js
  // Called by PipeVariablesModal's onSubmit with the raw form values. Creates
  // any new Transmission System/Line first (appending to the shared state so
  // the inspector picks them up immediately), then builds the pipe edge. If
  // either creation POST rejects, this rejects too — PipeVariablesModal
  // catches it, shows the error inline, and keeps the modal open.
  const submitPipe = useCallback(
    async (form) => {
      let systemId = form.transmissionSystemId || null;
      let lineIds = [...form.lineGroupIds];

      if (form.newTransmissionSystemName.trim()) {
        const created = await createTransmissionSystem({ name: form.newTransmissionSystemName.trim() });
        setTransmissionSystems((s) => [...s, created]);
        systemId = created.id;
      }
      if (form.newLineName.trim()) {
        const created = await createTransmissionLine({
          name: form.newLineName.trim(),
          isBranch: form.isBranch,
          parentLineId: form.isBranch ? form.parentLineId || null : null,
          branchName: form.isBranch ? form.branchName : null,
        });
        setTransmissionLines((s) => [...s, created]);
        lineIds = [...lineIds, created.id];
      }

      const specs = {};
      if (form.capacity !== "") specs.capacity = Number(form.capacity);
      if (form.pipelineLength !== "") specs.pipelineLength = Number(form.pipelineLength);
      if (form.pipelineDiameter !== "") specs.pipelineDiameter = Number(form.pipelineDiameter);
      if (form.pipelineMaterial) specs.pipelineMaterial = form.pipelineMaterial;
      if (form.designCapacity !== "") specs.designCapacity = Number(form.designCapacity);
      if (form.maximumCapacity !== "") specs.maximumCapacity = Number(form.maximumCapacity);
      if (form.infraSource.trim()) specs.infraSource = form.infraSource.trim();
      specs.bidirectional = !!form.bidirectional;
      if (systemId) specs.transmissionSystemId = systemId;
      if (lineIds.length) specs.lineGroupIds = lineIds;
      specs.capacityLimitationType = form.capacityLimitationType;
      if (form.capacityLimitationType !== "none" && form.capacityLimitationValue !== "") {
        specs.capacityLimitationValue = Number(form.capacityLimitationValue);
      }

      createPipeEdge({
        source: pipeModal.source,
        target: pipeModal.target,
        label: form.name,
        active: form.active,
        commissioningDate: form.commissioningDate,
        decommissioningDate: form.decommissioningDate,
        specs,
      });
      setPipeModal({ open: false, source: null, target: null });
    },
    [pipeModal, createPipeEdge]
  );
```

- [ ] **Step 10: Replace the pipe modal's JSX render**

Find:

```jsx
      {pipeModal.open && (
        <div className="af__overlay" onMouseDown={() => setPipeModal({ open: false, source: null, target: null })}>
          <div className="af__modal nb-pipe-modal" onMouseDown={(e) => e.stopPropagation()}>
            <header className="af__head">
              <h2 className="af__title">Pipeline variables</h2>
              <button className="af__close" onClick={() => setPipeModal({ open: false, source: null, target: null })} aria-label="Close">×</button>
            </header>
            <form className="af__body" onSubmit={(e) => { e.preventDefault(); submitPipe(); }}>
              <div className="af__grid">
                <label className="af__field">
                  Name / label
                  <input type="text" value={pipeForm.label} placeholder="e.g. West trunk main"
                    onChange={(e) => setPipeForm((f) => ({ ...f, label: e.target.value }))} />
                </label>
                <label className="af__field">
                  Status
                  <select value={pipeForm.status} onChange={(e) => setPipeForm((f) => ({ ...f, status: e.target.value }))}>
                    <option value="operational">Operational</option>
                    <option value="maintenance">Maintenance</option>
                    <option value="under_construction">Under construction</option>
                    <option value="planned">Planned</option>
                    <option value="decommissioned">Decommissioned</option>
                  </select>
                </label>
                <label className="af__field">
                  Length (km)
                  <input type="number" step="any" value={pipeForm.length_km}
                    onChange={(e) => setPipeForm((f) => ({ ...f, length_km: e.target.value }))} />
                </label>
                <label className="af__field">
                  Diameter (mm)
                  <input type="number" step="any" value={pipeForm.diameter_mm}
                    onChange={(e) => setPipeForm((f) => ({ ...f, diameter_mm: e.target.value }))} />
                </label>
                <label className="af__field">
                  Material
                  <input type="text" value={pipeForm.material} placeholder="e.g. Ductile iron"
                    onChange={(e) => setPipeForm((f) => ({ ...f, material: e.target.value }))} />
                </label>
              </div>
              <div className="af__footer">
                <button type="button" className="af__btn af__btn--ghost" onClick={() => setPipeModal({ open: false, source: null, target: null })}>Cancel</button>
                <button type="submit" className="af__btn af__btn--primary">Add pipe</button>
              </div>
            </form>
          </div>
        </div>
      )}
```

Replace with:

```jsx
      {pipeModal.open && (
        <PipeVariablesModal
          systems={transmissionSystems}
          lines={transmissionLines}
          onCancel={() => setPipeModal({ open: false, source: null, target: null })}
          onSubmit={submitPipe}
        />
      )}
```

- [ ] **Step 11: Manual verification — new pipe with a new system and a branch line**

Run: `cd backend && npm run dev` (Task 1's endpoints) and `cd frontend && npm run dev`.

In the browser (or via Playwright driving the live dev servers, as used successfully in the prior plan): open the Network Builder, place two nodes (e.g. two "Node" annotations, or a Plant/Pump — any two nodes work for pipe-drawing), enter draw-pipe mode, click the two nodes to connect them.

Expected: the "Pipeline variables" modal opens with the new field set (Pipe Name, Capacity, Length, Diameter, Material, Design/Max Capacity, Source, dates, Active, Bidirectional, Transmission System + Create new system, Transmission Lines + New Transmission Line, Capacity Limitation).

Fill: Pipe Name = "Test Main Line", Capacity = 2000, Length = 12.5, Diameter = 600, Material = HDPE, Design Capacity = 2200, Source = "Test source", Active on, Bidirectional off, leave Transmission System blank but type "Test System A" into "Create new system", leave Transmission Lines unselected but type "Test Line A" into "New Transmission Line", toggle "This line is a branch" on, leave "Branch Of Line" blank, Branch Name = "Test Branch A", Capacity Limitation = Percentage, Capacity Limitation Value = 80. Submit.

Expected: modal closes, a new pipe edge appears on the canvas between the two nodes, selected. `GET /api/transmission-systems` now includes "Test System A"; `GET /api/transmission-lines` now includes "Test Line A" with `isBranch: true` and `branchName: "Test Branch A"`.

- [ ] **Step 12: Manual verification — cancel discards nothing**

Draw another pipe between two other nodes (or the same two, if the canvas allows a second edge), open the modal, then click the backdrop.

Expected: modal closes, no new edge on canvas, no new system/line created (`GET` counts unchanged from step 11's end state).

- [ ] **Step 13: Commit**

```bash
git add frontend/src/api/metrics.js frontend/src/components/PipeVariablesModal.jsx frontend/src/pages/NetworkBuilderPage.jsx
git commit -m "$(cat <<'EOF'
Redesign the pipe-drawing modal with the full pipeline field set

Replaces the 5-field "Pipeline variables" modal with the complete field
set (capacity/length/diameter/material/dates/active/bidirectional/
capacity-limitation) plus inline-creatable Transmission Systems and
Transmission Lines.
EOF
)"
```

---

### Task 3: Frontend — pipe inspector redesign

**Files:**
- Modify: `frontend/src/components/NetworkNodeDetails.jsx`
- Modify: `frontend/src/pages/NetworkBuilderPage.jsx`

**Interfaces:**
- Consumes: `transmissionSystems`/`transmissionLines` state from Task 2 (already fetched on mount); `Switch` from `AssetFormControls.jsx` (existing, not yet imported by this file).
- Produces: `NetworkNodeDetails` gains props `systems`, `lines`, `onSpecBooleanChange(field, checked)`, `onSpecArrayChange(field, values)`, `onEdgeFieldChange(field, value)`, `onActiveChange(checked)` (all new; existing `selected`, `onLabelChange`, `onStatusChange`, `onSpecChange`, `onDelete` keep their existing signatures — `onStatusChange` is untouched and still used by the node/plant/pump branch, `onSpecChange` gains new string-vs-numeric coercion cases but keeps its `(field, value)` signature).

- [ ] **Step 1: Add new handlers to `NetworkBuilderPage.jsx`, generalize `handleSpecChange`**

Find:

```js
const rid = (p) => `${p}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
const INSERT_ENTITIES = ["plant", "pump", "node"];
const ENTITY_ICONS = { plant: Factory, pump: Droplet, node: Dot };
const ANNOTATION_TYPES = ["note", "group-box"];
const NOTE_SIZES = ["small", "normal", "large", "xlarge"];
```

Replace with:

```js
const rid = (p) => `${p}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
const INSERT_ENTITIES = ["plant", "pump", "node"];
const ENTITY_ICONS = { plant: Factory, pump: Droplet, node: Dot };
const ANNOTATION_TYPES = ["note", "group-box"];
const NOTE_SIZES = ["small", "normal", "large", "xlarge"];
// Pipe spec keys that must stay strings — everything else handleSpecChange
// coerces to a number, since most pipe spec fields are numeric.
const STRING_SPEC_FIELDS = new Set(["pipelineMaterial", "infraSource", "capacityLimitationType", "transmissionSystemId"]);
```

Find:

```js
  const handleSpecChange = useCallback(
    (field, value) => {
      const cy = cyRef.current;
      if (!cy || !selectedEl) return;
      const el = cy.getElementById(selectedEl.id);
      const meta = { ...(el.data("meta") || {}) };
      const specs = { ...(meta.specifications || {}) };
      if (value === "" || value == null) delete specs[field];
      else specs[field] = field === "material" ? value : Number(value);
      meta.specifications = specs;
      el.data("meta", meta);
      syncSelection();
    },
    [selectedEl, syncSelection]
  );
```

Replace with:

```js
  const handleSpecChange = useCallback(
    (field, value) => {
      const cy = cyRef.current;
      if (!cy || !selectedEl) return;
      const el = cy.getElementById(selectedEl.id);
      const meta = { ...(el.data("meta") || {}) };
      const specs = { ...(meta.specifications || {}) };
      if (value === "" || value == null) delete specs[field];
      else specs[field] = STRING_SPEC_FIELDS.has(field) ? value : Number(value);
      meta.specifications = specs;
      el.data("meta", meta);
      syncSelection();
    },
    [selectedEl, syncSelection]
  );

  // Boolean spec fields (e.g. pipe `bidirectional`) always store an explicit
  // true/false — never deleted, unlike handleSpecChange's delete-on-empty.
  const handleSpecBooleanChange = useCallback(
    (field, checked) => {
      const cy = cyRef.current;
      if (!cy || !selectedEl) return;
      const el = cy.getElementById(selectedEl.id);
      const meta = { ...(el.data("meta") || {}) };
      const specs = { ...(meta.specifications || {}), [field]: !!checked };
      meta.specifications = specs;
      el.data("meta", meta);
      syncSelection();
    },
    [selectedEl, syncSelection]
  );

  // Array spec fields (e.g. pipe `lineGroupIds` multi-select) replace the
  // whole array; an empty selection deletes the key.
  const handleSpecArrayChange = useCallback(
    (field, values) => {
      const cy = cyRef.current;
      if (!cy || !selectedEl) return;
      const el = cy.getElementById(selectedEl.id);
      const meta = { ...(el.data("meta") || {}) };
      const specs = { ...(meta.specifications || {}) };
      if (!values.length) delete specs[field];
      else specs[field] = values;
      meta.specifications = specs;
      el.data("meta", meta);
      syncSelection();
    },
    [selectedEl, syncSelection]
  );

  // Generic top-level edge field setter (e.g. pipe commissioningDate/
  // decommissioningDate) — distinct from handleLabelChange/handleStatusChange
  // since those two are shared across node/edge/note branches with their
  // own specific semantics.
  const handleEdgeFieldChange = useCallback(
    (field, value) => {
      const cy = cyRef.current;
      if (!cy || !selectedEl) return;
      const el = cy.getElementById(selectedEl.id);
      el.data(field, value);
      syncSelection();
    },
    [selectedEl, syncSelection]
  );

  // Pipe's Active toggle: sets the top-level `active` flag and derives the
  // `status` used for the canvas status color band, mirroring how
  // createPipeEdge derives status from active at creation time.
  const handleEdgeActiveChange = useCallback(
    (checked) => {
      const cy = cyRef.current;
      if (!cy || !selectedEl) return;
      const el = cy.getElementById(selectedEl.id);
      el.data("active", checked);
      el.data("status", checked ? "operational" : "inactive");
      syncSelection();
    },
    [selectedEl, syncSelection]
  );
```

- [ ] **Step 2: Pass the new props to `NetworkNodeDetails`**

Find:

```jsx
          <NetworkNodeDetails
            selected={selectedEl}
            onLabelChange={handleLabelChange}
            onStatusChange={handleStatusChange}
            onSpecChange={handleSpecChange}
            onDelete={handleDelete}
          />
```

Replace with:

```jsx
          <NetworkNodeDetails
            selected={selectedEl}
            systems={transmissionSystems}
            lines={transmissionLines}
            onLabelChange={handleLabelChange}
            onStatusChange={handleStatusChange}
            onSpecChange={handleSpecChange}
            onSpecBooleanChange={handleSpecBooleanChange}
            onSpecArrayChange={handleSpecArrayChange}
            onEdgeFieldChange={handleEdgeFieldChange}
            onActiveChange={handleEdgeActiveChange}
            onDelete={handleDelete}
          />
```

- [ ] **Step 3: Redesign the edge branch of `NetworkNodeDetails.jsx`**

Find:

```jsx
import React from "react";
import { ENTITY_TYPE_LABELS } from "../cytoscape/buildCyStyle";
```

Replace with:

```jsx
import React from "react";
import { ENTITY_TYPE_LABELS } from "../cytoscape/buildCyStyle";
import { Switch } from "./AssetFormControls";

const MATERIALS = [
  { value: "steel", label: "Steel" },
  { value: "ductile_iron", label: "Ductile Iron" },
  { value: "hdpe", label: "HDPE" },
  { value: "concrete", label: "Concrete" },
  { value: "pvc", label: "PVC" },
];
```

Leave `capacityLimitLabel` and `yesNo` (both Plant-branch helpers) untouched — no new helper function is needed here. The redesigned edge branch below renders `capacityLimitationType`/`capacityLimitationValue` as live-editable inputs, not a formatted read-only string, so there's nothing to format. The only additions from this step are the `MATERIALS` array and the `Switch` import from the find/replace above.

Now find the entire edge branch:

```jsx
  if (selected._group === "edge") {
    const pipeSpec = selected.meta?.specifications || {};
    return (
      <div className="nnd">
        <header className="nnd__head">
          <span className="adr__cat">Pipe</span>
          <h3 className="adr__name">{selected.label || `${selected.sourceLabel} → ${selected.targetLabel}`}</h3>
          {selected.status && (
            <span className={`st st--${selected.status}`}>{statusLabel(selected.status)}</span>
          )}
        </header>
        <div className="adr__body nnd__body">
          <label className="af__field nnd__field">
            Label
            <input
              type="text"
              value={selected.label || ""}
              placeholder="Optional pipe label"
              onChange={(e) => onLabelChange(e.target.value)}
            />
          </label>
          <label className="af__field nnd__field">
            Status
            <select value={selected.status || ""} onChange={(e) => onStatusChange(e.target.value)}>
              <option value="">—</option>
              {STATUSES.map((s) => (
                <option key={s} value={s}>{statusLabel(s)}</option>
              ))}
            </select>
          </label>

          <div className="af__section">Pipeline variables</div>
          <label className="af__field nnd__field">
            Length (km)
            <input
              type="number"
              step="any"
              value={pipeSpec.length_km ?? ""}
              onChange={(e) => onSpecChange("length_km", e.target.value)}
            />
          </label>
          <label className="af__field nnd__field">
            Diameter (mm)
            <input
              type="number"
              step="any"
              value={pipeSpec.diameter_mm ?? ""}
              onChange={(e) => onSpecChange("diameter_mm", e.target.value)}
            />
          </label>
          <label className="af__field nnd__field">
            Material
            <input
              type="text"
              value={pipeSpec.material ?? ""}
              onChange={(e) => onSpecChange("material", e.target.value)}
            />
          </label>

          <div className="af__section">Connection</div>
          <dl className="adr__list">
            <Row label="From" value={selected.sourceLabel} />
            <Row label="To" value={selected.targetLabel} />
            <Row label="Asset ID" value={selected.assetId} />
          </dl>
          <button className="af__btn nnd__delete" onClick={onDelete}>Delete pipe</button>
        </div>
      </div>
    );
  }
```

Replace with:

```jsx
  if (selected._group === "edge") {
    const pipeSpec = selected.meta?.specifications || {};
    return (
      <div className="nnd">
        <header className="nnd__head">
          <span className="adr__cat">Pipe</span>
          <h3 className="adr__name">{selected.label || `${selected.sourceLabel} → ${selected.targetLabel}`}</h3>
          {selected.status && (
            <span className={`st st--${selected.status}`}>{statusLabel(selected.status)}</span>
          )}
        </header>
        <div className="adr__body nnd__body">
          <label className="af__field nnd__field">
            Pipe Name
            <input
              type="text"
              value={selected.label || ""}
              placeholder="Pipe name"
              onChange={(e) => onLabelChange(e.target.value)}
            />
          </label>
          <label className="af__field nnd__field">
            Active
            <Switch checked={!!selected.active} onChange={onActiveChange} />
          </label>
          <label className="af__field nnd__field">
            Commissioning Date
            <input
              type="date"
              value={selected.commissioningDate || ""}
              onChange={(e) => onEdgeFieldChange("commissioningDate", e.target.value)}
            />
          </label>
          <label className="af__field nnd__field">
            Decommissioning Date
            <input
              type="date"
              value={selected.decommissioningDate || ""}
              onChange={(e) => onEdgeFieldChange("decommissioningDate", e.target.value)}
            />
          </label>

          <div className="af__section">Pipeline variables</div>
          <label className="af__field nnd__field">
            Capacity (m³/day)
            <input
              type="number"
              step="any"
              value={pipeSpec.capacity ?? ""}
              onChange={(e) => onSpecChange("capacity", e.target.value)}
            />
          </label>
          <label className="af__field nnd__field">
            Length (km)
            <input
              type="number"
              step="any"
              value={pipeSpec.pipelineLength ?? ""}
              onChange={(e) => onSpecChange("pipelineLength", e.target.value)}
            />
          </label>
          <label className="af__field nnd__field">
            Diameter (mm)
            <input
              type="number"
              step="any"
              value={pipeSpec.pipelineDiameter ?? ""}
              onChange={(e) => onSpecChange("pipelineDiameter", e.target.value)}
            />
          </label>
          <label className="af__field nnd__field">
            Material
            <select
              value={pipeSpec.pipelineMaterial || ""}
              onChange={(e) => onSpecChange("pipelineMaterial", e.target.value)}
            >
              <option value="">—</option>
              {MATERIALS.map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          </label>
          <label className="af__field nnd__field">
            Design Capacity (m³/day)
            <input
              type="number"
              step="any"
              value={pipeSpec.designCapacity ?? ""}
              onChange={(e) => onSpecChange("designCapacity", e.target.value)}
            />
          </label>
          <label className="af__field nnd__field">
            Max Capacity (m³/day)
            <input
              type="number"
              step="any"
              value={pipeSpec.maximumCapacity ?? ""}
              onChange={(e) => onSpecChange("maximumCapacity", e.target.value)}
            />
          </label>
          <label className="af__field nnd__field">
            Source
            <input
              type="text"
              value={pipeSpec.infraSource || ""}
              onChange={(e) => onSpecChange("infraSource", e.target.value)}
            />
          </label>
          <label className="af__field nnd__field">
            Bidirectional
            <Switch
              checked={!!pipeSpec.bidirectional}
              onChange={(v) => onSpecBooleanChange("bidirectional", v)}
            />
          </label>

          <div className="af__section">Transmission</div>
          <label className="af__field nnd__field">
            Transmission System
            <select
              value={pipeSpec.transmissionSystemId || ""}
              onChange={(e) => onSpecChange("transmissionSystemId", e.target.value)}
            >
              <option value="">—</option>
              {systems.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </label>
          <label className="af__field nnd__field">
            Transmission Lines
            <select
              multiple
              value={pipeSpec.lineGroupIds || []}
              onChange={(e) =>
                onSpecArrayChange("lineGroupIds", Array.from(e.target.selectedOptions, (o) => o.value))
              }
            >
              {lines.map((l) => (
                <option key={l.id} value={l.id}>{l.name}</option>
              ))}
            </select>
          </label>

          <div className="af__section">Capacity Limitation</div>
          <label className="af__field nnd__field">
            Capacity Limitation
            <select
              value={pipeSpec.capacityLimitationType || "none"}
              onChange={(e) => onSpecChange("capacityLimitationType", e.target.value)}
            >
              <option value="none">None</option>
              <option value="percentage">Percentage (%)</option>
              <option value="absolute">Absolute (m³/day)</option>
            </select>
          </label>
          {pipeSpec.capacityLimitationType && pipeSpec.capacityLimitationType !== "none" && (
            <label className="af__field nnd__field">
              Capacity Limitation Value
              <input
                type="number"
                step="any"
                value={pipeSpec.capacityLimitationValue ?? ""}
                onChange={(e) => onSpecChange("capacityLimitationValue", e.target.value)}
              />
            </label>
          )}

          <div className="af__section">Connection</div>
          <dl className="adr__list">
            <Row label="From" value={selected.sourceLabel} />
            <Row label="To" value={selected.targetLabel} />
            <Row label="Asset ID" value={selected.assetId} />
          </dl>
          <button className="af__btn nnd__delete" onClick={onDelete}>Delete pipe</button>
        </div>
      </div>
    );
  }
```

- [ ] **Step 4: Update the component's prop signature**

Find:

```jsx
export default function NetworkNodeDetails({ selected, onLabelChange, onStatusChange, onSpecChange, onDelete }) {
```

Replace with:

```jsx
export default function NetworkNodeDetails({
  selected, systems, lines,
  onLabelChange, onStatusChange, onSpecChange, onSpecBooleanChange, onSpecArrayChange,
  onEdgeFieldChange, onActiveChange, onDelete,
}) {
```

- [ ] **Step 5: Manual verification**

With both dev servers still running and the "Test Main Line" pipe from Task 2's verification still on the canvas: select it.

Expected: the inspector shows "Pipe Name" = "Test Main Line", "Active" = on, empty Commissioning/Decommissioning dates, "Capacity (m³/day)" = 2000, "Length (km)" = 12.5, "Diameter (mm)" = 600, "Material" = HDPE (selected in the dropdown), "Design Capacity (m³/day)" = 2200, "Max Capacity (m³/day)" blank, "Source" = "Test source", "Bidirectional" = off, "Transmission System" showing "Test System A" selected, "Transmission Lines" showing "Test Line A" selected, "Capacity Limitation" = Percentage with value 80.

Edit "Max Capacity (m³/day)" to 2500, toggle "Bidirectional" on, and change "Transmission System" to "—" (deselect).

Expected: no crash; re-selecting a different node then re-selecting this pipe shows the edits persisted (Max Capacity 2500, Bidirectional on, Transmission System blank) — confirming the new handlers correctly write into the cytoscape edge's data.

Select a Plant or Pump node placed earlier (from the prior plan's testing).

Expected: no change in behavior — the node branch (Status dropdown, read-only Specifications) is untouched, confirming `onStatusChange`'s existing usage there wasn't affected by this task's edge-only changes.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/NetworkNodeDetails.jsx frontend/src/pages/NetworkBuilderPage.jsx
git commit -m "$(cat <<'EOF'
Redesign the pipe inspector to match the new pipeline field set

The canvas inspector's edge branch now exposes every field the
redesigned pipe-drawing modal collects, so a placed pipe stays editable
instead of only showing the old length/diameter/material trio.
EOF
)"
```
