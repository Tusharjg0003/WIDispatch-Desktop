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

// Per-day loss for a maintenance/outage record: full outage removes the whole
// day's contracted capacity; otherwise use the day's daily_losses entry; legacy
// records fall back to their total loss field.
export function dayLoss(record, dateIso, contracted) {
  if (record.outage_scope === "full") return contracted;
  if (Array.isArray(record.daily_losses)) {
    const entry = record.daily_losses.find((d) => d.date === dateIso);
    return Number(entry?.loss_m3 || 0);
  }
  return Number(
    record.expected_loss_m3 ?? record.expected_impact_m3 ?? record.actual_loss_m3 ?? record.estimated_loss_m3 ?? 0,
  );
}
