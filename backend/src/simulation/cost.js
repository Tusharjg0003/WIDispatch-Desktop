// Variable O&M (SAR/m³) resolution for the dispatch merit order.
//
// SWIIMS/WIPlan typed this into the Simulation Config plants table (default
// 2.10). Here it comes from the Economics portal instead: the effective-dated
// `financialEntries` collection, whose rows are scoped to a plant and carry
// `variable_om` in SAR/m³. Only approved rows count, matching every other
// portal read in this backend.
//
// Falling back to `plants.specifications.variable_om` matters because the two
// are separate systems today — the per-plant Financial Breakdown on the asset
// record is not linked to `financialEntries` (see the Asset Registry redesign
// design doc), and in practice only one of the two is usually populated.

const DEFAULT_VARIABLE_OM = 2.1; // SWIIMS' default, kept so a run is never blocked

const finite = (x) => {
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
};

/**
 * Index approved plant-scoped financial entries by plant id, newest effective
 * period first, so a per-day lookup is a linear scan of a short list.
 */
export function indexFinancialEntries(rows = []) {
  const byPlant = new Map();
  for (const row of rows) {
    if (row.submission_status !== "approved") continue;
    if (row.scope_type && row.scope_type !== "plant") continue;
    const plantId = row.scope_id;
    if (!plantId) continue;
    if (!byPlant.has(plantId)) byPlant.set(plantId, []);
    byPlant.get(plantId).push(row);
  }
  for (const list of byPlant.values()) {
    list.sort((a, b) => String(b.effective_start || "").localeCompare(String(a.effective_start || "")));
  }
  return byPlant;
}

/**
 * Variable O&M for a plant on a day, with provenance so the config table can
 * show the operator where the number came from.
 *
 * @returns {{ value:number, source:"economics"|"plant_spec"|"default" }}
 */
export function variableOmForDay(plantId, dateIso, financialIndex, plant) {
  const entries = financialIndex?.get(plantId) || [];
  for (const entry of entries) {
    const start = entry.effective_start ? String(entry.effective_start).slice(0, 10) : null;
    const end = entry.effective_end ? String(entry.effective_end).slice(0, 10) : null;
    if (start && dateIso < start) continue;
    if (end && dateIso > end) continue;
    const value = finite(entry.variable_om);
    if (value != null) return { value, source: "economics" };
  }

  const spec = finite(plant?.specifications?.variable_om);
  if (spec != null) return { value: spec, source: "plant_spec" };

  return { value: DEFAULT_VARIABLE_OM, source: "default" };
}

export { DEFAULT_VARIABLE_OM };
