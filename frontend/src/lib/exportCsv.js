// Hand-written CSV serializer for the filtered Asset Registry export.
// (papaparse is intentionally NOT a dependency.)

const COLUMNS = [
  ["generated_id", (a) => a.id || ""],
  ["name", (a) => a.name || a.asset_name_ar || ""],
  ["activity", (a) => a.activity || ""],
  ["asset_type", (a) => a.asset_type || ""],
  ["region", (a) => a.region || ""],
  ["governorate", (a) => (a.governorate && a.governorate !== "NULL" ? a.governorate : "")],
  ["status", (a) => a.status || ""],
];

// A cell that begins with a formula metacharacter (= + - @, or a leading tab
// or carriage return) can be executed as a formula when the CSV is opened in
// a spreadsheet, so prefix a single quote to neutralize it. Carriage return
// and newline also trigger quoting so a stray CR/LF can't inject a new row.
const FORMULA_LEAD = /^[=+\-@\t\r]/;

function escapeCell(value) {
  let s = String(value ?? "");
  if (FORMULA_LEAD.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function assetsToCsv(assets) {
  const header = COLUMNS.map(([name]) => name).join(",");
  const rows = assets.map((a) => COLUMNS.map(([, get]) => escapeCell(get(a))).join(","));
  return [header, ...rows].join("\n");
}

export function downloadCsv(filename, csv) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
