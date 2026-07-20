# Demand Tab — City Gates Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a City Gates list + per-gate detail (5 tabs) experience to the desktop Demand tab, mirroring the existing Production/Transmission tabs.

**Architecture:** New backend module `demand.js` exposes a city-gate list and a per-gate data bundle from the shared `water_management_system` Mongo DB (`cityGates` + `demandInputs` + shared record collections). New frontend pages (`DemandCityGateList`, `DemandCityGateDetail`) and demand-only components reuse the shared record/quality/map components unchanged. Production/Transmission code is untouched.

**Tech Stack:** Node/Express + MongoDB (backend, ESM, `node:test`); React + react-router-dom + Recharts + date-fns (frontend, Vite, `node:test` for lib units).

## Global Constraints

- Desktop is **view-only**: no create/edit/import of demand records.
- Only `submission_status: "approved"` demand records are surfaced.
- City-gate `id` values contain spaces (e.g. `EP - WD - HP - 0000056`) — always `encodeURIComponent` in routes/links.
- Backend Mongo collection names, verbatim: assets `cityGates`; demand daily `demandInputs` (value field `required_m3`); shared `maintenanceRecords`, `outages`, `qualityRecords`, `qualityLimits`, `contractedCapacity`, `users`.
- Reused components consume a `bundle` with keys `qualityRecords`, `qualityLimits`, `maintenanceRecords`, `outages`, `users` — the demand bundle MUST provide these exact keys.
- Tests run with `node --test <file>` (no npm test script exists).
- Frontend module resolution is Vite/browser: no Node-only APIs in `src/`.

---

### Task 1: Backend demand module + routes

**Files:**
- Create: `backend/src/demand.js`
- Create: `backend/src/demand.test.js`
- Modify: `backend/src/server.js` (add import + two routes near the existing `/api/production/plant/...` routes, ~line 223-256)

**Interfaces:**
- Consumes: `getDb` from `./db.js`; `deriveDataStatus` from `./production.js`.
- Produces:
  - `foldLatestDates(demandDates, qualDates) -> Map<plant_id, isoDateOrNull>`
  - `listCityGates() -> Promise<Array<{...gate, hasData, latestDataDate}>>`
  - `getCityGateBundle(id) -> Promise<{ cityGate, demandInputs, qualityRecords, maintenanceRecords, outages, qualityLimits, contractedCapacities, users }>` (throws `err` with `statusCode = 404` when the gate is missing)

- [ ] **Step 1: Write the failing test** — `backend/src/demand.test.js`

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { foldLatestDates } from "./demand.js";

test("foldLatestDates: newest demand date per plant wins", () => {
  const m = foldLatestDates(
    [
      { plant_id: "G1", date: "2026-03-01" },
      { plant_id: "G1", date: "2026-03-07" },
      { plant_id: "G2", date: "2026-02-10" },
    ],
    [],
  );
  assert.equal(m.get("G1"), "2026-03-07");
  assert.equal(m.get("G2"), "2026-02-10");
});

test("foldLatestDates: quality sampling_datetime is truncated to date and compared", () => {
  const m = foldLatestDates(
    [{ plant_id: "G1", date: "2026-03-01" }],
    [{ plant_id: "G1", sampling_datetime: "2026-03-09T08:30:00Z" }],
  );
  assert.equal(m.get("G1"), "2026-03-09");
});

test("foldLatestDates: plant with only a null-ish date stays null", () => {
  const m = foldLatestDates([{ plant_id: "G3", date: null }], []);
  assert.equal(m.has("G3"), true);
  assert.equal(m.get("G3"), null);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test backend/src/demand.test.js`
Expected: FAIL — cannot find module `./demand.js` (or `foldLatestDates` is not exported).

- [ ] **Step 3: Write the implementation** — `backend/src/demand.js`

```js
import { getDb } from "./db.js";
import { deriveDataStatus } from "./production.js";

const CITY_GATE_PROJECTION = {
  _id: 0,
  id: 1, external_id: 1, name: 1, asset_name_ar: 1, entity: 1, entity_type: 1,
  activity: 1, asset_type: 1, region: 1, cluster: 1, governorate: 1, city: 1,
  latitude: 1, longitude: 1, status: 1, capacity: 1,
  commissioning_date: 1, decommissioning_date: 1, specifications: 1,
};

// Pure: fold demand + quality dates into Map<plant_id, latestIsoDate|null>.
export function foldLatestDates(demandDates, qualDates) {
  const dataMap = new Map();
  for (const r of demandDates) {
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
  return dataMap;
}

export async function listCityGates() {
  const db = await getDb();
  const [cityGates, demandDates, qualDates] = await Promise.all([
    db.collection("cityGates").find({}, { projection: CITY_GATE_PROJECTION }).toArray(),
    db.collection("demandInputs").find({}, { projection: { _id: 0, plant_id: 1, date: 1 } }).toArray(),
    db.collection("qualityRecords").find({}, { projection: { _id: 0, plant_id: 1, sampling_datetime: 1 } }).toArray(),
  ]);
  const dataMap = foldLatestDates(demandDates, qualDates);
  return cityGates.map((g) => deriveDataStatus(g, dataMap));
}

function publicUsersForRecords(userRows, records) {
  const referenced = new Set();
  for (const r of records) {
    if (r.submitted_by) referenced.add(r.submitted_by);
    if (r.approved_by) referenced.add(r.approved_by);
  }
  return userRows
    .filter((u) => referenced.has(u.id) || referenced.has(String(u._id)))
    .map((u) => ({ id: u.id || String(u._id), name: u.name, email: u.email }));
}

export async function getCityGateBundle(id) {
  const db = await getDb();
  const cityGate = await db.collection("cityGates").findOne({ id }, { projection: CITY_GATE_PROJECTION });
  if (!cityGate) {
    const err = new Error("City gate not found");
    err.statusCode = 404;
    throw err;
  }

  const [demandInputs, qualityRecords, maintenanceRecordRows, outages, qualityLimitRows, capacityRows, userRows] =
    await Promise.all([
      db.collection("demandInputs").find({ plant_id: id, submission_status: "approved" }, { projection: { _id: 0 } }).toArray(),
      db.collection("qualityRecords").find({ plant_id: id }, { projection: { _id: 0 } }).toArray(),
      db.collection("maintenanceRecords").find({ plant_id: id }).toArray(),
      db.collection("outages").find({ plant_id: id }, { projection: { _id: 0 } }).toArray(),
      db.collection("qualityLimits").find({ plant_id: id }, { projection: { _id: 0 } }).sort({ effective_from: -1 }).toArray(),
      db.collection("contractedCapacity").find({ plant_id: id }, { projection: { _id: 0 } }).sort({ effective_from: -1 }).toArray(),
      db.collection("users").find({}, { projection: { _id: 1, id: 1, name: 1, email: 1 } }).toArray(),
    ]);

  const maintenanceRecords = maintenanceRecordRows.map(({ _id, ...row }) => ({ id: String(_id), ...row }));

  const qualityLimits = {};
  for (const row of qualityLimitRows) {
    const key = row.parameter;
    if (!key || qualityLimits[key]) continue;
    qualityLimits[key] = { min: row.min ?? undefined, max: row.max ?? undefined };
  }

  const users = publicUsersForRecords(userRows, [...demandInputs, ...maintenanceRecords, ...outages, ...qualityRecords]);

  return { cityGate, demandInputs, qualityRecords, maintenanceRecords, outages, qualityLimits, contractedCapacities: capacityRows, users };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test backend/src/demand.test.js`
Expected: PASS (3 tests).

- [ ] **Step 5: Wire routes** — `backend/src/server.js`

Add the import alongside the other production/transmission imports near the top:

```js
import { listCityGates, getCityGateBundle } from "./demand.js";
```

Add these two routes immediately after the existing `app.get("/api/transmission/pump-station/:id/bundle", ...)` block:

```js
app.get("/api/demand/city-gates", async (_req, res) => {
  try {
    res.json(await listCityGates());
  } catch (err) {
    console.error("demand city gates error:", err);
    res.status(500).json({ error: "Failed to list city gates" });
  }
});

app.get("/api/demand/city-gate/:id/bundle", async (req, res) => {
  try {
    res.json(await getCityGateBundle(req.params.id));
  } catch (err) {
    console.error(`demand city gate bundle error (id=${req.params.id}):`, err);
    res.status(err.statusCode || 500).json({ error: err.message || "Failed to load city gate bundle" });
  }
});
```

- [ ] **Step 6: Smoke-test routes against the running backend**

Run (in one terminal): `node backend/src/server.js`
Run (in another): `curl -s localhost:4000/api/demand/city-gates | head -c 300`
Expected: JSON array of city gates (each with `hasData`/`latestDataDate`).
Run: `curl -s "localhost:4000/api/demand/city-gate/EP%20-%20WD%20-%20HP%20-%200000056/bundle" | head -c 400`
Expected: JSON object with `cityGate`, `demandInputs` (non-empty), and the shared record keys.

- [ ] **Step 7: Commit**

```bash
git add backend/src/demand.js backend/src/demand.test.js backend/src/server.js
git commit -m "feat(backend): demand city gates list + bundle endpoints"
```

---

### Task 2: Frontend demand API client

**Files:**
- Create: `frontend/src/api/demand.js`

**Interfaces:**
- Produces: `fetchCityGates() -> Promise<Array>`, `fetchCityGateBundle(id) -> Promise<Object>` (same bundle shape as Task 1).

- [ ] **Step 1: Write the implementation** — `frontend/src/api/demand.js`

```js
const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:4000";

async function getJson(path) {
  const res = await fetch(`${API_BASE}${path}`);
  if (!res.ok) throw new Error(`Request failed (${res.status})`);
  return res.json();
}

export function fetchCityGates() {
  return getJson("/api/demand/city-gates");
}

export function fetchCityGateBundle(id) {
  return getJson(`/api/demand/city-gate/${encodeURIComponent(id)}/bundle`);
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/api/demand.js
git commit -m "feat(frontend): demand api client (city gates list + bundle)"
```

---

### Task 3: Demand row/CSV lib

**Files:**
- Create: `frontend/src/lib/demandRows.js`
- Create: `frontend/src/lib/demandRows.test.js`

**Interfaces:**
- Consumes: `toCsv` from `./csvCell.js`; `parseISO` from `date-fns`.
- Produces:
  - `buildDemandRows(demandInputs, plantId, { startDate?, endDate? }) -> Array<{date, requiredM3, dataSource, comments, status, submittedBy, approvedBy, submittedAt, approvedAt}>` (newest-first)
  - `filterDemandByStatus(rows, status) -> rows`
  - `computeDemandTotals(rows) -> { days, totalM3, avgDailyM3, peakM3 }`
  - `demandRowsToCsv(rows, resolveUserName) -> string`

- [ ] **Step 1: Write the failing test** — `frontend/src/lib/demandRows.test.js`

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildDemandRows, filterDemandByStatus, computeDemandTotals, demandRowsToCsv } from "./demandRows.js";

const inputs = [
  { plant_id: "G1", date: "2026-03-01", required_m3: 60000, data_source: "SCADA", comments: "", submission_status: "approved", submitted_by: "u1", approved_by: "u2" },
  { plant_id: "G1", date: "2026-03-03", required_m3: 80000, data_source: "Manual", comments: "peak", submission_status: "approved", submitted_by: "u1", approved_by: "u2" },
  { plant_id: "G2", date: "2026-03-02", required_m3: 5000, submission_status: "approved" },
  { plant_id: "G1", date: "2026-03-02", required_m3: null, submission_status: "approved" },
];

test("buildDemandRows: filters by plant, drops null required, sorts newest-first", () => {
  const rows = buildDemandRows(inputs, "G1", {});
  assert.deepEqual(rows.map((r) => r.date), ["2026-03-03", "2026-03-01"]);
  assert.equal(rows[0].requiredM3, 80000);
  assert.equal(rows[0].dataSource, "Manual");
});

test("buildDemandRows: date range is inclusive", () => {
  const rows = buildDemandRows(inputs, "G1", { startDate: new Date("2026-03-02"), endDate: new Date("2026-03-31") });
  assert.deepEqual(rows.map((r) => r.date), ["2026-03-03"]);
});

test("computeDemandTotals: total, avg, peak, days", () => {
  const totals = computeDemandTotals(buildDemandRows(inputs, "G1", {}));
  assert.equal(totals.days, 2);
  assert.equal(totals.totalM3, 140000);
  assert.equal(totals.peakM3, 80000);
  assert.equal(totals.avgDailyM3, 70000);
});

test("filterDemandByStatus: 'all' passes through", () => {
  const rows = buildDemandRows(inputs, "G1", {});
  assert.equal(filterDemandByStatus(rows, "all").length, 2);
  assert.equal(filterDemandByStatus(rows, "approved").length, 2);
});

test("demandRowsToCsv: header + resolved user names", () => {
  const rows = buildDemandRows(inputs, "G1", {});
  const csv = demandRowsToCsv(rows, (ref) => (ref === "u1" ? "Alice" : ref === "u2" ? "Bob" : ref));
  const lines = csv.split("\n");
  assert.equal(lines[0], "Date,Required (m³),Data Source,Comments,Status,Submitted By,Approved By");
  assert.match(lines[1], /2026-03-03,80000,Manual,peak,approved,Alice,Bob/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test frontend/src/lib/demandRows.test.js`
Expected: FAIL — cannot find module `./demandRows.js`.

- [ ] **Step 3: Write the implementation** — `frontend/src/lib/demandRows.js`

```js
import { parseISO } from "date-fns";
import { toCsv } from "./csvCell.js";

export function buildDemandRows(demandInputs, plantId, { startDate, endDate } = {}) {
  return demandInputs
    .filter((r) => (!plantId || r.plant_id === plantId) && r.required_m3 != null && r.date)
    .filter((r) => {
      const d = parseISO(r.date);
      if (Number.isNaN(d.getTime())) return false;
      if (startDate && d < startDate) return false;
      if (endDate && d > endDate) return false;
      return true;
    })
    .map((r) => ({
      date: r.date,
      requiredM3: Number(r.required_m3) || 0,
      dataSource: r.data_source || "",
      comments: r.comments || "",
      status: r.submission_status || "",
      submittedBy: r.submitted_by || null,
      approvedBy: r.approved_by || null,
      submittedAt: r.submitted_at || null,
      approvedAt: r.approved_at || null,
    }))
    .sort((a, b) => (b.date || "").localeCompare(a.date || ""));
}

export function filterDemandByStatus(rows, status) {
  return status && status !== "all" ? rows.filter((r) => r.status === status) : rows;
}

export function computeDemandTotals(rows) {
  const days = rows.length;
  const totalM3 = rows.reduce((s, r) => s + r.requiredM3, 0);
  const peakM3 = rows.reduce((m, r) => Math.max(m, r.requiredM3), 0);
  const avgDailyM3 = days > 0 ? totalM3 / days : 0;
  return { days, totalM3, avgDailyM3, peakM3 };
}

export function demandRowsToCsv(rows, resolveUserName = (x) => x || "") {
  const headers = ["Date", "Required (m³)", "Data Source", "Comments", "Status", "Submitted By", "Approved By"];
  const body = rows.map((r) => [
    r.date, r.requiredM3, r.dataSource, r.comments, r.status,
    resolveUserName(r.submittedBy), resolveUserName(r.approvedBy),
  ]);
  return toCsv(headers, body);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test frontend/src/lib/demandRows.test.js`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/demandRows.js frontend/src/lib/demandRows.test.js
git commit -m "feat(frontend): demand rows filter/totals/csv builders"
```

---

### Task 4: DemandInputTable component (view-only "Demand" tab)

**Files:**
- Create: `frontend/src/components/demand/DemandInputTable.jsx`
- Create: `frontend/src/components/demand/DemandInputTable.css`

**Interfaces:**
- Consumes: `buildDemandRows`, `filterDemandByStatus`, `computeDemandTotals`, `demandRowsToCsv` (Task 3); `bundle.demandInputs`, `bundle.users`.
- Produces: default export `DemandInputTable({ cityGateId, bundle })`.

- [ ] **Step 1: Write the component** — `frontend/src/components/demand/DemandInputTable.jsx`

```jsx
import React, { useMemo, useState } from "react";
import { format, parseISO, startOfDay, subDays } from "date-fns";
import { Download } from "lucide-react";
import { buildDemandRows, filterDemandByStatus, computeDemandTotals, demandRowsToCsv } from "../../lib/demandRows";
import "../production/ProductionInputTable.css"; // shared prod-* table/badge/kpi/filter classes
import "./DemandInputTable.css";

const num = (v) => Math.round(v).toLocaleString();
const isoInput = (d) => format(d, "yyyy-MM-dd");
const fmtDT = (v) => { if (!v) return "N/A"; const d = parseISO(v); return Number.isNaN(d.getTime()) ? "N/A" : format(d, "yyyy-MM-dd HH:mm"); };

export default function DemandInputTable({ cityGateId, bundle }) {
  const { demandInputs, users } = bundle;
  const [startDate, setStartDate] = useState(startOfDay(subDays(new Date(), 30)));
  const [endDate, setEndDate] = useState(startOfDay(new Date()));
  const [status, setStatus] = useState("all");

  const resolveUserName = (ref) => {
    if (!ref) return "N/A";
    const u = users.find((x) => x.id === ref || x.email === ref);
    return u?.name || u?.email || ref;
  };

  const rows = useMemo(
    () => filterDemandByStatus(buildDemandRows(demandInputs, cityGateId, { startDate, endDate }), status),
    [demandInputs, cityGateId, startDate, endDate, status],
  );
  const totals = useMemo(() => computeDemandTotals(rows), [rows]);

  const exportToCSV = () => {
    const csv = demandRowsToCsv(rows, resolveUserName);
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `demand-${format(new Date(), "yyyy-MM-dd")}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="prod-input">
      <div className="prod-strip">
        {[
          ["Total Required (m³)", num(totals.totalM3), ""],
          ["Avg / day (m³)", num(totals.avgDailyM3), "prod-kpi--blue"],
          ["Peak day (m³)", num(totals.peakM3), "prod-kpi--green"],
          ["Days Reporting", String(totals.days), ""],
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
        <label>Status
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="all">All</option>
            <option value="approved">Approved</option>
            <option value="submitted">Submitted</option>
            <option value="revised">Revised</option>
            <option value="rejected">Rejected</option>
          </select>
        </label>
        <button type="button" className="prod-btn" onClick={exportToCSV} disabled={rows.length === 0}>
          <Download size={14} /> Export CSV
        </button>
      </div>

      <div className="prod-table-wrap">
        <table className="prod-table">
          <thead>
            <tr>
              <th>Date</th><th className="ta-r">Required (m³)</th><th>Data Source</th>
              <th>Comments</th><th>Status</th><th>Submitted By</th><th>Approved By</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.date}>
                <td className="nowrap">{format(parseISO(r.date), "EEE, MMM dd")}</td>
                <td className="ta-r mono">{num(r.requiredM3)}</td>
                <td className="muted">{r.dataSource || "—"}</td>
                <td className="muted">{r.comments || "—"}</td>
                <td>{r.status ? <span className={`prod-badge prod-badge--${r.status}`}>{r.status.replace("_", " ")}</span> : "—"}</td>
                <td className="nowrap muted">{resolveUserName(r.submittedBy)}</td>
                <td className="nowrap muted">{resolveUserName(r.approvedBy)}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={7} className="empty">No approved demand records match the selected range/filters.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="prod-caption">
        {rows.length === 0 ? "No demand records in range." : `Showing ${rows.length} day${rows.length === 1 ? "" : "s"}`}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Write the stylesheet** — `frontend/src/components/demand/DemandInputTable.css`

```css
/* Demand-only tweaks layered on top of the shared prod-* classes. */
.prod-input .prod-badge--approved { background: #dcfce7; color: #166534; }
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/demand/DemandInputTable.jsx frontend/src/components/demand/DemandInputTable.css
git commit -m "feat(frontend): demand input table (view-only required m3 + csv)"
```

---

### Task 5: DemandCapacityChart component

**Files:**
- Create: `frontend/src/components/demand/DemandCapacityChart.jsx`

**Interfaces:**
- Consumes: `buildCapacityChartData` from `../../lib/capacityChartData`; `bundle.demandInputs`, `bundle.qualityRecords`, `bundle.outages`, `bundle.maintenanceRecords`; `cityGate.specifications`.
- Produces: default export `DemandCapacityChart({ cityGate, cityGateId, bundle })`.

This is `ProductionCapacityChart` adapted for demand: `buildCapacityChartData` receives `productionInputs: bundle.demandInputs`, so its `required` series carries `required_m3`. The "Delivered/actual" series is dropped (demand has no actuals), axis/legend/tooltip are relabeled to demand. It reuses `ProductionCapacityChart.css`.

- [ ] **Step 1: Write the component** — `frontend/src/components/demand/DemandCapacityChart.jsx`

```jsx
import React, { useMemo } from "react";
import { format } from "date-fns";
import {
  ComposedChart, Line, Area, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ReferenceLine, ResponsiveContainer,
} from "recharts";
import { buildCapacityChartData } from "../../lib/capacityChartData";
import "../production/ProductionCapacityChart.css";

const getStatusColor = (status) => {
  switch (status) {
    case "approved": return "#10b981";
    case "submitted":
    case "revised": return "#3b82f6";
    case "under_revision": return "#f59e0b";
    case "rejected": return "#ef4444";
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

export default function DemandCapacityChart({ cityGate, cityGateId, bundle }) {
  const { demandInputs, outages, maintenanceRecords, qualityRecords } = bundle;
  const contractedCapacity = cityGate?.specifications?.contracted_capacity;
  const designCapacity = cityGate?.specifications?.design_capacity;
  const maximumCapacity = cityGate?.specifications?.maximum_capacity;

  const chartData = useMemo(
    () => buildCapacityChartData({ plantId: cityGateId, productionInputs: demandInputs, qualityRecords, outages, maintenanceRecords, contractedCapacity }),
    [cityGateId, demandInputs, qualityRecords, outages, maintenanceRecords, contractedCapacity],
  );

  const renderStatusDot = (fallbackColor) => (props) => {
    const { cx, cy, payload, dataKey, index } = props;
    const key = `${dataKey || "dot"}-${payload?.isoDate || index}`;
    if (cx == null || cy == null) return <circle key={key} cx={0} cy={0} r={0} fill="none" />;
    return <circle key={key} cx={cx} cy={cy} r={4} fill={getStatusColor(payload.requiredStatus) || fallbackColor} stroke="#fff" strokeWidth={1.5} />;
  };

  const showCapacityLine = !!cityGateId && !!contractedCapacity;
  const legendItems = [
    { label: "Required Demand", color: "#6366f1", kind: "dashed" },
    ...(showCapacityLine ? [{ label: "Available Capacity", color: "#f59e0b", kind: "line" }] : []),
    ...(showCapacityLine ? [{ label: "Capacity Lost", color: "#f59e0b", kind: "area" }] : []),
    ...(showCapacityLine ? [{ label: "Contracted", color: "#f59e0b", kind: "dashed" }] : []),
    ...(!!cityGateId && !!designCapacity ? [{ label: "Design", color: "#8b5cf6", kind: "dashed" }] : []),
    ...(!!cityGateId && !!maximumCapacity ? [{ label: "Maximum", color: "#06b6d4", kind: "dashed" }] : []),
    { label: "Out-of-Spec Quality", color: "#ef4444", kind: "diamond" },
  ];

  const yTicks = (() => {
    const all = chartData.flatMap((d) => [d.required, d.effectiveCapacity, contractedCapacity, designCapacity, maximumCapacity]).filter((v) => v != null);
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
            label={{ value: "Demand (m³)", angle: -90, position: "insideLeft", fill: "#4b5563", fontSize: 11 }} />
          <Tooltip content={({ active, label }) => {
            if (!active) return null;
            const d = chartData.find((p) => p.date === label);
            if (!d) return null;
            return (
              <div className="cap-tip">
                <p className="cap-tip__title">{label}</p>
                {d.effectiveCapacity !== undefined && <p style={{ color: "#b45309", fontWeight: 600 }}>Available Capacity: {d.effectiveCapacity.toLocaleString()} m³</p>}
                {d.required !== null && <p style={{ color: getStatusColor(d.requiredStatus) }}>Required Demand: {d.required.toLocaleString()} m³ ({d.requiredStatus || "pending"})</p>}
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
          {!!cityGateId && !!designCapacity && <ReferenceLine y={designCapacity} stroke="#8b5cf6" strokeWidth={2} strokeDasharray="3 3" label={{ value: "Design", fill: "#7c3aed", fontSize: 11, position: "insideTopRight" }} />}
          {!!cityGateId && !!maximumCapacity && <ReferenceLine y={maximumCapacity} stroke="#06b6d4" strokeWidth={2} strokeDasharray="3 3" label={{ value: "Maximum", fill: "#0891b2", fontSize: 11, position: "insideTopRight" }} />}

          {showCapacityLine && <Area type="monotone" dataKey="effectiveCapacity" stackId="cap" stroke="none" fill="none" isAnimationActive={false} legendType="none" activeDot={false} />}
          {showCapacityLine && <Area type="monotone" dataKey="capacityLost" stackId="cap" stroke="#f59e0b" strokeOpacity={0.35} strokeWidth={1} fill="#f59e0b" fillOpacity={0.13} name="Capacity Lost" isAnimationActive={false} activeDot={false} />}
          {showCapacityLine && <Line type="monotone" dataKey="effectiveCapacity" stroke="#f59e0b" strokeWidth={3} dot={{ fill: "#f59e0b", r: 3 }} activeDot={{ r: 5 }} name="Available Capacity" isAnimationActive={false} />}

          <Line type="monotone" dataKey="required" stroke="#6366f1" strokeWidth={2} strokeDasharray="5 3" dot={renderStatusDot("#6366f1")} activeDot={{ r: 5 }} name="Required Demand" connectNulls={false} />
          <Scatter dataKey="qualityMarker" fill="#ef4444" shape="diamond" name="Out-of-Spec Quality" isAnimationActive={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/demand/DemandCapacityChart.jsx
git commit -m "feat(frontend): demand capacity chart (required vs capacity)"
```

---

### Task 6: DemandOverview component

**Files:**
- Create: `frontend/src/components/demand/DemandOverview.jsx`

**Interfaces:**
- Consumes: `SinglePlantMap`, `QualityParameterCharts` (from `../production/`); `DemandCapacityChart` (Task 5); `../production/PlantOverview.css` (reused `pov-*` classes).
- Produces: default export `DemandOverview({ cityGate, cityGateId, bundle })`.

- [ ] **Step 1: Write the component** — `frontend/src/components/demand/DemandOverview.jsx`

```jsx
import React from "react";
import { format } from "date-fns";
import SinglePlantMap from "../production/SinglePlantMap";
import QualityParameterCharts from "../production/QualityParameterCharts";
import DemandCapacityChart from "./DemandCapacityChart";
import "../production/PlantOverview.css";

const fmtDate = (v) => {
  if (!v || v === "NULL" || v === "") return "—";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? "—" : format(d, "PPP");
};
const cap = (v) => (v != null ? `${Number(v).toLocaleString()} m³/day` : "N/A");

export default function DemandOverview({ cityGate, cityGateId, bundle }) {
  const s = cityGate?.specifications || {};
  const fields = [
    ["Asset ID", cityGate?.external_id || "—"],
    ["City Gate Name", cityGate?.name || "—"],
    ["Gate Type", cityGate?.asset_type || "N/A"],
    ["Entity", cityGate?.entity || "N/A"],
    ["Contracted Capacity", s.contracted_capacity != null ? cap(s.contracted_capacity) : "Not set"],
    ["Design Capacity", cap(s.design_capacity)],
    ["Maximum Capacity", s.maximum_capacity != null ? cap(s.maximum_capacity) : "N/A"],
    ["Commissioning Date", fmtDate(cityGate?.commissioning_date)],
    ["Decommissioning Date", fmtDate(cityGate?.decommissioning_date)],
  ];

  return (
    <div className="pov">
      <div className="pov__row">
        <section className="pov__card pov__info">
          <div className="pov__card-head"><h3>Basic Information</h3><p>Core city gate details and specifications</p></div>
          <div className="pov__grid">
            {fields.map(([label, value]) => (
              <div className="pov__field" key={label}>
                <div className="pov__label">{label}</div>
                <div className="pov__value">{value}</div>
              </div>
            ))}
          </div>
        </section>
        <section className="pov__card pov__loc">
          <div className="pov__card-head"><h3>Location</h3><p>Satellite view</p></div>
          <div className="pov__card-body"><SinglePlantMap latitude={cityGate?.latitude} longitude={cityGate?.longitude} name={cityGate?.name} height={220} /></div>
        </section>
      </div>

      <section className="pov__card">
        <div className="pov__card-head"><h3>Demand &amp; Capacity</h3><p>Required demand against contracted, design &amp; maximum capacity, with maintenance, outage and quality factors.</p></div>
        <div className="pov__card-body"><DemandCapacityChart cityGate={cityGate} cityGateId={cityGateId} bundle={bundle} /></div>
      </section>

      <section className="pov__card">
        <div className="pov__card-head"><h3>Water Quality Parameters</h3><p>Daily readings per parameter with the gate's acceptable range shaded; out-of-range points flagged.</p></div>
        <div className="pov__card-body"><QualityParameterCharts plantId={cityGateId} bundle={bundle} /></div>
      </section>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/demand/DemandOverview.jsx
git commit -m "feat(frontend): demand city gate overview tab"
```

---

### Task 7: City Gates list page + Demand tab landing

**Files:**
- Create: `frontend/src/pages/DemandCityGateList.jsx`
- Create: `frontend/src/pages/DemandCityGateList.css`
- Modify: `frontend/src/pages/DemandPage.jsx` (full rewrite)

**Interfaces:**
- Consumes: `fetchCityGates` (Task 2); reuses `ProductionPlantList.css` (`ppl-*` classes).
- Produces: default export `DemandCityGateList()`; `DemandPage` renders it.

- [ ] **Step 1: Write the list page** — `frontend/src/pages/DemandCityGateList.jsx`

```jsx
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { fetchCityGates } from "../api/demand";
import "./ProductionPlantList.css";
import "./DemandCityGateList.css";

const uniqSorted = (values) => [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b));

export default function DemandCityGateList() {
  const navigate = useNavigate();
  const [gates, setGates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [query, setQuery] = useState("");
  const [gateType, setGateType] = useState("");
  const [entity, setEntity] = useState("");
  const [region, setRegion] = useState("");

  useEffect(() => {
    let alive = true;
    fetchCityGates()
      .then((data) => { if (alive) { setGates(data); setLoading(false); } })
      .catch((e) => { if (alive) { setError(e.message); setLoading(false); } });
    return () => { alive = false; };
  }, []);

  const filterOptions = useMemo(() => ({
    gateTypes: uniqSorted(gates.map((g) => g.asset_type)),
    entities: uniqSorted(gates.map((g) => g.entity)),
    regions: uniqSorted(gates.map((g) => g.region)),
  }), [gates]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return gates.filter((g) => {
      if (gateType && g.asset_type !== gateType) return false;
      if (entity && g.entity !== entity) return false;
      if (region && g.region !== region) return false;
      if (!q) return true;
      return [g.name, g.external_id, g.city, g.region, g.entity, g.asset_type]
        .filter(Boolean)
        .some((f) => f.toLowerCase().includes(q));
    });
  }, [gates, query, gateType, entity, region]);

  return (
    <div className="ppl demand-city-gates">
      <div className="ppl__titlebar">
        <div>
          <h1 className="ppl__title">City Gates</h1>
          <p className="ppl__subtitle">Demand delivery points · view only</p>
        </div>
      </div>

      <header className="ppl__head">
        <input className="ppl__search" placeholder="Search city gates by name, ID, city, region, entity…" value={query} onChange={(e) => setQuery(e.target.value)} />
        <select className="ppl__filter" aria-label="Gate type" value={gateType} onChange={(e) => setGateType(e.target.value)}>
          <option value="">All Gate Types</option>
          {filterOptions.gateTypes.map((type) => <option key={type} value={type}>{type}</option>)}
        </select>
        <select className="ppl__filter" aria-label="Entity" value={entity} onChange={(e) => setEntity(e.target.value)}>
          <option value="">All Entities</option>
          {filterOptions.entities.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
        <select className="ppl__filter" aria-label="Region" value={region} onChange={(e) => setRegion(e.target.value)}>
          <option value="">All Regions</option>
          {filterOptions.regions.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
      </header>

      {loading && <div className="ppl__state">Loading city gates…</div>}
      {error && <div className="ppl__state ppl__state--err">Failed to load city gates: {error}</div>}

      {!loading && !error && (
        <div className="ppl__table-wrap">
          <table className="ppl__table">
            <thead>
              <tr>
                <th>Asset ID</th><th>City Gate Name</th><th>Type</th><th>Entity</th><th>Region</th>
                <th>Status</th><th className="ta-r">Contracted (m³/day)</th><th>Data</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((g) => (
                <tr key={g.id} onClick={() => navigate(`/demand/${encodeURIComponent(g.id)}`)}>
                  <td className="mono muted">{g.external_id}</td>
                  <td><div className="ppl__name">{g.name}</div><div className="ppl__city">{g.city || "—"}</div></td>
                  <td><span className="ppl__badge">{g.asset_type || "N/A"}</span></td>
                  <td className="muted">{g.entity || "—"}</td>
                  <td className="muted">{g.region || "—"}</td>
                  <td>{g.status || "N/A"}</td>
                  <td className="ta-r mono">{g.specifications?.contracted_capacity?.toLocaleString() || "N/A"}</td>
                  <td>
                    {g.hasData
                      ? <span className="ppl__badge ppl__badge--data">Reporting{g.latestDataDate ? ` · ${g.latestDataDate}` : ""}</span>
                      : <span className="ppl__badge ppl__badge--pending">Pending</span>}
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && <tr><td colSpan={8} className="ppl__empty">No city gates match your filters.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Write the stylesheet** — `frontend/src/pages/DemandCityGateList.css`

```css
/* Demand-only tweaks layered on the shared ppl-* list classes. */
.demand-city-gates .ppl__badge--data { background: #dbeafe; color: #1e40af; }
```

- [ ] **Step 3: Rewrite the Demand landing** — `frontend/src/pages/DemandPage.jsx` (replace entire file)

```jsx
import React from "react";
import DemandCityGateList from "./DemandCityGateList";

export default function DemandPage() {
  return <DemandCityGateList />;
}
```

- [ ] **Step 4: Verify the app builds**

Run: `cd frontend && npx vite build`
Expected: Build succeeds with no import errors. (`DemandPage.css` is no longer imported; leaving the file on disk is harmless.)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/DemandCityGateList.jsx frontend/src/pages/DemandCityGateList.css frontend/src/pages/DemandPage.jsx
git commit -m "feat(frontend): city gates list as demand tab landing"
```

---

### Task 8: City Gate detail page (5 tabs) + route

**Files:**
- Create: `frontend/src/pages/DemandCityGateDetail.jsx`
- Modify: `frontend/src/App.jsx` (add import + route `/demand/:cityGateId`)

**Interfaces:**
- Consumes: `fetchCityGateBundle` (Task 2); `DemandOverview` (Task 6); `DemandInputTable` (Task 4); reused `QualityRecordList`, `MaintenanceRecordList`, `OutageRecordList` from `../components/production/`; reuses `ProductionPlantDetail.css` (`ppd-*` classes).
- Produces: default export `DemandCityGateDetail()`.

- [ ] **Step 1: Write the detail page** — `frontend/src/pages/DemandCityGateDetail.jsx`

```jsx
import React, { useEffect, useState } from "react";
import { useParams, Link, useSearchParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { fetchCityGateBundle } from "../api/demand";
import DemandOverview from "../components/demand/DemandOverview";
import DemandInputTable from "../components/demand/DemandInputTable";
import QualityRecordList from "../components/production/QualityRecordList";
import MaintenanceRecordList from "../components/production/MaintenanceRecordList";
import OutageRecordList from "../components/production/OutageRecordList";
import "./ProductionPlantDetail.css";

const TABS = [
  { key: "overview", label: "Overview" },
  { key: "demand", label: "Demand" },
  { key: "quality", label: "Quality" },
  { key: "maintenance", label: "Maintenance" },
  { key: "outages", label: "Outages" },
];
const TAB_KEYS = new Set(TABS.map((tab) => tab.key));

export default function DemandCityGateDetail() {
  const { cityGateId: rawId } = useParams();
  const cityGateId = decodeURIComponent(rawId);
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedTab = searchParams.get("tab");
  const [bundle, setBundle] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState(TAB_KEYS.has(requestedTab) ? requestedTab : "overview");

  useEffect(() => {
    const nextTab = TAB_KEYS.has(requestedTab) ? requestedTab : "overview";
    setActiveTab((current) => (current === nextTab ? current : nextTab));
  }, [requestedTab]);

  const selectTab = (key) => {
    setActiveTab(key);
    const next = new URLSearchParams(searchParams);
    if (key === "overview") next.delete("tab");
    else next.set("tab", key);
    setSearchParams(next, { replace: true });
  };

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    setBundle(null);
    fetchCityGateBundle(cityGateId)
      .then((b) => { if (alive) { setBundle(b); setLoading(false); } })
      .catch((e) => { if (alive) { setError(e.message); setLoading(false); } });
    return () => { alive = false; };
  }, [cityGateId]);

  const cityGate = bundle?.cityGate;

  return (
    <div className="ppd demand-detail">
      <header className="ppd__head">
        <Link to="/demand" className="ppd__back" aria-label="Back to city gates"><ArrowLeft size={16} /></Link>
        <div>
          <h1 className="ppd__name">{cityGate?.name || cityGateId}</h1>
          <p className="ppd__meta">{[cityGate?.asset_type, cityGate?.region, "View only"].filter(Boolean).join(" · ")}</p>
        </div>
      </header>

      {loading && <div className="ppd__state">Loading city gate…</div>}
      {error && <div className="ppd__state ppd__state--err">Failed to load city gate: {error}</div>}

      {!loading && !error && bundle && (
        <>
          <div className="ppd__tabs" role="tablist">
            {TABS.map((t) => (
              <button
                key={t.key}
                role="tab"
                aria-selected={activeTab === t.key}
                className={`ppd__tab ${activeTab === t.key ? "ppd__tab--active" : ""}`}
                onClick={() => selectTab(t.key)}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div className="ppd__tabpanel">
            {activeTab === "overview" && <DemandOverview cityGate={cityGate} cityGateId={cityGateId} bundle={bundle} />}
            {activeTab === "demand" && <DemandInputTable cityGateId={cityGateId} bundle={bundle} />}
            {activeTab === "quality" && <QualityRecordList plantId={cityGateId} bundle={bundle} />}
            {activeTab === "maintenance" && <MaintenanceRecordList plantId={cityGateId} bundle={bundle} readOnly />}
            {activeTab === "outages" && <OutageRecordList plantId={cityGateId} bundle={bundle} />}
          </div>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Add the route** — `frontend/src/App.jsx`

Add the import next to the other page imports:

```jsx
import DemandCityGateDetail from "./pages/DemandCityGateDetail";
```

Add the route immediately after the existing `<Route path="/demand" element={<DemandPage />} />`:

```jsx
<Route path="/demand/:cityGateId" element={<DemandCityGateDetail />} />
```

- [ ] **Step 3: Verify the app builds**

Run: `cd frontend && npx vite build`
Expected: Build succeeds, no unresolved imports.

- [ ] **Step 4: Manual verification (backend running: `node backend/src/server.js`, frontend: `cd frontend && npm run dev`)**

- Demand tab shows the City Gates table; search + Type/Entity/Region filters work.
- Clicking `2 Khafji Handover Point` (`EP - WD - HP - 0000056`) opens the detail with 5 tabs.
- Overview renders info card, map, Demand & Capacity chart (required-demand line vs capacity refs), and quality charts (empty state OK).
- Demand tab shows 4 approved demand rows with Total/Avg/Peak/Days KPIs; CSV export downloads.
- Maintenance tab shows the gate's maintenance record (read-only, no approve/reject actions); Quality/Outages render clean empty states.
- `?tab=demand` deep-links directly to the Demand tab; switching tabs updates the URL.
- Open a gate with no records — every tab shows a clean empty state, no crash.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/DemandCityGateDetail.jsx frontend/src/App.jsx
git commit -m "feat(frontend): city gate detail page with 5 tabs + route"
```

---

## Self-Review

**Spec coverage:**
- Backend `demand.js` (`listCityGates`, `getCityGateBundle`) + routes → Task 1. ✓
- `api/demand.js` (`fetchCityGates`, `fetchCityGateBundle`) → Task 2. ✓
- `DemandPage` → city gates table; list page → Task 7. ✓
- Detail page, 5 tabs, `?tab=` sync, `/demand/:cityGateId` route → Task 8. ✓
- `DemandOverview` → Task 6; `DemandInputTable` → Task 4; `DemandCapacityChart` → Task 5. ✓
- Reused `SinglePlantMap`, `MaintenanceRecordList`, `OutageRecordList`, `QualityRecordList`, `QualityParameterCharts` unchanged → Tasks 6 & 8. ✓
- Optional `demandRows.js` (+ test) → Task 3 (adopted; used by `DemandInputTable`). ✓
- Testing: backend pure helper test (Task 1), lib tests (Task 3), manual pass (Task 8). ✓

**Placeholder scan:** No TBD/TODO/"handle edge cases"; every code step shows complete code. ✓

**Type consistency:**
- Bundle key `cityGate` (Task 1) matches `bundle.cityGate`/`bundle?.cityGate` reads in Tasks 6 & 8. ✓
- Bundle keys `demandInputs`, `qualityRecords`, `qualityLimits`, `maintenanceRecords`, `outages`, `users`, `contractedCapacities` (Task 1) match consumers: `DemandInputTable` (`demandInputs`, `users`), `DemandCapacityChart` (`demandInputs`, `qualityRecords`, `outages`, `maintenanceRecords`), `QualityParameterCharts`/`QualityRecordList`/`MaintenanceRecordList`/`OutageRecordList` (their required keys). ✓
- `DemandInputTable({ cityGateId, bundle })`, `DemandCapacityChart({ cityGate, cityGateId, bundle })`, `DemandOverview({ cityGate, cityGateId, bundle })` — call sites in Tasks 6 & 8 pass exactly these props. ✓
- `foldLatestDates`, `buildDemandRows`, `filterDemandByStatus`, `computeDemandTotals`, `demandRowsToCsv` names identical across definition and use. ✓

**Note on reused `MaintenanceRecordList`:** passed `readOnly` in Task 8 so no desktop approve/reject actions render on the demand detail (view-only constraint). It still reads `bundle.maintenanceRecords`/`bundle.users` unchanged.
