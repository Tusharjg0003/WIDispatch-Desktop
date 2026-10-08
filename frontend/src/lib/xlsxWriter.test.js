import test from "node:test";
import assert from "node:assert/strict";
import JSZip from "jszip";

import { buildXlsx, safeSheetName, sheetXml } from "./xlsxWriter.js";

test("safeSheetName strips illegal characters, truncates and de-duplicates", () => {
  const used = new Set();
  assert.equal(safeSheetName("Trace: summary/all", used), "Trace  summary all");
  assert.equal(safeSheetName("Trace: summary/all", used), "Trace  summary all (2)");
  assert.equal(safeSheetName("x".repeat(40), used).length, 31);
});

test("sheetXml writes a header row, numbers as numbers, text escaped", () => {
  const xml = sheetXml([{ Name: "A & B", Flow: 12 }, { Name: "<C>", Extra: true }]);
  assert.match(xml, /<c r="A1" t="inlineStr" s="1"><is><t xml:space="preserve">Name<\/t>/);
  assert.match(xml, /<c r="B2"><v>12<\/v><\/c>/);
  assert.match(xml, /A &amp; B/);
  assert.match(xml, /&lt;C&gt;/);
  assert.match(xml, /<c r="C3" t="b"><v>1<\/v><\/c>/);
});

test("buildXlsx produces a workbook with one part per sheet", async () => {
  const blob = await buildXlsx({ One: [{ a: 1 }], Two: [] });
  const zip = await JSZip.loadAsync(await blob.arrayBuffer());
  assert.ok(zip.file("xl/workbook.xml"));
  assert.ok(zip.file("xl/worksheets/sheet1.xml"));
  assert.ok(zip.file("xl/worksheets/sheet2.xml"));
  const wb = await zip.file("xl/workbook.xml").async("string");
  assert.match(wb, /name="One"/);
  assert.match(wb, /name="Two"/);
});
