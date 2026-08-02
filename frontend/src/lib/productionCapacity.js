// Contracted capacity effective on a date: latest effective_from ≤ date from the
// capacities array (newest-first), else the plant's static spec. Mirrors the
// production website's lib/capacity.ts.
export function getContractedCapacityForDate(plant, dateIso, capacities) {
  const rows = plant && capacities ? capacities : undefined;
  if (rows && rows.length) {
    const effective = rows.find((r) => r.effective_from <= dateIso) ?? rows[rows.length - 1];
    if (effective) return effective.value_m3;
  }
  if (!plant) return 0;
  const s = plant.specifications || {};
  return s.contracted_capacity ?? s.design_capacity ?? plant.capacity ?? 0;
}

// How many calendar days a record's window spans (at least 1).
export function recordDaySpan(record) {
  const start = record?.start_datetime;
  const end = record?.end_datetime;
  if (!start || !end) return 1;
  const from = Date.parse(String(start).slice(0, 10));
  const to = Date.parse(String(end).slice(0, 10));
  if (Number.isNaN(from) || Number.isNaN(to) || to < from) return 1;
  return Math.floor((to - from) / 86400000) + 1;
}

// Per-day loss for a maintenance/outage record: full outage removes the whole
// day's contracted capacity; otherwise use the day's daily_losses entry; legacy
// records fall back to their total loss field, spread across the window.
//
// `daily_losses` is checked for length, not just for being an array: the
// production website writes `daily_losses: daily_losses ?? []` on every update,
// so a legacy record re-saved there would otherwise derate by nothing at all.
// And the fallback fields are window totals, not daily rates, so applying one
// unchanged to every overlapping day multiplied the loss by the window length.
export function dayLoss(record, dateIso, contracted) {
  if (record.outage_scope === "full") return contracted;
  if (Array.isArray(record.daily_losses) && record.daily_losses.length) {
    const entry = record.daily_losses.find((d) => d.date === dateIso);
    return Number(entry?.loss_m3 || 0);
  }
  const total = Number(
    record.expected_loss_m3 ?? record.expected_impact_m3 ?? record.actual_loss_m3 ?? record.estimated_loss_m3 ?? 0,
  );
  return total / recordDaySpan(record);
}
