import { format, parseISO } from "date-fns";
import { toCsv } from "./csvCell.js";

// CSV for the per-day demand grid. Rows are productionRows-shaped
// (see buildProductionRows); demand has no delivered/actual column.
const HEADERS = [
  "Date", "Contracted Capacity (m³/day)", "Maintenance Loss (m³)", "Outage Loss (m³)",
  "Variance (m³)", "Available Capacity (m³)", "Required (m³)",
  "Responsible User", "Submitted At", "Approved At",
];

const fmtDateTime = (v) => {
  if (!v) return "N/A";
  const d = parseISO(v);
  return Number.isNaN(d.getTime()) ? "N/A" : format(d, "yyyy-MM-dd HH:mm");
};

export function demandRowsToCsv(rows, resolveUserName = (x) => x || "") {
  const body = rows.map((r) => [
    r.iso,
    r.contracted.toFixed(0),
    r.maintenanceLoss.toFixed(0),
    r.outageLoss.toFixed(0),
    r.variance.toFixed(0),
    r.available.toFixed(0),
    r.requested != null ? r.requested.toFixed(0) : "Pending",
    resolveUserName(r.responsibleUser),
    fmtDateTime(r.submittedAt),
    fmtDateTime(r.approvedAt),
  ]);
  return toCsv(HEADERS, body);
}
