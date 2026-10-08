// KMZ / KML import review (SWIIMS "Review imported entity types"): features
// are grouped by KML folder, each group shows the detected canvas type and can
// be overridden before anything is placed.

import { classifyKmzPoint } from "../../lib/kmzEntityClassifier.js";

const NO_FOLDER = "__no_folder__";

export function buildKmzReviewRows(points = []) {
  const groups = new Map();
  points.forEach((point) => {
    const key = point.folder ? `folder:${point.folder}` : NO_FOLDER;
    const { type, source } = classifyKmzPoint(point);
    const group = groups.get(key) || { groupKey: key, label: point.folder || "No folder", fromFolder: Boolean(point.folder), count: 0, types: new Map(), sources: new Map(), sampleNames: [] };
    group.count += 1;
    group.types.set(type, (group.types.get(type) || 0) + 1);
    group.sources.set(source, (group.sources.get(source) || 0) + 1);
    if (group.sampleNames.length < 5 && point.name) group.sampleNames.push(point.name);
    groups.set(key, group);
  });
  const top = (map) => [...map.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  return [...groups.values()]
    .map((g) => ({
      groupKey: g.groupKey,
      label: g.label,
      fromFolder: g.fromFolder,
      count: g.count,
      detectedType: top(g.types) || "node",
      detectedSource: top(g.sources) || "default",
      mixed: g.types.size > 1,
      sampleNames: g.sampleNames,
      overrideType: "",
    }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

/** Points carrying `forcedType` where their group was overridden. */
export function applyKmzOverrides(points = [], rows = []) {
  const overrides = new Map(rows.filter((r) => r.overrideType).map((r) => [r.groupKey, r.overrideType]));
  if (!overrides.size) return points;
  return points.map((point) => {
    const key = point.folder ? `folder:${point.folder}` : NO_FOLDER;
    return overrides.has(key) ? { ...point, forcedType: overrides.get(key) } : point;
  });
}
