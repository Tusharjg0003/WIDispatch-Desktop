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
