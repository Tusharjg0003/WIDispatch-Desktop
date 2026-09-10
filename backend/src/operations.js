import { getDb } from "./db.js";
import { buildSummary } from "./metrics.js";
import { buildTransmission } from "./transmission.js";
import { buildEconomics } from "./economics.js";
import { listRecentOutages } from "./production.js";

const dayIso = (value = new Date()) => {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
};

const finite = (value) => (Number.isFinite(Number(value)) ? Number(value) : 0);

export function summarizePlan(plan) {
  if (!plan) return null;
  const kpis = plan.kpis || {};
  const shortageM3 = finite(kpis.totalShortageM3 ?? plan.totalShortageM3);
  return {
    id: plan.id,
    configId: plan.configId ?? null,
    name: plan.configName || plan.name || "Dispatch run",
    status: plan.status || "draft",
    runAt: plan.runAt ?? plan.updatedAt ?? null,
    from: plan.from ?? null,
    to: plan.to ?? null,
    requiredM3: finite(kpis.totalRequiredM3 ?? plan.totalRequiredM3),
    deliveredM3: finite(kpis.totalDeliveredM3 ?? plan.totalDeliveredM3),
    shortageM3,
    hasShortage: shortageM3 > 0,
  };
}

export function buildOverviewSnapshot({
  requestedDate,
  production,
  demand,
  transmission,
  economics,
  outages = [],
  plans = [],
  pending = {},
  warnings = [],
  generatedAt = new Date().toISOString(),
}) {
  const supplyKpis = production?.kpis || {};
  const demandKpis = demand?.kpis || {};
  const transmissionKpis = transmission?.kpis || {};
  const latestPlan = plans[0] || null;
  const deliveredM3 = latestPlan?.deliveredM3 || finite(supplyKpis.totalM3);
  const requiredM3 = latestPlan?.requiredM3 || finite(demandKpis.totalM3);
  const shortageM3 = latestPlan?.shortageM3 || Math.max(requiredM3 - deliveredM3, 0);

  const exceptions = [];
  if (shortageM3 > 0) {
    exceptions.push({
      id: "supply-shortage",
      tone: "critical",
      title: "Supply shortfall",
      detail: `${Math.round(shortageM3).toLocaleString("en-US")} m³ remains unmet in the latest dispatch run.`,
      path: latestPlan?.id ? `/simulation-config/${encodeURIComponent(latestPlan.configId || "")}` : "/simulation-config",
    });
  }
  if (supplyKpis.isStale) {
    exceptions.push({
      id: "production-stale",
      tone: "warning",
      title: "Production data needs attention",
      detail: supplyKpis.latestDate ? `Latest approved production data is ${supplyKpis.latestDate}.` : "No approved production data is available.",
      path: "/production",
    });
  }
  if (demandKpis.isStale) {
    exceptions.push({
      id: "demand-stale",
      tone: "warning",
      title: "Demand data needs attention",
      detail: demandKpis.latestDate ? `Latest approved demand data is ${demandKpis.latestDate}.` : "No approved demand data is available.",
      path: "/demand",
    });
  }
  for (const outage of outages.slice(0, 4)) {
    exceptions.push({
      id: `outage-${outage.id}`,
      tone: outage.scope === "full" ? "critical" : "warning",
      title: `${outage.assetName || "Asset"} outage`,
      detail: outage.description || `${outage.failureType || "Outage"} · ${outage.scope || "full"}`,
      path: outage.assetKind === "pumpStation"
        ? `/transmission/${encodeURIComponent(outage.assetId || "")}`
        : `/production/${encodeURIComponent(outage.assetId || "")}`,
    });
  }

  return {
    generatedAt,
    requestedDate: requestedDate || null,
    supply: {
      dataDate: supplyKpis.latestDate ?? null,
      actualM3: finite(supplyKpis.totalM3),
      availableM3: finite(supplyKpis.totalM3) + finite(supplyKpis.headroomM3),
      headroomM3: finite(supplyKpis.headroomM3),
      utilizationPct: supplyKpis.utilizationPct ?? null,
      reporting: finite(supplyKpis.plantsReporting),
      operational: finite(supplyKpis.plantsOperationalTotal),
      isStale: Boolean(supplyKpis.isStale),
    },
    demand: {
      dataDate: demandKpis.latestDate ?? null,
      requiredM3,
      deliveredM3,
      shortageM3,
      reporting: finite(demandKpis.plantsReporting),
      isStale: Boolean(demandKpis.isStale),
    },
    transmission: {
      requiredProductionM3: finite(transmissionKpis.requiredProductionM3),
      outageLossM3: finite(transmissionKpis.outageLossM3),
      maintenanceImpactM3: finite(transmissionKpis.maintenanceImpactM3),
      operationalAssets: finite(transmissionKpis.assetsOperational),
      totalAssets: finite(transmissionKpis.assetsTotal),
      assetsInMaintenance: finite(transmissionKpis.assetsInMaintenance),
    },
    economics: {
      approvedEntries: finite(economics?.kpis?.entries),
      variableOmTotal: finite(economics?.kpis?.totalVariableOm),
    },
    pending: {
      maintenance: finite(pending.maintenance),
      demand: finite(pending.demand),
      draftPlans: finite(pending.draftPlans),
      total: finite(pending.maintenance) + finite(pending.demand) + finite(pending.draftPlans),
    },
    latestPlan,
    recentRuns: plans,
    exceptions,
    warnings,
  };
}

async function latestDomainSummary(domain, requestedDate) {
  if (requestedDate) return buildSummary(domain, { from: requestedDate, to: requestedDate });
  const discovery = await buildSummary(domain);
  const latest = discovery?.kpis?.latestDate;
  return latest ? buildSummary(domain, { from: latest, to: latest }) : discovery;
}

async function readOperationsMetadata() {
  const db = await getDb();
  const undecided = { $or: [{ desktop_approval_status: { $exists: false } }, { desktop_approval_status: null }] };
  const [rawPlans, maintenance, demand, draftPlans] = await Promise.all([
    db.collection("dispatchPlans")
      .find({}, { projection: { _id: 0, id: 1, configId: 1, configName: 1, status: 1, runAt: 1, updatedAt: 1, from: 1, to: 1, kpis: 1, totalRequiredM3: 1, totalDeliveredM3: 1, totalShortageM3: 1 } })
      .sort({ runAt: -1 })
      .limit(6)
      .toArray(),
    db.collection("maintenanceRecords").countDocuments({ submission_status: "approved", ...undecided }),
    db.collection("demandInputs").countDocuments({ submission_status: "approved", ...undecided }),
    db.collection("dispatchPlans").countDocuments({ status: "draft" }),
  ]);
  return {
    plans: rawPlans.map(summarizePlan),
    pending: { maintenance, demand, draftPlans },
  };
}

export async function getOperationsOverview({ date } = {}) {
  const requestedDate = date ? dayIso(date) : null;
  if (date && !requestedDate) {
    const error = new Error("date must be a valid YYYY-MM-DD value");
    error.statusCode = 400;
    throw error;
  }

  const tasks = {
    production: latestDomainSummary("production", requestedDate),
    demand: latestDomainSummary("demand", requestedDate),
    transmission: buildTransmission(requestedDate ? { from: requestedDate, to: requestedDate } : {}),
    economics: buildEconomics(),
    outages: listRecentOutages({ limit: 6 }),
    metadata: readOperationsMetadata(),
  };
  const entries = await Promise.all(Object.entries(tasks).map(async ([key, promise]) => {
    try {
      return [key, await promise, null];
    } catch (error) {
      return [key, null, error];
    }
  }));

  const data = {};
  const warnings = [];
  for (const [key, value, error] of entries) {
    data[key] = value;
    if (error) warnings.push({ source: key, message: "This data source is temporarily unavailable." });
  }

  return buildOverviewSnapshot({
    requestedDate,
    production: data.production,
    demand: data.demand,
    transmission: data.transmission,
    economics: data.economics,
    outages: data.outages || [],
    plans: data.metadata?.plans || [],
    pending: data.metadata?.pending || {},
    warnings,
  });
}

