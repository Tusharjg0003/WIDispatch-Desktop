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
  assert.match(lines[0], /^Date,Contracted/);
  assert.match(lines[1], /(^|,)2026-03-01,/);
  assert.match(lines[1], /,Pending,/);
  assert.match(lines[1], /,Alice,/);
});

test("productionRowsToCsv: escapes a formula-leading resolved user name", () => {
  const rows = [{
    iso: "2026-03-02", contracted: 1, maintenanceLoss: 0, outageLoss: 0, variance: 0,
    available: 1, requested: 1, delivered: 1, deliveredStatus: "approved",
    responsibleUser: "u2", submittedAt: null, approvedAt: null,
  }];
  const csv = productionRowsToCsv(rows, (r) => (r === "u2" ? "=cmd" : "N/A"));
  const lines = csv.split("\n");
  assert.equal(
    lines[1],
    "2026-03-02,1,0,0,0,1,1,1,approved,'=cmd,N/A,N/A"
  );
});
