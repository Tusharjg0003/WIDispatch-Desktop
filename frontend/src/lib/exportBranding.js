// SWIIMS · Utility Optimo identity for every exported file (PDF, Excel, CSV),
// and the Wtt brand font for PDFs — it carries the Arabic script, which the
// PDF standard fonts don't, so Arabic names render instead of garbage.
//
// Brand assets are fetched from /public once per session and cached. Anything
// that can't load (no network, or tests under Node) is simply left out: the
// export still works, with text-only branding and the standard font.

export const BRAND = Object.freeze({
  product: "SWIIMS",
  company: "Utility Optimo",
  line: "SWIIMS · Utility Optimo",
});

const NAVY = [0, 48, 87];
const MUTED = [93, 127, 150];
const RULE = [214, 225, 234];

/** "13 Oct 2026, 15:30" */
export const brandStamp = (date = new Date()) =>
  date.toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

/** "asset-registry-2026-10-13.csv" → "Asset registry" */
export const titleFromFilename = (filename) => {
  const base = String(filename || "")
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/[-_]?\d{4}-\d{2}-\d{2}.*$/, "")
    .replace(/[-_]+/g, " ")
    .trim();
  return base ? base.charAt(0).toUpperCase() + base.slice(1) : "Export";
};

// ── CSV ──────────────────────────────────────────────────────────────────────

const BOM = "﻿";
const csvQuote = (s) => (/[",\r\n]/.test(s) ? `"${String(s).replace(/"/g, '""')}"` : String(s));

/**
 * A CSV with the brand on top and a UTF-8 byte-order mark, so Excel opens
 * Arabic (and "m³") as text rather than mojibake:
 *
 *   SWIIMS · Utility Optimo
 *   <Title>,Generated 13 Oct 2026, 15:30
 *   (blank)
 *   <the table>
 */
export const brandCsv = (csv, { title, date } = {}) => {
  const body = String(csv ?? "").replace(/^﻿/, "");
  const head = [csvQuote(BRAND.line), [csvQuote(title || "Export"), csvQuote(`Generated ${brandStamp(date)}`)].join(","), ""];
  return `${BOM}${head.join("\r\n")}\r\n${body}`;
};

// ── Assets (fonts, logos) ────────────────────────────────────────────────────

const toBase64 = (bytes) => {
  let s = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) s += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  return btoa(s);
};

const fetchBytes = async (url) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
};

/** The code points a TrueType font has glyphs for (cmap format 4 / 12). */
export const fontCoverage = (bytes) => {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const u16 = (o) => view.getUint16(o);
  const u32 = (o) => view.getUint32(o);
  let cmap = 0;
  for (let i = 0; i < u16(4); i += 1) {
    const rec = 12 + i * 16;
    if (String.fromCharCode(bytes[rec], bytes[rec + 1], bytes[rec + 2], bytes[rec + 3]) === "cmap") cmap = u32(rec + 8);
  }
  const covered = new Set();
  if (!cmap) return covered;
  for (let i = 0; i < u16(cmap + 2); i += 1) {
    const off = cmap + u32(cmap + 4 + i * 8 + 4);
    const format = u16(off);
    if (format === 4) {
      const segX2 = u16(off + 6);
      const ends = off + 14;
      const starts = ends + segX2 + 2;
      for (let s = 0; s < segX2 / 2; s += 1) {
        for (let c = u16(starts + s * 2); c <= u16(ends + s * 2) && c !== 0xffff; c += 1) covered.add(c);
      }
    } else if (format === 12) {
      for (let g = 0; g < u32(off + 12); g += 1) {
        const end = Math.min(u32(off + 20 + g * 12), 0x2ffff);
        for (let c = u32(off + 16 + g * 12); c <= end; c += 1) covered.add(c);
      }
    }
  }
  return covered;
};

// The SWIIMS mark is an SVG; PDFs and workbooks need a PNG. Drawn on a
// canvas and trimmed to its visible pixels.
const svgToPng = (url, width = 480) =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const ratio = img.naturalHeight && img.naturalWidth ? img.naturalHeight / img.naturalWidth : 0.5;
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = Math.round(width * ratio);
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
      let x1 = canvas.width;
      let y1 = canvas.height;
      let x2 = -1;
      let y2 = -1;
      for (let y = 0; y < canvas.height; y += 1) {
        for (let x = 0; x < canvas.width; x += 1) {
          if (data[(y * canvas.width + x) * 4 + 3] > 8) {
            if (x < x1) x1 = x;
            if (x > x2) x2 = x;
            if (y < y1) y1 = y;
            if (y > y2) y2 = y;
          }
        }
      }
      const out = document.createElement("canvas");
      const w = x2 >= x1 ? x2 - x1 + 1 : canvas.width;
      const h = y2 >= y1 ? y2 - y1 + 1 : canvas.height;
      out.width = w;
      out.height = h;
      out.getContext("2d").drawImage(canvas, x2 >= x1 ? x1 : 0, y2 >= y1 ? y1 : 0, w, h, 0, 0, w, h);
      out.toBlob(async (blob) => {
        if (!blob) return reject(new Error("PNG encoding failed"));
        resolve({ bytes: new Uint8Array(await blob.arrayBuffer()), width: w, height: h });
      }, "image/png");
    };
    img.onerror = () => reject(new Error(`Couldn't load ${url}`));
    img.src = url;
  });

const pngSize = (bytes) => {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { width: view.getUint32(16), height: view.getUint32(20) };
};

const settle = async (promise) => {
  try {
    return await promise;
  } catch {
    return null;
  }
};

let assetsPromise = null;

/**
 * { fonts: { regular, bold } (base64 TTF), coverage (Set of code points),
 *   logos: { swiims, company } ({ bytes, width, height, dataUrl }) } — any
 * part may be null when it couldn't load.
 */
export function loadBrandAssets() {
  if (!assetsPromise) {
    assetsPromise = (async () => {
      if (typeof window === "undefined" || typeof fetch !== "function") return { fonts: null, coverage: null, logos: {} };
      const [regular, bold, company, swiims] = await Promise.all([
        settle(fetchBytes("/fonts/Wtt-Regular.ttf")),
        settle(fetchBytes("/fonts/Wtt-Bold.ttf")),
        settle(fetchBytes("/utility-optimo-logo-light-bg.png")),
        settle(svgToPng("/swiims-widispatch-logo-color.svg")),
      ]);
      const withUrl = (logo) => (logo ? { ...logo, dataUrl: `data:image/png;base64,${toBase64(logo.bytes)}` } : null);
      return {
        fonts: regular && bold ? { regular: toBase64(regular), bold: toBase64(bold) } : null,
        coverage: regular ? fontCoverage(regular) : null,
        logos: {
          swiims: withUrl(swiims),
          company: withUrl(company ? { bytes: company, ...pngSize(company) } : null),
        },
      };
    })();
  }
  return assetsPromise;
}

// ── PDF ──────────────────────────────────────────────────────────────────────

const ARABIC = /[؀-ۿݐ-ݿﭐ-﷿ﹰ-﻿]/;
export const hasArabic = (text) => ARABIC.test(String(text ?? ""));

/**
 * Get a jsPDF document ready for branded output: embeds the Wtt font (normal
 * + bold) when it loads. Returns a small kit — `font` to pass to setFont, and
 * `text()` / `width()` that fall back to Helvetica for the few characters Wtt
 * lacks ("³", "→").
 */
export async function brandPdf(doc) {
  const assets = await loadBrandAssets();
  let font = "helvetica";
  if (assets.fonts) {
    try {
      doc.addFileToVFS("Wtt-Regular.ttf", assets.fonts.regular);
      doc.addFont("Wtt-Regular.ttf", "Wtt", "normal");
      doc.addFileToVFS("Wtt-Bold.ttf", assets.fonts.bold);
      doc.addFont("Wtt-Bold.ttf", "Wtt", "bold");
      font = "Wtt";
    } catch {
      font = "helvetica";
    }
  }
  const coverage = font === "Wtt" ? assets.coverage : null;
  const covered = (ch) => !coverage || coverage.has(ch.codePointAt(0)) || ch === " ";

  // Runs of characters Wtt has / lacks, left to right.
  const runs = (text) => {
    const out = [];
    for (const ch of String(text)) {
      const ok = covered(ch);
      if (out.length && out[out.length - 1].ok === ok) out[out.length - 1].s += ch;
      else out.push({ ok, s: ch });
    }
    return out;
  };
  const style = () => doc.getFont().fontStyle || "normal";
  const needsFallback = (text) => coverage && !hasArabic(text) && [...String(text)].some((ch) => !covered(ch));

  const width = (text) => {
    if (!needsFallback(text)) return doc.getTextWidth(String(text));
    const st = style();
    let w = 0;
    for (const run of runs(text)) {
      doc.setFont(run.ok ? font : "helvetica", st);
      w += doc.getTextWidth(run.s);
    }
    doc.setFont(font, st);
    return w;
  };

  /** doc.text, with { align: "right" } support across mixed-font runs. */
  const text = (value, x, y, options) => {
    const s = String(value ?? "");
    if (!needsFallback(s)) {
      doc.text(s, x, y, options);
      return;
    }
    const st = style();
    let cx = options?.align === "right" ? x - width(s) : options?.align === "center" ? x - width(s) / 2 : x;
    for (const run of runs(s)) {
      doc.setFont(run.ok ? font : "helvetica", st);
      doc.text(run.s, cx, y);
      cx += doc.getTextWidth(run.s);
    }
    doc.setFont(font, st);
  };

  doc.setFont(font, "normal");
  return { font, assets, text, width };
}

/**
 * The report header: SWIIMS logo on the left, Utility Optimo on the right,
 * the title under them and a hairline. Returns the y to continue from.
 */
export function drawPdfHeader(doc, kit, { title, lines = [], marginX = 32, top = 28 } = {}) {
  const pageW = doc.internal.pageSize.getWidth();
  const { swiims, company } = kit.assets.logos || {};
  const logoH = 30;
  let y = top;
  if (swiims) doc.addImage(swiims.dataUrl, "PNG", marginX, y, (swiims.width / swiims.height) * logoH, logoH);
  if (company) {
    const h = 20;
    const w = (company.width / company.height) * h;
    doc.addImage(company.dataUrl, "PNG", pageW - marginX - w, y + (logoH - h) / 2, w, h);
  }
  if (!swiims && !company) {
    doc.setFont(kit.font, "bold");
    doc.setFontSize(11);
    doc.setTextColor(...NAVY);
    kit.text(BRAND.line, marginX, y + 18);
  }
  y += logoH + 10;
  doc.setDrawColor(...RULE);
  doc.line(marginX, y, pageW - marginX, y);
  y += 22;

  doc.setFont(kit.font, "bold");
  doc.setFontSize(16);
  doc.setTextColor(...NAVY);
  kit.text(title, marginX, y);
  y += 16;
  doc.setFont(kit.font, "normal");
  doc.setFontSize(9);
  doc.setTextColor(...MUTED);
  [`${BRAND.line} · Generated ${brandStamp()}`, ...lines].forEach((line) => {
    doc.splitTextToSize(String(line), pageW - marginX * 2).forEach((l) => {
      kit.text(l, marginX, y);
      y += 12;
    });
  });
  return y + 6;
}

/** "SWIIMS · Utility Optimo · <title>" and "Page n of N" on every page. */
export function drawPdfFooters(doc, kit, { title, marginX = 32 } = {}) {
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p += 1) {
    doc.setPage(p);
    doc.setDrawColor(...RULE);
    doc.line(marginX, pageH - 28, pageW - marginX, pageH - 28);
    doc.setFont(kit.font, "normal");
    doc.setFontSize(8);
    doc.setTextColor(...MUTED);
    kit.text(`${BRAND.line}${title ? ` · ${title}` : ""}`, marginX, pageH - 16);
    kit.text(`Page ${p} of ${pages}`, pageW - marginX, pageH - 16, { align: "right" });
  }
}

/** Header space the page body must leave at the bottom for the footer. */
export const PDF_FOOTER_SPACE = 40;

const TABLE_INK = [33, 41, 54];
const TABLE_HEAD_BG = [234, 241, 247];
const TABLE_STRIPE = [248, 250, 252];

/**
 * A table that wraps long text inside its cells, repeats its header row on
 * each new page and right-aligns numbers (and Arabic text, which reads right
 * to left). `rows` are strings; `widths` (pt) fill the page width. Returns
 * the y below the table.
 */
export function renderPdfTable(doc, kit, { headers, rows, widths, numeric = [], y, marginX = 32, top = 40, bottom, fontSize = 8 }) {
  const available = widths.reduce((s, w) => s + w, 0);
  const xs = widths.reduce((acc, w, i) => [...acc, acc[i] + w], [marginX]);
  const lineH = fontSize + 2.5;
  const padX = 4;
  const padY = 4;
  const end = bottom ?? doc.internal.pageSize.getHeight() - PDF_FOOTER_SPACE;
  let cy = y;
  doc.setFontSize(fontSize);
  const wrap = (value, i) => doc.splitTextToSize(String(value ?? ""), Math.max(8, widths[i] - padX * 2));
  const put = (lines, i, rowTop, rightAlign) => {
    lines.forEach((l, k) => {
      const tx = rightAlign ? xs[i] + widths[i] - padX : xs[i] + padX;
      kit.text(l, tx, rowTop + padY + fontSize + k * lineH - 1, rightAlign ? { align: "right" } : undefined);
    });
  };

  const header = () => {
    doc.setFont(kit.font, "bold");
    const cells = headers.map((h, i) => wrap(h, i));
    const h = Math.max(1, ...cells.map((l) => l.length)) * lineH + padY * 2;
    doc.setFillColor(...TABLE_HEAD_BG);
    doc.rect(marginX, cy, available, h, "F");
    doc.setTextColor(...NAVY);
    cells.forEach((lines, i) => put(lines, i, cy, numeric[i]));
    doc.setDrawColor(...RULE);
    doc.line(marginX, cy + h, marginX + available, cy + h);
    cy += h;
    doc.setFont(kit.font, "normal");
  };

  header();
  rows.forEach((row, r) => {
    const cells = row.map((v, i) => wrap(v, i));
    const h = Math.max(1, ...cells.map((l) => l.length)) * lineH + padY * 2;
    if (cy + h > end) {
      doc.addPage();
      cy = top;
      header();
    }
    if (r % 2 === 1) {
      doc.setFillColor(...TABLE_STRIPE);
      doc.rect(marginX, cy, available, h, "F");
    }
    doc.setTextColor(...TABLE_INK);
    cells.forEach((lines, i) => put(lines, i, cy, numeric[i] || hasArabic(row[i])));
    doc.setDrawColor(...RULE);
    doc.line(marginX, cy + h, marginX + available, cy + h);
    cy += h;
  });
  return cy;
}
