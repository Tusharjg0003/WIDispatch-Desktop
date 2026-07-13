import { format, parseISO } from "date-fns";
import { toCsv } from "./csvCell.js";

export function maintenanceDurationHours(start, end) {
  const s = new Date(start).getTime();
  const e = new Date(end).getTime();
  if (Number.isNaN(s) || Number.isNaN(e) || e < s) return 0;
  return Math.round((e - s) / 3_600_000);
}

export function buildMaintenanceRows(maintenanceRecords, plantId, { startDate, endDate } = {}) {
  return maintenanceRecords
    .filter((r) => r.plant_id === plantId && r.start_datetime)
    .filter((r) => {
      const t = new Date(r.start_datetime);
      if (startDate && t < startDate) return false;
      if (endDate && t > endDate) return false;
      return true;
    })
    .sort((a, b) => new Date(b.start_datetime).getTime() - new Date(a.start_datetime).getTime());
}

export function filterMaintenanceByStatus(rows, status) {
  if (!status || status === "all") return rows;
  return rows.filter((r) => r.submission_status === status);
}

export function computeMaintenanceStats(rows) {
  const total = rows.length;
  const pending = rows.filter((r) => r.submission_status === "submitted" || r.submission_status === "revised").length;
  const approved = rows.filter((r) => r.submission_status === "approved").length;
  const rejected = rows.filter((r) => r.submission_status === "rejected").length;
  const totalImpact = rows.reduce((sum, r) => sum + (Number(r.expected_impact_m3) || 0), 0);
  return { total, pending, approved, rejected, totalImpact };
}

const MAINT_HEADERS = [
  "Description", "Start Date & Time", "End Date & Time", "Duration (hours)",
  "Expected Loss (m³)", "Actual Impact (m³)", "Status", "Responsible User",
  "Submitted At", "Website Approved At", "Desktop Approval", "Desktop Approved At",
];

const fmtDT = (v) => {
  if (!v) return "N/A";
  const d = parseISO(v);
  return Number.isNaN(d.getTime()) ? "N/A" : format(d, "yyyy-MM-dd HH:mm");
};

export function maintenanceRowsToCsv(rows, resolveUserName) {
  const body = rows.map((r) => [
    r.description || "",
    fmtDT(r.start_datetime),
    fmtDT(r.end_datetime),
    String(maintenanceDurationHours(r.start_datetime, r.end_datetime)),
    r.expected_impact_m3 != null ? Number(r.expected_impact_m3).toFixed(2) : "N/A",
    r.actual_impact_m3 != null ? Number(r.actual_impact_m3).toFixed(2) : "N/A",
    r.submission_status || "",
    resolveUserName(r.submitted_by || r.approved_by || null),
    fmtDT(r.submitted_at || r.created_at || null),
    fmtDT(r.approved_at || null),
    r.desktop_approval_status || r.desktop_decision_status || r.desktop_approval || "pending",
    fmtDT(r.desktop_approved_at || r.desktop_decision_at || null),
  ]);
  return toCsv(MAINT_HEADERS, body);
}
