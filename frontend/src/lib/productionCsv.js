import { format, parseISO } from "date-fns";

const HEADERS = [
  "Date", "Contracted Capacity (m³/day)", "Maintenance Loss (m³)", "Outage Loss (m³)",
  "Variance (m³)", "Available Capacity (m³)", "Requested Capacity (m³)", "Delivered (m³)",
  "Delivered Status", "Responsible User", "Submitted At", "Approved At",
];

const fmtDateTime = (v) => {
  if (!v) return "N/A";
  const d = parseISO(v);
  return Number.isNaN(d.getTime()) ? "N/A" : format(d, "yyyy-MM-dd HH:mm");
};

export function productionRowsToCsv(rows, resolveUserName) {
  const body = rows.map((r) => [
    r.iso,
    r.contracted.toFixed(0),
    r.maintenanceLoss.toFixed(0),
    r.outageLoss.toFixed(0),
    r.variance.toFixed(0),
    r.available.toFixed(0),
    r.requested != null ? r.requested.toFixed(0) : "Pending",
    r.delivered != null ? r.delivered.toFixed(0) : "Pending",
    r.deliveredStatus ?? "",
    resolveUserName(r.responsibleUser),
    fmtDateTime(r.submittedAt),
    fmtDateTime(r.approvedAt),
  ]);
  return [HEADERS, ...body].map((row) => row.map((c) => `"${c}"`).join(",")).join("\n");
}
