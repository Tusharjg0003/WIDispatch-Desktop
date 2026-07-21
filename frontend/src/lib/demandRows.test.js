import { test } from "node:test";
import assert from "node:assert/strict";
import { demandRowsToCsv, demandDesktopStatus, demandApprovedDemand } from "./demandRows.js";

// productionRows-shaped day rows (see buildProductionRows).
const rows = [
  {
    iso: "2026-03-03", contracted: 100000, maintenanceLoss: 0, outageLoss: 5000,
    variance: 5000, available: 95000, requested: 80000,
    responsibleUser: "u1", submittedAt: "2026-03-03T08:00:00Z", approvedAt: "2026-03-03T09:00:00Z",
    input: { id: "d1", desktop_approval_status: "approved", desktop_approved_at: "2026-03-03T10:00:00Z" },
  },
  {
    iso: "2026-03-02", contracted: 100000, maintenanceLoss: 0, outageLoss: 0,
    variance: 0, available: 100000, requested: 70000,
    responsibleUser: "u1", submittedAt: "2026-03-02T08:00:00Z", approvedAt: "2026-03-02T09:00:00Z",
    input: { id: "d2" },
  },
  {
    iso: "2026-03-01", contracted: 100000, maintenanceLoss: 0, outageLoss: 0,
    variance: 0, available: 100000, requested: null,
    responsibleUser: null, submittedAt: null, approvedAt: null, input: undefined,
  },
];

test("demandDesktopStatus: null day, pending default, explicit status", () => {
  assert.equal(demandDesktopStatus(undefined), null);
  assert.equal(demandDesktopStatus({ id: "x" }), "pending");
  assert.equal(demandDesktopStatus({ desktop_approval_status: "rejected" }), "rejected");
});

test("demandApprovedDemand: only when desktop-approved", () => {
  assert.equal(demandApprovedDemand(rows[0]), 80000);
  assert.equal(demandApprovedDemand(rows[1]), null);
  assert.equal(demandApprovedDemand(rows[2]), null);
});

test("demandRowsToCsv: header includes approval columns", () => {
  const header = demandRowsToCsv(rows).split("\n")[0];
  assert.equal(
    header,
    "Date,Contracted Capacity (m³/day),Maintenance Loss (m³),Outage Loss (m³),Variance (m³),Available Capacity (m³),Required Demand (m³),Approved Demand (m³),Responsible User,Submitted At,Website Approved At,Desktop Approval,Desktop Approved At",
  );
});

test("demandRowsToCsv: approved row carries approved demand + desktop status", () => {
  const line = demandRowsToCsv(rows, (ref) => (ref === "u1" ? "Alice" : ref)).split("\n")[1];
  assert.match(line, /^2026-03-03,100000,0,5000,5000,95000,80000,80000,Alice,/);
  // datetime rendered in local time; assert structure, not the exact hour
  assert.match(line, /approved,2026-03-03 \d\d:\d\d$/);
});

test("demandRowsToCsv: pending record shows Pending approved demand", () => {
  const line = demandRowsToCsv(rows).split("\n")[2];
  assert.match(line, /,70000,Pending,/);
  assert.match(line, /,pending,N\/A$/);
});

test("demandRowsToCsv: day without a record shows em dashes", () => {
  const line = demandRowsToCsv(rows).split("\n")[3];
  assert.match(line, /,Pending,—,/);
  assert.match(line, /,—,N\/A$/);
});
