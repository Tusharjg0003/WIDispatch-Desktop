import { test } from "node:test";
import assert from "node:assert/strict";
import { demandRowsToCsv } from "./demandRows.js";

// productionRows-shaped day rows (see buildProductionRows).
const rows = [
  {
    iso: "2026-03-03", contracted: 100000, maintenanceLoss: 0, outageLoss: 5000,
    variance: 5000, available: 95000, requested: 80000,
    responsibleUser: "u1", submittedAt: "2026-03-03T08:00:00Z", approvedAt: "2026-03-03T09:00:00Z",
  },
  {
    iso: "2026-03-02", contracted: 100000, maintenanceLoss: 0, outageLoss: 0,
    variance: 0, available: 100000, requested: null,
    responsibleUser: null, submittedAt: null, approvedAt: null,
  },
];

test("demandRowsToCsv: header row (no delivered column)", () => {
  const csv = demandRowsToCsv(rows);
  const header = csv.split("\n")[0];
  assert.equal(
    header,
    "Date,Contracted Capacity (m³/day),Maintenance Loss (m³),Outage Loss (m³),Variance (m³),Available Capacity (m³),Required (m³),Responsible User,Submitted At,Approved At",
  );
});

test("demandRowsToCsv: rounds values and resolves user name", () => {
  const csv = demandRowsToCsv(rows, (ref) => (ref === "u1" ? "Alice" : ref));
  const line = csv.split("\n")[1];
  assert.match(line, /^2026-03-03,100000,0,5000,5000,95000,80000,Alice,/);
});

test("demandRowsToCsv: pending required renders as 'Pending'", () => {
  const csv = demandRowsToCsv(rows);
  const line = csv.split("\n")[2];
  // default resolver returns "" for a null user; submitted/approved render "N/A"
  assert.match(line, /2026-03-02,100000,0,0,0,100000,Pending,,N\/A,N\/A/);
});
