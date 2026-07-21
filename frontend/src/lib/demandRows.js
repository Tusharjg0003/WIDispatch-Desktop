import { format, parseISO } from "date-fns";
import { toCsv } from "./csvCell.js";

// Desktop approval status for a day's underlying demand record.
// null when the day has no demand record; "pending" until a decision is made.
export const demandDesktopStatus = (input) => (input ? (input.desktop_approval_status || "pending") : null);

// Approved Demand = the required_m3 once the desktop operator has approved the record.
export function demandApprovedDemand(row) {
  return demandDesktopStatus(row.input) === "approved" ? row.requested : null;
}

// CSV for the per-day demand grid. Rows are productionRows-shaped
// (see buildProductionRows); `requested` carries required_m3.
const HEADERS = [
  "Date", "Contracted Capacity (m³/day)", "Maintenance Loss (m³)", "Outage Loss (m³)",
  "Variance (m³)", "Available Capacity (m³)", "Required Demand (m³)", "Approved Demand (m³)",
  "Responsible User", "Submitted At", "Website Approved At", "Desktop Approval", "Desktop Approved At",
];

const fmtDateTime = (v) => {
  if (!v) return "N/A";
  const d = parseISO(v);
  return Number.isNaN(d.getTime()) ? "N/A" : format(d, "yyyy-MM-dd HH:mm");
};

export function demandRowsToCsv(rows, resolveUserName = (x) => x || "") {
  const body = rows.map((r) => {
    const desktop = demandDesktopStatus(r.input);
    const approved = demandApprovedDemand(r);
    return [
      r.iso,
      r.contracted.toFixed(0),
      r.maintenanceLoss.toFixed(0),
      r.outageLoss.toFixed(0),
      r.variance.toFixed(0),
      r.available.toFixed(0),
      r.requested != null ? r.requested.toFixed(0) : "Pending",
      approved != null ? approved.toFixed(0) : (r.input ? "Pending" : "—"),
      resolveUserName(r.responsibleUser),
      fmtDateTime(r.submittedAt),
      fmtDateTime(r.approvedAt),
      desktop || "—",
      fmtDateTime(r.input?.desktop_approved_at),
    ];
  });
  return toCsv(HEADERS, body);
}
