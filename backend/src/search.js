import { listAssets } from "./assetRegistry.js";
import { listNetworks } from "./networks.js";
import { listSimulationConfigs } from "./simulationConfigs.js";

export const MODULE_RESULTS = [
  { type: "module", id: "home", title: "Operations", subtitle: "System command center", path: "/" },
  { type: "module", id: "production", title: "Production", subtitle: "Plants, output and quality", path: "/production" },
  { type: "module", id: "demand", title: "Demand", subtitle: "City gates and required volume", path: "/demand" },
  { type: "module", id: "transmission", title: "Transmission", subtitle: "Pump stations and transmission systems", path: "/transmission" },
  { type: "module", id: "economics", title: "Economics", subtitle: "Cost readiness and financial inputs", path: "/economics" },
  { type: "module", id: "network", title: "Network Builder", subtitle: "Build and validate topology", path: "/network-builder" },
  { type: "module", id: "simulation", title: "Simulation Config", subtitle: "Configure and review dispatch runs", path: "/simulation-config" },
  { type: "module", id: "registry", title: "Asset Registry", subtitle: "All registered assets", path: "/asset-registry" },
];

const searchable = (item) => [item.title, item.subtitle, item.id, item.status].filter(Boolean).join(" ").toLowerCase();

export function filterSearchResults(items, query, { types = [], limit = 20 } = {}) {
  const q = String(query || "").trim().toLowerCase();
  const allowed = new Set(types.filter(Boolean));
  const max = Math.min(Math.max(Number(limit) || 20, 1), 50);
  return items
    .filter((item) => !allowed.size || allowed.has(item.type))
    .filter((item) => !q || searchable(item).includes(q))
    .sort((a, b) => {
      const aTitle = a.title.toLowerCase();
      const bTitle = b.title.toLowerCase();
      const aExact = aTitle === q ? 0 : aTitle.startsWith(q) ? 1 : 2;
      const bExact = bTitle === q ? 0 : bTitle.startsWith(q) ? 1 : 2;
      return aExact - bExact || aTitle.localeCompare(bTitle);
    })
    .slice(0, max);
}

export async function searchWorkspace({ q = "", types = "", limit = 20 } = {}) {
  const requestedTypes = String(types || "").split(",").map((value) => value.trim()).filter(Boolean);
  const query = String(q || "").trim();
  const [assetResult, networkResult, configResult] = await Promise.allSettled([
    listAssets({ q: query || undefined, limit: 50 }),
    listNetworks(),
    listSimulationConfigs(),
  ]);

  const items = [...MODULE_RESULTS];
  if (assetResult.status === "fulfilled") {
    for (const asset of assetResult.value.assets || []) {
      items.push({
        type: "asset",
        id: asset.id,
        title: asset.name || asset.id,
        subtitle: [asset.asset_type || asset.category, asset.region, asset.entity].filter(Boolean).join(" · "),
        status: asset.status || null,
        path: `/asset-registry/view/${encodeURIComponent(asset.id)}`,
      });
    }
  }
  if (networkResult.status === "fulfilled") {
    for (const network of networkResult.value.networks || []) {
      items.push({
        type: "network",
        id: network.id,
        title: network.name || network.id,
        subtitle: `${network.nodeCount || 0} nodes · ${network.edgeCount || 0} pipes`,
        status: network.status || null,
        path: `/network-builder/${encodeURIComponent(network.id)}`,
      });
    }
  }
  if (configResult.status === "fulfilled") {
    for (const config of configResult.value.configs || []) {
      items.push({
        type: "simulation",
        id: config.id,
        title: config.name || config.id,
        subtitle: config.latestRunAt ? `Last run ${config.latestRunAt}` : "Not run yet",
        status: config.latestPlanId ? "ready" : "draft",
        path: `/simulation-config/${encodeURIComponent(config.id)}`,
      });
    }
  }

  return {
    query,
    results: filterSearchResults(items, query, { types: requestedTypes, limit }),
    partial: [assetResult, networkResult, configResult].some((result) => result.status === "rejected"),
  };
}
