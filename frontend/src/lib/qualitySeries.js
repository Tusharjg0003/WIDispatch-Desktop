import { format, parseISO } from "date-fns";

export const QUALITY_PARAMS = [
  { key: "ph", label: "PH", unit: "", color: "#db2777" },
  { key: "alkalinity", label: "Alkalinity", unit: "mg/L", color: "#d97706" },
  { key: "turbidity", label: "Turbidity", unit: "NTU", color: "#7c3aed" },
  { key: "temperature", label: "Temperature", unit: "°C", color: "#ea580c" },
  { key: "residual_chlorine", label: "Chlorine", unit: "mg/L", color: "#0891b2" },
  { key: "conductivity", label: "Conductivity", unit: "µS/cm", color: "#059669" },
  { key: "tds", label: "TDS", unit: "mg/L", color: "#2563eb" },
];

export function buildQualitySeries(qualityRecords, plantId) {
  return qualityRecords
    .filter((r) => r.plant_id === plantId && r.sampling_datetime)
    .sort((a, b) => new Date(a.sampling_datetime).getTime() - new Date(b.sampling_datetime).getTime())
    .map((r) => ({
      date: format(parseISO(r.sampling_datetime), "MMM dd"),
      ph: r.ph ?? null,
      alkalinity: r.alkalinity ?? null,
      turbidity: r.turbidity ?? null,
      temperature: r.temperature ?? null,
      residual_chlorine: r.residual_chlorine ?? null,
      conductivity: r.conductivity ?? null,
      tds: r.tds ?? null,
    }));
}

export function outOfRange(value, limit = {}) {
  return value != null && ((limit.min != null && value < limit.min) || (limit.max != null && value > limit.max));
}
