export function stationPumps(specifications) {
  if (Array.isArray(specifications?.pumps)) return specifications.pumps;
  return [
    ...(Array.isArray(specifications?.active_pumps) ? specifications.active_pumps : []),
    ...(Array.isArray(specifications?.standby_pumps) ? specifications.standby_pumps : []),
  ];
}

// `||` rather than `??` so a pump carrying `design_capacity: 0` alongside a real
// `capacity_m3_day` falls through instead of reading as zero. Matches the
// transmission website's own normalisation.
export function pumpCapacity(pump) {
  const value = pump?.design_capacity || pump?.capacity_m3_day || pump?.capacity;
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

export function isFunctionalPump(pump) {
  return ["active", "functional"].includes(String(pump?.role || "").toLowerCase());
}

export function isBackupPump(pump) {
  return ["standby", "backup"].includes(String(pump?.role || "").toLowerCase());
}

export function functionalPumps(specifications) {
  return stationPumps(specifications).filter((pump) => isFunctionalPump(pump));
}

export function backupPumps(specifications) {
  return stationPumps(specifications).filter((pump) => isBackupPump(pump));
}

export function activeFunctionalPumps(specifications) {
  return functionalPumps(specifications).filter((pump) => pump.active !== false);
}

// The pump list wins over a station-level figure: it is the one the transmission
// website maintains and derates against, whereas `design_capacity` is often a
// stale aggregate left behind by migration. Matches that site's own ordering.
export function totalDesignCapacity(specifications) {
  const pumps = activeFunctionalPumps(specifications);
  if (pumps.length) return pumps.reduce((sum, pump) => sum + pumpCapacity(pump), 0);
  const stationCapacity = Number(specifications?.design_capacity || specifications?.capacity_m3_day);
  return Number.isFinite(stationCapacity) ? stationCapacity : 0;
}

export function findPump(specifications, id) {
  return stationPumps(specifications).find((pump) => pump.id === id);
}

export function pumpRoleLabel(pump) {
  if (isBackupPump(pump)) return "Backup";
  if (isFunctionalPump(pump)) return "Functional";
  return pump?.role ? String(pump.role).replaceAll("_", " ") : "Pump";
}
