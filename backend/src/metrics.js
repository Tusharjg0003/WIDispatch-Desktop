import { getDb } from "./db.js";

const STALE_DAYS = Number(process.env.STALE_DAYS ?? 2);

const finite = (x) => (Number.isFinite(x) ? x : null);
const round1 = (x) => (x == null ? null : Math.round(x * 10) / 10);
const pct = (num, den) => (den > 0 ? round1((num / den) * 100) : null);

function designCapacity(plant) {
  return finite(plant?.specifications?.design_capacity);
}

/**
 * Domain configs. Production reports approved `actual_m3`; demand reports
 * approved `required_m3`. Both are grouped by plant and merged per date.
 * Capacity-derived metrics (utilization, headroom) only apply to production.
 */
export const DOMAINS = {
  production: {
    collection: "productionInputs",
    valueField: "actual_m3",
    // plant_id resolves to a production plant.
    groupCollection: "plants",
    hasHandover: true,
    capacityMetrics: true,
  },
  demand: {
    collection: "demandInputs",
    valueField: "required_m3",
    // plant_id here is a delivery point (city gate / handover point).
    groupCollection: "cityGates",
    hasHandover: false,
    capacityMetrics: false,
  },
};

async function getApprovedJoined(cfg, { from, to, plant } = {}) {
  const db = await getDb();

  const match = { submission_status: "approved" };
  if (from || to) {
    match.date = {};
    if (from) match.date.$gte = from;
    if (to) match.date.$lte = to;
  }
  if (plant) match.plant_id = plant;

  const pipeline = [
    { $match: match },
    {
      $lookup: {
        from: cfg.groupCollection,
        localField: "plant_id",
        foreignField: "id",
        as: "plant",
      },
    },
  ];
  if (cfg.hasHandover) {
    pipeline.push({
      $lookup: {
        from: "handover-points",
        localField: "handover_point_id",
        foreignField: "id",
        as: "hop",
      },
    });
  }
  pipeline.push(
    { $addFields: { plant: { $first: "$plant" }, hop: { $first: "$hop" } } },
    { $sort: { date: 1, plant_id: 1 } }
  );

  const rows = await db.collection(cfg.collection).aggregate(pipeline).toArray();

  const approverIds = [...new Set(rows.map((r) => r.approved_by).filter(Boolean))];
  const approverMap = new Map();
  if (approverIds.length) {
    const users = await db
      .collection("users")
      .find({}, { projection: { name: 1, email: 1 } })
      .toArray();
    for (const u of users) {
      approverMap.set(String(u._id), u.name || u.email || String(u._id));
    }
  }

  return rows.map((r) => ({
    ...r,
    approverName: approverMap.get(String(r.approved_by)) || null,
  }));
}

function isStale(latestDate) {
  if (!latestDate) return true;
  const last = new Date(latestDate + "T00:00:00Z").getTime();
  return (Date.now() - last) / 86_400_000 > STALE_DAYS;
}

/** Ledger grouped by plant; one merged row per date carrying the domain value. */
export async function buildRecords(domain, filters) {
  const cfg = DOMAINS[domain];
  const rows = await getApprovedJoined(cfg, filters);
  const plants = new Map();

  for (const r of rows) {
    const cap = designCapacity(r.plant);
    let plant = plants.get(r.plant_id);
    if (!plant) {
      plant = {
        plantId: r.plant_id,
        plantName: r.plant?.name ?? r.plant_id,
        region: r.plant?.region ?? null,
        assetType: r.plant?.asset_type ?? null,
        designCapacityM3: cfg.capacityMetrics ? cap : null,
        _byDate: new Map(),
      };
      plants.set(r.plant_id, plant);
    }

    let row = plant._byDate.get(r.date);
    if (!row) {
      row = { date: r.date, valueM3: 0, _hop: new Set(), approvedBy: null, approvedAt: null };
      plant._byDate.set(r.date, row);
    }
    row.valueM3 += finite(r[cfg.valueField]) ?? 0;
    if (cfg.hasHandover && (r.hop?.name || r.handover_point_id)) {
      row._hop.add(r.hop?.name ?? r.handover_point_id);
    }
    if (r.approved_at && (!row.approvedAt || r.approved_at > row.approvedAt)) {
      row.approvedAt = r.approved_at;
      row.approvedBy = r.approverName;
    }
  }

  return [...plants.values()].map((plant) => {
    const cap = plant.designCapacityM3;
    const dayRows = [...plant._byDate.values()]
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((row) => ({
        date: row.date,
        valueM3: row.valueM3,
        utilizationPct: cap ? round1((row.valueM3 / cap) * 100) : null,
        handoverPoints: [...row._hop],
        approvedBy: row.approvedBy,
        approvedAt: row.approvedAt,
      }));

    let total = 0;
    let peak = 0;
    let headroom = 0;
    for (const d of dayRows) {
      total += d.valueM3;
      if (d.valueM3 > peak) peak = d.valueM3;
      if (cap != null) headroom += Math.max(cap - d.valueM3, 0);
    }

    return {
      plantId: plant.plantId,
      plantName: plant.plantName,
      region: plant.region,
      assetType: plant.assetType,
      designCapacityM3: cap,
      totals: {
        days: dayRows.length,
        totalM3: total,
        avgDailyM3: dayRows.length ? Math.round(total / dayRows.length) : 0,
        peakM3: peak,
        utilizationPct: cap ? pct(total, cap * dayRows.length) : null,
        headroomM3: cap != null ? headroom : null,
      },
      rows: dayRows,
    };
  });
}

/** KPI block + breakdowns for a domain. */
export async function buildSummary(domain, filters) {
  const cfg = DOMAINS[domain];
  const rows = await getApprovedJoined(cfg, filters);
  const db = await getDb();

  let total = 0;
  let capValue = 0;
  let capDenom = 0;
  let headroom = 0;
  const dates = new Set();
  const plants = new Set();
  const dailyTotals = new Map(); // date -> summed value (for peak)
  const plantMap = new Map();
  const hopMap = new Map();

  for (const r of rows) {
    const val = finite(r[cfg.valueField]) ?? 0;
    const cap = designCapacity(r.plant);

    total += val;
    dates.add(r.date);
    plants.add(r.plant_id);
    dailyTotals.set(r.date, (dailyTotals.get(r.date) || 0) + val);

    if (cfg.capacityMetrics && cap != null) {
      capValue += val;
      capDenom += cap;
      headroom += Math.max(cap - val, 0);
    }

    const p = plantMap.get(r.plant_id) || {
      plantId: r.plant_id,
      plantName: r.plant?.name ?? r.plant_id,
      valueM3: 0,
    };
    p.valueM3 += val;
    plantMap.set(r.plant_id, p);

    if (cfg.hasHandover) {
      const key = r.handover_point_id;
      const h = hopMap.get(key) || {
        handoverPointId: key,
        name: r.hop?.name ?? key,
        valueM3: 0,
      };
      h.valueM3 += val;
      hopMap.set(key, h);
    }
  }

  const sortedDates = [...dates].sort();
  const latestDate = sortedDates.at(-1) ?? null;
  const peak = Math.max(0, ...dailyTotals.values());
  const plantsOperationalTotal = await db
    .collection("plants")
    .countDocuments({ status: "operational" });

  return {
    domain,
    range: { from: filters?.from ?? sortedDates[0] ?? null, to: filters?.to ?? latestDate },
    kpis: {
      totalM3: total,
      avgDailyM3: dates.size ? Math.round(total / dates.size) : 0,
      peakM3: peak,
      utilizationPct: cfg.capacityMetrics ? pct(capValue, capDenom) : null,
      headroomM3: cfg.capacityMetrics ? headroom : null,
      plantsReporting: plants.size,
      plantsOperationalTotal,
      days: dates.size,
      latestDate,
      isStale: isStale(latestDate),
    },
    byPlant: [...plantMap.values()],
    byHandoverPoint: [...hopMap.values()],
  };
}
