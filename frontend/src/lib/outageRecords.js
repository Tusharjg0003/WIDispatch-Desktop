import { format, parseISO } from "date-fns";
import { toCsv } from "./csvCell.js";

export function outageDurationHours(record) {
  if (record?.duration_hours != null && Number.isFinite(Number(record.duration_hours))) {
    return Number(record.duration_hours);
  }
  const s = new Date(record?.start_datetime).getTime();
  const e = new Date(record?.end_datetime).getTime();
  if (Number.isNaN(s) || Number.isNaN(e) || e < s) return 0;
  return Math.round((e - s) / 3_600_000);
}

export function outageLossM3(record) {
  if (record?.actual_loss_m3 != null) return Number(record.actual_loss_m3) || 0;
  if (record?.estimated_loss_m3 != null) return Number(record.estimated_loss_m3) || 0;
  if (record?.expected_loss_m3 != null) return Number(record.expected_loss_m3) || 0;
  if (Array.isArray(record?.daily_losses)) {
    return record.daily_losses.reduce((sum, row) => sum + (Number(row?.loss_m3) || 0), 0);
  }
  return 0;
}

export function buildOutageRows(outages, plantId, { startDate, endDate } = {}) {
  return outages
    .filter((r) => r.plant_id === plantId && r.start_datetime)
    .filter((r) => {
      const t = new Date(r.start_datetime);
      if (startDate && t < startDate) return false;
      if (endDate && t > endDate) return false;
      return true;
    })
    .sort((a, b) => new Date(b.start_datetime).getTime() - new Date(a.start_datetime).getTime());
}

export function computeOutageStats(rows) {
  const total = rows.length;
  const totalLoss = rows.reduce((sum, r) => sum + outageLossM3(r), 0);
  const emergency = rows.filter((r) => r.is_emergency).length;
  const fullScope = rows.filter((r) => r.outage_scope === "full").length;
  return { total, totalLoss, emergency, fullScope };
}

const OUTAGE_HEADERS = [
  "outage_type", "outage_scope", "failure_type", "description", "Start", "End", "Duration (hours)",
  "Loss (m³)", "Responsible User", "Submitted At",
];

const fmtDT = (v) => {
  if (!v) return "N/A";
  const d = parseISO(v);
  return Number.isNaN(d.getTime()) ? "N/A" : format(d, "yyyy-MM-dd HH:mm");
};

function outageScope(value) {
  const normalized = String(value || "").trim().toLowerCase().replace(/[_-]+/g, " ");
  if (!normalized) return "";
  if (normalized.includes("partial")) return "partial";
  if (normalized.includes("complete")) return "complete";
  if (normalized.includes("full")) return "full";
  return "";
}

function outageScopeValue(record) {
  return record.outage_scope || record.scope || outageScope(record.failure_type) || outageScope(record.outage_type);
}

export function outageRowsToCsv(rows, resolveUserName) {
  const body = rows.map((r) => [
    r.outage_type || r.type || "",
    outageScopeValue(r),
    r.failure_type || "",
    r.description || "",
    fmtDT(r.start_datetime),
    fmtDT(r.end_datetime),
    String(outageDurationHours(r)),
    outageLossM3(r).toFixed(2),
    resolveUserName(r.submitted_by || r.approved_by || null),
    fmtDT(r.submitted_at || r.created_at || null),
  ]);
  return toCsv(OUTAGE_HEADERS, body);
}
