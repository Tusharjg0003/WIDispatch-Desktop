import { format, parseISO, eachDayOfInterval, startOfDay } from "date-fns";
import { getContractedCapacityForDate, dayLoss } from "./productionCapacity.js";

const ACTIVE_MAINTENANCE = ["submitted", "under_revision", "revised", "approved"];

const responsibleUserRef = (r) => (r ? r.submitted_by || r.approved_by || null : null);
const submittedAtRef = (r) => (r ? r.submitted_at || r.created_at || null : null);

// Index production inputs for the plant by date (yyyy-MM-dd), preferring the
// most-recently-updated record per day.
function indexInputsByDate(productionInputs, plantId) {
  const map = new Map();
  productionInputs
    .filter((r) => !plantId || r.plant_id === plantId)
    .forEach((r) => {
      const existing = map.get(r.date);
      if (!existing || new Date(r.updated_at || r.created_at) > new Date(existing.updated_at || existing.created_at)) {
        map.set(r.date, r);
      }
    });
  return map;
}

export function buildProductionRows({
  plant, plantId, productionInputs, maintenanceRecords, outages, contractedCapacities,
  startDate, endDate,
}) {
  const s = startOfDay(startDate);
  const e = startOfDay(endDate);
  if (e < s) return [];
  const days = eachDayOfInterval({ start: s, end: e });
  const inputByDate = indexInputsByDate(productionInputs, plantId);

  const plantMaintenance = maintenanceRecords.filter(
    (m) => (!plantId || m.plant_id === plantId) && ACTIVE_MAINTENANCE.includes(m.submission_status),
  );
  const plantOutages = outages.filter(
    (o) => (!plantId || o.plant_id === plantId) && o.submission_status === "approved",
  );

  return days
    .map((day) => {
      const iso = format(day, "yyyy-MM-dd");
      const dayStart = startOfDay(day);
      const dayEnd = new Date(dayStart);
      dayEnd.setHours(23, 59, 59, 999);
      const contracted = getContractedCapacityForDate(plant, iso, contractedCapacities);

      const maintenanceLoss = plantMaintenance
        .filter((m) => parseISO(m.start_datetime) <= dayEnd && parseISO(m.end_datetime) >= dayStart)
        .reduce((sum, m) => sum + dayLoss(m, iso, contracted), 0);

      const outageLoss = plantOutages
        .filter((o) => {
          const os = parseISO(o.start_datetime);
          const oe = o.end_datetime ? parseISO(o.end_datetime) : new Date();
          return os <= dayEnd && oe >= dayStart;
        })
        .reduce((sum, o) => sum + dayLoss(o, iso, contracted), 0);

      const available = Math.max(0, contracted - maintenanceLoss - outageLoss);
      const variance = contracted - available;
      const input = inputByDate.get(iso);

      return {
        iso,
        input,
        contracted,
        maintenanceLoss,
        outageLoss,
        available,
        variance,
        requested: input?.required_m3 ?? null,
        requestedStatus: input?.required_m3 != null ? "allocated" : "pending",
        delivered: input?.actual_m3 ?? null,
        deliveredStatus: input?.submission_status ?? null,
        responsibleUser: responsibleUserRef(input),
        submittedAt: submittedAtRef(input),
        approvedAt: input?.approved_at ?? null,
      };
    })
    .reverse();
}

export function filterRows(rows, { deliveredStatus, requestedStatus }) {
  return rows.filter((r) => {
    if (deliveredStatus !== "all" && r.deliveredStatus !== deliveredStatus) return false;
    if (requestedStatus !== "all" && r.requestedStatus !== requestedStatus) return false;
    return true;
  });
}

export function computeTotals(rows) {
  const contracted = rows.reduce((s, r) => s + r.contracted, 0);
  const available = rows.reduce((s, r) => s + r.available, 0);
  const delivered = rows.reduce((s, r) => s + (r.delivered ?? 0), 0);
  const loss = rows.reduce((s, r) => s + r.maintenanceLoss + r.outageLoss, 0);
  const availabilityPct = contracted > 0 ? (available / contracted) * 100 : 0;
  return { contracted, available, delivered, loss, availabilityPct };
}
