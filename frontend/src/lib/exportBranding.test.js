import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import JSZip from "jszip";

import { BRAND, brandCsv, fontCoverage, hasArabic, titleFromFilename } from "./exportBranding.js";
import { buildXlsx, sheetXml } from "./xlsxWriter.js";

test("brandCsv: byte-order mark, brand lines, then the table", () => {
  const csv = brandCsv("Name,Region\nمحطة,Asir", { title: "Production plants", date: new Date(2026, 9, 13, 15, 30) });
  assert.equal(csv.charCodeAt(0), 0xfeff, "UTF-8 BOM so Excel reads Arabic");
  const lines = csv.slice(1).split("\r\n");
  assert.equal(lines[0], BRAND.line);
  assert.equal(lines[1], 'Production plants,"Generated 13 Oct 2026, 15:30"');
  assert.equal(lines[2], "");
  assert.equal(lines.slice(3).join("\r\n"), "Name,Region\nمحطة,Asir");
  // A BOM already on the table isn't doubled.
  assert.equal(brandCsv("﻿a,b", { title: "T" }).match(/﻿/g).length, 1);
});

test("titleFromFilename", () => {
  assert.equal(titleFromFilename("dispatch-allocation-2026-08-01-to-2026-08-31.csv"), "Dispatch allocation");
  assert.equal(titleFromFilename("Tank_Demo_Network_tables_2026_assets.csv"), "Tank Demo Network tables 2026 assets");
  assert.equal(titleFromFilename(""), "Export");
});

test("the Wtt brand font carries Arabic (so PDFs can show it)", () => {
  const bytes = new Uint8Array(fs.readFileSync(new URL("../../public/fonts/Wtt-Regular.ttf", import.meta.url)));
  const covered = fontCoverage(bytes);
  for (const ch of "محطة تنقية مياه أبها") if (ch !== " ") assert.ok(covered.has(ch.codePointAt(0)), ch);
  // jsPDF shapes Arabic into presentation forms: those must be there too.
  assert.ok(covered.has(0xfe8d) && covered.has(0xfeea), "presentation forms B");
  for (const ch of "Abc 123 m/day") assert.ok(ch === " " || covered.has(ch.codePointAt(0)), ch);
  assert.ok(hasArabic("Plant محطة") && !hasArabic("Plant 1"));
});

test("branded sheets: title block, header on row 5 with filters, print titles", () => {
  const xml = sheetXml([{ Name: "محطة", Flow: 12 }], { brand: { title: "Production plants", line: BRAND.line, generated: "13 Oct 2026, 15:30" } });
  assert.match(xml, /<c r="A2" t="inlineStr" s="2"><is><t xml:space="preserve">Production plants<\/t>/);
  assert.match(xml, /SWIIMS · Utility Optimo · Generated 13 Oct 2026, 15:30/);
  assert.match(xml, /<c r="A5" t="inlineStr" s="4"><is><t xml:space="preserve">Name<\/t>/);
  assert.match(xml, /<c r="A6" t="inlineStr"><is><t xml:space="preserve">محطة<\/t>/);
  assert.match(xml, /<autoFilter ref="A5:B6"\/>/);
  assert.match(xml, /<pane ySplit="5" topLeftCell="A6"/);
  assert.match(xml, /<oddHeader>&amp;L&amp;"Calibri,Bold"SWIIMS · Utility Optimo&amp;RProduction plants<\/oddHeader>/);
  // Unbranded sheets are unchanged: header on row 1.
  assert.match(sheetXml([{ Name: "x" }]), /<c r="A1" t="inlineStr" s="1">/);
});

test("branded workbooks embed the logos once and draw them on every sheet", async () => {
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 0, 2, 0, 0, 0, 1]);
  const blob = await buildXlsx(
    { One: [{ a: 1 }], Two: [{ b: "ب" }] },
    { brand: { title: "T", line: BRAND.line, logos: [{ name: "SWIIMS", bytes: png, width: 2, height: 1, heightPx: 38 }, { name: "Utility Optimo", bytes: png, width: 4, height: 1, heightPx: 24 }] } }
  );
  const zip = await JSZip.loadAsync(await blob.arrayBuffer());
  assert.ok(zip.file("xl/media/image1.png") && zip.file("xl/media/image2.png"));
  for (const i of [1, 2]) {
    assert.ok(zip.file(`xl/drawings/drawing${i}.xml`), `drawing ${i}`);
    assert.match(await zip.file(`xl/worksheets/_rels/sheet${i}.xml.rels`).async("string"), /drawings\/drawing\d\.xml/);
    assert.match(await zip.file(`xl/worksheets/sheet${i}.xml`).async("string"), /<drawing r:id="rId1"\/>/);
  }
  const types = await zip.file("[Content_Types].xml").async("string");
  assert.match(types, /Extension="png"/);
  assert.match(types, /drawing\+xml/);
  const wb = await zip.file("xl/workbook.xml").async("string");
  assert.match(wb, /_xlnm\.Print_Titles" localSheetId="1">'Two'!\$5:\$5/);
});
