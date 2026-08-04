// Effective-dated cost parameters for a plant.
//
// Rows come from the `financialEntries` collection, newest effective period
// first. "Current" means the newest row whose effective window covers the given
// day, regardless of submission status — the Financial tab shows operators the
// latest numbers on file, including drafts and entries still awaiting approval.
// (The dispatch simulation is stricter: it prices plants off approved rows only.)

import { toCsv } from "./csvCell.js";

const FIELDS = ["ccr", "fixedOm", "variableOm", "capex"];

export function isEffectiveOn(entry, dateIso) {
  if (entry.effectiveFrom && dateIso < entry.effectiveFrom) return false;
  if (entry.effectiveTo && dateIso > entry.effectiveTo) return false;
  return true;
}

/**
 * Current CCR / Fixed O&M / Variable O&M / CAPEX, each resolved independently
 * so a newer entry that only changed one parameter doesn't blank the others.
 *
 * @returns {{ ccr:number|null, fixedOm:number|null, variableOm:number|null, capex:number|null, effectiveFrom:string|null }}
 */
export function currentFinancials(entries = [], dateIso = new Date().toISOString().slice(0, 10)) {
  const active = entries
    .filter((e) => isEffectiveOn(e, dateIso))
    .sort((a, b) => String(b.effectiveFrom || "").localeCompare(String(a.effectiveFrom || "")));

  const result = { effectiveFrom: active[0]?.effectiveFrom ?? null };
  for (const field of FIELDS) {
    result[field] = active.find((e) => e[field] != null)?.[field] ?? null;
  }
  return result;
}

const LABELS = { ccr: "CCR", fixedOm: "Fixed O&M", variableOm: "Variable O&M", capex: "CAPEX", lifetime: "Lifetime" };

const CSV_HEADERS = ["Effective From", "Changed", "CCR", "Fixed O&M", "Variable O&M", "CAPEX", "Lifetime (yrs)", "Status"];

// Raw numbers, no thousands separators — the table's display formatting would
// break a spreadsheet's number parsing.
export function financialEntriesToCsv(entries = []) {
  const body = entries.map((e) => [
    e.effectiveFrom ?? "",
    changedLabels(e.changedFields).join(" | ") || "Baseline",
    e.ccr ?? "",
    e.fixedOm ?? "",
    e.variableOm ?? "",
    e.capex ?? "",
    e.lifetime ?? "",
    e.status ?? "",
  ]);
  return toCsv(CSV_HEADERS, body);
}

// `changed_fields` is stored in the collection's snake_case field names.
export function changedLabels(changedFields = []) {
  return changedFields.map((f) => {
    const key = String(f).replace(/_([a-z])/g, (_, c) => c.toUpperCase());
    return LABELS[key] || f;
  });
}
