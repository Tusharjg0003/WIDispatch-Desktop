// Per-day available capacity for the dispatch engine.
//
// The plant path mirrors frontend/src/lib/productionCapacity.js, which in turn
// mirrors the Production portal's own getEffectiveCapacityM3 (see
// WIDispatch-Production/app/api/production-inputs/route.ts). Keeping the three
// in step matters: the portal rejects a written `required_m3` that exceeds its
// own idea of effective capacity, so the engine must never allocate above this.
//
// The pump-station path mirrors the richer model in
// frontend/src/components/transmission/PumpStationCapacityChart.jsx — a station
// derates by the capacity of the pumps that are down, less whatever a standby
// substitute covers.
//
// Duplicating small pure helpers backend-side follows the existing precedent of
// backend/src/assetTypes.js vs frontend/src/lib/assetTypes.js.

// Maintenance counts against capacity from the moment it is submitted — an
// approved-only filter would let planned work vanish from the forecast.
export const ACTIVE_MAINTENANCE_STATUSES = ["submitted", "under_revision", "revised", "approved"];

const num = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

/** ISO date (YYYY-MM-DD) → [startOfDayIso, endOfDayIso]. */
export function dayBounds(dateIso) {
  return [`${dateIso}T00:00:00.000Z`, `${dateIso}T23:59:59.999Z`];
}

/** Does a record with start/end datetimes overlap the given day? */
export function overlapsDay(record, dateIso) {
  const start = record?.start_datetime;
  if (!start) return false;
  const [dayStart, dayEnd] = dayBounds(dateIso);
  const end = record.end_datetime || dayEnd; // open-ended records run to "now" and beyond
  return String(start) <= dayEnd && String(end) >= dayStart;
}

/**
 * Contracted capacity effective on a date: latest effective_from ≤ date from the
 * capacities array (expected newest-first), else the asset's static spec.
 */
export function getContractedCapacityForDate(asset, dateIso, capacities) {
  const rows = asset && capacities ? capacities : undefined;
  if (rows && rows.length) {
    const effective = rows.find((r) => r.effective_from <= dateIso) ?? rows[rows.length - 1];
    if (effective && effective.value_m3 != null) return num(effective.value_m3);
  }
  if (!asset) return 0;
  const s = asset.specifications || {};
  return num(s.contracted_capacity ?? s.design_capacity ?? asset.capacity ?? 0);
}

/** How many calendar days a record's window spans (at least 1). */
export function recordDaySpan(record) {
  const start = record?.start_datetime;
  const end = record?.end_datetime;
  if (!start || !end) return 1;
  const from = Date.parse(String(start).slice(0, 10));
  const to = Date.parse(String(end).slice(0, 10));
  if (Number.isNaN(from) || Number.isNaN(to) || to < from) return 1;
  return Math.floor((to - from) / 86400000) + 1;
}

/**
 * Per-day loss for a maintenance/outage record on a plant or city gate: a full
 * outage removes the whole day's contracted capacity; otherwise use the day's
 * daily_losses entry; legacy records fall back to their total loss field.
 *
 * Two subtleties, both learned from what the portals actually write:
 *
 * - `daily_losses` must be checked for length, not just for being an array. The
 *   Production API writes `daily_losses: daily_losses ?? []` on every update, so
 *   a legacy record re-saved through it ends up with an empty array. Treating
 *   that as authoritative would make the fallback unreachable and silently
 *   derate the plant by nothing, permanently.
 * - The fallback fields are the *window total*, not a daily rate (both portals
 *   compute them as a sum across the window). Returning the total unchanged for
 *   every overlapping day multiplied the loss by the window length, so it is
 *   spread evenly across the record's span instead.
 */
export function dayLoss(record, dateIso, contracted) {
  if (record.outage_scope === "full") return contracted;
  if (Array.isArray(record.daily_losses) && record.daily_losses.length) {
    const entry = record.daily_losses.find((d) => d.date === dateIso);
    return num(entry?.loss_m3);
  }
  const total = num(
    record.expected_loss_m3 ?? record.expected_impact_m3 ?? record.actual_loss_m3 ?? record.estimated_loss_m3 ?? 0,
  );
  return total / recordDaySpan(record);
}

// ── Pump stations ───────────────────────────────────────────────────────────
// Mirrors frontend/src/lib/pumpStation.js.

export function stationPumps(specifications) {
  if (Array.isArray(specifications?.pumps)) return specifications.pumps;
  return [
    ...(Array.isArray(specifications?.active_pumps) ? specifications.active_pumps : []),
    ...(Array.isArray(specifications?.standby_pumps) ? specifications.standby_pumps : []),
  ];
}

// `||` rather than `??` so a pump carrying `design_capacity: 0` alongside a real
// `capacity_m3_day` falls through instead of reading as zero. Matches the
// Transmission portal's own normalisation.
export function pumpCapacity(pump) {
  return num(pump?.design_capacity || pump?.capacity_m3_day || pump?.capacity);
}

export const isFunctionalPump = (pump) => ["active", "functional"].includes(String(pump?.role || "").toLowerCase());
export const isBackupPump = (pump) => ["standby", "backup"].includes(String(pump?.role || "").toLowerCase());

export function findPump(specifications, id) {
  return stationPumps(specifications).find((pump) => pump.id === id);
}

/** Pumps that actually contribute capacity: functional and not switched off. */
export function activeFunctionalPumps(specifications) {
  return stationPumps(specifications).filter((p) => isFunctionalPump(p) && p.active !== false);
}

/**
 * Station design capacity: the sum of active functional pumps, falling back to
 * the station-level figure when no pump list exists.
 *
 * The pump list wins because it is the one the Transmission portal maintains and
 * derates against — a station-level `design_capacity` is often a stale aggregate
 * left behind by migration. This ordering matches the portal's own
 * `totalDesignCapacity`; the reverse ordering made the simulation's base capacity
 * disagree with the portal's whenever the two drifted apart.
 */
export function totalDesignCapacity(specifications) {
  const pumps = activeFunctionalPumps(specifications);
  if (pumps.length) return pumps.reduce((sum, pump) => sum + pumpCapacity(pump), 0);
  return num(specifications?.design_capacity || specifications?.capacity_m3_day);
}

function substitutionMap(record) {
  const map = new Map();
  if (!Array.isArray(record?.substitutions)) return map;
  for (const s of record.substitutions) {
    if (s?.down_pump_id) map.set(s.down_pump_id, s.standby_pump_id);
  }
  return map;
}

/**
 * Capacity lost when `pumpIds` go down, netting off any standby that covers them.
 *
 * Only functional pumps count. The Transmission portal's maintenance form writes
 * every ticked pump into `pumps_under_maintenance` — including standby units,
 * which it labels "no capacity impact" and deliberately excludes from both its
 * own capacity reduction and from `substitutions`. Charging for them here would
 * overstate the derate.
 */
export function pumpReduction(record, specifications, pumpIds) {
  const substitutions = substitutionMap(record);
  return (pumpIds || []).reduce((sum, pumpId) => {
    const down = findPump(specifications, pumpId);
    if (!down || !isFunctionalPump(down)) return sum;
    const standbyId = substitutions.get(pumpId);
    const standby = standbyId ? findPump(specifications, standbyId) : null;
    return sum + Math.max(0, pumpCapacity(down) - pumpCapacity(standby));
  }, 0);
}

// ── The one entry point the engine uses ─────────────────────────────────────

/**
 * Available capacity (m³/day) for one asset on one day.
 *
 * @param {object} asset      plant / pump / cityGate document
 * @param {"plant"|"pump"|"handover_point"} kind
 * @param {string} dateIso    YYYY-MM-DD
 * @param {object} ctx
 * @param {object[]} ctx.maintenanceRecords  records for THIS asset
 * @param {object[]} ctx.outages             records for THIS asset
 * @param {object[]} [ctx.contractedCapacities] effective-dated rows for THIS asset
 * @param {Set<string>} [ctx.excludeMaintenanceIds] records to ignore (counterfactual runs)
 * @returns {{ base:number, maintenanceLoss:number, outageLoss:number, available:number, fullOutage:boolean }}
 */
export function availableForDay(asset, kind, dateIso, ctx = {}) {
  const {
    maintenanceRecords = [],
    outages = [],
    contractedCapacities = [],
    excludeMaintenanceIds,
  } = ctx;

  const isPump = kind === "pump";
  const base = isPump
    ? totalDesignCapacity(asset?.specifications)
    : getContractedCapacityForDate(asset, dateIso, contractedCapacities);

  const activeMaintenance = maintenanceRecords.filter(
    (r) =>
      ACTIVE_MAINTENANCE_STATUSES.includes(r.submission_status) &&
      overlapsDay(r, dateIso) &&
      !excludeMaintenanceIds?.has(String(r.id)),
  );
  const activeOutages = outages.filter((r) => r.submission_status === "approved" && overlapsDay(r, dateIso));

  if (isPump) {
    // A non-partial outage takes the whole station offline.
    const fullOutage = activeOutages.some((o) => o.outage_scope !== "partial");
    const spec = asset?.specifications;

    // For a pump station the pump list is authoritative: the loss is whichever
    // functional pumps are down, less whatever a standby covers. `daily_losses`
    // is only a fallback, because it is a snapshot the portal computed at
    // submission time and does not track later edits to the station's pumps.
    const outageLoss = activeOutages.reduce((sum, o) => {
      if (o.outage_scope !== "partial") return sum;
      if (Array.isArray(o.pumps_out) && o.pumps_out.length) {
        return sum + pumpReduction(o, spec, o.pumps_out);
      }
      return sum + dayLoss(o, dateIso, base);
    }, 0);

    const maintenanceLoss = activeMaintenance.reduce((sum, m) => {
      if (Array.isArray(m.pumps_under_maintenance) && m.pumps_under_maintenance.length) {
        return sum + pumpReduction(m, spec, m.pumps_under_maintenance);
      }
      return sum + dayLoss(m, dateIso, base);
    }, 0);

    return {
      base,
      maintenanceLoss,
      outageLoss,
      available: fullOutage ? 0 : Math.max(0, base - maintenanceLoss - outageLoss),
      fullOutage,
    };
  }

  const maintenanceLoss = activeMaintenance.reduce((sum, m) => sum + dayLoss(m, dateIso, base), 0);
  const outageLoss = activeOutages.reduce((sum, o) => sum + dayLoss(o, dateIso, base), 0);
  const fullOutage = activeOutages.some((o) => o.outage_scope === "full");

  return {
    base,
    maintenanceLoss,
    outageLoss,
    available: Math.max(0, base - maintenanceLoss - outageLoss),
    fullOutage,
  };
}

/** Inclusive list of ISO dates between two ISO dates. */
export function eachDay(fromIso, toIso) {
  const out = [];
  const end = new Date(`${toIso}T00:00:00.000Z`);
  for (let d = new Date(`${fromIso}T00:00:00.000Z`); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

/** Is an asset (or pipe) in service on a date, per its commissioning window? */
export function inServiceOn(commissioningDate, decommissioningDate, dateIso) {
  const commissioned = commissioningDate ? String(commissioningDate).slice(0, 10) : null;
  const decommissioned = decommissioningDate ? String(decommissioningDate).slice(0, 10) : null;
  if (commissioned && dateIso < commissioned) return false;
  if (decommissioned && dateIso >= decommissioned) return false;
  return true;
}
