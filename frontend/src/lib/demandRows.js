import { format, parseISO } from "date-fns";
import { toCsv } from "./csvCell.js";

// Desktop approval status for a day's underlying demand record.
// null when the day has no demand record; "pending" until a decision is made.
//
// `desktop_decision_status` is preferred: the dispatch simulation writes the
// richer vocabulary the Demand portal reads (approved | adjusted | shortfall),
// while `desktop_approval_status` carries the coarser approved/rejected that a
// manual per-row decision sets. Both are written on publish, so preferring the
// richer one loses nothing.
export const demandDesktopStatus = (input) =>
  input ? (input.desktop_decision_status || input.desktop_approval_status || "pending") : null;

export const isWebsiteAcceptedDemandRow = (row) => row?.input?.submission_status === "approved";

export function filterWebsiteAcceptedDemandRows(rows) {
  return rows.filter(isWebsiteAcceptedDemandRow);
}

// Approved Demand. The dispatch simulation records the volume it could actually
// deliver in `desktop_approved_m3`, which is the whole point of a revised
// decision — so that value wins wherever it exists. A manual per-row approval
// sets no volume, and there the approved demand is simply what was requested.
export function demandApprovedDemand(row) {
  const approved = row.input?.desktop_approved_m3;
  if (approved != null) return approved;
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
