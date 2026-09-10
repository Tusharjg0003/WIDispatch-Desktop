import { escapeCell } from "./csvCell.js";

export function parseHiddenColumns(value, allowedKeys) {
  const allowed = new Set(allowedKeys);
  return new Set(String(value || "").split(",").filter((key) => allowed.has(key)));
}

export function toggleHiddenColumn(hiddenColumns, key, allowedKeys) {
  const hidden = new Set(hiddenColumns);
  if (hidden.has(key)) hidden.delete(key);
  else hidden.add(key);

  const visibleCount = allowedKeys.filter((columnKey) => !hidden.has(columnKey)).length;
  if (visibleCount === 0) hidden.delete(key);
  return hidden;
}

export function hiddenColumnsParam(hiddenColumns, allowedKeys) {
  return allowedKeys.filter((key) => hiddenColumns.has(key)).join(",");
}

export function recordsToCsv(records, columns) {
  const header = columns.map((column) => escapeCell(column.label)).join(",");
  const rows = records.map((record) => columns.map((column) => escapeCell(column.get(record))).join(","));
  return [header, ...rows].join("\n");
}
