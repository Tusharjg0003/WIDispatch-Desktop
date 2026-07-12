import { format, parseISO, startOfDay, subDays, addDays, eachDayOfInterval } from "date-fns";

const ACTIVE_MAINTENANCE = ["submitted", "under_revision", "revised", "approved"];

function statusPriority(status) {
  switch (status) {
    case "approved": return 6;
    case "adjusted":
    case "conditional": return 5;
    case "submitted":
    case "revised": return 4;
    case "under_revision": return 3;
    case "draft": return 2;
    case "rejected":
    case "shortfall":
    case "postponed": return 1;
    default: return 0;
  }
}
const pickStatus = (cur, next) => (statusPriority(next) >= statusPriority(cur) ? next ?? cur ?? null : cur ?? null);

export function buildCapacityChartData({
  plantId, productionInputs, qualityRecords, outages, maintenanceRecords, contractedCapacity,
}) {
  const today = startOfDay(new Date());
  const gridStart = subDays(today, 30);
  const gridEnd = addDays(today, 30);

  const byDate = new Map();
  const plantProduction = plantId ? productionInputs.filter((p) => p.plant_id === plantId) : productionInputs;

  plantProduction.forEach((record) => {
    const isoDate = record.date;
    const existing = byDate.get(isoDate) || { actual: 0, required: null, actualStatus: null, requiredStatus: null, availableCapacity: null };
    existing.actual += record.actual_m3 || 0;
    if (record.actual_m3 != null) existing.actualStatus = pickStatus(existing.actualStatus, record.submission_status);
    if (record.available_capacity_m3 != null) existing.availableCapacity = Math.max(existing.availableCapacity ?? 0, record.available_capacity_m3);
    byDate.set(isoDate, existing);

    if (record.required_m3 != null) {
      if (record.end_date && record.end_date > record.date) {
        const rangeDays = eachDayOfInterval({ start: parseISO(record.date), end: parseISO(record.end_date) });
        rangeDays.forEach((day) => {
          const dayIso = format(day, "yyyy-MM-dd");
          const dayEntry = byDate.get(dayIso) || { actual: 0, required: null, actualStatus: null, requiredStatus: null, availableCapacity: null };
          dayEntry.required = (dayEntry.required ?? 0) + record.required_m3;
          dayEntry.requiredStatus = pickStatus(dayEntry.requiredStatus, record.desktop_decision_status || record.submission_status);
          byDate.set(dayIso, dayEntry);
        });
      } else {
        existing.required = (existing.required ?? 0) + record.required_m3;
        existing.requiredStatus = pickStatus(existing.requiredStatus, record.desktop_decision_status || record.submission_status);
        byDate.set(isoDate, existing);
      }
    }
  });

  const outOfSpecDates = new Set();
  if (plantId) {
    qualityRecords.forEach((q) => {
      if (q.plant_id !== plantId || q.compliance_flag !== "out_of_spec") return;
      outOfSpecDates.add(format(parseISO(q.sampling_datetime), "yyyy-MM-dd"));
    });
  }

  return eachDayOfInterval({ start: gridStart, end: gridEnd }).map((day) => {
    const isoDate = format(day, "yyyy-MM-dd");
    const record = byDate.get(isoDate);
    const isPast = day <= today;

    let outageLoss = 0, maintenanceLoss = 0, outageIsActual = false;

    if (plantId && contractedCapacity) {
      const dateStart = startOfDay(day);
      const dateEnd = new Date(dateStart);
      dateEnd.setHours(23, 59, 59, 999);

      const matchingOutages = outages.filter((o) => {
        if (o.plant_id !== plantId || o.submission_status !== "approved") return false;
        const s = parseISO(o.start_datetime);
        const e = o.end_datetime ? parseISO(o.end_datetime) : new Date();
        return s <= dateEnd && e >= dateStart;
      });
      const matchingMaintenance = maintenanceRecords.filter((m) => {
        if (m.plant_id !== plantId || !ACTIVE_MAINTENANCE.includes(m.submission_status)) return false;
        const s = parseISO(m.start_datetime);
        const e = parseISO(m.end_datetime);
        return s <= dateEnd && e >= dateStart;
      });

      const loss = (rec) => {
        if (rec.outage_scope === "full") return contractedCapacity;
        if (Array.isArray(rec.daily_losses)) {
          const entry = rec.daily_losses.find((d) => d.date === isoDate);
          return Number(entry?.loss_m3 || 0);
        }
        return Number(rec.expected_loss_m3 ?? rec.expected_impact_m3 ?? rec.actual_loss_m3 ?? rec.estimated_loss_m3 ?? 0);
      };

      outageIsActual = matchingOutages.some((o) => o.actual_loss_m3 && o.actual_loss_m3 > 0);
      outageLoss = matchingOutages.reduce((sum, o) => sum + loss(o), 0);
      maintenanceLoss = matchingMaintenance.reduce((sum, m) => sum + loss(m), 0);
    }

    const totalLoss = outageLoss + maintenanceLoss;
    const submittedAvailableCapacity = record?.availableCapacity ?? undefined;
    const effectiveCapacityRaw = submittedAvailableCapacity ?? (contractedCapacity != null ? contractedCapacity - totalLoss : undefined);
    const effectiveCapacity = effectiveCapacityRaw != null ? Math.max(0, effectiveCapacityRaw) : undefined;
    const capacityLost = contractedCapacity != null && effectiveCapacity != null ? Math.max(0, contractedCapacity - effectiveCapacity) : 0;

    const actual = isPast && record ? Math.round(record.actual) : null;
    const required = record?.required != null ? Math.round(record.required) : null;
    const actualStatus = actual !== null ? record?.actualStatus ?? null : null;
    const requiredStatus = required !== null ? record?.requiredStatus ?? null : null;

    const hasQualityIssue = outOfSpecDates.has(isoDate);
    const qualityMarker = hasQualityIssue ? (actual ?? required ?? contractedCapacity ?? 0) : null;

    return {
      date: format(day, "MMM dd"),
      isoDate,
      actual, required, actualStatus, requiredStatus,
      contractedCapacity: contractedCapacity ?? undefined,
      availableCapacity: submittedAvailableCapacity,
      effectiveCapacity, capacityLost, outageLoss, outageIsActual, maintenanceLoss,
      qualityMarker, isFuture: day > today,
    };
  });
}
