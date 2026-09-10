import test from "node:test";
import assert from "node:assert/strict";
import { formatStatus, statusTone } from "./status.js";

test("formatStatus normalizes stored enum values", () => {
  assert.equal(formatStatus("under_construction"), "Under construction");
  assert.equal(formatStatus("desktop-approved"), "Desktop Approved");
  assert.equal(formatStatus(null), "Not available");
});

test("statusTone maps operational semantics", () => {
  assert.equal(statusTone("operational"), "success");
  assert.equal(statusTone("planned maintenance"), "warning");
  assert.equal(statusTone("supply shortfall"), "critical");
});
