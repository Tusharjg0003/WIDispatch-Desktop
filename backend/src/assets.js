export const finite = (x) => (Number.isFinite(x) ? x : null);

// Build a date match for either a `date` (YYYY-MM-DD) or a datetime field.
export function dateMatch(field, { from, to } = {}, isDatetime = false) {
  if (!from && !to) return {};
  const cond = {};
  if (from) cond.$gte = from;
  if (to) cond.$lte = isDatetime ? `${to}T23:59:59.999Z` : to;
  return { [field]: cond };
}

// Records can reference any asset type, so resolve names across all of them.
const ASSET_NAME_COLLECTIONS = ["plants", "pumps", "valves", "pipelines", "cityGates"];

export async function resolveAssetNames(db, ids) {
  const unique = [...new Set(ids.filter(Boolean))];
  const map = new Map();
  if (!unique.length) return map;
  for (const coll of ASSET_NAME_COLLECTIONS) {
    const remaining = unique.filter((id) => !map.has(id));
    if (!remaining.length) break;
    const docs = await db
      .collection(coll)
      .find({ id: { $in: remaining } }, { projection: { id: 1, name: 1, region: 1 } })
      .toArray();
    for (const d of docs) map.set(d.id, { name: d.name, region: d.region });
  }
  return map;
}
