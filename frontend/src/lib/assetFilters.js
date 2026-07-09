// Pure helpers for the Asset Registry's client-side filtering, cascade-aware
// filter option lists, and per-category KPI aggregation. No React / no
// import.meta so these can be unit-tested with `node --test`.

const uniqSorted = (values) => [...new Set(values.filter(Boolean))].sort();

export function deriveFilterOptions(assets, { activity = "", assetType = "", region = "" } = {}) {
  const activities = uniqSorted(assets.map((a) => a.activity));

  const assetTypes = uniqSorted(
    assets
      .filter((a) => !activity || a.activity === activity)
      .map((a) => a.asset_type)
  );

  const regions = uniqSorted(
    assets
      .filter((a) => (!activity || a.activity === activity) && (!assetType || a.asset_type === assetType))
      .map((a) => a.region)
  );

  const governorates = region
    ? uniqSorted(
        assets
          .filter(
            (a) =>
              a.region === region &&
              (!activity || a.activity === activity) &&
              (!assetType || a.asset_type === assetType)
          )
          .map((a) => a.governorate)
          .filter((g) => g && g !== "NULL")
      )
    : [];

  return { activities, assetTypes, regions, governorates };
}

export function applyAssetFilters(assets, { activity = "", assetType = "", region = "", governorate = "", q = "" } = {}) {
  let data = assets;
  if (activity) data = data.filter((a) => a.activity === activity);
  if (assetType) data = data.filter((a) => a.asset_type === assetType);
  if (region) data = data.filter((a) => a.region === region);
  if (governorate) {
    const g = governorate.toLowerCase();
    data = data.filter((a) => (a.governorate || "").toLowerCase().includes(g));
  }
  if (q) {
    const term = q.toLowerCase();
    data = data.filter(
      (a) =>
        (a.name || "").toLowerCase().includes(term) ||
        (a.id || "").toLowerCase().includes(term) ||
        (a.region || "").toLowerCase().includes(term)
    );
  }
  return data;
}

const KPI_CATEGORIES = ["plant", "pump", "handover_point"];

export function computeCategoryKpis(assets) {
  const byCategory = {};
  const statusByCategory = {};
  for (const cat of KPI_CATEGORIES) {
    byCategory[cat] = 0;
    statusByCategory[cat] = {};
  }
  const totalStatus = {};
  for (const a of assets) {
    if (byCategory[a.category] == null) continue;
    byCategory[a.category] += 1;
    const st = a.status || "unknown";
    statusByCategory[a.category][st] = (statusByCategory[a.category][st] || 0) + 1;
    totalStatus[st] = (totalStatus[st] || 0) + 1;
  }
  const total = KPI_CATEGORIES.reduce((sum, cat) => sum + byCategory[cat], 0);
  return { byCategory, statusByCategory, total, totalStatus };
}
