// Operations home: the numbers behind the charts, tables and KPIs.
//
// Pure functions over the approved production / demand ledgers
// (/api/{production,demand}/records: one entry per plant or city gate, each
// with its daily rows). Everything is computed client-side so the period and
// region controls respond instantly.

const DAY = 86_400_000;

// ── Regions ──────────────────────────────────────────────────────────────────
// Sources disagree (provinces on plants, broad regions on city gates), so
// everything is folded into the five operating regions.
const REGION_OF = {
  riyadh: "Central", qassim: "Central", central: "Central",
  "eastern province": "Eastern", eastern: "Eastern", "ash sharqiyah": "Eastern",
  makkah: "Western", mecca: "Western", madinah: "Western", medina: "Western", western: "Western",
  asir: "Southern", jizan: "Southern", jazan: "Southern", najran: "Southern", "al baha": "Southern", "al bahah": "Southern", southern: "Southern",
  tabuk: "Northern", hail: "Northern", "ha'il": "Northern", "al jouf": "Northern", "al jawf": "Northern", "northern borders": "Northern", northern: "Northern",
};

export const REGIONS = ["Central", "Eastern", "Western", "Southern", "Northern"];

export const normalizeRegion = (...candidates) => {
  for (const value of candidates) {
    const key = String(value ?? "").trim().toLowerCase();
    if (key && REGION_OF[key]) return REGION_OF[key];
  }
  return "Other";
};

// ── Dates and periods ────────────────────────────────────────────────────────
const toTime = (iso) => Date.parse(`${iso}T00:00:00Z`);
export const addDays = (iso, days) => new Date(toTime(iso) + days * DAY).toISOString().slice(0, 10);
export const daysBetween = (from, to) => Math.round((toTime(to) - toTime(from)) / DAY) + 1;

export const PERIOD_PRESETS = [
  { key: "7d", label: "7D", days: 7 },
  { key: "30d", label: "30D", days: 30 },
  { key: "90d", label: "90D", days: 90 },
  { key: "all", label: "All", days: null },
];

/** First and last dates with approved data in either ledger. */
export const dataBounds = (...ledgers) => {
  let first = null;
  let last = null;
  for (const ledger of ledgers) {
    for (const entry of ledger || []) {
      for (const row of entry.rows || []) {
        if (!first || row.date < first) first = row.date;
        if (!last || row.date > last) last = row.date;
      }
    }
  }
  return { first, last };
};

/**
 * The period to show, and the one before it (same length) for comparisons.
 * Presets count back from the latest data, not today: approved data lags.
 */
export const resolvePeriod = (period, bounds) => {
  if (!bounds.last) return null;
  let from;
  let to;
  if (period.key === "custom" && period.from && period.to) {
    from = period.from <= period.to ? period.from : period.to;
    to = period.from <= period.to ? period.to : period.from;
  } else {
    to = bounds.last;
    const preset = PERIOD_PRESETS.find((p) => p.key === period.key) || PERIOD_PRESETS[1];
    from = preset.days ? addDays(to, -(preset.days - 1)) : bounds.first;
  }
  const length = daysBetween(from, to);
  return { from, to, days: length, prevFrom: addDays(from, -length), prevTo: addDays(from, -1) };
};

const inRange = (date, from, to) => date >= from && date <= to;

// ── Filtering ────────────────────────────────────────────────────────────────
/** Ledger entries in a region ("all" keeps everything). */
export const byRegion = (ledger, region) =>
  (ledger || []).filter((entry) => region === "all" || normalizeRegion(entry.region) === region);

// ── Series ───────────────────────────────────────────────────────────────────
/**
 * One point per day: approved production, required demand, and the gap where
 * both were reported. A day a ledger didn't report stays null (not zero), so
 * the chart shows a hole rather than a false collapse.
 */
export const buildDailySeries = (production, demand, from, to) => {
  const sum = (ledger) => {
    const map = new Map();
    for (const entry of ledger) {
      for (const row of entry.rows || []) {
        if (!inRange(row.date, from, to)) continue;
        map.set(row.date, (map.get(row.date) || 0) + (Number(row.valueM3) || 0));
      }
    }
    return map;
  };
  const prod = sum(production);
  const dem = sum(demand);
  const capacity = production.reduce((total, entry) => total + (Number(entry.designCapacityM3) || 0), 0);
  const points = [];
  for (let date = from; date <= to; date = addDays(date, 1)) {
    const p = prod.has(date) ? prod.get(date) : null;
    const d = dem.has(date) ? dem.get(date) : null;
    points.push({
      date,
      production: p,
      demand: d,
      gap: p != null && d != null ? p - d : null,
      capacity: capacity || null,
    });
  }
  return points;
};

/** Trailing moving average of a series field (nulls skipped). */
export const movingAverage = (points, field, window = 7) =>
  points.map((point, index) => {
    const slice = points.slice(Math.max(0, index - window + 1), index + 1).map((p) => p[field]).filter((v) => v != null);
    return slice.length ? slice.reduce((a, b) => a + b, 0) / slice.length : null;
  });

// ── KPIs ─────────────────────────────────────────────────────────────────────
const totalsIn = (ledger, from, to) => {
  let total = 0;
  const days = new Set();
  for (const entry of ledger) {
    for (const row of entry.rows || []) {
      if (!inRange(row.date, from, to)) continue;
      total += Number(row.valueM3) || 0;
      days.add(row.date);
    }
  }
  return { total, days: days.size, avg: days.size ? total / days.size : 0 };
};

/** % change, or null when there's nothing to compare with. */
export const change = (current, previous) =>
  previous ? ((current - previous) / previous) * 100 : null;

export const buildKpis = (production, demand, period) => {
  const prod = totalsIn(production, period.from, period.to);
  const prodPrev = totalsIn(production, period.prevFrom, period.prevTo);
  const dem = totalsIn(demand, period.from, period.to);
  const demPrev = totalsIn(demand, period.prevFrom, period.prevTo);

  // Coverage only over days both ledgers reported (otherwise it's noise).
  const series = buildDailySeries(production, demand, period.from, period.to);
  const both = series.filter((p) => p.gap != null);
  const bothProd = both.reduce((a, p) => a + p.production, 0);
  const bothDem = both.reduce((a, p) => a + p.demand, 0);
  const deficitDays = both.filter((p) => p.gap < 0).length;

  // Utilization: approved output against design capacity, per reporting day.
  let used = 0;
  let cap = 0;
  const plantsReporting = new Set();
  for (const entry of production) {
    const capacity = Number(entry.designCapacityM3) || 0;
    for (const row of entry.rows || []) {
      if (!inRange(row.date, period.from, period.to)) continue;
      plantsReporting.add(entry.plantId);
      if (capacity) {
        used += Number(row.valueM3) || 0;
        cap += capacity;
      }
    }
  }

  return {
    production: { total: prod.total, avg: prod.avg, days: prod.days, change: change(prod.avg, prodPrev.avg) },
    demand: { total: dem.total, avg: dem.avg, days: dem.days, change: change(dem.avg, demPrev.avg) },
    coverage: {
      pct: bothDem ? (bothProd / bothDem) * 100 : null,
      days: both.length,
      deficitDays,
    },
    utilization: {
      pct: cap ? (used / cap) * 100 : null,
      plantsReporting: plantsReporting.size,
      plantsTotal: production.length,
    },
    sparks: {
      production: series.map((p) => p.production),
      demand: series.map((p) => p.demand),
    },
  };
};

// ── Tables ───────────────────────────────────────────────────────────────────
const entryStats = (entry, from, to) => {
  const rows = (entry.rows || []).filter((row) => inRange(row.date, from, to));
  const total = rows.reduce((a, row) => a + (Number(row.valueM3) || 0), 0);
  return { rows, total, avg: rows.length ? total / rows.length : 0 };
};

/** One row per plant / city gate: totals, utilization, change, daily values. */
export const buildEntityTable = (ledger, period) =>
  (ledger || []).map((entry) => {
    const now = entryStats(entry, period.from, period.to);
    const prev = entryStats(entry, period.prevFrom, period.prevTo);
    const capacity = Number(entry.designCapacityM3) || null;
    const peak = now.rows.reduce((a, row) => Math.max(a, Number(row.valueM3) || 0), 0);
    return {
      id: entry.plantId,
      name: entry.plantName || entry.plantId,
      region: normalizeRegion(entry.region),
      type: entry.assetType || "",
      days: now.rows.length,
      total: now.total,
      avg: now.avg,
      peak,
      capacity,
      utilization: capacity && now.rows.length ? (now.avg / capacity) * 100 : null,
      change: change(now.avg, prev.avg),
      spark: now.rows.map((row) => Number(row.valueM3) || 0),
      lastDate: now.rows.at(-1)?.date ?? null,
    };
  });

export const sortRows = (rows, key, direction = "desc") => {
  const sign = direction === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const x = a[key];
    const y = b[key];
    if (x == null && y == null) return 0;
    if (x == null) return 1; // blanks last either way
    if (y == null) return -1;
    if (typeof x === "string") return sign * x.localeCompare(y);
    return sign * (x - y);
  });
};

// ── Regions ──────────────────────────────────────────────────────────────────
/** Average daily production vs demand per region, for the period. */
export const buildRegionBreakdown = (production, demand, period) => {
  const out = new Map(REGIONS.map((region) => [region, { region, production: 0, demand: 0 }]));
  const add = (ledger, field) => {
    for (const entry of ledger) {
      const region = normalizeRegion(entry.region);
      if (!out.has(region)) out.set(region, { region, production: 0, demand: 0 });
      out.get(region)[field] += entryStats(entry, period.from, period.to).avg;
    }
  };
  add(production, "production");
  add(demand, "demand");
  return [...out.values()]
    .filter((row) => row.production || row.demand)
    .map((row) => ({ ...row, balance: row.production - row.demand }));
};

// ── A single day ─────────────────────────────────────────────────────────────
/** Who produced / needed what on one day (largest first). */
export const dayDetail = (production, demand, date) => {
  const pick = (ledger) =>
    ledger
      .map((entry) => ({ id: entry.plantId, name: entry.plantName || entry.plantId, value: (entry.rows || []).find((row) => row.date === date)?.valueM3 ?? null }))
      .filter((item) => item.value != null)
      .sort((a, b) => b.value - a.value);
  return { date, plants: pick(production), gates: pick(demand) };
};

// ── Activity ─────────────────────────────────────────────────────────────────
/**
 * Recent events, newest first: outages, simulation runs and approvals of
 * production / demand data (latest approval per plant or gate).
 */
export const buildActivity = ({ outages = [], runs = [], production = [], demand = [], limit = 12 }) => {
  const items = [];
  for (const outage of outages) {
    items.push({
      id: `outage-${outage.id}`,
      kind: "outage",
      at: outage.submittedAt || outage.eventTime || outage.start,
      title: `${outage.scope === "full" ? "Full" : "Partial"} outage · ${outage.assetName || outage.plantName || outage.assetId}`,
      detail: outage.description || outage.failureType || "",
      path: outage.assetKind === "plant" || outage.plantId ? `/production/${encodeURIComponent(outage.plantId || outage.assetId)}` : null,
    });
  }
  for (const run of runs) {
    items.push({
      id: `run-${run.id}`,
      kind: run.status === "published" ? "published" : "run",
      at: run.runAt,
      title: `${run.status === "published" ? "Published" : "Ran"} · ${run.name}`,
      detail: run.hasShortage ? "Shortfall in the plan" : "Plan meets demand",
      tone: run.hasShortage ? "warn" : "ok",
      path: run.configId ? `/simulation-config/${encodeURIComponent(run.configId)}` : "/simulation-config",
    });
  }
  const approvals = (ledger, label, base) => {
    for (const entry of ledger) {
      const latest = (entry.rows || []).filter((row) => row.approvedAt).sort((a, b) => String(b.approvedAt).localeCompare(String(a.approvedAt)))[0];
      if (!latest) continue;
      items.push({
        id: `approval-${base}-${entry.plantId}-${latest.date}`,
        kind: "approval",
        at: latest.approvedAt,
        title: `${label} approved · ${entry.plantName || entry.plantId}`,
        detail: `${latest.date}${latest.approvedBy ? ` · by ${latest.approvedBy}` : ""}`,
        path: `/${base}/${encodeURIComponent(entry.plantId)}`,
      });
    }
  };
  approvals(production, "Production", "production");
  approvals(demand, "Demand", "demand");
  return items
    .filter((item) => item.at && !Number.isNaN(Date.parse(item.at)))
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
    .slice(0, limit);
};
