import test from "node:test";
import assert from "node:assert/strict";

import { parseDateRange, parseIsoDate, parseLimit } from "./requestValidation.js";

test("dates: real YYYY-MM-DD only", () => {
  assert.equal(parseIsoDate(undefined, "from"), undefined);
  assert.equal(parseIsoDate("2026-02-28", "from"), "2026-02-28");
  for (const bad of ["2026-13-45", "2026-02-30", "26-1-1", "yesterday"]) {
    assert.throws(() => parseIsoDate(bad, "from"), (e) => e.statusCode === 400);
  }
  assert.throws(() => parseDateRange({ from: "2026-08-02", to: "2026-08-01" }), (e) => e.statusCode === 400);
  assert.deepEqual(parseDateRange({ from: "2026-08-01" }), { from: "2026-08-01", to: undefined });
});

test("limits: positive whole numbers, capped, with a default", () => {
  assert.equal(parseLimit(undefined, { fallback: 300, max: 5000 }), 300);
  assert.equal(parseLimit("25", { fallback: 300, max: 5000 }), 25);
  assert.equal(parseLimit("99999", { fallback: 300, max: 5000 }), 5000);
  for (const bad of ["-1", "0", "abc", "2.5"]) {
    assert.throws(() => parseLimit(bad, { fallback: 300, max: 5000 }), (e) => e.statusCode === 400);
  }
});
