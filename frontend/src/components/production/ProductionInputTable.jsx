import React, { useMemo, useState } from "react";
import { format, parseISO, startOfDay, subDays } from "date-fns";
import { Download } from "lucide-react";
import { buildProductionRows, filterRows, computeTotals } from "../../lib/productionRows";
import { productionRowsToCsv } from "../../lib/productionCsv";
import "./ProductionInputTable.css";

const num = (v) => Math.round(v).toLocaleString();
const isoInput = (d) => format(d, "yyyy-MM-dd");

export default function ProductionInputTable({ plant, plantId, bundle }) {
  const { productionInputs, maintenanceRecords, outages, contractedCapacities, users } = bundle;

  const [startDate, setStartDate] = useState(startOfDay(subDays(new Date(), 30)));
  const [endDate, setEndDate] = useState(startOfDay(new Date()));
  const [deliveredStatus, setDeliveredStatus] = useState("all");
  const [requestedStatus, setRequestedStatus] = useState("all");

  const resolveUserName = (ref) => {
    if (!ref) return "N/A";
    const u = users.find((x) => x.id === ref || x.email === ref);
    return u?.name || u?.email || ref;
  };
  const fmtDateTime = (v) => {
    if (!v) return "N/A";
    const d = parseISO(v);
    return Number.isNaN(d.getTime()) ? "N/A" : format(d, "yyyy-MM-dd HH:mm");
  };

  const rows = useMemo(
    () => buildProductionRows({ plant, plantId, productionInputs, maintenanceRecords, outages, contractedCapacities, startDate, endDate }),
    [plant, plantId, productionInputs, maintenanceRecords, outages, contractedCapacities, startDate, endDate],
  );
  const visibleRows = useMemo(() => filterRows(rows, { deliveredStatus, requestedStatus }), [rows, deliveredStatus, requestedStatus]);
  const totals = useMemo(() => computeTotals(visibleRows), [visibleRows]);

  const exportToCSV = () => {
    const csv = productionRowsToCsv(visibleRows, resolveUserName);
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `production-${format(new Date(), "yyyy-MM-dd")}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="prod-input">
      <div className="prod-strip">
        {[
          ["Contracted (m³)", num(totals.contracted), ""],
          ["Available (m³)", num(totals.available), "prod-kpi--blue"],
          ["Delivered (m³)", num(totals.delivered), "prod-kpi--green"],
          ["Total Loss (m³)", num(totals.loss), "prod-kpi--red"],
          ["Avg Availability", `${totals.availabilityPct.toFixed(0)}%`, ""],
        ].map(([label, value, tone]) => (
          <div className="prod-strip-cell" key={label}>
            <div className="prod-kpi-label">{label}</div>
            <div className={`prod-kpi-value ${tone}`}>{value}</div>
          </div>
        ))}
      </div>

      <div className="prod-filters">
        <label>Start Date
          <input type="date" value={isoInput(startDate)} onChange={(e) => e.target.value && setStartDate(startOfDay(parseISO(e.target.value)))} />
        </label>
        <label>End Date
          <input type="date" value={isoInput(endDate)} onChange={(e) => e.target.value && setEndDate(startOfDay(parseISO(e.target.value)))} />
        </label>
        <label>Delivered Status
          <select value={deliveredStatus} onChange={(e) => setDeliveredStatus(e.target.value)}>
            <option value="all">All</option><option value="draft">Draft</option><option value="submitted">Submitted</option>
            <option value="revised">Revised</option><option value="approved">Approved</option><option value="rejected">Rejected</option>
          </select>
        </label>
        <label>Requested Status
          <select value={requestedStatus} onChange={(e) => setRequestedStatus(e.target.value)}>
            <option value="all">All</option><option value="allocated">Allocated</option><option value="pending">Pending</option>
          </select>
        </label>
        <button type="button" className="prod-btn" onClick={exportToCSV} disabled={visibleRows.length === 0}>
          <Download size={14} /> Export CSV
        </button>
      </div>

      <div className="prod-table-wrap">
        <table className="prod-table">
          <thead>
            <tr>
              <th>Date</th><th className="ta-r">Contracted</th><th className="ta-r">Maint. Loss</th>
              <th className="ta-r">Outage Loss</th><th className="ta-r">Variance</th><th className="ta-r">Available</th>
              <th className="ta-r">Requested</th><th className="ta-r">Delivered</th>
              <th>Responsible User</th><th>Submitted At</th><th>Approved At</th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((r) => (
              <tr key={r.iso}>
                <td className="nowrap">{format(parseISO(r.iso), "EEE, MMM dd")}</td>
                <td className="ta-r mono">{num(r.contracted)}</td>
                <td className="ta-r mono">{r.maintenanceLoss > 0 ? num(r.maintenanceLoss) : "—"}</td>
                <td className="ta-r mono">{r.outageLoss > 0 ? num(r.outageLoss) : "—"}</td>
                <td className="ta-r mono"><span className={r.variance > 0 ? "neg" : ""}>{r.variance > 0 ? `-${num(r.variance)}` : "0"}</span></td>
                <td className="ta-r mono">{num(r.available)}</td>
                <td className="ta-r mono">{r.requested != null ? num(r.requested) : <span className="muted">Pending</span>}</td>
                <td className="ta-r mono">
                  {r.delivered != null ? (
                    <span className="delivered">{num(r.delivered)}{r.deliveredStatus && <span className={`prod-badge prod-badge--${r.deliveredStatus}`}>{r.deliveredStatus.replace("_", " ")}</span>}</span>
                  ) : <span className="muted">Pending</span>}
                </td>
                <td className="nowrap muted">{resolveUserName(r.responsibleUser)}</td>
                <td className="nowrap">{fmtDateTime(r.submittedAt)}</td>
                <td className="nowrap">{fmtDateTime(r.approvedAt)}</td>
              </tr>
            ))}
            {visibleRows.length === 0 && (
              <tr><td colSpan={11} className="empty">No days match the selected range/filters.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="prod-caption">
        {visibleRows.length === 0 ? "No days match the selected range/filters." : `Showing ${visibleRows.length} day${visibleRows.length === 1 ? "" : "s"}`}
      </div>
    </div>
  );
}
