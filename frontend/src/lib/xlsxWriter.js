// Minimal .xlsx writer on top of jszip (already a dependency) — enough for the
// app's exports: several named sheets of plain rows with a bold header.
// Avoids pulling in the unmaintained `xlsx` package.
//
// sheets: { "Sheet name": [{ Column: value, ... }, ...] }
//
// With a `brand` ({ title, subtitle, line, logos }), every sheet opens with
// the SWIIMS · Utility Optimo block — the logos, the report title and a
// "Generated …" line — above a styled header row with filters, and prints
// with a branded page header/footer and the header row repeated.

import JSZip from "jszip";

const xmlEscape = (value) =>
  String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    // Strip control characters Excel refuses to open.
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "");

const columnName = (index) => {
  let n = index + 1;
  let name = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    name = String.fromCharCode(65 + rem) + name;
    n = Math.floor((n - 1) / 26);
  }
  return name;
};

// Excel sheet names: ≤31 chars, none of : \ / ? * [ ], unique.
export function safeSheetName(name, used = new Set()) {
  let base = String(name || "Sheet").replace(/[:\\/?*[\]]/g, " ").trim().slice(0, 31) || "Sheet";
  let candidate = base;
  for (let i = 2; used.has(candidate.toLowerCase()); i += 1) {
    const suffix = ` (${i})`;
    candidate = base.slice(0, 31 - suffix.length) + suffix;
  }
  used.add(candidate.toLowerCase());
  return candidate;
}

// Cell styles (index into cellXfs in styles.xml).
const STYLE = { body: 0, bold: 1, title: 2, subtitle: 3, header: 4 };

function cellXml(ref, value, styleId) {
  const s = styleId ? ` s="${styleId}"` : "";
  if (value === null || value === undefined || value === "") return `<c r="${ref}"${s}/>`;
  if (typeof value === "number" && Number.isFinite(value)) return `<c r="${ref}"${s}><v>${value}</v></c>`;
  if (typeof value === "boolean") return `<c r="${ref}" t="b"${s}><v>${value ? 1 : 0}</v></c>`;
  return `<c r="${ref}" t="inlineStr"${s}><is><t xml:space="preserve">${xmlEscape(value)}</t></is></c>`;
}

// Branded sheets: logos (row 1), title (2), brand line (3), gap (4), header (5).
const BRANDED_HEADER_ROW = 5;
const LOGO_ROW_PT = 34;

const printText = (s) => xmlEscape(String(s).replace(/&/g, "&&"));

/**
 * One worksheet. `brand` adds the identity block above the table (the
 * header row moves to row 5); `drawing` links the sheet to its logo drawing.
 */
export function sheetXml(rows, { brand = null, drawing = false } = {}) {
  const columns = [];
  rows.forEach((row) => Object.keys(row || {}).forEach((key) => !columns.includes(key) && columns.push(key)));
  const headerRow = brand ? BRANDED_HEADER_ROW : 1;
  const lines = [];
  if (brand) {
    lines.push(`<row r="1" ht="${LOGO_ROW_PT}" customHeight="1"/>`);
    lines.push(`<row r="2" ht="20" customHeight="1">${cellXml("A2", brand.title || "Export", STYLE.title)}</row>`);
    const sub = [brand.line, brand.generated && `Generated ${brand.generated}`, brand.subtitle].filter(Boolean).join(" · ");
    lines.push(`<row r="3">${cellXml("A3", sub, STYLE.subtitle)}</row>`);
  }
  lines.push(
    `<row r="${headerRow}">${columns.map((col, c) => cellXml(`${columnName(c)}${headerRow}`, col, brand ? STYLE.header : STYLE.bold)).join("")}</row>`
  );
  rows.forEach((row, r) => {
    const rowIndex = headerRow + 1 + r;
    lines.push(`<row r="${rowIndex}">${columns.map((col, c) => cellXml(`${columnName(c)}${rowIndex}`, row?.[col], STYLE.body)).join("")}</row>`);
  });
  const widths = columns
    .map((col, c) => {
      const longest = Math.max(String(col).length, ...rows.map((row) => String(row?.[col] ?? "").length));
      return `<col min="${c + 1}" max="${c + 1}" width="${Math.min(60, Math.max(brand ? 10 : 8, longest + 2))}" customWidth="1"/>`;
    })
    .join("");
  const lastRow = headerRow + rows.length;
  const filter = brand && columns.length ? `<autoFilter ref="A${headerRow}:${columnName(columns.length - 1)}${Math.max(lastRow, headerRow)}"/>` : "";
  const print = brand
    ? '<pageMargins left="0.4" right="0.4" top="0.6" bottom="0.6" header="0.25" footer="0.25"/>' +
      '<pageSetup orientation="landscape" fitToWidth="1" fitToHeight="0"/>' +
      `<headerFooter><oddHeader>&amp;L&amp;"Calibri,Bold"${printText(brand.line)}&amp;R${printText(brand.title || "")}</oddHeader>` +
      `<oddFooter>&amp;L${printText(brand.generated ? `Generated ${brand.generated}` : "")}&amp;RPage &amp;P of &amp;N</oddFooter></headerFooter>`
    : "";
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
    (brand ? '<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>' : "") +
    `<sheetViews><sheetView workbookViewId="0"${brand ? ' showGridLines="0"' : ""}><pane ySplit="${headerRow}" topLeftCell="A${headerRow + 1}" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>` +
    (widths ? `<cols>${widths}</cols>` : "") +
    `<sheetData>${lines.join("")}</sheetData>` +
    filter +
    print +
    (drawing ? '<drawing r:id="rId1"/>' : "") +
    "</worksheet>"
  );
}

// ── Logos (a drawing per sheet, the images shared) ───────────────────────────

const EMU_PER_PX = 9525;

/** Logos side by side in row 1: [{ media, width, height }] at a given pixel height each. */
const drawingXml = (logos) => {
  let x = 8;
  const pics = logos.map((logo, i) => {
    const h = logo.heightPx;
    const w = Math.round((logo.width / logo.height) * h);
    const y = Math.round((LOGO_ROW_PT * (96 / 72) - h) / 2);
    const xml =
      `<xdr:absoluteAnchor><xdr:pos x="${x * EMU_PER_PX}" y="${Math.max(2, y) * EMU_PER_PX}"/><xdr:ext cx="${w * EMU_PER_PX}" cy="${h * EMU_PER_PX}"/>` +
      `<xdr:pic><xdr:nvPicPr><xdr:cNvPr id="${i + 2}" name="${xmlEscape(logo.name)}" descr="${xmlEscape(logo.name)}"/><xdr:cNvPicPr><a:picLocks noChangeAspect="1"/></xdr:cNvPicPr></xdr:nvPicPr>` +
      `<xdr:blipFill><a:blip r:embed="rId${i + 1}"/><a:stretch><a:fillRect/></a:stretch></xdr:blipFill>` +
      `<xdr:spPr><a:xfrm><a:off x="${x * EMU_PER_PX}" y="${Math.max(2, y) * EMU_PER_PX}"/><a:ext cx="${w * EMU_PER_PX}" cy="${h * EMU_PER_PX}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr>` +
      "</xdr:pic><xdr:clientData/></xdr:absoluteAnchor>";
    x += w + 18;
    return xml;
  });
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
    pics.join("") +
    "</xdr:wsDr>"
  );
};

const STYLES_XML =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
  '<fonts count="5">' +
  '<font><sz val="11"/><name val="Calibri"/></font>' +
  '<font><b/><sz val="11"/><name val="Calibri"/></font>' +
  '<font><b/><sz val="14"/><color rgb="FF003057"/><name val="Calibri"/></font>' +
  '<font><sz val="9"/><color rgb="FF5D7F96"/><name val="Calibri"/></font>' +
  '<font><b/><sz val="11"/><color rgb="FF003057"/><name val="Calibri"/></font>' +
  "</fonts>" +
  '<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>' +
  '<fill><patternFill patternType="solid"><fgColor rgb="FFEAF1F7"/><bgColor indexed="64"/></patternFill></fill></fills>' +
  '<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border>' +
  '<border><left/><right/><top/><bottom style="thin"><color rgb="FFB9CCDB"/></bottom><diagonal/></border></borders>' +
  '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
  '<cellXfs count="5">' +
  '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
  '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
  '<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
  '<xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
  '<xf numFmtId="0" fontId="4" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"><alignment vertical="center" wrapText="1"/></xf>' +
  "</cellXfs>" +
  "</styleSheet>";

/**
 * The workbook as a Blob. `brand`: { title, subtitle, line, generated,
 * logos: [{ name, bytes (PNG), width, height, heightPx }] }.
 */
export async function buildXlsx(sheets, { brand = null } = {}) {
  const used = new Set();
  const entries = Object.entries(sheets || {}).map(([name, rows]) => [safeSheetName(name, used), Array.isArray(rows) ? rows : []]);
  if (!entries.length) entries.push(["Sheet1", []]);
  const logos = brand ? (brand.logos || []).filter((l) => l?.bytes?.length) : [];
  const drawing = logos.length > 0;
  const zip = new JSZip();
  zip.file(
    "[Content_Types].xml",
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      (drawing ? '<Default Extension="png" ContentType="image/png"/>' : "") +
      '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
      '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
      entries.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("") +
      (drawing ? entries.map((_, i) => `<Override PartName="/xl/drawings/drawing${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>`).join("") : "") +
      "</Types>"
  );
  zip.file(
    "_rels/.rels",
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
      "</Relationships>"
  );
  // Printing repeats each branded sheet's header row on every page.
  const printTitles = brand
    ? `<definedNames>${entries
        .map(([name], i) => `<definedName name="_xlnm.Print_Titles" localSheetId="${i}">'${xmlEscape(name.replace(/'/g, "''"))}'!$${BRANDED_HEADER_ROW}:$${BRANDED_HEADER_ROW}</definedName>`)
        .join("")}</definedNames>`
    : "";
  zip.file(
    "xl/workbook.xml",
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>' +
      entries.map(([name], i) => `<sheet name="${xmlEscape(name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("") +
      `</sheets>${printTitles}</workbook>`
  );
  zip.file(
    "xl/_rels/workbook.xml.rels",
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      entries.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("") +
      `<Relationship Id="rId${entries.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
      "</Relationships>"
  );
  zip.file("xl/styles.xml", STYLES_XML);
  entries.forEach(([, rows], i) => zip.file(`xl/worksheets/sheet${i + 1}.xml`, sheetXml(rows, { brand, drawing })));
  if (drawing) {
    logos.forEach((logo, k) => zip.file(`xl/media/image${k + 1}.png`, logo.bytes));
    const drawingRels =
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      logos.map((_, k) => `<Relationship Id="rId${k + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/image${k + 1}.png"/>`).join("") +
      "</Relationships>";
    const drawingBody = drawingXml(logos);
    entries.forEach((_, i) => {
      zip.file(
        `xl/worksheets/_rels/sheet${i + 1}.xml.rels`,
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
          '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
          `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing${i + 1}.xml"/>` +
          "</Relationships>"
      );
      zip.file(`xl/drawings/drawing${i + 1}.xml`, drawingBody);
      zip.file(`xl/drawings/_rels/drawing${i + 1}.xml.rels`, drawingRels);
    });
  }
  return zip.generateAsync({ type: "blob", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Every Excel export in the app goes through here: branded with SWIIMS ·
 * Utility Optimo (logos when they load). `title` names the report (default:
 * from the file name); `subtitle` adds context to the brand line.
 */
export async function exportSheetsToXlsx(sheets, filename, { title, subtitle } = {}) {
  const { BRAND, brandStamp, loadBrandAssets, titleFromFilename } = await import("./exportBranding.js");
  const assets = await loadBrandAssets();
  const { swiims, company } = assets.logos || {};
  const brand = {
    title: title || titleFromFilename(filename),
    subtitle,
    line: BRAND.line,
    generated: brandStamp(),
    logos: [
      swiims && { name: "SWIIMS", ...swiims, heightPx: 38 },
      company && { name: "Utility Optimo", ...company, heightPx: 24 },
    ].filter(Boolean),
  };
  const blob = await buildXlsx(sheets, { brand });
  downloadBlob(blob, filename.endsWith(".xlsx") ? filename : `${filename}.xlsx`);
}
