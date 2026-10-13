// Hand-written CSV serializer for the filtered Asset Registry export.
// (papaparse is intentionally NOT a dependency.)

import { escapeCell } from "./csvCell.js";
import { brandCsv, titleFromFilename } from "./exportBranding.js";

const COLUMNS = [
  ["generated_id", (a) => a.id || ""],
  ["name", (a) => a.name || a.asset_name_ar || ""],
  ["activity", (a) => a.activity || ""],
  ["asset_type", (a) => a.asset_type || ""],
  ["region", (a) => a.region || ""],
  ["governorate", (a) => (a.governorate && a.governorate !== "NULL" ? a.governorate : "")],
  ["status", (a) => a.status || ""],
];

export function assetsToCsv(assets) {
  const header = COLUMNS.map(([name]) => name).join(",");
  const rows = assets.map((a) => COLUMNS.map(([, get]) => escapeCell(get(a))).join(","));
  return [header, ...rows].join("\n");
}

/**
 * Every CSV download in the app: SWIIMS · Utility Optimo on top and a UTF-8
 * byte-order mark, so Excel shows Arabic as Arabic (see brandCsv).
 */
export function downloadCsv(filename, csv, { title } = {}) {
  const blob = new Blob([brandCsv(csv, { title: title || titleFromFilename(filename) })], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.hidden = true;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}
