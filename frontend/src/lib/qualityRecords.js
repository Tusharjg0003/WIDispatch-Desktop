import { format, parseISO } from "date-fns";
import { toCsv } from "./csvCell.js";

export function buildQualityRows(qualityRecords, plantId, { startDate, endDate } = {}) {
  return qualityRecords
    .filter((r) => r.plant_id === plantId && r.sampling_datetime)
    .filter((r) => {
      const t = new Date(r.sampling_datetime);
      if (startDate && t < startDate) return false;
      if (endDate && t > endDate) return false;
      return true;
    })
    .sort((a, b) => new Date(b.sampling_datetime).getTime() - new Date(a.sampling_datetime).getTime());
}

export function filterQualityByCompliance(rows, compliance) {
  if (!compliance || compliance === "all") return rows;
  return rows.filter((r) => r.compliance_flag === compliance);
}

export function computeQualityStats(rows) {
  const total = rows.length;
  const within = rows.filter((r) => r.compliance_flag === "within_spec").length;
  const out = rows.filter((r) => r.compliance_flag === "out_of_spec").length;
  const complianceRate = total ? (within / total) * 100 : 0;
  return { total, within, out, complianceRate };
}

const QUALITY_HEADERS = [
  "Date & Time", "PH", "Alkalinity (mg/L)", "Turbidity (NTU)", "Temperature (°C)",
  "Chlorine (mg/L)", "Conductivity (µS/cm)", "TDS (mg/L)", "Compliance",
  "Responsible User", "Submitted At", "Remarks",
];

const fmtDT = (v) => {
  if (!v) return "N/A";
  const d = parseISO(v);
  return Number.isNaN(d.getTime()) ? "N/A" : format(d, "yyyy-MM-dd HH:mm");
};
const n2 = (v) => (v == null ? "N/A" : Number(v).toFixed(2));
const n1 = (v) => (v == null ? "N/A" : Number(v).toFixed(1));

export function qualityRowsToCsv(rows, resolveUserName) {
  const body = rows.map((r) => [
    fmtDT(r.sampling_datetime),
    n2(r.ph), n1(r.alkalinity), n2(r.turbidity), n1(r.temperature),
    n2(r.residual_chlorine), n1(r.conductivity), n1(r.tds),
    r.compliance_flag === "within_spec" ? "Within Spec" : "Out of Spec",
    resolveUserName(r.submitted_by || r.approved_by || null),
    fmtDT(r.submitted_at || r.created_at || null),
    r.comments || "",
  ]);
  return toCsv(QUALITY_HEADERS, body);
}
