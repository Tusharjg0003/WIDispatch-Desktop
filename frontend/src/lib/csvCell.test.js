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
