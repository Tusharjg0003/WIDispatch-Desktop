import React, { useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { Download } from "lucide-react";
import { buildQualityRows, filterQualityByCompliance, computeQualityStats, qualityRowsToCsv } from "../../lib/qualityRecords";
import "./QualityRecordList.css";
import "./ProductionInputTable.css"; // shared prod-* table/badge/kpi/filter classes

const fmtDT = (v) => { if (!v) return "N/A"; const d = parseISO(v); return Number.isNaN(d.getTime()) ? "N/A" : format(d, "yyyy-MM-dd HH:mm"); };
const cell = (v, digits) => (v == null ? "—" : Number(v).toFixed(digits));

export default function QualityRecordList({ plantId, bundle }) {
  const { qualityRecords, users } = bundle;
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [compliance, setCompliance] = useState("all");

  const resolveUserName = (ref) => {
    if (!ref) return "N/A";
    const u = users.find((x) => x.id === ref || x.email === ref);
    return u?.name || u?.email || ref;
  };

  const rows = useMemo(() => filterQualityByCompliance(
    buildQualityRows(qualityRecords, plantId, {
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(`${endDate}T23:59:59`) : undefined,
    }), compliance,
  ), [qualityRecords, plantId, startDate, endDate, compliance]);

  const stats = useMemo(() => computeQualityStats(rows), [rows]);

  const exportCsv = () => {
    const csv = qualityRowsToCsv(rows, resolveUserName);
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url; link.download = `quality-records-${format(new Date(), "yyyy-MM-dd")}.csv`; link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="qrl">
      <div className="prod-strip">
        <div className="prod-strip-cell"><div className="prod-kpi-label">Total Tests</div><div className="prod-kpi-value">{stats.total}</div></div>
        <div className="prod-strip-cell"><div className="prod-kpi-label">Compliance Rate</div><div className="prod-kpi-value prod-kpi--green">{stats.complianceRate.toFixed(0)}%</div></div>
        <div className="prod-strip-cell"><div className="prod-kpi-label">Within Spec</div><div className="prod-kpi-value prod-kpi--green">{stats.within}</div></div>
        <div className="prod-strip-cell"><div className="prod-kpi-label">Out of Spec</div><div className="prod-kpi-value prod-kpi--red">{stats.out}</div></div>
      </div>

      <div className="prod-filters">
        <label>Start Date<input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} /></label>
        <label>End Date<input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} /></label>
        <label>Compliance
          <select value={compliance} onChange={(e) => setCompliance(e.target.value)}>
            <option value="all">All</option><option value="within_spec">Within Spec</option><option value="out_of_spec">Out of Spec</option>
          </select>
        </label>
        <button type="button" className="prod-btn" onClick={exportCsv} disabled={rows.length === 0}><Download size={14} /> Export CSV</button>
      </div>

      <div className="prod-table-wrap">
        <table className="prod-table">
          <thead>
            <tr>
              <th>Date &amp; Time</th><th className="ta-r">PH</th><th className="ta-r">Alkalinity</th><th className="ta-r">Turbidity</th>
              <th className="ta-r">Temp (°C)</th><th className="ta-r">Chlorine</th><th className="ta-r">Conductivity</th><th className="ta-r">TDS</th>
              <th>Compliance</th><th>Responsible User</th><th>Submitted At</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.id || i}>
                <td className="nowrap">{fmtDT(r.sampling_datetime)}</td>
                <td className="ta-r mono">{cell(r.ph, 2)}</td>
                <td className="ta-r mono">{cell(r.alkalinity, 1)}</td>
                <td className="ta-r mono">{cell(r.turbidity, 2)}</td>
                <td className="ta-r mono">{cell(r.temperature, 1)}</td>
                <td className="ta-r mono">{cell(r.residual_chlorine, 2)}</td>
                <td className="ta-r mono">{cell(r.conductivity, 1)}</td>
                <td className="ta-r mono">{cell(r.tds, 1)}</td>
                <td><span className={`prod-badge ${r.compliance_flag === "within_spec" ? "prod-badge--approved" : "prod-badge--rejected"}`}>{r.compliance_flag === "within_spec" ? "Within Spec" : "Out of Spec"}</span></td>
                <td className="nowrap muted">{resolveUserName(r.submitted_by || r.approved_by)}</td>
                <td className="nowrap">{fmtDT(r.submitted_at || r.created_at)}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={11} className="empty">No quality records match the filters.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
