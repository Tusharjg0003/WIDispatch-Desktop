import React, { useMemo, useState } from "react";
import { format, parseISO, startOfDay, subDays } from "date-fns";
import { Download } from "lucide-react";
import { buildDemandRows, filterDemandByStatus, computeDemandTotals, demandRowsToCsv } from "../../lib/demandRows";
import "../production/ProductionInputTable.css"; // shared prod-* table/badge/kpi/filter classes
import "./DemandInputTable.css";

const num = (v) => Math.round(v).toLocaleString();
const isoInput = (d) => format(d, "yyyy-MM-dd");

export default function DemandInputTable({ cityGateId, bundle }) {
  const { demandInputs, users } = bundle;
  const [startDate, setStartDate] = useState(startOfDay(subDays(new Date(), 30)));
  const [endDate, setEndDate] = useState(startOfDay(new Date()));
  const [status, setStatus] = useState("all");

  const resolveUserName = (ref) => {
    if (!ref) return "N/A";
    const u = users.find((x) => x.id === ref || x.email === ref);
    return u?.name || u?.email || ref;
  };

  const rows = useMemo(
    () => filterDemandByStatus(buildDemandRows(demandInputs, cityGateId, { startDate, endDate }), status),
    [demandInputs, cityGateId, startDate, endDate, status],
  );
  const totals = useMemo(() => computeDemandTotals(rows), [rows]);

  const exportToCSV = () => {
    const csv = demandRowsToCsv(rows, resolveUserName);
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `demand-${format(new Date(), "yyyy-MM-dd")}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="prod-input">
      <div className="prod-strip">
        {[
          ["Total Required (m³)", num(totals.totalM3), ""],
          ["Avg / day (m³)", num(totals.avgDailyM3), "prod-kpi--blue"],
          ["Peak day (m³)", num(totals.peakM3), "prod-kpi--green"],
          ["Days Reporting", String(totals.days), ""],
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
        <label>Status
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="all">All</option>
            <option value="approved">Approved</option>
            <option value="submitted">Submitted</option>
            <option value="revised">Revised</option>
            <option value="rejected">Rejected</option>
          </select>
        </label>
        <button type="button" className="prod-btn" onClick={exportToCSV} disabled={rows.length === 0}>
          <Download size={14} /> Export CSV
        </button>
      </div>

      <div className="prod-table-wrap">
        <table className="prod-table">
          <thead>
            <tr>
              <th>Date</th><th className="ta-r">Required (m³)</th><th>Data Source</th>
              <th>Comments</th><th>Status</th><th>Submitted By</th><th>Approved By</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.date}>
                <td className="nowrap">{format(parseISO(r.date), "EEE, MMM dd")}</td>
                <td className="ta-r mono">{num(r.requiredM3)}</td>
                <td className="muted">{r.dataSource || "—"}</td>
                <td className="muted">{r.comments || "—"}</td>
                <td>{r.status ? <span className={`prod-badge prod-badge--${r.status}`}>{r.status.replace("_", " ")}</span> : "—"}</td>
                <td className="nowrap muted">{resolveUserName(r.submittedBy)}</td>
                <td className="nowrap muted">{resolveUserName(r.approvedBy)}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={7} className="empty">No approved demand records match the selected range/filters.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="prod-caption">
        {rows.length === 0 ? "No demand records in range." : `Showing ${rows.length} day${rows.length === 1 ? "" : "s"}`}
      </div>
    </div>
  );
}
