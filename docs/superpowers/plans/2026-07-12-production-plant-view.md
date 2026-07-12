# Production Tab Plant View Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Production tab's aggregate dashboard with a plant-list table that opens a per-plant read-only view (production input table + capacity chart + quality charts), mirroring the production website's plant page against the shared MongoDB.

**Architecture:** The Express backend (port 4000) gains two read-only endpoints querying the same Mongo collections the website uses. The Vite/JSX frontend routes `/production` (plant list) and `/production/:plantId` (detail). All data transforms are extracted into pure `lib/*.js` modules (unit-tested with `node:test`); `.jsx` files are thin render layers. Recharts renders the charts in the repo's light "government-card" theme.

**Tech Stack:** Node/Express + MongoDB (backend); React 18 + Vite + react-router-dom + plain CSS + Recharts + date-fns (frontend). Tests: `node:test` + `node:assert/strict`.

## Global Constraints

- Shared DB: `mongodb://localhost:27017/water_management_system` (already wired via `backend/src/db.js` `getDb()`). Backend must have this running to verify.
- Read-only. No auth/JWT/RBAC, no import, no create/edit, no approvals/submissions, no maintenance/outage tabs, no quality record *list* table.
- Business ids align: `plant.id` (e.g. `"MK - WP - DS - 0000003"`) === `productionInput.plant_id`. No id remapping.
- Styling: this repo's **light** theme only. Source of truth `frontend/src/pages/ProductionPage.css` / `AssetRegistryPage.css`: white cards, bg `#f8fafc`, borders `#d0d7de`, radius 2px, accent `#003eb1`, ink `#111827`, dim `#4b5563`. Recharts in light mode (dark-ink axes, light grid), keep semantic series colors.
- Frontend is ESM (`"type": "module"`). Tests are colocated `*.test.js`, run with `node --test <file>`. JSX is NOT unit-tested — all testable logic lives in `.js` modules.
- Existing `/api/production/summary` and `/api/production/records` routes stay untouched (distinct paths from the new `/api/production/plants` and `/api/production/plant/:id/bundle`).
- Chart series colors (verbatim): delivered `#10b981`, requested `#6366f1`, capacity/contracted `#f59e0b`, design `#8b5cf6`, maximum `#06b6d4`, out-of-spec `#ef4444`.

---

### Task 1: Frontend dependencies (recharts + date-fns)

**Files:**
- Modify: `frontend/package.json`

**Interfaces:**
- Produces: `recharts` and `date-fns` importable in `frontend/src/**`.

- [ ] **Step 1: Install both packages**

```bash
cd frontend && npm install recharts@^2.12.7 date-fns@^3.6.0
```

- [ ] **Step 2: Verify they resolve**

Run: `cd frontend && node -e "import('recharts').then(()=>import('date-fns')).then(()=>console.log('ok')).catch(e=>{console.error(e);process.exit(1)})"`
Expected: prints `ok`

- [ ] **Step 3: Commit**

```bash
git add frontend/package.json frontend/package-lock.json
git commit -m "chore: add recharts + date-fns to frontend"
```

---

### Task 2: Backend production endpoints

**Files:**
- Create: `backend/src/production.js`
- Create: `backend/src/production.test.js`
- Modify: `backend/src/server.js` (imports near top; routes after the domain loop)

**Interfaces:**
- Produces:
  - `deriveDataStatus(plant, dataMap)` → `{ ...plant, hasData: boolean, latestDataDate: string|null }` where `dataMap` is `Map<plantId, string|null>` (latest ISO date or null).
  - `listProductionPlants()` → `Promise<Array<{ id, external_id, name, city, entity, region, asset_type, status, specifications, hasData, latestDataDate }>>`
  - `getPlantBundle(id)` → `Promise<{ plant, productionInputs, qualityRecords, maintenanceRecords, outages, qualityLimits, contractedCapacities, users }>`
  - Routes: `GET /api/production/plants`, `GET /api/production/plant/:id/bundle`

- [ ] **Step 1: Write the failing test**

Create `backend/src/production.test.js`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { deriveDataStatus } from "./production.js";

test("deriveDataStatus: marks plant with data and latest date", () => {
  const map = new Map([["P1", "2026-03-05"]]);
  const out = deriveDataStatus({ id: "P1", name: "Alpha" }, map);
  assert.equal(out.hasData, true);
  assert.equal(out.latestDataDate, "2026-03-05");
  assert.equal(out.name, "Alpha");
});

test("deriveDataStatus: plant absent from map is pending", () => {
  const out = deriveDataStatus({ id: "P2" }, new Map());
  assert.equal(out.hasData, false);
  assert.equal(out.latestDataDate, null);
});

test("deriveDataStatus: plant present with null date is pending", () => {
  const out = deriveDataStatus({ id: "P3" }, new Map([["P3", null]]));
  assert.equal(out.hasData, false);
  assert.equal(out.latestDataDate, null);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test backend/src/production.test.js`
Expected: FAIL — cannot find module `./production.js` / `deriveDataStatus is not a function`

- [ ] **Step 3: Write the implementation**

Create `backend/src/production.js`:

```js
import { getDb } from "./db.js";

const PLANT_PROJECTION = {
  _id: 0,
  id: 1, external_id: 1, name: 1, asset_name_ar: 1, entity: 1, entity_type: 1,
  activity: 1, asset_type: 1, region: 1, cluster: 1, governorate: 1, city: 1,
  latitude: 1, longitude: 1, status: 1, capacity: 1,
  commissioning_date: 1, decommissioning_date: 1, specifications: 1,
};

// Pure: fold a plant together with its data status from a Map<plantId, latestIsoDate|null>.
export function deriveDataStatus(plant, dataMap) {
  const latest = dataMap.get(plant.id) ?? null;
  return { ...plant, hasData: latest != null, latestDataDate: latest };
}

// Newest ISO date string across a list of records for the given date field.
function latestDate(records, field) {
  let max = null;
  for (const r of records) {
    const d = r[field];
    if (d && (max == null || d > max)) max = d;
  }
  return max;
}

export async function listProductionPlants() {
  const db = await getDb();
  const [plants, prodDates, qualDates] = await Promise.all([
    db.collection("plants").find({}, { projection: PLANT_PROJECTION }).toArray(),
    db.collection("productionInputs").find({}, { projection: { _id: 0, plant_id: 1, date: 1 } }).toArray(),
    db.collection("qualityRecords").find({}, { projection: { _id: 0, plant_id: 1, sampling_datetime: 1 } }).toArray(),
  ]);

  const dataMap = new Map();
  for (const r of prodDates) {
    const cur = dataMap.get(r.plant_id) ?? null;
    if (r.date && (cur == null || r.date > cur)) dataMap.set(r.plant_id, r.date);
    else if (!dataMap.has(r.plant_id)) dataMap.set(r.plant_id, cur);
  }
  for (const r of qualDates) {
    const iso = r.sampling_datetime ? String(r.sampling_datetime).slice(0, 10) : null;
    const cur = dataMap.get(r.plant_id) ?? null;
    if (iso && (cur == null || iso > cur)) dataMap.set(r.plant_id, iso);
    else if (!dataMap.has(r.plant_id)) dataMap.set(r.plant_id, cur);
  }

  return plants.map((p) => deriveDataStatus(p, dataMap));
}

export async function getPlantBundle(id) {
  const db = await getDb();
  const plant = await db.collection("plants").findOne({ id }, { projection: PLANT_PROJECTION });
  if (!plant) {
    const err = new Error("Plant not found");
    err.statusCode = 404;
    throw err;
  }

  const [productionInputs, qualityRecords, maintenanceRecords, outages, qualityLimitRows, capacityRows, userRows] =
    await Promise.all([
      db.collection("productionInputs").find({ plant_id: id }, { projection: { _id: 0 } }).toArray(),
      db.collection("qualityRecords").find({ plant_id: id }, { projection: { _id: 0 } }).toArray(),
      db.collection("maintenanceRecords").find({ plant_id: id }, { projection: { _id: 0 } }).toArray(),
      db.collection("outages").find({ plant_id: id }, { projection: { _id: 0 } }).toArray(),
      db.collection("qualityLimits").find({ plant_id: id }, { projection: { _id: 0 } }).toArray(),
      db.collection("contractedCapacity").find({ plant_id: id }, { projection: { _id: 0 } })
        .sort({ effective_from: -1 }).toArray(),
      db.collection("users").find({}, { projection: { _id: 1, id: 1, name: 1, email: 1 } }).toArray(),
    ]);

  // qualityLimits: fold rows into { [parameter]: { min, max } } keyed for this plant.
  const qualityLimits = {};
  for (const row of qualityLimitRows) {
    const key = row.parameter;
    if (!key) continue;
    qualityLimits[key] = { min: row.min ?? undefined, max: row.max ?? undefined };
  }

  const users = userRows.map((u) => ({ id: u.id || String(u._id), name: u.name, email: u.email }));

  return {
    plant,
    productionInputs,
    qualityRecords,
    maintenanceRecords,
    outages,
    qualityLimits,
    contractedCapacities: capacityRows,
    users,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test backend/src/production.test.js`
Expected: PASS (3 tests)

- [ ] **Step 5: Wire routes into server.js**

In `backend/src/server.js`, add to the import block near the top (after the networks import):

```js
import { listProductionPlants, getPlantBundle } from "./production.js";
```

Add these routes immediately before `app.listen(`:

```js
app.get("/api/production/plants", async (_req, res) => {
  try {
    res.json(await listProductionPlants());
  } catch (err) {
    console.error("production plants error:", err);
    res.status(500).json({ error: "Failed to list production plants" });
  }
});

app.get("/api/production/plant/:id/bundle", async (req, res) => {
  try {
    res.json(await getPlantBundle(req.params.id));
  } catch (err) {
    console.error(`production bundle error (id=${req.params.id}):`, err);
    res.status(err.statusCode || 500).json({ error: err.message || "Failed to fetch plant bundle" });
  }
});
```

- [ ] **Step 6: Verify endpoints against the live DB**

Start the backend in one shell: `cd backend && npm start` (leave running).
In another shell:

Run: `curl -s "http://localhost:4000/api/production/plants" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const a=JSON.parse(s);console.log('count',a.length,'withData',a.filter(p=>p.hasData).length);console.log(a.find(p=>p.hasData))})"`
Expected: `count 519` (approx), `withData` ≥ 1, and a sample plant object with `hasData:true` and a `latestDataDate`.

Run: `curl -s "http://localhost:4000/api/production/plant/MK%20-%20WP%20-%20DS%20-%200000003/bundle" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const b=JSON.parse(s);console.log('plant',b.plant.name,'inputs',b.productionInputs.length,'users',b.users.length)})"`
Expected: prints the plant name, a non-zero `inputs` count, and a `users` count.

- [ ] **Step 7: Commit**

```bash
git add backend/src/production.js backend/src/production.test.js backend/src/server.js
git commit -m "feat(backend): read-only production plants + plant bundle endpoints"
```

---

### Task 3: Capacity helpers (`lib/productionCapacity.js`)

**Files:**
- Create: `frontend/src/lib/productionCapacity.js`
- Create: `frontend/src/lib/productionCapacity.test.js`

**Interfaces:**
- Produces:
  - `getContractedCapacityForDate(plant, dateIso, capacities)` → `number` (`capacities` = array of `{ value_m3, effective_from }` newest-first, or undefined)
  - `dayLoss(record, dateIso, contracted)` → `number`

- [ ] **Step 1: Write the failing test**

Create `frontend/src/lib/productionCapacity.test.js`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { getContractedCapacityForDate, dayLoss } from "./productionCapacity.js";

const plant = { id: "P1", specifications: { contracted_capacity: 100000, design_capacity: 120000 } };

test("getContractedCapacityForDate: falls back to plant spec when no rows", () => {
  assert.equal(getContractedCapacityForDate(plant, "2026-03-01", undefined), 100000);
});

test("getContractedCapacityForDate: picks latest effective row on/before date", () => {
  const rows = [
    { value_m3: 90000, effective_from: "2026-02-01" },
    { value_m3: 80000, effective_from: "2026-01-01" },
  ];
  assert.equal(getContractedCapacityForDate(plant, "2026-02-15", rows), 90000);
  assert.equal(getContractedCapacityForDate(plant, "2026-01-15", rows), 80000);
});

test("dayLoss: full outage removes whole contracted capacity", () => {
  assert.equal(dayLoss({ outage_scope: "full" }, "2026-03-01", 100000), 100000);
});

test("dayLoss: uses daily_losses entry for the date", () => {
  const rec = { daily_losses: [{ date: "2026-03-01", loss_m3: 2500 }] };
  assert.equal(dayLoss(rec, "2026-03-01", 100000), 2500);
  assert.equal(dayLoss(rec, "2026-03-02", 100000), 0);
});

test("dayLoss: legacy record falls back to total loss field", () => {
  assert.equal(dayLoss({ expected_loss_m3: 1500 }, "2026-03-01", 100000), 1500);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test frontend/src/lib/productionCapacity.test.js`
Expected: FAIL — cannot find module `./productionCapacity.js`

- [ ] **Step 3: Write the implementation**

Create `frontend/src/lib/productionCapacity.js`:

```js
// Contracted capacity effective on a date: latest effective_from ≤ date from the
// capacities array (newest-first), else the plant's static spec. Mirrors the
// production website's lib/capacity.ts.
export function getContractedCapacityForDate(plant, dateIso, capacities) {
  const rows = plant && capacities ? capacities : undefined;
  if (rows && rows.length) {
    const effective = rows.find((r) => r.effective_from <= dateIso) ?? rows[rows.length - 1];
    if (effective) return effective.value_m3;
  }
  if (!plant) return 0;
  const s = plant.specifications || {};
  return s.contracted_capacity ?? s.design_capacity ?? plant.capacity ?? 0;
}

// Per-day loss for a maintenance/outage record: full outage removes the whole
// day's contracted capacity; otherwise use the day's daily_losses entry; legacy
// records fall back to their total loss field.
export function dayLoss(record, dateIso, contracted) {
  if (record.outage_scope === "full") return contracted;
  if (Array.isArray(record.daily_losses)) {
    const entry = record.daily_losses.find((d) => d.date === dateIso);
    return Number(entry?.loss_m3 || 0);
  }
  return Number(
    record.expected_loss_m3 ?? record.expected_impact_m3 ?? record.actual_loss_m3 ?? record.estimated_loss_m3 ?? 0,
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test frontend/src/lib/productionCapacity.test.js`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/productionCapacity.js frontend/src/lib/productionCapacity.test.js
git commit -m "feat(frontend): contracted-capacity + day-loss helpers"
```

---

### Task 4: Production rows builder (`lib/productionRows.js`)

**Files:**
- Create: `frontend/src/lib/productionRows.js`
- Create: `frontend/src/lib/productionRows.test.js`

**Interfaces:**
- Consumes: `getContractedCapacityForDate`, `dayLoss` from `./productionCapacity.js`; `date-fns`.
- Produces:
  - `buildProductionRows({ plant, plantId, productionInputs, maintenanceRecords, outages, contractedCapacities, startDate, endDate })` → array of row objects (most-recent first), each: `{ iso, input, contracted, maintenanceLoss, outageLoss, available, variance, requested, requestedStatus, delivered, deliveredStatus, responsibleUser, submittedAt, approvedAt }`
  - `filterRows(rows, { deliveredStatus, requestedStatus })` → filtered array
  - `computeTotals(rows)` → `{ contracted, available, delivered, loss, availabilityPct }`

- [ ] **Step 1: Write the failing test**

Create `frontend/src/lib/productionRows.test.js`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildProductionRows, filterRows, computeTotals } from "./productionRows.js";

const plant = { id: "P1", specifications: { contracted_capacity: 100000 } };

test("buildProductionRows: one day, delivered value from matching input", () => {
  const rows = buildProductionRows({
    plant, plantId: "P1",
    productionInputs: [{ plant_id: "P1", date: "2026-03-01", actual_m3: 90000, required_m3: 95000, submission_status: "approved", created_at: "2026-03-01T00:00:00Z" }],
    maintenanceRecords: [], outages: [], contractedCapacities: [],
    startDate: new Date("2026-03-01T00:00:00"), endDate: new Date("2026-03-01T00:00:00"),
  });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].contracted, 100000);
  assert.equal(rows[0].delivered, 90000);
  assert.equal(rows[0].requested, 95000);
  assert.equal(rows[0].available, 100000);
  assert.equal(rows[0].deliveredStatus, "approved");
});

test("buildProductionRows: most recent day first", () => {
  const rows = buildProductionRows({
    plant, plantId: "P1", productionInputs: [], maintenanceRecords: [], outages: [], contractedCapacities: [],
    startDate: new Date("2026-03-01T00:00:00"), endDate: new Date("2026-03-03T00:00:00"),
  });
  assert.deepEqual(rows.map((r) => r.iso), ["2026-03-03", "2026-03-02", "2026-03-01"]);
});

test("computeTotals: sums and availability percent", () => {
  const rows = [
    { contracted: 100000, available: 80000, delivered: 70000, maintenanceLoss: 10000, outageLoss: 10000 },
    { contracted: 100000, available: 100000, delivered: 90000, maintenanceLoss: 0, outageLoss: 0 },
  ];
  const t = computeTotals(rows);
  assert.equal(t.contracted, 200000);
  assert.equal(t.available, 180000);
  assert.equal(t.delivered, 160000);
  assert.equal(t.loss, 20000);
  assert.equal(Math.round(t.availabilityPct), 90);
});

test("filterRows: delivered status filter", () => {
  const rows = [{ deliveredStatus: "approved", requestedStatus: "allocated" }, { deliveredStatus: null, requestedStatus: "pending" }];
  assert.equal(filterRows(rows, { deliveredStatus: "approved", requestedStatus: "all" }).length, 1);
  assert.equal(filterRows(rows, { deliveredStatus: "all", requestedStatus: "pending" }).length, 1);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test frontend/src/lib/productionRows.test.js`
Expected: FAIL — cannot find module `./productionRows.js`

- [ ] **Step 3: Write the implementation**

Create `frontend/src/lib/productionRows.js`:

```js
import { format, parseISO, eachDayOfInterval, startOfDay } from "date-fns";
import { getContractedCapacityForDate, dayLoss } from "./productionCapacity.js";

const ACTIVE_MAINTENANCE = ["submitted", "under_revision", "revised", "approved"];

const responsibleUserRef = (r) => (r ? r.submitted_by || r.approved_by || null : null);
const submittedAtRef = (r) => (r ? r.submitted_at || r.created_at || null : null);

// Index production inputs for the plant by date (yyyy-MM-dd), preferring the
// most-recently-updated record per day.
function indexInputsByDate(productionInputs, plantId) {
  const map = new Map();
  productionInputs
    .filter((r) => !plantId || r.plant_id === plantId)
    .forEach((r) => {
      const existing = map.get(r.date);
      if (!existing || new Date(r.updated_at || r.created_at) > new Date(existing.updated_at || existing.created_at)) {
        map.set(r.date, r);
      }
    });
  return map;
}

export function buildProductionRows({
  plant, plantId, productionInputs, maintenanceRecords, outages, contractedCapacities,
  startDate, endDate,
}) {
  const s = startOfDay(startDate);
  const e = startOfDay(endDate);
  if (e < s) return [];
  const days = eachDayOfInterval({ start: s, end: e });
  const inputByDate = indexInputsByDate(productionInputs, plantId);

  const plantMaintenance = maintenanceRecords.filter(
    (m) => (!plantId || m.plant_id === plantId) && ACTIVE_MAINTENANCE.includes(m.submission_status),
  );
  const plantOutages = outages.filter(
    (o) => (!plantId || o.plant_id === plantId) && o.submission_status === "approved",
  );

  return days
    .map((day) => {
      const iso = format(day, "yyyy-MM-dd");
      const dayStart = startOfDay(day);
      const dayEnd = new Date(dayStart);
      dayEnd.setHours(23, 59, 59, 999);
      const contracted = getContractedCapacityForDate(plant, iso, contractedCapacities);

      const maintenanceLoss = plantMaintenance
        .filter((m) => parseISO(m.start_datetime) <= dayEnd && parseISO(m.end_datetime) >= dayStart)
        .reduce((sum, m) => sum + dayLoss(m, iso, contracted), 0);

      const outageLoss = plantOutages
        .filter((o) => {
          const os = parseISO(o.start_datetime);
          const oe = o.end_datetime ? parseISO(o.end_datetime) : new Date();
          return os <= dayEnd && oe >= dayStart;
        })
        .reduce((sum, o) => sum + dayLoss(o, iso, contracted), 0);

      const available = Math.max(0, contracted - maintenanceLoss - outageLoss);
      const variance = contracted - available;
      const input = inputByDate.get(iso);

      return {
        iso,
        input,
        contracted,
        maintenanceLoss,
        outageLoss,
        available,
        variance,
        requested: input?.required_m3 ?? null,
        requestedStatus: input?.required_m3 != null ? "allocated" : "pending",
        delivered: input?.actual_m3 ?? null,
        deliveredStatus: input?.submission_status ?? null,
        responsibleUser: responsibleUserRef(input),
        submittedAt: submittedAtRef(input),
        approvedAt: input?.approved_at ?? null,
      };
    })
    .reverse();
}

export function filterRows(rows, { deliveredStatus, requestedStatus }) {
  return rows.filter((r) => {
    if (deliveredStatus !== "all" && r.deliveredStatus !== deliveredStatus) return false;
    if (requestedStatus !== "all" && r.requestedStatus !== requestedStatus) return false;
    return true;
  });
}

export function computeTotals(rows) {
  const contracted = rows.reduce((s, r) => s + r.contracted, 0);
  const available = rows.reduce((s, r) => s + r.available, 0);
  const delivered = rows.reduce((s, r) => s + (r.delivered ?? 0), 0);
  const loss = rows.reduce((s, r) => s + r.maintenanceLoss + r.outageLoss, 0);
  const availabilityPct = contracted > 0 ? (available / contracted) * 100 : 0;
  return { contracted, available, delivered, loss, availabilityPct };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test frontend/src/lib/productionRows.test.js`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/productionRows.js frontend/src/lib/productionRows.test.js
git commit -m "feat(frontend): per-day production rows + totals builder"
```

---

### Task 5: Production CSV export (`lib/productionCsv.js`)

**Files:**
- Create: `frontend/src/lib/productionCsv.js`
- Create: `frontend/src/lib/productionCsv.test.js`

**Interfaces:**
- Consumes: row objects from `buildProductionRows`.
- Produces: `productionRowsToCsv(rows, resolveUserName)` → `string` (header + quoted rows, `\n`-joined). `resolveUserName(ref)` → display string.

- [ ] **Step 1: Write the failing test**

Create `frontend/src/lib/productionCsv.test.js`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { productionRowsToCsv } from "./productionCsv.js";

test("productionRowsToCsv: header then one row, pending where null", () => {
  const rows = [{
    iso: "2026-03-01", contracted: 100000, maintenanceLoss: 0, outageLoss: 0, variance: 0,
    available: 100000, requested: null, delivered: 90000, deliveredStatus: "approved",
    responsibleUser: "u1", submittedAt: "2026-03-01T10:00:00Z", approvedAt: null,
  }];
  const csv = productionRowsToCsv(rows, (r) => (r === "u1" ? "Alice" : "N/A"));
  const lines = csv.split("\n");
  assert.match(lines[0], /^"Date","Contracted/);
  assert.match(lines[1], /"2026-03-01"/);
  assert.match(lines[1], /"Pending"/);
  assert.match(lines[1], /"Alice"/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test frontend/src/lib/productionCsv.test.js`
Expected: FAIL — cannot find module `./productionCsv.js`

- [ ] **Step 3: Write the implementation**

Create `frontend/src/lib/productionCsv.js`:

```js
import { format, parseISO } from "date-fns";

const HEADERS = [
  "Date", "Contracted Capacity (m³/day)", "Maintenance Loss (m³)", "Outage Loss (m³)",
  "Variance (m³)", "Available Capacity (m³)", "Requested Capacity (m³)", "Delivered (m³)",
  "Delivered Status", "Responsible User", "Submitted At", "Approved At",
];

const fmtDateTime = (v) => {
  if (!v) return "N/A";
  const d = parseISO(v);
  return Number.isNaN(d.getTime()) ? "N/A" : format(d, "yyyy-MM-dd HH:mm");
};

export function productionRowsToCsv(rows, resolveUserName) {
  const body = rows.map((r) => [
    r.iso,
    r.contracted.toFixed(0),
    r.maintenanceLoss.toFixed(0),
    r.outageLoss.toFixed(0),
    r.variance.toFixed(0),
    r.available.toFixed(0),
    r.requested != null ? r.requested.toFixed(0) : "Pending",
    r.delivered != null ? r.delivered.toFixed(0) : "Pending",
    r.deliveredStatus ?? "",
    resolveUserName(r.responsibleUser),
    fmtDateTime(r.submittedAt),
    fmtDateTime(r.approvedAt),
  ]);
  return [HEADERS, ...body].map((row) => row.map((c) => `"${c}"`).join(",")).join("\n");
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test frontend/src/lib/productionCsv.test.js`
Expected: PASS (1 test)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/productionCsv.js frontend/src/lib/productionCsv.test.js
git commit -m "feat(frontend): production rows CSV serializer"
```

---

### Task 6: Capacity chart data builder (`lib/capacityChartData.js`)

**Files:**
- Create: `frontend/src/lib/capacityChartData.js`
- Create: `frontend/src/lib/capacityChartData.test.js`

**Interfaces:**
- Consumes: `dayLoss` from `./productionCapacity.js`; `date-fns`.
- Produces: `buildCapacityChartData({ plantId, productionInputs, qualityRecords, outages, maintenanceRecords, contractedCapacity })` → array over a −30…+30-day grid, each: `{ date, isoDate, actual, required, actualStatus, requiredStatus, contractedCapacity, availableCapacity, effectiveCapacity, capacityLost, outageLoss, outageIsActual, maintenanceLoss, qualityMarker, isFuture }`. `contractedCapacity` is a number|undefined passed in by the caller.

- [ ] **Step 1: Write the failing test**

Create `frontend/src/lib/capacityChartData.test.js`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { format } from "date-fns";
import { buildCapacityChartData } from "./capacityChartData.js";

test("buildCapacityChartData: spans 61 days centered on today", () => {
  const data = buildCapacityChartData({
    plantId: "P1", productionInputs: [], qualityRecords: [], outages: [], maintenanceRecords: [],
    contractedCapacity: 100000,
  });
  assert.equal(data.length, 61);
});

test("buildCapacityChartData: today's delivered comes from a matching input", () => {
  const today = format(new Date(), "yyyy-MM-dd");
  const data = buildCapacityChartData({
    plantId: "P1",
    productionInputs: [{ plant_id: "P1", date: today, actual_m3: 88000, required_m3: 90000, submission_status: "approved" }],
    qualityRecords: [], outages: [], maintenanceRecords: [], contractedCapacity: 100000,
  });
  const row = data.find((d) => d.isoDate === today);
  assert.equal(row.actual, 88000);
  assert.equal(row.required, 90000);
  assert.equal(row.effectiveCapacity, 100000);
});

test("buildCapacityChartData: out-of-spec quality sets a marker", () => {
  const today = format(new Date(), "yyyy-MM-dd");
  const data = buildCapacityChartData({
    plantId: "P1",
    productionInputs: [{ plant_id: "P1", date: today, actual_m3: 88000, submission_status: "approved" }],
    qualityRecords: [{ plant_id: "P1", compliance_flag: "out_of_spec", sampling_datetime: `${today}T08:00:00Z` }],
    outages: [], maintenanceRecords: [], contractedCapacity: 100000,
  });
  const row = data.find((d) => d.isoDate === today);
  assert.equal(row.qualityMarker, 88000);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test frontend/src/lib/capacityChartData.test.js`
Expected: FAIL — cannot find module `./capacityChartData.js`

- [ ] **Step 3: Write the implementation**

Create `frontend/src/lib/capacityChartData.js` (ported from `production-capacity-chart.tsx` `chartData` useMemo, with `contractedCapacity` passed in):

```js
import { format, parseISO, startOfDay, subDays, addDays, eachDayOfInterval } from "date-fns";

const ACTIVE_MAINTENANCE = ["submitted", "under_revision", "revised", "approved"];

function statusPriority(status) {
  switch (status) {
    case "approved": return 6;
    case "adjusted":
    case "conditional": return 5;
    case "submitted":
    case "revised": return 4;
    case "under_revision": return 3;
    case "draft": return 2;
    case "rejected":
    case "shortfall":
    case "postponed": return 1;
    default: return 0;
  }
}
const pickStatus = (cur, next) => (statusPriority(next) >= statusPriority(cur) ? next ?? cur ?? null : cur ?? null);

export function buildCapacityChartData({
  plantId, productionInputs, qualityRecords, outages, maintenanceRecords, contractedCapacity,
}) {
  const today = startOfDay(new Date());
  const gridStart = subDays(today, 30);
  const gridEnd = addDays(today, 30);

  const byDate = new Map();
  const plantProduction = plantId ? productionInputs.filter((p) => p.plant_id === plantId) : productionInputs;

  plantProduction.forEach((record) => {
    const isoDate = record.date;
    const existing = byDate.get(isoDate) || { actual: 0, required: null, actualStatus: null, requiredStatus: null, availableCapacity: null };
    existing.actual += record.actual_m3 || 0;
    if (record.actual_m3 != null) existing.actualStatus = pickStatus(existing.actualStatus, record.submission_status);
    if (record.available_capacity_m3 != null) existing.availableCapacity = Math.max(existing.availableCapacity ?? 0, record.available_capacity_m3);
    byDate.set(isoDate, existing);

    if (record.required_m3 != null) {
      if (record.end_date && record.end_date > record.date) {
        const rangeDays = eachDayOfInterval({ start: parseISO(record.date), end: parseISO(record.end_date) });
        rangeDays.forEach((day) => {
          const dayIso = format(day, "yyyy-MM-dd");
          const dayEntry = byDate.get(dayIso) || { actual: 0, required: null, actualStatus: null, requiredStatus: null, availableCapacity: null };
          dayEntry.required = (dayEntry.required ?? 0) + record.required_m3;
          dayEntry.requiredStatus = pickStatus(dayEntry.requiredStatus, record.desktop_decision_status || record.submission_status);
          byDate.set(dayIso, dayEntry);
        });
      } else {
        existing.required = (existing.required ?? 0) + record.required_m3;
        existing.requiredStatus = pickStatus(existing.requiredStatus, record.desktop_decision_status || record.submission_status);
        byDate.set(isoDate, existing);
      }
    }
  });

  const outOfSpecDates = new Set();
  if (plantId) {
    qualityRecords.forEach((q) => {
      if (q.plant_id !== plantId || q.compliance_flag !== "out_of_spec") return;
      outOfSpecDates.add(format(parseISO(q.sampling_datetime), "yyyy-MM-dd"));
    });
  }

  return eachDayOfInterval({ start: gridStart, end: gridEnd }).map((day) => {
    const isoDate = format(day, "yyyy-MM-dd");
    const record = byDate.get(isoDate);
    const isPast = day <= today;

    let outageLoss = 0, maintenanceLoss = 0, outageIsActual = false;

    if (plantId && contractedCapacity) {
      const dateStart = startOfDay(day);
      const dateEnd = new Date(dateStart);
      dateEnd.setHours(23, 59, 59, 999);

      const matchingOutages = outages.filter((o) => {
        if (o.plant_id !== plantId || o.submission_status !== "approved") return false;
        const s = parseISO(o.start_datetime);
        const e = o.end_datetime ? parseISO(o.end_datetime) : new Date();
        return s <= dateEnd && e >= dateStart;
      });
      const matchingMaintenance = maintenanceRecords.filter((m) => {
        if (m.plant_id !== plantId || !ACTIVE_MAINTENANCE.includes(m.submission_status)) return false;
        const s = parseISO(m.start_datetime);
        const e = parseISO(m.end_datetime);
        return s <= dateEnd && e >= dateStart;
      });

      const loss = (rec) => {
        if (rec.outage_scope === "full") return contractedCapacity;
        if (Array.isArray(rec.daily_losses)) {
          const entry = rec.daily_losses.find((d) => d.date === isoDate);
          return Number(entry?.loss_m3 || 0);
        }
        return Number(rec.expected_loss_m3 ?? rec.expected_impact_m3 ?? rec.actual_loss_m3 ?? rec.estimated_loss_m3 ?? 0);
      };

      outageIsActual = matchingOutages.some((o) => o.actual_loss_m3 && o.actual_loss_m3 > 0);
      outageLoss = matchingOutages.reduce((sum, o) => sum + loss(o), 0);
      maintenanceLoss = matchingMaintenance.reduce((sum, m) => sum + loss(m), 0);
    }

    const totalLoss = outageLoss + maintenanceLoss;
    const submittedAvailableCapacity = record?.availableCapacity ?? undefined;
    const effectiveCapacityRaw = submittedAvailableCapacity ?? (contractedCapacity != null ? contractedCapacity - totalLoss : undefined);
    const effectiveCapacity = effectiveCapacityRaw != null ? Math.max(0, effectiveCapacityRaw) : undefined;
    const capacityLost = contractedCapacity != null && effectiveCapacity != null ? Math.max(0, contractedCapacity - effectiveCapacity) : 0;

    const actual = isPast && record ? Math.round(record.actual) : null;
    const required = record?.required != null ? Math.round(record.required) : null;
    const actualStatus = actual !== null ? record?.actualStatus ?? null : null;
    const requiredStatus = required !== null ? record?.requiredStatus ?? null : null;

    const hasQualityIssue = outOfSpecDates.has(isoDate);
    const qualityMarker = hasQualityIssue ? (actual ?? required ?? contractedCapacity ?? 0) : null;

    return {
      date: format(day, "MMM dd"),
      isoDate,
      actual, required, actualStatus, requiredStatus,
      contractedCapacity: contractedCapacity ?? undefined,
      availableCapacity: submittedAvailableCapacity,
      effectiveCapacity, capacityLost, outageLoss, outageIsActual, maintenanceLoss,
      qualityMarker, isFuture: day > today,
    };
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test frontend/src/lib/capacityChartData.test.js`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/capacityChartData.js frontend/src/lib/capacityChartData.test.js
git commit -m "feat(frontend): capacity-vs-production chart data builder"
```

---

### Task 7: Quality series builder (`lib/qualitySeries.js`)

**Files:**
- Create: `frontend/src/lib/qualitySeries.js`
- Create: `frontend/src/lib/qualitySeries.test.js`

**Interfaces:**
- Consumes: `date-fns`.
- Produces:
  - `QUALITY_PARAMS` → `[{ key, label, unit, color }]` (the 7 parameters)
  - `buildQualitySeries(qualityRecords, plantId)` → sorted array of `{ date, ph, alkalinity, turbidity, temperature, residual_chlorine, conductivity, tds }`
  - `outOfRange(value, limit)` → boolean (`limit` = `{ min?, max? }`)

- [ ] **Step 1: Write the failing test**

Create `frontend/src/lib/qualitySeries.test.js`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildQualitySeries, outOfRange, QUALITY_PARAMS } from "./qualitySeries.js";

test("QUALITY_PARAMS: has the 7 expected keys", () => {
  assert.deepEqual(QUALITY_PARAMS.map((p) => p.key),
    ["ph", "alkalinity", "turbidity", "temperature", "residual_chlorine", "conductivity", "tds"]);
});

test("buildQualitySeries: filters by plant and sorts by time", () => {
  const recs = [
    { plant_id: "P1", sampling_datetime: "2026-03-02T08:00:00Z", ph: 7.1 },
    { plant_id: "P1", sampling_datetime: "2026-03-01T08:00:00Z", ph: 7.0 },
    { plant_id: "P2", sampling_datetime: "2026-03-01T08:00:00Z", ph: 9.9 },
  ];
  const series = buildQualitySeries(recs, "P1");
  assert.equal(series.length, 2);
  assert.deepEqual(series.map((s) => s.ph), [7.0, 7.1]);
});

test("outOfRange: respects min and max", () => {
  assert.equal(outOfRange(5, { min: 6, max: 8 }), true);
  assert.equal(outOfRange(9, { min: 6, max: 8 }), true);
  assert.equal(outOfRange(7, { min: 6, max: 8 }), false);
  assert.equal(outOfRange(null, { min: 6, max: 8 }), false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test frontend/src/lib/qualitySeries.test.js`
Expected: FAIL — cannot find module `./qualitySeries.js`

- [ ] **Step 3: Write the implementation**

Create `frontend/src/lib/qualitySeries.js`:

```js
import { format, parseISO } from "date-fns";

export const QUALITY_PARAMS = [
  { key: "ph", label: "PH", unit: "", color: "#db2777" },
  { key: "alkalinity", label: "Alkalinity", unit: "mg/L", color: "#d97706" },
  { key: "turbidity", label: "Turbidity", unit: "NTU", color: "#7c3aed" },
  { key: "temperature", label: "Temperature", unit: "°C", color: "#ea580c" },
  { key: "residual_chlorine", label: "Chlorine", unit: "mg/L", color: "#0891b2" },
  { key: "conductivity", label: "Conductivity", unit: "µS/cm", color: "#059669" },
  { key: "tds", label: "TDS", unit: "mg/L", color: "#2563eb" },
];

export function buildQualitySeries(qualityRecords, plantId) {
  return qualityRecords
    .filter((r) => r.plant_id === plantId && r.sampling_datetime)
    .sort((a, b) => new Date(a.sampling_datetime).getTime() - new Date(b.sampling_datetime).getTime())
    .map((r) => ({
      date: format(parseISO(r.sampling_datetime), "MMM dd"),
      ph: r.ph ?? null,
      alkalinity: r.alkalinity ?? null,
      turbidity: r.turbidity ?? null,
      temperature: r.temperature ?? null,
      residual_chlorine: r.residual_chlorine ?? null,
      conductivity: r.conductivity ?? null,
      tds: r.tds ?? null,
    }));
}

export function outOfRange(value, limit = {}) {
  return value != null && ((limit.min != null && value < limit.min) || (limit.max != null && value > limit.max));
}
```

Note: colors are darkened vs. the website's pastels for legibility on the repo's white background; series meaning is unchanged.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test frontend/src/lib/qualitySeries.test.js`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/qualitySeries.js frontend/src/lib/qualitySeries.test.js
git commit -m "feat(frontend): quality parameter series builder"
```

---

### Task 8: Production API client (`api/production.js`)

**Files:**
- Create: `frontend/src/api/production.js`

**Interfaces:**
- Consumes: `import.meta.env.VITE_API_BASE_URL` (same pattern as `api/metrics.js`).
- Produces: `fetchProductionPlants()` → `Promise<plant[]>`; `fetchPlantBundle(id)` → `Promise<bundle>`.

- [ ] **Step 1: Write the implementation**

Create `frontend/src/api/production.js`:

```js
const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:4000";

async function getJson(path) {
  const res = await fetch(`${API_BASE}${path}`);
  if (!res.ok) throw new Error(`Request failed (${res.status})`);
  return res.json();
}

export function fetchProductionPlants() {
  return getJson("/api/production/plants");
}

export function fetchPlantBundle(id) {
  return getJson(`/api/production/plant/${encodeURIComponent(id)}/bundle`);
}
```

- [ ] **Step 2: Verify it imports cleanly**

Run: `cd frontend && node --input-type=module -e "process.env.VITE_API_BASE_URL=''; const m=await import('./src/api/production.js'); console.log(typeof m.fetchProductionPlants, typeof m.fetchPlantBundle)"`
Expected: prints `function function` (import.meta.env is undefined under node, so guard by wrapping — if it errors on `import.meta.env`, instead verify via the running app in Task 13).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/api/production.js
git commit -m "feat(frontend): production API client"
```

---

### Task 9: Production input table component

**Files:**
- Create: `frontend/src/components/production/ProductionInputTable.jsx`
- Create: `frontend/src/components/production/ProductionInputTable.css`

**Interfaces:**
- Consumes: `buildProductionRows`, `filterRows`, `computeTotals` (`lib/productionRows.js`); `productionRowsToCsv` (`lib/productionCsv.js`); `date-fns`.
- Props: `{ plant, plantId, bundle }` where `bundle` is the object from `fetchPlantBundle`.
- Produces: default export `ProductionInputTable`.

- [ ] **Step 1: Write the component**

Create `frontend/src/components/production/ProductionInputTable.jsx`:

```jsx
import React, { useMemo, useState } from "react";
import { format, parseISO, startOfDay, subDays } from "date-fns";
import { Download } from "lucide-react";
import { buildProductionRows, filterRows, computeTotals } from "../../lib/productionRows";
import { productionRowsToCsv } from "../../lib/productionCsv";
import "./ProductionInputTable.css";

const num = (v) => Math.round(v).toLocaleString();
const isoInput = (d) => format(d, "yyyy-MM-dd");

export default function ProductionInputTable({ plant, plantId, bundle }) {
  const { productionInputs, maintenanceRecords, outages, contractedCapacities, users } = bundle;

  const [startDate, setStartDate] = useState(startOfDay(subDays(new Date(), 30)));
  const [endDate, setEndDate] = useState(startOfDay(new Date()));
  const [deliveredStatus, setDeliveredStatus] = useState("all");
  const [requestedStatus, setRequestedStatus] = useState("all");

  const resolveUserName = (ref) => {
    if (!ref) return "N/A";
    const u = users.find((x) => x.id === ref || x.email === ref);
    return u?.name || u?.email || ref;
  };
  const fmtDateTime = (v) => {
    if (!v) return "N/A";
    const d = parseISO(v);
    return Number.isNaN(d.getTime()) ? "N/A" : format(d, "yyyy-MM-dd HH:mm");
  };

  const rows = useMemo(
    () => buildProductionRows({ plant, plantId, productionInputs, maintenanceRecords, outages, contractedCapacities, startDate, endDate }),
    [plant, plantId, productionInputs, maintenanceRecords, outages, contractedCapacities, startDate, endDate],
  );
  const visibleRows = useMemo(() => filterRows(rows, { deliveredStatus, requestedStatus }), [rows, deliveredStatus, requestedStatus]);
  const totals = useMemo(() => computeTotals(visibleRows), [visibleRows]);

  const exportToCSV = () => {
    const csv = productionRowsToCsv(visibleRows, resolveUserName);
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `production-${format(new Date(), "yyyy-MM-dd")}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="prod-input">
      <div className="prod-strip">
        {[
          ["Contracted (m³)", num(totals.contracted), ""],
          ["Available (m³)", num(totals.available), "prod-kpi--blue"],
          ["Delivered (m³)", num(totals.delivered), "prod-kpi--green"],
          ["Total Loss (m³)", num(totals.loss), "prod-kpi--red"],
          ["Avg Availability", `${totals.availabilityPct.toFixed(0)}%`, ""],
        ].map(([label, value, tone]) => (
          <div className="prod-strip-cell" key={label}>
            <div className="prod-kpi-label">{label}</div>
            <div className={`prod-kpi-value ${tone}`}>{value}</div>
          </div>
        ))}
      </div>

      <div className="prod-filters">
        <label>Start Date
          <input type="date" value={isoInput(startDate)} onChange={(e) => e.target.value && setStartDate(startOfDay(parseISO(e.target.value)))} />
        </label>
        <label>End Date
          <input type="date" value={isoInput(endDate)} onChange={(e) => e.target.value && setEndDate(startOfDay(parseISO(e.target.value)))} />
        </label>
        <label>Delivered Status
          <select value={deliveredStatus} onChange={(e) => setDeliveredStatus(e.target.value)}>
            <option value="all">All</option><option value="draft">Draft</option><option value="submitted">Submitted</option>
            <option value="revised">Revised</option><option value="approved">Approved</option><option value="rejected">Rejected</option>
          </select>
        </label>
        <label>Requested Status
          <select value={requestedStatus} onChange={(e) => setRequestedStatus(e.target.value)}>
            <option value="all">All</option><option value="allocated">Allocated</option><option value="pending">Pending</option>
          </select>
        </label>
        <button type="button" className="prod-btn" onClick={exportToCSV} disabled={visibleRows.length === 0}>
          <Download size={14} /> Export CSV
        </button>
      </div>

      <div className="prod-table-wrap">
        <table className="prod-table">
          <thead>
            <tr>
              <th>Date</th><th className="ta-r">Contracted</th><th className="ta-r">Maint. Loss</th>
              <th className="ta-r">Outage Loss</th><th className="ta-r">Variance</th><th className="ta-r">Available</th>
              <th className="ta-r">Requested</th><th className="ta-r">Delivered</th>
              <th>Responsible User</th><th>Submitted At</th><th>Approved At</th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((r) => (
              <tr key={r.iso}>
                <td className="nowrap">{format(parseISO(r.iso), "EEE, MMM dd")}</td>
                <td className="ta-r mono">{num(r.contracted)}</td>
                <td className="ta-r mono">{r.maintenanceLoss > 0 ? num(r.maintenanceLoss) : "—"}</td>
                <td className="ta-r mono">{r.outageLoss > 0 ? num(r.outageLoss) : "—"}</td>
                <td className="ta-r mono"><span className={r.variance > 0 ? "neg" : ""}>{r.variance > 0 ? `-${num(r.variance)}` : "0"}</span></td>
                <td className="ta-r mono">{num(r.available)}</td>
                <td className="ta-r mono">{r.requested != null ? num(r.requested) : <span className="muted">Pending</span>}</td>
                <td className="ta-r mono">
                  {r.delivered != null ? (
                    <span className="delivered">{num(r.delivered)}{r.deliveredStatus && <span className={`prod-badge prod-badge--${r.deliveredStatus}`}>{r.deliveredStatus.replace("_", " ")}</span>}</span>
                  ) : <span className="muted">Pending</span>}
                </td>
                <td className="nowrap muted">{resolveUserName(r.responsibleUser)}</td>
                <td className="nowrap">{fmtDateTime(r.submittedAt)}</td>
                <td className="nowrap">{fmtDateTime(r.approvedAt)}</td>
              </tr>
            ))}
            {visibleRows.length === 0 && (
              <tr><td colSpan={11} className="empty">No days match the selected range/filters.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="prod-caption">
        {visibleRows.length === 0 ? "No days match the selected range/filters." : `Showing ${visibleRows.length} day${visibleRows.length === 1 ? "" : "s"}`}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Write the stylesheet**

Create `frontend/src/components/production/ProductionInputTable.css`:

```css
.prod-input { display: flex; flex-direction: column; gap: 12px; }

.prod-strip { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 10px; }
.prod-strip-cell { padding: 10px 12px; border: 2px solid #000; border-radius: 2px; background: #fff; }
.prod-kpi-label { color: #000; font-size: 0.66rem; font-weight: 700; letter-spacing: 0.06em; }
.prod-kpi-value { margin-top: 4px; color: #000; font-size: 1.25rem; font-weight: 700; }
.prod-kpi--blue { color: #1a4a8a; } .prod-kpi--green { color: #047857; } .prod-kpi--red { color: #b91c1c; }

.prod-filters { display: flex; flex-wrap: wrap; gap: 8px; align-items: end; }
.prod-filters label { display: flex; flex-direction: column; gap: 3px; color: #111827; font-size: 0.64rem; font-weight: 700; letter-spacing: 0.04em; }
.prod-filters input, .prod-filters select { height: 30px; padding: 0 8px; border: 1px solid #d0d7de; border-radius: 2px; background: #fff; color: #111827; font-size: 0.8rem; }
.prod-btn { display: inline-flex; align-items: center; gap: 6px; height: 30px; padding: 0 12px; border: 1px solid #d0d7de; border-radius: 2px; background: #fff; color: #111827; font-weight: 600; font-size: 0.78rem; cursor: pointer; }
.prod-btn:disabled { opacity: 0.5; cursor: not-allowed; }

.prod-table-wrap { border: 1px solid #d0d7de; border-radius: 2px; overflow-x: auto; background: #fff; }
.prod-table { width: 100%; border-collapse: collapse; font-size: 0.78rem; }
.prod-table thead th { position: sticky; top: 0; padding: 7px 10px; text-align: left; color: #111827; background: #f8fafc; border-bottom: 1px solid #d0d7de; font-size: 0.64rem; font-weight: 700; letter-spacing: 0.06em; }
.prod-table td { padding: 7px 10px; border-bottom: 1px solid #e5e7eb; color: #111827; }
.prod-table .ta-r, .prod-table th.ta-r { text-align: right; }
.prod-table .mono { font-family: var(--mono); }
.prod-table .muted { color: #6b7280; }
.prod-table .neg { color: #b91c1c; }
.prod-table .empty { text-align: center; color: #6b7280; padding: 16px; }
.prod-table .delivered { display: inline-flex; align-items: center; gap: 6px; justify-content: flex-end; }

.prod-badge { padding: 1px 6px; border-radius: 2px; font-size: 0.6rem; font-weight: 700; text-transform: uppercase; border: 1px solid #d0d7de; background: #f3f4f6; color: #374151; }
.prod-badge--approved { background: #dcfce7; border-color: #86efac; color: #166534; }
.prod-badge--submitted, .prod-badge--revised { background: #dbeafe; border-color: #93c5fd; color: #1e40af; }
.prod-badge--under_revision { background: #fef3c7; border-color: #fcd34d; color: #92400e; }
.prod-badge--rejected { background: #fee2e2; border-color: #fca5a5; color: #991b1b; }

.prod-caption { color: #6b7280; font-size: 0.72rem; }

@media (max-width: 1100px) { .prod-strip { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
@media (max-width: 640px) { .prod-strip { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/production/ProductionInputTable.jsx frontend/src/components/production/ProductionInputTable.css
git commit -m "feat(frontend): production input table component"
```

Verification happens end-to-end in Task 13.

---

### Task 10: Production capacity chart component

**Files:**
- Create: `frontend/src/components/production/ProductionCapacityChart.jsx`
- Create: `frontend/src/components/production/ProductionCapacityChart.css`

**Interfaces:**
- Consumes: `buildCapacityChartData` (`lib/capacityChartData.js`); `recharts`; `date-fns`.
- Props: `{ plant, plantId, bundle }`.
- Produces: default export `ProductionCapacityChart`.

- [ ] **Step 1: Write the component**

Create `frontend/src/components/production/ProductionCapacityChart.jsx` (ported from `production-capacity-chart.tsx`, light theme):

```jsx
import React, { useMemo } from "react";
import { format } from "date-fns";
import {
  ComposedChart, Line, Area, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ReferenceLine, ResponsiveContainer,
} from "recharts";
import { buildCapacityChartData } from "../../lib/capacityChartData";
import "./ProductionCapacityChart.css";

const getStatusColor = (status) => {
  switch (status) {
    case "approved": return "#10b981";
    case "submitted":
    case "revised": return "#3b82f6";
    case "under_revision": return "#f59e0b";
    case "rejected": return "#ef4444";
    case "adjusted":
    case "conditional": return "#f59e0b";
    case "shortfall":
    case "postponed": return "#ef4444";
    case "draft": return "#94a3b8";
    default: return "#6366f1";
  }
};

function LegendMarker({ color, kind }) {
  if (kind === "area") return <span style={{ display: "inline-block", width: 14, height: 9, background: color, opacity: 0.3, border: `1px solid ${color}`, borderRadius: 2 }} />;
  if (kind === "diamond") return <span style={{ display: "inline-block", width: 9, height: 9, background: color, transform: "rotate(45deg)" }} />;
  return (
    <svg width="16" height="6" aria-hidden>
      <line x1="0" y1="3" x2="16" y2="3" stroke={color} strokeWidth={kind === "dashed" ? 2 : 3} strokeDasharray={kind === "dashed" ? "4 3" : undefined} />
    </svg>
  );
}

export default function ProductionCapacityChart({ plant, plantId, bundle }) {
  const { productionInputs, outages, maintenanceRecords, qualityRecords } = bundle;
  const contractedCapacity = plant?.specifications?.contracted_capacity;
  const designCapacity = plant?.specifications?.design_capacity;
  const maximumCapacity = plant?.specifications?.maximum_capacity;

  const chartData = useMemo(
    () => buildCapacityChartData({ plantId, productionInputs, qualityRecords, outages, maintenanceRecords, contractedCapacity }),
    [plantId, productionInputs, qualityRecords, outages, maintenanceRecords, contractedCapacity],
  );

  const renderStatusDot = (fallbackColor) => (props) => {
    const { cx, cy, payload, dataKey, index } = props;
    const key = `${dataKey || "dot"}-${payload?.isoDate || index}`;
    if (cx == null || cy == null) return <circle key={key} cx={0} cy={0} r={0} fill="none" />;
    const status = dataKey === "actual" ? payload.actualStatus : payload.requiredStatus;
    return <circle key={key} cx={cx} cy={cy} r={4} fill={getStatusColor(status) || fallbackColor} stroke="#fff" strokeWidth={1.5} />;
  };

  const showCapacityLine = !!plantId && !!contractedCapacity;
  const legendItems = [
    { label: "Delivered", color: "#10b981", kind: "line" },
    { label: "Requested", color: "#6366f1", kind: "dashed" },
    ...(showCapacityLine ? [{ label: "Available Capacity", color: "#f59e0b", kind: "line" }] : []),
    ...(showCapacityLine ? [{ label: "Capacity Lost", color: "#f59e0b", kind: "area" }] : []),
    ...(showCapacityLine ? [{ label: "Contracted", color: "#f59e0b", kind: "dashed" }] : []),
    ...(!!plantId && !!designCapacity ? [{ label: "Design", color: "#8b5cf6", kind: "dashed" }] : []),
    ...(!!plantId && !!maximumCapacity ? [{ label: "Maximum", color: "#06b6d4", kind: "dashed" }] : []),
    { label: "Out-of-Spec Quality", color: "#ef4444", kind: "diamond" },
  ];

  const yTicks = (() => {
    const all = chartData.flatMap((d) => [d.actual, d.required, d.effectiveCapacity, contractedCapacity, designCapacity, maximumCapacity]).filter((v) => v != null);
    if (all.length === 0) return undefined;
    const dataMin = Math.min(0, ...all);
    const dataMax = Math.max(...all);
    const range = dataMax - dataMin || 1;
    const rawStep = range / 4;
    const magnitude = Math.pow(10, Math.floor(Math.log10(rawStep)));
    const step = Math.ceil(rawStep / magnitude) * magnitude;
    const ticks = [];
    for (let v = Math.floor(dataMin / step) * step; v <= dataMax + step; v += step) ticks.push(Math.round(v));
    return ticks;
  })();

  return (
    <div className="cap-chart">
      <ResponsiveContainer width="100%" height={400}>
        <ComposedChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
          <XAxis dataKey="date" tick={{ fill: "#4b5563", fontSize: 11 }} interval={6} />
          <YAxis ticks={yTicks} tick={{ fill: "#4b5563", fontSize: 11 }} tickFormatter={(v) => v.toLocaleString()} width={80}
            label={{ value: "Production (m³)", angle: -90, position: "insideLeft", fill: "#4b5563", fontSize: 11 }} />
          <Tooltip content={({ active, label }) => {
            if (!active) return null;
            const d = chartData.find((p) => p.date === label);
            if (!d) return null;
            return (
              <div className="cap-tip">
                <p className="cap-tip__title">{label}</p>
                {d.effectiveCapacity !== undefined && <p style={{ color: "#b45309", fontWeight: 600 }}>Available Capacity: {d.effectiveCapacity.toLocaleString()} m³</p>}
                {d.required !== null && <p style={{ color: getStatusColor(d.requiredStatus) }}>Requested: {d.required.toLocaleString()} m³ ({d.requiredStatus || "pending"})</p>}
                {d.actual !== null && <p style={{ color: getStatusColor(d.actualStatus) }}>Delivered: {d.actual.toLocaleString()} m³ ({d.actualStatus || "pending"})</p>}
                {contractedCapacity && <p style={{ color: "#b45309", opacity: 0.85 }}>Contracted: {contractedCapacity.toLocaleString()} m³</p>}
                {designCapacity && <p style={{ color: "#7c3aed" }}>Design: {designCapacity.toLocaleString()} m³</p>}
                {maximumCapacity && <p style={{ color: "#0891b2" }}>Maximum: {maximumCapacity.toLocaleString()} m³</p>}
                {d.maintenanceLoss > 0 && <p style={{ color: "#d97706" }}>Maintenance Loss: {d.maintenanceLoss.toLocaleString()} m³</p>}
                {d.outageLoss > 0 && <p style={{ color: "#dc2626" }}>Outage Loss ({d.outageIsActual ? "actual" : "estimated"}): {d.outageLoss.toLocaleString()} m³</p>}
                {d.qualityMarker !== null && <p className="cap-tip__flag">⚠ Out-of-spec quality recorded</p>}
              </div>
            );
          }} />
          <Legend content={() => (
            <div className="cap-legend">
              {legendItems.map((it) => (
                <span key={it.label} className="cap-legend__item"><LegendMarker color={it.color} kind={it.kind} /><span>{it.label}</span></span>
              ))}
            </div>
          )} />

          <ReferenceLine x={format(new Date(), "MMM dd")} stroke="#111827" strokeWidth={2} strokeDasharray="2 4"
            label={{ value: "Today", fill: "#111827", fontSize: 11, fontWeight: 700, position: "insideTopRight" }} />

          {showCapacityLine && <ReferenceLine y={contractedCapacity} stroke="#f59e0b" strokeWidth={2} strokeDasharray="6 3" label={{ value: "Contracted", fill: "#b45309", fontSize: 11, position: "insideTopRight" }} />}
          {!!plantId && !!designCapacity && <ReferenceLine y={designCapacity} stroke="#8b5cf6" strokeWidth={2} strokeDasharray="3 3" label={{ value: "Design", fill: "#7c3aed", fontSize: 11, position: "insideTopRight" }} />}
          {!!plantId && !!maximumCapacity && <ReferenceLine y={maximumCapacity} stroke="#06b6d4" strokeWidth={2} strokeDasharray="3 3" label={{ value: "Maximum", fill: "#0891b2", fontSize: 11, position: "insideTopRight" }} />}

          {showCapacityLine && <Area type="monotone" dataKey="effectiveCapacity" stackId="cap" stroke="none" fill="none" isAnimationActive={false} legendType="none" activeDot={false} />}
          {showCapacityLine && <Area type="monotone" dataKey="capacityLost" stackId="cap" stroke="#f59e0b" strokeOpacity={0.35} strokeWidth={1} fill="#f59e0b" fillOpacity={0.13} name="Capacity Lost" isAnimationActive={false} activeDot={false} />}
          {showCapacityLine && <Line type="monotone" dataKey="effectiveCapacity" stroke="#f59e0b" strokeWidth={3} dot={{ fill: "#f59e0b", r: 3 }} activeDot={{ r: 5 }} name="Available Capacity" isAnimationActive={false} />}

          <Line type="monotone" dataKey="required" stroke="#6366f1" strokeWidth={2} strokeDasharray="5 3" dot={renderStatusDot("#6366f1")} activeDot={{ r: 5 }} name="Requested" connectNulls={false} />
          <Line type="monotone" dataKey="actual" stroke="#10b981" strokeWidth={2} dot={renderStatusDot("#10b981")} activeDot={{ r: 5 }} name="Delivered" connectNulls={false} />
          <Scatter dataKey="qualityMarker" fill="#ef4444" shape="diamond" name="Out-of-Spec Quality" isAnimationActive={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
```

- [ ] **Step 2: Write the stylesheet**

Create `frontend/src/components/production/ProductionCapacityChart.css`:

```css
.cap-chart { width: 100%; }
.cap-tip { background: #fff; border: 1px solid #d0d7de; border-radius: 2px; padding: 8px 12px; font-size: 12px; min-width: 180px; color: #111827; box-shadow: 0 8px 24px rgba(0,0,0,.15); }
.cap-tip p { margin: 2px 0; }
.cap-tip__title { font-weight: 600; margin-bottom: 6px; }
.cap-tip__flag { color: #dc2626; font-weight: 600; margin: 6px 0 2px; border-top: 1px solid #e5e7eb; padding-top: 4px; }
.cap-legend { display: flex; flex-wrap: wrap; align-items: center; justify-content: center; gap: 4px 16px; padding-top: 8px; font-size: 11px; color: #4b5563; }
.cap-legend__item { display: inline-flex; align-items: center; gap: 6px; }
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/production/ProductionCapacityChart.jsx frontend/src/components/production/ProductionCapacityChart.css
git commit -m "feat(frontend): production vs capacity chart component"
```

Verification happens end-to-end in Task 13.

---

### Task 11: Quality parameter charts component

**Files:**
- Create: `frontend/src/components/production/QualityParameterCharts.jsx`
- Create: `frontend/src/components/production/QualityParameterCharts.css`

**Interfaces:**
- Consumes: `buildQualitySeries`, `outOfRange`, `QUALITY_PARAMS` (`lib/qualitySeries.js`); `recharts`.
- Props: `{ plantId, bundle }`.
- Produces: default export `QualityParameterCharts`.

- [ ] **Step 1: Write the component**

Create `frontend/src/components/production/QualityParameterCharts.jsx`:

```jsx
import React, { useMemo } from "react";
import { Line, LineChart, CartesianGrid, ReferenceArea, ReferenceLine, Tooltip, XAxis, YAxis, ResponsiveContainer } from "recharts";
import { buildQualitySeries, outOfRange, QUALITY_PARAMS } from "../../lib/qualitySeries";
import "./QualityParameterCharts.css";

export default function QualityParameterCharts({ plantId, bundle }) {
  const { qualityRecords, qualityLimits } = bundle;
  const limits = qualityLimits || {};
  const series = useMemo(() => buildQualitySeries(qualityRecords, plantId), [qualityRecords, plantId]);

  if (series.length === 0) {
    return <div className="qp-empty">No quality readings yet</div>;
  }

  return (
    <div className="qp-grid">
      {QUALITY_PARAMS.map(({ key, label, unit, color }) => {
        const lim = limits[key] || {};
        return (
          <div key={key} className="qp-card">
            <div className="qp-card__head">
              <span className="qp-card__title">{label}</span>
              <span className="qp-card__limit">
                {lim.min != null || lim.max != null ? `Limit ${lim.min ?? "–"}–${lim.max ?? "–"} ${unit}` : unit}
              </span>
            </div>
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={series} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
                <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#4b5563" }} interval="preserveStartEnd" minTickGap={24} />
                <YAxis tick={{ fontSize: 10, fill: "#4b5563" }} width={40} />
                {lim.min != null && lim.max != null && <ReferenceArea y1={lim.min} y2={lim.max} fill="#34d399" fillOpacity={0.12} stroke="none" />}
                {lim.min != null && <ReferenceLine y={lim.min} stroke="#f87171" strokeDasharray="4 3" strokeWidth={1} />}
                {lim.max != null && <ReferenceLine y={lim.max} stroke="#f87171" strokeDasharray="4 3" strokeWidth={1} />}
                <Tooltip content={({ active, payload, label: lbl }) => {
                  if (!active || !payload?.length) return null;
                  const v = payload[0]?.value;
                  const bad = outOfRange(v, lim);
                  return (
                    <div className="qp-tip">
                      <div className="qp-tip__title">{String(lbl)}</div>
                      <div style={{ color: bad ? "#dc2626" : color }}>{label}: {v != null ? `${v} ${unit}` : "—"} {bad ? "· OUT OF SPEC" : ""}</div>
                    </div>
                  );
                }} />
                <Line type="monotone" dataKey={key} stroke={color} strokeWidth={2} connectNulls isAnimationActive={false}
                  dot={(props) => {
                    const { cx, cy, value, index } = props;
                    if (cx == null || cy == null) return <circle key={index} r={0} fill="none" />;
                    const bad = outOfRange(value, lim);
                    return <circle key={index} cx={cx} cy={cy} r={bad ? 4 : 2.5} fill={bad ? "#dc2626" : color} stroke={bad ? "#fff" : "none"} strokeWidth={bad ? 1 : 0} />;
                  }}
                  activeDot={{ r: 5 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Write the stylesheet**

Create `frontend/src/components/production/QualityParameterCharts.css`:

```css
.qp-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px; }
.qp-card { border: 1px solid #d0d7de; border-radius: 2px; background: #fff; padding: 12px; }
.qp-card__head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
.qp-card__title { font-size: 0.7rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; color: #111827; }
.qp-card__limit { font-size: 0.62rem; color: #6b7280; }
.qp-empty { display: flex; height: 150px; align-items: center; justify-content: center; border: 1px dashed #d0d7de; border-radius: 2px; color: #6b7280; font-size: 0.75rem; }
.qp-tip { border: 1px solid #d0d7de; background: #fff; border-radius: 2px; padding: 6px 10px; font-size: 0.72rem; box-shadow: 0 8px 24px rgba(0,0,0,.15); }
.qp-tip__title { font-weight: 600; margin-bottom: 4px; color: #111827; }

@media (max-width: 1100px) { .qp-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (max-width: 700px) { .qp-grid { grid-template-columns: 1fr; } }
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/production/QualityParameterCharts.jsx frontend/src/components/production/QualityParameterCharts.css
git commit -m "feat(frontend): quality parameter charts component"
```

Verification happens end-to-end in Task 13.

---

### Task 12: Plant list page

**Files:**
- Create: `frontend/src/pages/ProductionPlantList.jsx`
- Create: `frontend/src/pages/ProductionPlantList.css`

**Interfaces:**
- Consumes: `fetchProductionPlants` (`api/production.js`); `react-router-dom` `useNavigate`.
- Produces: default export `ProductionPlantList`.

- [ ] **Step 1: Write the page**

Create `frontend/src/pages/ProductionPlantList.jsx`:

```jsx
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Factory } from "lucide-react";
import { fetchProductionPlants } from "../api/production";
import "./ProductionPlantList.css";

export default function ProductionPlantList() {
  const navigate = useNavigate();
  const [plants, setPlants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    let alive = true;
    fetchProductionPlants()
      .then((data) => { if (alive) { setPlants(data); setLoading(false); } })
      .catch((e) => { if (alive) { setError(e.message); setLoading(false); } });
    return () => { alive = false; };
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return plants;
    return plants.filter((p) =>
      [p.name, p.external_id, p.city, p.region, p.entity].filter(Boolean).some((f) => f.toLowerCase().includes(q)),
    );
  }, [plants, query]);

  return (
    <div className="ppl">
      <header className="ppl__head">
        <div className="ppl__title"><Factory size={18} /><h1>Production — Plants</h1></div>
        <input className="ppl__search" placeholder="Search name, ID, city, region, entity…" value={query} onChange={(e) => setQuery(e.target.value)} />
      </header>

      {loading && <div className="ppl__state">Loading plants…</div>}
      {error && <div className="ppl__state ppl__state--err">Failed to load plants: {error}</div>}

      {!loading && !error && (
        <div className="ppl__table-wrap">
          <table className="ppl__table">
            <thead>
              <tr>
                <th>Asset ID</th><th>Plant Name</th><th>Type</th><th>Entity</th><th>Region</th>
                <th>Status</th><th className="ta-r">Contracted (m³/day)</th><th>Data</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => (
                <tr key={p.id} onClick={() => navigate(`/production/${encodeURIComponent(p.id)}`)}>
                  <td className="mono muted">{p.external_id}</td>
                  <td><div className="ppl__name">{p.name}</div><div className="ppl__city">{p.city}</div></td>
                  <td><span className="ppl__badge ppl__badge--type">{p.asset_type || "N/A"}</span></td>
                  <td className="muted">{p.entity}</td>
                  <td className="muted">{p.region}</td>
                  <td>{p.status}</td>
                  <td className="ta-r mono">{p.specifications?.contracted_capacity?.toLocaleString() || "N/A"}</td>
                  <td>
                    {p.hasData
                      ? <span className="ppl__badge ppl__badge--data">Reporting{p.latestDataDate ? ` · ${p.latestDataDate}` : ""}</span>
                      : <span className="ppl__badge ppl__badge--pending">Pending</span>}
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && <tr><td colSpan={8} className="ppl__empty">No plants match your search.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Write the stylesheet**

Create `frontend/src/pages/ProductionPlantList.css`:

```css
.ppl { padding: 12px; background: #f8fafc; min-height: 100%; }
.ppl__head { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 12px; padding: 0 12px; min-height: 42px; border: 1px solid #d0d7de; border-radius: 2px; background: #fff; box-shadow: 0 1px 1px rgba(0,0,0,.04); }
.ppl__title { display: flex; align-items: center; gap: 8px; color: #111827; }
.ppl__title h1 { font-size: 1.25rem; font-weight: 700; }
.ppl__search { height: 30px; width: 320px; max-width: 45vw; padding: 0 10px; border: 1px solid #d0d7de; border-radius: 2px; background: #fff; color: #111827; font-size: 0.8rem; }
.ppl__state { padding: 24px; color: #4b5563; }
.ppl__state--err { color: #b91c1c; }

.ppl__table-wrap { border: 1px solid #d0d7de; border-radius: 2px; overflow-x: auto; background: #fff; }
.ppl__table { width: 100%; border-collapse: collapse; font-size: 0.78rem; }
.ppl__table thead th { position: sticky; top: 0; padding: 8px 12px; text-align: left; color: #111827; background: #f8fafc; border-bottom: 1px solid #d0d7de; font-size: 0.64rem; font-weight: 700; letter-spacing: 0.06em; }
.ppl__table td { padding: 8px 12px; border-bottom: 1px solid #e5e7eb; color: #111827; vertical-align: top; }
.ppl__table tbody tr { cursor: pointer; }
.ppl__table tbody tr:hover { background: #eef4ff; }
.ppl__table .ta-r, .ppl__table th.ta-r { text-align: right; }
.ppl__table .mono { font-family: var(--mono); }
.ppl__table .muted { color: #6b7280; }
.ppl__name { font-weight: 600; color: #1a4a8a; }
.ppl__city { font-size: 0.7rem; color: #6b7280; }
.ppl__empty { text-align: center; color: #6b7280; padding: 16px; }

.ppl__badge { display: inline-block; padding: 1px 7px; border-radius: 2px; font-size: 0.62rem; font-weight: 700; border: 1px solid #d0d7de; background: #f3f4f6; color: #374151; }
.ppl__badge--type { background: #f3e8ff; border-color: #d8b4fe; color: #6b21a8; }
.ppl__badge--data { background: #dcfce7; border-color: #86efac; color: #166534; }
.ppl__badge--pending { background: #f3f4f6; border-color: #d1d5db; color: #6b7280; }
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/ProductionPlantList.jsx frontend/src/pages/ProductionPlantList.css
git commit -m "feat(frontend): production plant list page"
```

---

### Task 13: Plant detail page + routing (end-to-end wiring & verification)

**Files:**
- Create: `frontend/src/pages/ProductionPlantDetail.jsx`
- Create: `frontend/src/pages/ProductionPlantDetail.css`
- Modify: `frontend/src/pages/ProductionPage.jsx` (replace body)
- Modify: `frontend/src/App.jsx` (add `/production/:plantId` route)

**Interfaces:**
- Consumes: `fetchPlantBundle` (`api/production.js`); `ProductionInputTable`, `ProductionCapacityChart`, `QualityParameterCharts`; `react-router-dom` `useParams`, `Link`.
- Produces: default export `ProductionPlantDetail`; `ProductionPage` renders `ProductionPlantList`.

- [ ] **Step 1: Write the detail page**

Create `frontend/src/pages/ProductionPlantDetail.jsx`:

```jsx
import React, { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { fetchPlantBundle } from "../api/production";
import ProductionInputTable from "../components/production/ProductionInputTable";
import ProductionCapacityChart from "../components/production/ProductionCapacityChart";
import QualityParameterCharts from "../components/production/QualityParameterCharts";
import "./ProductionPlantDetail.css";

export default function ProductionPlantDetail() {
  const { plantId: rawId } = useParams();
  const plantId = decodeURIComponent(rawId);
  const [bundle, setBundle] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetchPlantBundle(plantId)
      .then((b) => { if (alive) { setBundle(b); setLoading(false); } })
      .catch((e) => { if (alive) { setError(e.message); setLoading(false); } });
    return () => { alive = false; };
  }, [plantId]);

  const plant = bundle?.plant;

  return (
    <div className="ppd">
      <header className="ppd__head">
        <Link to="/production" className="ppd__back" aria-label="Back to plants"><ArrowLeft size={16} /></Link>
        <div>
          <h1 className="ppd__name">{plant?.name || plantId}</h1>
          <p className="ppd__meta">{[plant?.asset_type, plant?.region].filter(Boolean).join(" · ")}</p>
        </div>
      </header>

      {loading && <div className="ppd__state">Loading plant…</div>}
      {error && <div className="ppd__state ppd__state--err">Failed to load plant: {error}</div>}

      {!loading && !error && bundle && (
        <div className="ppd__sections">
          <section className="ppd__card">
            <div className="ppd__card-head"><h2>Production Inputs</h2><p>Per-day contracted, available and delivered volumes with maintenance/outage losses.</p></div>
            <div className="ppd__card-body"><ProductionInputTable plant={plant} plantId={plantId} bundle={bundle} /></div>
          </section>

          <section className="ppd__card">
            <div className="ppd__card-head"><h2>Production &amp; Capacity</h2><p>Production against contracted, design &amp; maximum capacity, with maintenance, outage and quality factors.</p></div>
            <div className="ppd__card-body"><ProductionCapacityChart plant={plant} plantId={plantId} bundle={bundle} /></div>
          </section>

          <section className="ppd__card">
            <div className="ppd__card-head"><h2>Water Quality Parameters</h2><p>Daily readings per parameter with the plant's acceptable range shaded; out-of-range points flagged.</p></div>
            <div className="ppd__card-body"><QualityParameterCharts plantId={plantId} bundle={bundle} /></div>
          </section>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Write the detail stylesheet**

Create `frontend/src/pages/ProductionPlantDetail.css`:

```css
.ppd { padding: 12px; background: #f8fafc; min-height: 100%; }
.ppd__head { display: flex; align-items: center; gap: 12px; margin-bottom: 12px; padding: 8px 12px; border: 1px solid #d0d7de; border-radius: 2px; background: #fff; box-shadow: 0 1px 1px rgba(0,0,0,.04); }
.ppd__back { display: inline-flex; align-items: center; justify-content: center; width: 30px; height: 30px; border: 1px solid #d0d7de; border-radius: 2px; color: #111827; text-decoration: none; }
.ppd__back:hover { background: #eef4ff; }
.ppd__name { font-size: 1.15rem; font-weight: 700; color: #111827; }
.ppd__meta { font-size: 0.72rem; color: #6b7280; margin-top: 2px; }
.ppd__state { padding: 24px; color: #4b5563; }
.ppd__state--err { color: #b91c1c; }

.ppd__sections { display: flex; flex-direction: column; gap: 12px; }
.ppd__card { border: 1px solid #d0d7de; border-radius: 2px; background: #fff; }
.ppd__card-head { padding: 10px 12px; border-bottom: 1px solid #d0d7de; }
.ppd__card-head h2 { font-size: 0.95rem; font-weight: 700; color: #111827; }
.ppd__card-head p { font-size: 0.72rem; color: #6b7280; margin-top: 2px; }
.ppd__card-body { padding: 12px; }
```

- [ ] **Step 3: Replace the Production page body**

Overwrite `frontend/src/pages/ProductionPage.jsx` with:

```jsx
import React from "react";
import ProductionPlantList from "./ProductionPlantList";

export default function ProductionPage() {
  return <ProductionPlantList />;
}
```

- [ ] **Step 4: Add the detail route**

In `frontend/src/App.jsx`, add the import after the `ProductionPage` import:

```jsx
import ProductionPlantDetail from "./pages/ProductionPlantDetail";
```

And add this route immediately after the `/production` route line:

```jsx
<Route path="/production/:plantId" element={<ProductionPlantDetail />} />
```

- [ ] **Step 5: Run all unit tests**

Run: `node --test backend/src/production.test.js frontend/src/lib/productionCapacity.test.js frontend/src/lib/productionRows.test.js frontend/src/lib/productionCsv.test.js frontend/src/lib/capacityChartData.test.js frontend/src/lib/qualitySeries.test.js`
Expected: all suites PASS.

- [ ] **Step 6: Build the frontend (catches import/JSX errors)**

Run: `cd frontend && npm run build`
Expected: build completes with no errors.

- [ ] **Step 7: End-to-end verification**

Start backend (`cd backend && npm start`) and frontend (`cd frontend && npm run dev`) in separate shells (leave running). Then:
- Open `http://localhost:5173/production` — confirm the plant list renders ~519 rows, the search filters, and the Data column shows "Reporting · <date>" for plants with data and "Pending" otherwise.
- Click a Reporting plant (e.g. Shoaiba Exp. I IWP / `MK - WP - DS - 0000003`) — confirm: KPI strip populated, per-day input table with delivered values + status badges, the Production & Capacity chart drawing contracted/design reference lines + delivered/requested lines, and the quality charts area (may show "No quality readings yet" for plants without quality data).
- Change the start/end dates and the status filters — confirm the table updates. Click Export CSV — confirm a `.csv` downloads with the visible rows.
- Click Back — confirm return to the list. Open a Pending plant — confirm graceful empty states (no crash).

- [ ] **Step 8: Commit**

```bash
git add frontend/src/pages/ProductionPlantDetail.jsx frontend/src/pages/ProductionPlantDetail.css frontend/src/pages/ProductionPage.jsx frontend/src/App.jsx
git commit -m "feat(frontend): plant detail page + production routing"
```

---

## Notes for the implementer

- `import.meta.env` only exists under Vite, not plain node — so the API-client and component files can't be unit-tested with `node --test`; they're verified via `npm run build` and the running app (Task 13). All pure logic they depend on is already unit-tested in Tasks 2–7.
- If `npm run build` complains about `recharts` peer deps with React 18, that's a warning, not an error; the build still succeeds. Only stop if the build actually fails.
- The website's `qualityLimits` collection is a set of per-plant/parameter rows; Task 2 folds them to `{ [parameter]: { min, max } }`. With 0 rows today, quality charts render without shaded ranges — expected.
