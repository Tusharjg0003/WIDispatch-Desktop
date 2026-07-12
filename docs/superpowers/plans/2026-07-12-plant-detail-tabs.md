# Plant Detail Tabs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Expand the `/production/:plantId` detail page from a single stacked view into a 4-tab view — Overview, Production, Quality, Maintenance — mirroring the reference site's plant detail, read-only (displays + Export CSV, no forms).

**Architecture:** No backend changes — the existing `/api/production/plant/:id/bundle` already returns `plant` (with lat/long), `productionInputs`, `qualityRecords`, `maintenanceRecords`, and the referenced `users`. All new filter/stats/CSV logic goes in unit-tested `lib/*.js`; new `.jsx` tab components are thin render layers in the repo's light theme. Recharts and Leaflet are already installed.

**Tech Stack:** React 18 + Vite (JSX) + react-router-dom + react-leaflet + date-fns + recharts; tests `node:test` + `node:assert/strict`.

## Global Constraints

- Read-only. No forms, no create/edit/approve, no Actions columns. Export CSV only.
- Light "government-card" theme (white cards, `#f8fafc` bg, `#d0d7de` borders, 2px radius, accent `#003eb1`, ink `#111827`). Reuse existing `ProductionInputTable.css` classes (`prod-strip`, `prod-strip-cell`, `prod-kpi-label/value`, `prod-table-wrap`, `prod-table`, `prod-badge`, `prod-filters`, `prod-btn`) where possible.
- CSV must use the hardened shared escaper: `frontend/src/lib/csvCell.js` (`escapeCell`, and new `toCsv`). Never hand-quote.
- `bundle.users` is `{ id, name, email }[]` scoped to referenced users; resolve via `id`/`email` match, fallback to the raw ref.
- Tabs to build: Overview, Production, Quality, Maintenance (NOT Outages).
- Frontend ESM; JSX is not unit-tested (verified by `npm run build`); pure `.js` logic is unit-tested.
- Do not stage/commit the untracked `Production_website_code/` reference folder.
- Field names (from reference/DB): quality record → `sampling_datetime, ph, alkalinity, turbidity, temperature, residual_chlorine, conductivity, tds, compliance_flag ("within_spec"|"out_of_spec"), comments, submitted_by, approved_by, submitted_at, created_at`; maintenance record → `description, start_datetime, end_datetime, expected_impact_m3, actual_impact_m3, submission_status, submitted_by, approved_by, submitted_at, created_at, approved_at`.

---

### Task 1: Shared `toCsv` helper + refactor productionCsv to use it

**Files:**
- Modify: `frontend/src/lib/csvCell.js`
- Create: `frontend/src/lib/csvCell.test.js`
- Modify: `frontend/src/lib/productionCsv.js`

**Interfaces:**
- Produces: `toCsv(headers, rows)` → CSV string (each cell run through `escapeCell`, comma-joined, `\n`-joined). `headers` is `string[]`, `rows` is `string[][]`.
- Consumes: existing `escapeCell`.

- [ ] **Step 1: Write the failing test**

Create `frontend/src/lib/csvCell.test.js`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { toCsv, escapeCell } from "./csvCell.js";

test("escapeCell: neutralizes formula lead and doubles quotes", () => {
  assert.equal(escapeCell("=cmd"), "'=cmd");
  assert.equal(escapeCell('a"b'), '"a""b"');
  assert.equal(escapeCell("plain"), "plain");
});

test("toCsv: header + rows, escaped, newline-joined", () => {
  const csv = toCsv(["A", "B"], [["1", "x,y"], ["=z", "q"]]);
  assert.equal(csv, 'A,B\n1,"x,y"\n\'=z,q');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test frontend/src/lib/csvCell.test.js`
Expected: FAIL — `toCsv` is not a function.

- [ ] **Step 3: Add `toCsv` to csvCell.js**

Append to `frontend/src/lib/csvCell.js`:

```js
// Serialize a header row + body rows to CSV, escaping every cell.
export function toCsv(headers, rows) {
  return [headers, ...rows].map((row) => row.map(escapeCell).join(",")).join("\n");
}
```

- [ ] **Step 4: Refactor productionCsv.js to use it**

In `frontend/src/lib/productionCsv.js`, change the import to add `toCsv`:
```js
import { escapeCell, toCsv } from "./csvCell.js";
```
(If it currently imports only `escapeCell`, add `toCsv`.) Replace the final return line
```js
  return [HEADERS, ...body].map((row) => row.map(escapeCell).join(",")).join("\n");
```
with:
```js
  return toCsv(HEADERS, body);
```

- [ ] **Step 5: Run tests to verify pass (both files, productionCsv output unchanged)**

Run: `node --test frontend/src/lib/csvCell.test.js frontend/src/lib/productionCsv.test.js`
Expected: PASS (all). productionCsv's existing assertions are unchanged because `toCsv` produces identical output.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/lib/csvCell.js frontend/src/lib/csvCell.test.js frontend/src/lib/productionCsv.js
git commit -m "feat(frontend): shared toCsv helper; productionCsv uses it"
```

---

### Task 2: Quality records lib (`lib/qualityRecords.js`)

**Files:**
- Create: `frontend/src/lib/qualityRecords.js`
- Create: `frontend/src/lib/qualityRecords.test.js`

**Interfaces:**
- Consumes: `date-fns`, `./csvCell.js` `toCsv`.
- Produces:
  - `buildQualityRows(qualityRecords, plantId, { startDate, endDate } = {})` → records for the plant with `sampling_datetime`, filtered to the date window (compare against `sampling_datetime`), sorted newest-first.
  - `filterQualityByCompliance(rows, compliance)` → `compliance` is `"all"|"within_spec"|"out_of_spec"`.
  - `computeQualityStats(rows)` → `{ total, within, out, complianceRate }` (percent 0–100).
  - `qualityRowsToCsv(rows, resolveUserName)` → CSV string via `toCsv`.

- [ ] **Step 1: Write the failing test**

Create `frontend/src/lib/qualityRecords.test.js`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildQualityRows, filterQualityByCompliance, computeQualityStats, qualityRowsToCsv } from "./qualityRecords.js";

const recs = [
  { plant_id: "P1", sampling_datetime: "2026-03-02T08:00:00Z", ph: 7.1, compliance_flag: "within_spec", submitted_by: "u1" },
  { plant_id: "P1", sampling_datetime: "2026-03-01T08:00:00Z", ph: 9.9, compliance_flag: "out_of_spec", submitted_by: "u1" },
  { plant_id: "P2", sampling_datetime: "2026-03-01T08:00:00Z", ph: 7.0, compliance_flag: "within_spec" },
];

test("buildQualityRows: filters by plant and sorts newest-first", () => {
  const rows = buildQualityRows(recs, "P1");
  assert.equal(rows.length, 2);
  assert.equal(rows[0].sampling_datetime, "2026-03-02T08:00:00Z");
});

test("buildQualityRows: applies date window", () => {
  const rows = buildQualityRows(recs, "P1", { startDate: new Date("2026-03-02T00:00:00Z") });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].ph, 7.1);
});

test("filterQualityByCompliance: filters flag", () => {
  const rows = buildQualityRows(recs, "P1");
  assert.equal(filterQualityByCompliance(rows, "out_of_spec").length, 1);
  assert.equal(filterQualityByCompliance(rows, "all").length, 2);
});

test("computeQualityStats: totals + rate", () => {
  const s = computeQualityStats(buildQualityRows(recs, "P1"));
  assert.equal(s.total, 2);
  assert.equal(s.within, 1);
  assert.equal(s.out, 1);
  assert.equal(Math.round(s.complianceRate), 50);
});

test("qualityRowsToCsv: header + resolved user + compliance label", () => {
  const csv = qualityRowsToCsv(buildQualityRows(recs, "P1"), (r) => (r === "u1" ? "Alice" : "N/A"));
  const lines = csv.split("\n");
  assert.match(lines[0], /^Date & Time,PH,/);
  assert.match(csv, /Alice/);
  assert.match(csv, /Out of Spec/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test frontend/src/lib/qualityRecords.test.js`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Write the implementation**

Create `frontend/src/lib/qualityRecords.js`:

```js
import { format, parseISO } from "date-fns";
import { toCsv } from "./csvCell.js";

export function buildQualityRows(qualityRecords, plantId, { startDate, endDate } = {}) {
  return qualityRecords
    .filter((r) => r.plant_id === plantId && r.sampling_datetime)
    .filter((r) => {
      const t = new Date(r.sampling_datetime);
      if (startDate && t < startDate) return false;
      if (endDate && t > endDate) return false;
      return true;
    })
    .sort((a, b) => new Date(b.sampling_datetime).getTime() - new Date(a.sampling_datetime).getTime());
}

export function filterQualityByCompliance(rows, compliance) {
  if (!compliance || compliance === "all") return rows;
  return rows.filter((r) => r.compliance_flag === compliance);
}

export function computeQualityStats(rows) {
  const total = rows.length;
  const within = rows.filter((r) => r.compliance_flag === "within_spec").length;
  const out = rows.filter((r) => r.compliance_flag === "out_of_spec").length;
  const complianceRate = total ? (within / total) * 100 : 0;
  return { total, within, out, complianceRate };
}

const QUALITY_HEADERS = [
  "Date & Time", "PH", "Alkalinity (mg/L)", "Turbidity (NTU)", "Temperature (°C)",
  "Chlorine (mg/L)", "Conductivity (µS/cm)", "TDS (mg/L)", "Compliance",
  "Responsible User", "Submitted At", "Remarks",
];

const fmtDT = (v) => {
  if (!v) return "N/A";
  const d = parseISO(v);
  return Number.isNaN(d.getTime()) ? "N/A" : format(d, "yyyy-MM-dd HH:mm");
};
const n2 = (v) => (v == null ? "N/A" : Number(v).toFixed(2));
const n1 = (v) => (v == null ? "N/A" : Number(v).toFixed(1));

export function qualityRowsToCsv(rows, resolveUserName) {
  const body = rows.map((r) => [
    fmtDT(r.sampling_datetime),
    n2(r.ph), n1(r.alkalinity), n2(r.turbidity), n1(r.temperature),
    n2(r.residual_chlorine), n1(r.conductivity), n1(r.tds),
    r.compliance_flag === "within_spec" ? "Within Spec" : "Out of Spec",
    resolveUserName(r.submitted_by || r.approved_by || null),
    fmtDT(r.submitted_at || r.created_at || null),
    r.comments || "",
  ]);
  return toCsv(QUALITY_HEADERS, body);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test frontend/src/lib/qualityRecords.test.js`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/qualityRecords.js frontend/src/lib/qualityRecords.test.js
git commit -m "feat(frontend): quality records filter/stats/csv builders"
```

---

### Task 3: Maintenance records lib (`lib/maintenanceRecords.js`)

**Files:**
- Create: `frontend/src/lib/maintenanceRecords.js`
- Create: `frontend/src/lib/maintenanceRecords.test.js`

**Interfaces:**
- Consumes: `date-fns`, `./csvCell.js` `toCsv`.
- Produces:
  - `maintenanceDurationHours(start, end)` → whole hours between ISO datetimes (rounded), 0 if invalid.
  - `buildMaintenanceRows(maintenanceRecords, plantId, { startDate, endDate } = {})` → plant's records filtered by `start_datetime` window, sorted newest-first.
  - `filterMaintenanceByStatus(rows, status)` → `status` is `"all"` or a `submission_status`.
  - `computeMaintenanceStats(rows)` → `{ total, pending, approved, rejected, totalImpact }` (`pending` = submitted|revised; `totalImpact` sums `expected_impact_m3`).
  - `maintenanceRowsToCsv(rows, resolveUserName)` → CSV via `toCsv`.

- [ ] **Step 1: Write the failing test**

Create `frontend/src/lib/maintenanceRecords.test.js`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { maintenanceDurationHours, buildMaintenanceRows, filterMaintenanceByStatus, computeMaintenanceStats, maintenanceRowsToCsv } from "./maintenanceRecords.js";

const recs = [
  { plant_id: "P1", description: "Pump swap", start_datetime: "2026-03-02T00:00:00Z", end_datetime: "2026-03-02T06:00:00Z", expected_impact_m3: 1000, actual_impact_m3: 900, submission_status: "approved", submitted_by: "u1" },
  { plant_id: "P1", description: "Valve check", start_datetime: "2026-03-01T00:00:00Z", end_datetime: "2026-03-01T02:00:00Z", expected_impact_m3: 500, submission_status: "submitted", submitted_by: "u1" },
  { plant_id: "P2", description: "x", start_datetime: "2026-03-01T00:00:00Z", end_datetime: "2026-03-01T01:00:00Z", expected_impact_m3: 10, submission_status: "approved" },
];

test("maintenanceDurationHours: whole hours", () => {
  assert.equal(maintenanceDurationHours("2026-03-02T00:00:00Z", "2026-03-02T06:00:00Z"), 6);
  assert.equal(maintenanceDurationHours("bad", "worse"), 0);
});

test("buildMaintenanceRows: plant filter + newest-first", () => {
  const rows = buildMaintenanceRows(recs, "P1");
  assert.equal(rows.length, 2);
  assert.equal(rows[0].description, "Pump swap");
});

test("filterMaintenanceByStatus", () => {
  const rows = buildMaintenanceRows(recs, "P1");
  assert.equal(filterMaintenanceByStatus(rows, "approved").length, 1);
  assert.equal(filterMaintenanceByStatus(rows, "all").length, 2);
});

test("computeMaintenanceStats", () => {
  const s = computeMaintenanceStats(buildMaintenanceRows(recs, "P1"));
  assert.equal(s.total, 2);
  assert.equal(s.pending, 1);
  assert.equal(s.approved, 1);
  assert.equal(s.totalImpact, 1500);
});

test("maintenanceRowsToCsv: header + duration + user", () => {
  const csv = maintenanceRowsToCsv(buildMaintenanceRows(recs, "P1"), (r) => (r === "u1" ? "Alice" : "N/A"));
  assert.match(csv.split("\n")[0], /^Description,Start Date & Time,/);
  assert.match(csv, /Alice/);
  assert.match(csv, /Pump swap/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test frontend/src/lib/maintenanceRecords.test.js`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Write the implementation**

Create `frontend/src/lib/maintenanceRecords.js`:

```js
import { format, parseISO } from "date-fns";
import { toCsv } from "./csvCell.js";

export function maintenanceDurationHours(start, end) {
  const s = new Date(start).getTime();
  const e = new Date(end).getTime();
  if (Number.isNaN(s) || Number.isNaN(e) || e < s) return 0;
  return Math.round((e - s) / 3_600_000);
}

export function buildMaintenanceRows(maintenanceRecords, plantId, { startDate, endDate } = {}) {
  return maintenanceRecords
    .filter((r) => r.plant_id === plantId && r.start_datetime)
    .filter((r) => {
      const t = new Date(r.start_datetime);
      if (startDate && t < startDate) return false;
      if (endDate && t > endDate) return false;
      return true;
    })
    .sort((a, b) => new Date(b.start_datetime).getTime() - new Date(a.start_datetime).getTime());
}

export function filterMaintenanceByStatus(rows, status) {
  if (!status || status === "all") return rows;
  return rows.filter((r) => r.submission_status === status);
}

export function computeMaintenanceStats(rows) {
  const total = rows.length;
  const pending = rows.filter((r) => r.submission_status === "submitted" || r.submission_status === "revised").length;
  const approved = rows.filter((r) => r.submission_status === "approved").length;
  const rejected = rows.filter((r) => r.submission_status === "rejected").length;
  const totalImpact = rows.reduce((sum, r) => sum + (Number(r.expected_impact_m3) || 0), 0);
  return { total, pending, approved, rejected, totalImpact };
}

const MAINT_HEADERS = [
  "Description", "Start Date & Time", "End Date & Time", "Duration (hours)",
  "Expected Loss (m³)", "Actual Impact (m³)", "Status", "Responsible User",
  "Submitted At", "Approved At",
];

const fmtDT = (v) => {
  if (!v) return "N/A";
  const d = parseISO(v);
  return Number.isNaN(d.getTime()) ? "N/A" : format(d, "yyyy-MM-dd HH:mm");
};

export function maintenanceRowsToCsv(rows, resolveUserName) {
  const body = rows.map((r) => [
    r.description || "",
    fmtDT(r.start_datetime),
    fmtDT(r.end_datetime),
    String(maintenanceDurationHours(r.start_datetime, r.end_datetime)),
    r.expected_impact_m3 != null ? Number(r.expected_impact_m3).toFixed(2) : "N/A",
    r.actual_impact_m3 != null ? Number(r.actual_impact_m3).toFixed(2) : "N/A",
    r.submission_status || "",
    resolveUserName(r.submitted_by || r.approved_by || null),
    fmtDT(r.submitted_at || r.created_at || null),
    fmtDT(r.approved_at || null),
  ]);
  return toCsv(MAINT_HEADERS, body);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test frontend/src/lib/maintenanceRecords.test.js`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/maintenanceRecords.js frontend/src/lib/maintenanceRecords.test.js
git commit -m "feat(frontend): maintenance records filter/stats/csv builders"
```

---

### Task 4: Single-plant map component

**Files:**
- Create: `frontend/src/components/production/SinglePlantMap.jsx`

**Interfaces:**
- Consumes: `react-leaflet`, `leaflet/dist/leaflet.css`.
- Props: `{ latitude, longitude, name, height = 220 }`.
- Produces: default export `SinglePlantMap`.

- [ ] **Step 1: Write the component**

Create `frontend/src/components/production/SinglePlantMap.jsx`:

```jsx
import React from "react";
import { MapContainer, TileLayer, CircleMarker, Tooltip } from "react-leaflet";
import "leaflet/dist/leaflet.css";

// Read-only satellite map with a marker at the plant location.
export default function SinglePlantMap({ latitude, longitude, name, height = 220 }) {
  const lat = Number(latitude);
  const lng = Number(longitude);
  if (Number.isNaN(lat) || Number.isNaN(lng)) {
    return (
      <div style={{ height, display: "flex", alignItems: "center", justifyContent: "center", border: "1px solid #d0d7de", borderRadius: 2, color: "#6b7280", fontSize: "0.75rem" }}>
        No coordinates for this plant
      </div>
    );
  }
  return (
    <div style={{ height, borderRadius: 2, overflow: "hidden", border: "1px solid #d0d7de" }}>
      <MapContainer center={[lat, lng]} zoom={13} style={{ height: "100%", width: "100%" }} scrollWheelZoom={false}>
        <TileLayer
          attribution="Tiles &copy; Esri"
          url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
        />
        <CircleMarker center={[lat, lng]} radius={8} pathOptions={{ color: "#003eb1", fillColor: "#003eb1", fillOpacity: 0.7 }}>
          {name && <Tooltip>{name}</Tooltip>}
        </CircleMarker>
      </MapContainer>
    </div>
  );
}
```

- [ ] **Step 2: Build to verify it compiles**

Run: `cd frontend && npm run build`
Expected: build succeeds (chunk advisory OK).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/production/SinglePlantMap.jsx
git commit -m "feat(frontend): read-only single-plant map"
```

---

### Task 5: Quality record list component

**Files:**
- Create: `frontend/src/components/production/QualityRecordList.jsx`
- Create: `frontend/src/components/production/QualityRecordList.css`

**Interfaces:**
- Consumes: `../../lib/qualityRecords` (`buildQualityRows`, `filterQualityByCompliance`, `computeQualityStats`, `qualityRowsToCsv`); `date-fns`; `lucide-react` `Download`.
- Props: `{ plantId, bundle }` (reads `bundle.qualityRecords`, `bundle.users`).
- Produces: default export `QualityRecordList`.

- [ ] **Step 1: Write the component**

Create `frontend/src/components/production/QualityRecordList.jsx`:

```jsx
import React, { useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { Download } from "lucide-react";
import { buildQualityRows, filterQualityByCompliance, computeQualityStats, qualityRowsToCsv } from "../../lib/qualityRecords";
import "./QualityRecordList.css";
import "./ProductionInputTable.css"; // shared prod-* table/badge/kpi/filter classes

const fmtDT = (v) => { if (!v) return "N/A"; const d = parseISO(v); return Number.isNaN(d.getTime()) ? "N/A" : format(d, "yyyy-MM-dd HH:mm"); };
const cell = (v, digits) => (v == null ? "—" : Number(v).toFixed(digits));

export default function QualityRecordList({ plantId, bundle }) {
  const { qualityRecords, users } = bundle;
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [compliance, setCompliance] = useState("all");

  const resolveUserName = (ref) => {
    if (!ref) return "N/A";
    const u = users.find((x) => x.id === ref || x.email === ref);
    return u?.name || u?.email || ref;
  };

  const rows = useMemo(() => filterQualityByCompliance(
    buildQualityRows(qualityRecords, plantId, {
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(`${endDate}T23:59:59`) : undefined,
    }), compliance,
  ), [qualityRecords, plantId, startDate, endDate, compliance]);

  const stats = useMemo(() => computeQualityStats(rows), [rows]);

  const exportCsv = () => {
    const csv = qualityRowsToCsv(rows, resolveUserName);
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url; link.download = `quality-records-${format(new Date(), "yyyy-MM-dd")}.csv`; link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="qrl">
      <div className="prod-strip">
        <div className="prod-strip-cell"><div className="prod-kpi-label">Total Tests</div><div className="prod-kpi-value">{stats.total}</div></div>
        <div className="prod-strip-cell"><div className="prod-kpi-label">Compliance Rate</div><div className="prod-kpi-value prod-kpi--green">{stats.complianceRate.toFixed(0)}%</div></div>
        <div className="prod-strip-cell"><div className="prod-kpi-label">Within Spec</div><div className="prod-kpi-value prod-kpi--green">{stats.within}</div></div>
        <div className="prod-strip-cell"><div className="prod-kpi-label">Out of Spec</div><div className="prod-kpi-value prod-kpi--red">{stats.out}</div></div>
      </div>

      <div className="prod-filters">
        <label>Start Date<input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} /></label>
        <label>End Date<input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} /></label>
        <label>Compliance
          <select value={compliance} onChange={(e) => setCompliance(e.target.value)}>
            <option value="all">All</option><option value="within_spec">Within Spec</option><option value="out_of_spec">Out of Spec</option>
          </select>
        </label>
        <button type="button" className="prod-btn" onClick={exportCsv} disabled={rows.length === 0}><Download size={14} /> Export CSV</button>
      </div>

      <div className="prod-table-wrap">
        <table className="prod-table">
          <thead>
            <tr>
              <th>Date &amp; Time</th><th className="ta-r">PH</th><th className="ta-r">Alkalinity</th><th className="ta-r">Turbidity</th>
              <th className="ta-r">Temp (°C)</th><th className="ta-r">Chlorine</th><th className="ta-r">Conductivity</th><th className="ta-r">TDS</th>
              <th>Compliance</th><th>Responsible User</th><th>Submitted At</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.id || i}>
                <td className="nowrap">{fmtDT(r.sampling_datetime)}</td>
                <td className="ta-r mono">{cell(r.ph, 2)}</td>
                <td className="ta-r mono">{cell(r.alkalinity, 1)}</td>
                <td className="ta-r mono">{cell(r.turbidity, 2)}</td>
                <td className="ta-r mono">{cell(r.temperature, 1)}</td>
                <td className="ta-r mono">{cell(r.residual_chlorine, 2)}</td>
                <td className="ta-r mono">{cell(r.conductivity, 1)}</td>
                <td className="ta-r mono">{cell(r.tds, 1)}</td>
                <td><span className={`prod-badge ${r.compliance_flag === "within_spec" ? "prod-badge--approved" : "prod-badge--rejected"}`}>{r.compliance_flag === "within_spec" ? "Within Spec" : "Out of Spec"}</span></td>
                <td className="nowrap muted">{resolveUserName(r.submitted_by || r.approved_by)}</td>
                <td className="nowrap">{fmtDT(r.submitted_at || r.created_at)}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={11} className="empty">No quality records match the filters.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Write the stylesheet**

Create `frontend/src/components/production/QualityRecordList.css`:

```css
.qrl { display: flex; flex-direction: column; gap: 12px; }
/* Reuses shared prod-* classes from ProductionInputTable.css, which is imported by the
   sibling table component on the same page; these fallbacks keep this tab self-contained. */
.qrl .prod-table .empty { text-align: center; color: #6b7280; padding: 16px; }
```

Note: the `prod-strip`, `prod-filters`, `prod-table*`, `prod-badge*`, `prod-btn`, `mono`, `muted`, `nowrap`, `ta-r`, `prod-kpi--green/red` classes are defined in `ProductionInputTable.css`, which the Step 1 component imports directly so this tab renders correctly regardless of which tab mounts first.

- [ ] **Step 3: Build to verify**

Run: `cd frontend && npm run build`
Expected: succeeds.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/production/QualityRecordList.jsx frontend/src/components/production/QualityRecordList.css
git commit -m "feat(frontend): quality record list tab (display + CSV)"
```

---

### Task 6: Maintenance record list component

**Files:**
- Create: `frontend/src/components/production/MaintenanceRecordList.jsx`
- Create: `frontend/src/components/production/MaintenanceRecordList.css`

**Interfaces:**
- Consumes: `../../lib/maintenanceRecords` (`buildMaintenanceRows`, `filterMaintenanceByStatus`, `computeMaintenanceStats`, `maintenanceDurationHours`, `maintenanceRowsToCsv`); `date-fns`; `lucide-react` `Download`.
- Props: `{ plantId, bundle }` (reads `bundle.maintenanceRecords`, `bundle.users`).
- Produces: default export `MaintenanceRecordList`.

- [ ] **Step 1: Write the component**

Create `frontend/src/components/production/MaintenanceRecordList.jsx`:

```jsx
import React, { useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { Download } from "lucide-react";
import { buildMaintenanceRows, filterMaintenanceByStatus, computeMaintenanceStats, maintenanceDurationHours, maintenanceRowsToCsv } from "../../lib/maintenanceRecords";
import "./MaintenanceRecordList.css";
import "./ProductionInputTable.css";

const fmtDT = (v) => { if (!v) return "N/A"; const d = parseISO(v); return Number.isNaN(d.getTime()) ? "N/A" : format(d, "yyyy-MM-dd HH:mm"); };
const fmtShort = (v) => { if (!v) return "—"; const d = parseISO(v); return Number.isNaN(d.getTime()) ? "—" : format(d, "MMM dd, HH:mm"); };
const num = (v) => (v == null ? "—" : Number(v).toLocaleString());

export default function MaintenanceRecordList({ plantId, bundle }) {
  const { maintenanceRecords, users } = bundle;
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [status, setStatus] = useState("all");

  const resolveUserName = (ref) => {
    if (!ref) return "N/A";
    const u = users.find((x) => x.id === ref || x.email === ref);
    return u?.name || u?.email || ref;
  };

  const rows = useMemo(() => filterMaintenanceByStatus(
    buildMaintenanceRows(maintenanceRecords, plantId, {
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(`${endDate}T23:59:59`) : undefined,
    }), status,
  ), [maintenanceRecords, plantId, startDate, endDate, status]);

  const stats = useMemo(() => computeMaintenanceStats(rows), [rows]);

  const exportCsv = () => {
    const csv = maintenanceRowsToCsv(rows, resolveUserName);
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url; link.download = `maintenance-records-${format(new Date(), "yyyy-MM-dd")}.csv`; link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="mrl">
      <div className="prod-strip">
        <div className="prod-strip-cell"><div className="prod-kpi-label">Total</div><div className="prod-kpi-value">{stats.total}</div></div>
        <div className="prod-strip-cell"><div className="prod-kpi-label">Pending</div><div className="prod-kpi-value">{stats.pending}</div></div>
        <div className="prod-strip-cell"><div className="prod-kpi-label">Approved</div><div className="prod-kpi-value prod-kpi--green">{stats.approved}</div></div>
        <div className="prod-strip-cell"><div className="prod-kpi-label">Expected Loss (m³)</div><div className="prod-kpi-value prod-kpi--red">{Math.round(stats.totalImpact).toLocaleString()}</div></div>
      </div>

      <div className="prod-filters">
        <label>Start Date<input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} /></label>
        <label>End Date<input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} /></label>
        <label>Status
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="all">All</option><option value="draft">Draft</option><option value="submitted">Submitted</option>
            <option value="under_revision">Under Revision</option><option value="revised">Revised</option>
            <option value="approved">Approved</option><option value="rejected">Rejected</option>
          </select>
        </label>
        <button type="button" className="prod-btn" onClick={exportCsv} disabled={rows.length === 0}><Download size={14} /> Export CSV</button>
      </div>

      <div className="prod-table-wrap">
        <table className="prod-table">
          <thead>
            <tr>
              <th>Description</th><th>Start</th><th>End</th><th className="ta-r">Duration</th>
              <th className="ta-r">Expected Loss</th><th className="ta-r">Actual Impact</th><th>Status</th>
              <th>Responsible User</th><th>Submitted At</th><th>Approved At</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.id || i}>
                <td className="mrl__desc">{r.description}</td>
                <td className="nowrap">{fmtShort(r.start_datetime)}</td>
                <td className="nowrap">{fmtShort(r.end_datetime)}</td>
                <td className="ta-r mono">{maintenanceDurationHours(r.start_datetime, r.end_datetime)}h</td>
                <td className="ta-r mono">{num(r.expected_impact_m3)}{r.expected_impact_m3 != null ? " m³" : ""}</td>
                <td className="ta-r mono">{r.actual_impact_m3 != null ? `${num(r.actual_impact_m3)} m³` : "-"}</td>
                <td><span className={`prod-badge prod-badge--${r.submission_status}`}>{(r.submission_status || "").replace("_", " ")}</span></td>
                <td className="nowrap muted">{resolveUserName(r.submitted_by || r.approved_by)}</td>
                <td className="nowrap">{fmtDT(r.submitted_at || r.created_at)}</td>
                <td className="nowrap">{fmtDT(r.approved_at)}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={10} className="empty">No maintenance records match the filters.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Write the stylesheet**

Create `frontend/src/components/production/MaintenanceRecordList.css`:

```css
.mrl { display: flex; flex-direction: column; gap: 12px; }
.mrl__desc { max-width: 280px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mrl .prod-table .empty { text-align: center; color: #6b7280; padding: 16px; }
/* prod-badge--draft/under_revision aren't defined in ProductionInputTable.css; add neutral fallback */
.prod-badge--draft, .prod-badge--revised { background: #f3f4f6; border-color: #d1d5db; color: #374151; }
```

- [ ] **Step 3: Build to verify**

Run: `cd frontend && npm run build`
Expected: succeeds.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/production/MaintenanceRecordList.jsx frontend/src/components/production/MaintenanceRecordList.css
git commit -m "feat(frontend): maintenance record list tab (display + CSV)"
```

---

### Task 7: Plant overview tab component

**Files:**
- Create: `frontend/src/components/production/PlantOverview.jsx`
- Create: `frontend/src/components/production/PlantOverview.css`

**Interfaces:**
- Consumes: `./SinglePlantMap`, `./ProductionCapacityChart`, `./QualityParameterCharts`; `date-fns`.
- Props: `{ plant, plantId, bundle }`.
- Produces: default export `PlantOverview`.

- [ ] **Step 1: Write the component**

Create `frontend/src/components/production/PlantOverview.jsx`:

```jsx
import React from "react";
import { format } from "date-fns";
import SinglePlantMap from "./SinglePlantMap";
import ProductionCapacityChart from "./ProductionCapacityChart";
import QualityParameterCharts from "./QualityParameterCharts";
import "./PlantOverview.css";

const fmtDate = (v) => {
  if (!v || v === "NULL" || v === "") return "—";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? "—" : format(d, "PPP");
};
const cap = (v) => (v != null ? `${Number(v).toLocaleString()} m³/day` : "N/A");

export default function PlantOverview({ plant, plantId, bundle }) {
  const s = plant?.specifications || {};
  const fields = [
    ["Asset ID", plant?.external_id || "—"],
    ["Plant Name", plant?.name || "—"],
    ["Plant Type", plant?.asset_type || "N/A"],
    ["Entity", plant?.entity || "N/A"],
    ["Contracted Capacity", s.contracted_capacity != null ? cap(s.contracted_capacity) : "Not set"],
    ["Design Capacity", cap(s.design_capacity)],
    ["Maximum Capacity", s.maximum_capacity != null ? cap(s.maximum_capacity) : "N/A"],
    ["Commissioning Date", fmtDate(plant?.commissioning_date)],
    ["Decommissioning Date", fmtDate(plant?.decommissioning_date)],
  ];

  return (
    <div className="pov">
      <div className="pov__row">
        <section className="pov__card pov__info">
          <div className="pov__card-head"><h3>Basic Information</h3><p>Core plant details and specifications</p></div>
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
          <div className="pov__card-body"><SinglePlantMap latitude={plant?.latitude} longitude={plant?.longitude} name={plant?.name} height={220} /></div>
        </section>
      </div>

      <section className="pov__card">
        <div className="pov__card-head"><h3>Production &amp; Capacity</h3><p>Production against contracted, design &amp; maximum capacity, with maintenance, outage and quality factors.</p></div>
        <div className="pov__card-body"><ProductionCapacityChart plant={plant} plantId={plantId} bundle={bundle} /></div>
      </section>

      <section className="pov__card">
        <div className="pov__card-head"><h3>Water Quality Parameters</h3><p>Daily readings per parameter with the plant's acceptable range shaded; out-of-range points flagged.</p></div>
        <div className="pov__card-body"><QualityParameterCharts plantId={plantId} bundle={bundle} /></div>
      </section>
    </div>
  );
}
```

- [ ] **Step 2: Write the stylesheet**

Create `frontend/src/components/production/PlantOverview.css`:

```css
.pov { display: flex; flex-direction: column; gap: 12px; }
.pov__row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.pov__card { border: 1px solid #d0d7de; border-radius: 2px; background: #fff; }
.pov__card-head { padding: 10px 12px; border-bottom: 1px solid #d0d7de; }
.pov__card-head h3 { font-size: 0.95rem; font-weight: 700; color: #111827; }
.pov__card-head p { font-size: 0.72rem; color: #6b7280; margin-top: 2px; }
.pov__card-body { padding: 12px; }
.pov__grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px 12px; padding: 12px; }
.pov__label { font-size: 0.6rem; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; color: #6b7280; }
.pov__value { font-size: 0.82rem; color: #111827; margin-top: 2px; }
@media (max-width: 900px) { .pov__row { grid-template-columns: 1fr; } .pov__grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
```

- [ ] **Step 3: Build to verify**

Run: `cd frontend && npm run build`
Expected: succeeds.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/production/PlantOverview.jsx frontend/src/components/production/PlantOverview.css
git commit -m "feat(frontend): plant overview tab (info + map + charts)"
```

---

### Task 8: Wire tabs into the detail page

**Files:**
- Modify: `frontend/src/pages/ProductionPlantDetail.jsx`
- Modify: `frontend/src/pages/ProductionPlantDetail.css`

**Interfaces:**
- Consumes: `PlantOverview`, `ProductionInputTable`, `QualityRecordList`, `MaintenanceRecordList` (all default exports in `../components/production/`).
- Produces: the detail page renders a tab bar (Overview | Production | Quality | Maintenance) and the active tab's content.

- [ ] **Step 1: Replace the sections block with tabs**

In `frontend/src/pages/ProductionPlantDetail.jsx`:

Update the imports — replace the three component imports with:
```jsx
import PlantOverview from "../components/production/PlantOverview";
import ProductionInputTable from "../components/production/ProductionInputTable";
import QualityRecordList from "../components/production/QualityRecordList";
import MaintenanceRecordList from "../components/production/MaintenanceRecordList";
```
(Remove the now-unused `ProductionCapacityChart` and `QualityParameterCharts` imports — they are used inside `PlantOverview` now, not here.)

Add tab state near the other hooks (after the `useState` for bundle/loading/error):
```jsx
  const [activeTab, setActiveTab] = useState("overview");
  const TABS = [
    { key: "overview", label: "Overview" },
    { key: "production", label: "Production" },
    { key: "quality", label: "Quality" },
    { key: "maintenance", label: "Maintenance" },
  ];
```

Replace the entire `{!loading && !error && bundle && ( ... )}` block (the `.ppd__sections` with the three `<section>`s) with:
```jsx
      {!loading && !error && bundle && (
        <>
          <div className="ppd__tabs" role="tablist">
            {TABS.map((t) => (
              <button
                key={t.key}
                role="tab"
                aria-selected={activeTab === t.key}
                className={`ppd__tab ${activeTab === t.key ? "ppd__tab--active" : ""}`}
                onClick={() => setActiveTab(t.key)}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div className="ppd__tabpanel">
            {activeTab === "overview" && <PlantOverview plant={plant} plantId={plantId} bundle={bundle} />}
            {activeTab === "production" && <ProductionInputTable plant={plant} plantId={plantId} bundle={bundle} />}
            {activeTab === "quality" && <QualityRecordList plantId={plantId} bundle={bundle} />}
            {activeTab === "maintenance" && <MaintenanceRecordList plantId={plantId} bundle={bundle} />}
          </div>
        </>
      )}
```

Leave the header, back-link, and the loading/error states unchanged. Keep the `setError(null); setBundle(null);` reset in the fetch effect.

- [ ] **Step 2: Add tab styles**

Append to `frontend/src/pages/ProductionPlantDetail.css`:

```css
.ppd__tabs { display: flex; gap: 2px; border-bottom: 1px solid #d0d7de; margin-bottom: 12px; }
.ppd__tab { padding: 8px 16px; border: 1px solid transparent; border-bottom: none; background: transparent; color: #4b5563; font-size: 0.82rem; font-weight: 600; cursor: pointer; border-radius: 2px 2px 0 0; }
.ppd__tab:hover { color: #111827; background: #eef4ff; }
.ppd__tab--active { color: #003eb1; background: #fff; border-color: #d0d7de; margin-bottom: -1px; }
.ppd__tabpanel { min-height: 200px; }
```

- [ ] **Step 3: Run full unit suite + build**

Run: `node --test backend/src/*.test.js frontend/src/lib/*.test.js`
Expected: all pass.
Run: `cd frontend && npm run build`
Expected: succeeds.

- [ ] **Step 4: End-to-end smoke (no headless browser available — use build + endpoint curl)**

Confirm the backend still serves the bundle with the data the tabs read:
Run: `curl -s "http://localhost:4000/api/production/plant/MK%20-%20WP%20-%20DS%20-%200000003/bundle" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const b=JSON.parse(s);console.log('inputs',b.productionInputs.length,'quality',b.qualityRecords.length,'maint',b.maintenanceRecords.length,'lat',b.plant.latitude)})"`
Expected: prints counts and a latitude (start the backend first if not already running; leave ports as found).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/ProductionPlantDetail.jsx frontend/src/pages/ProductionPlantDetail.css
git commit -m "feat(frontend): tabbed plant detail (overview/production/quality/maintenance)"
```

---

## Notes for the implementer

- No backend changes: the bundle already carries `plant` (with `latitude`/`longitude`), `productionInputs`, `qualityRecords`, `maintenanceRecords`, and referenced `users`.
- The shared `prod-*` table/badge/kpi classes live in `ProductionInputTable.css`; the Quality and Maintenance components import it so their tab renders correctly regardless of which tab mounts first.
- JSX components have no unit tests (repo convention) — `npm run build` is the compile gate; the pure lib modules carry the logic tests.
