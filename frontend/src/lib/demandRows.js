import { parseISO } from "date-fns";
import { toCsv } from "./csvCell.js";

export function buildDemandRows(demandInputs, plantId, { startDate, endDate } = {}) {
  return demandInputs
    .filter((r) => (!plantId || r.plant_id === plantId) && r.required_m3 != null && r.date)
    .filter((r) => {
      const d = parseISO(r.date);
      if (Number.isNaN(d.getTime())) return false;
      if (startDate && d < startDate) return false;
      if (endDate && d > endDate) return false;
      return true;
    })
    .map((r) => ({
      date: r.date,
      requiredM3: Number(r.required_m3) || 0,
      dataSource: r.data_source || "",
      comments: r.comments || "",
      status: r.submission_status || "",
      submittedBy: r.submitted_by || null,
      approvedBy: r.approved_by || null,
      submittedAt: r.submitted_at || null,
      approvedAt: r.approved_at || null,
    }))
    .sort((a, b) => (b.date || "").localeCompare(a.date || ""));
}

export function filterDemandByStatus(rows, status) {
  return status && status !== "all" ? rows.filter((r) => r.status === status) : rows;
}

export function computeDemandTotals(rows) {
  const days = rows.length;
  const totalM3 = rows.reduce((s, r) => s + r.requiredM3, 0);
  const peakM3 = rows.reduce((m, r) => Math.max(m, r.requiredM3), 0);
  const avgDailyM3 = days > 0 ? totalM3 / days : 0;
  return { days, totalM3, avgDailyM3, peakM3 };
}

export function demandRowsToCsv(rows, resolveUserName = (x) => x || "") {
  const headers = ["Date", "Required (m³)", "Data Source", "Comments", "Status", "Submitted By", "Approved By"];
  const body = rows.map((r) => [
    r.date, r.requiredM3, r.dataSource, r.comments, r.status,
    resolveUserName(r.submittedBy), resolveUserName(r.approvedBy),
  ]);
  return toCsv(headers, body);
}
