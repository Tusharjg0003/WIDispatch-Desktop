import React, { useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { Download } from "lucide-react";
import { buildMaintenanceRows, filterMaintenanceByStatus, computeMaintenanceStats, maintenanceDurationHours, maintenanceRowsToCsv } from "../../lib/maintenanceRecords";
import "./MaintenanceRecordList.css";
import "./ProductionInputTable.css";

const fmtDT = (v) => { if (!v) return "N/A"; const d = parseISO(v); return Number.isNaN(d.getTime()) ? "N/A" : format(d, "yyyy-MM-dd HH:mm"); };
const fmtShort = (v) => { if (!v) return "—"; const d = parseISO(v); return Number.isNaN(d.getTime()) ? "—" : format(d, "MMM dd, HH:mm"); };
const num = (v) => (v == null ? "—" : Number(v).toLocaleString());

export default function MaintenanceRecordList({ plantId, bundle }) {
  const { maintenanceRecords, users } = bundle;
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [status, setStatus] = useState("all");

  const resolveUserName = (ref) => {
    if (!ref) return "N/A";
    const u = users.find((x) => x.id === ref || x.email === ref);
    return u?.name || u?.email || ref;
  };

  const rows = useMemo(() => filterMaintenanceByStatus(
    buildMaintenanceRows(maintenanceRecords, plantId, {
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(`${endDate}T23:59:59`) : undefined,
    }), status,
  ), [maintenanceRecords, plantId, startDate, endDate, status]);

  const stats = useMemo(() => computeMaintenanceStats(rows), [rows]);

  const exportCsv = () => {
    const csv = maintenanceRowsToCsv(rows, resolveUserName);
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url; link.download = `maintenance-records-${format(new Date(), "yyyy-MM-dd")}.csv`; link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="mrl">
      <div className="prod-strip">
        <div className="prod-strip-cell"><div className="prod-kpi-label">Total</div><div className="prod-kpi-value">{stats.total}</div></div>
        <div className="prod-strip-cell"><div className="prod-kpi-label">Pending</div><div className="prod-kpi-value">{stats.pending}</div></div>
        <div className="prod-strip-cell"><div className="prod-kpi-label">Approved</div><div className="prod-kpi-value prod-kpi--green">{stats.approved}</div></div>
        <div className="prod-strip-cell"><div className="prod-kpi-label">Expected Loss (m³)</div><div className="prod-kpi-value prod-kpi--red">{Math.round(stats.totalImpact).toLocaleString()}</div></div>
      </div>

      <div className="prod-filters">
        <label>Start Date<input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} /></label>
        <label>End Date<input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} /></label>
        <label>Status
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="all">All</option><option value="draft">Draft</option><option value="submitted">Submitted</option>
            <option value="under_revision">Under Revision</option><option value="revised">Revised</option>
            <option value="approved">Approved</option><option value="rejected">Rejected</option>
          </select>
        </label>
        <button type="button" className="prod-btn" onClick={exportCsv} disabled={rows.length === 0}><Download size={14} /> Export CSV</button>
      </div>

      <div className="prod-table-wrap">
        <table className="prod-table">
          <thead>
            <tr>
              <th>Description</th><th>Start</th><th>End</th><th className="ta-r">Duration</th>
              <th className="ta-r">Expected Loss</th><th className="ta-r">Actual Impact</th><th>Status</th>
              <th>Responsible User</th><th>Submitted At</th><th>Approved At</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.id || i}>
                <td className="mrl__desc">{r.description}</td>
                <td className="nowrap">{fmtShort(r.start_datetime)}</td>
                <td className="nowrap">{fmtShort(r.end_datetime)}</td>
                <td className="ta-r mono">{maintenanceDurationHours(r.start_datetime, r.end_datetime)}h</td>
                <td className="ta-r mono">{num(r.expected_impact_m3)}{r.expected_impact_m3 != null ? " m³" : ""}</td>
                <td className="ta-r mono">{r.actual_impact_m3 != null ? `${num(r.actual_impact_m3)} m³` : "-"}</td>
                <td><span className={`prod-badge prod-badge--${r.submission_status}`}>{(r.submission_status || "").replace("_", " ")}</span></td>
                <td className="nowrap muted">{resolveUserName(r.submitted_by || r.approved_by)}</td>
                <td className="nowrap">{fmtDT(r.submitted_at || r.created_at)}</td>
                <td className="nowrap">{fmtDT(r.approved_at)}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={10} className="empty">No maintenance records match the filters.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
