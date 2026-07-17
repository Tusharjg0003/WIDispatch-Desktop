import React, { useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { Download } from "lucide-react";
import { buildOutageRows, computeOutageStats, outageDurationHours, outageLossM3, outageRowsToCsv } from "../../lib/outageRecords";
import "./OutageRecordList.css";
import "./ProductionInputTable.css";

const fmtDT = (v) => { if (!v) return "N/A"; const d = parseISO(v); return Number.isNaN(d.getTime()) ? "N/A" : format(d, "yyyy-MM-dd HH:mm"); };
const fmtShort = (v) => { if (!v) return "—"; const d = parseISO(v); return Number.isNaN(d.getTime()) ? "—" : format(d, "MMM dd, HH:mm"); };
const num = (v) => Number(v || 0).toLocaleString();
const label = (v) => (v ? String(v).replaceAll("_", " ") : "—");

function outageScope(value) {
  const normalized = String(value || "").trim().toLowerCase().replace(/[_-]+/g, " ");
  if (!normalized) return null;
  if (normalized.includes("partial")) return "partial";
  if (normalized.includes("complete") || normalized.includes("full")) return "full";
  return null;
}

function rowScope(row) {
  return row.outage_scope || row.scope || outageScope(row.failure_type) || outageScope(row.outage_type);
}

export default function OutageRecordList({ plantId, bundle }) {
  const { outages, users } = bundle;
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const resolveUserName = (ref) => {
    if (!ref) return "N/A";
    const u = users.find((x) => x.id === ref || x.email === ref);
    return u?.name || u?.email || ref;
  };

  const rows = useMemo(() => buildOutageRows(outages, plantId, {
    startDate: startDate ? new Date(startDate) : undefined,
    endDate: endDate ? new Date(`${endDate}T23:59:59`) : undefined,
  }), [outages, plantId, startDate, endDate]);

  const stats = useMemo(() => computeOutageStats(rows), [rows]);

  const exportCsv = () => {
    const csv = outageRowsToCsv(rows, resolveUserName);
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url; link.download = `outage-records-${format(new Date(), "yyyy-MM-dd")}.csv`; link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="orl">
      <div className="prod-strip">
        <div className="prod-strip-cell"><div className="prod-kpi-label">Total</div><div className="prod-kpi-value">{stats.total}</div></div>
        <div className="prod-strip-cell"><div className="prod-kpi-label">Loss (m³)</div><div className="prod-kpi-value prod-kpi--red">{Math.round(stats.totalLoss).toLocaleString()}</div></div>
        <div className="prod-strip-cell"><div className="prod-kpi-label">Emergency</div><div className="prod-kpi-value">{stats.emergency}</div></div>
        <div className="prod-strip-cell"><div className="prod-kpi-label">Full Scope</div><div className="prod-kpi-value">{stats.fullScope}</div></div>
      </div>

      <div className="prod-filters">
        <label>Start Date<input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} /></label>
        <label>End Date<input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} /></label>
        <button type="button" className="prod-btn" onClick={exportCsv} disabled={rows.length === 0}><Download size={14} /> Export CSV</button>
      </div>

      <div className="prod-table-wrap">
        <table className="prod-table">
          <thead>
            <tr>
              <th>outage_type</th><th>outage_scope</th><th>failure_type</th><th>description</th><th>Start</th><th>End</th>
              <th className="ta-r">Duration</th><th className="ta-r">Loss (m³)</th>
              <th>Responsible User</th><th>Submitted At</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.id || i}>
                <td><span className="prod-badge">{label(r.outage_type || r.type)}</span></td>
                <td>{label(rowScope(r))}</td>
                <td>{label(r.failure_type)}</td>
                <td className="orl__desc">{r.description || "—"}</td>
                <td className="nowrap">{fmtShort(r.start_datetime)}</td>
                <td className="nowrap">{fmtShort(r.end_datetime)}</td>
                <td className="ta-r mono">{outageDurationHours(r)}h</td>
                <td className="ta-r mono">{num(outageLossM3(r))}</td>
                <td className="nowrap muted">{resolveUserName(r.submitted_by || r.approved_by)}</td>
                <td className="nowrap">{fmtDT(r.submitted_at || r.created_at)}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={10} className="empty">No outage records match the filters.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
