import React, { useMemo, useState } from "react";
import { fileSlug, fmtDateTime, fmtShortDateTime, recordName } from "../../lib/displayDates";
import { format, parseISO } from "date-fns";
import { Ban, Download, Siren, TriangleAlert, Zap } from "lucide-react";
import RecordKpis from "./RecordKpis";
import { buildOutageRows, computeOutageStats, outageDurationHours, outageLossM3, outageRowsToCsv } from "../../lib/outageRecords";
import "./OutageRecordList.css";
import "./ProductionInputTable.css";
import DateInput from "../DateInput";
import { downloadCsv } from "../../lib/exportCsv";

const fmtDT = (v) => fmtDateTime(v);
const fmtShort = (v) => fmtShortDateTime(v);
const num = (v) => Number(v || 0).toLocaleString();
const label = (v) => (v ? String(v).replaceAll("_", " ") : "—");

function outageScope(value) {
  const normalized = String(value || "").trim().toLowerCase().replace(/[_-]+/g, " ");
  if (!normalized) return null;
  if (normalized.includes("partial")) return "partial";
  if (normalized.includes("complete") || normalized.includes("full")) return "full";
  return null;
}

const isEmergency = (row) => /emergency|unplanned|forced/i.test(String(row.outage_type || row.type || ""));

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
    downloadCsv(`outages-${fileSlug(recordName(bundle, plantId))}-${format(new Date(), "yyyy-MM-dd")}.csv`, csv, { title: `Outages — ${recordName(bundle, plantId)}` });
  };

  return (
    <div className="orl">
      <RecordKpis
        items={[
          { label: "Total", value: stats.total, icon: Zap, tone: "neutral", sub: "Outages in range" },
          { label: "Loss", value: Math.round(stats.totalLoss).toLocaleString(), unit: "m³", icon: TriangleAlert, tone: stats.totalLoss > 0 ? "err" : "neutral" },
          { label: "Emergency", value: stats.emergency, icon: Siren, tone: stats.emergency > 0 ? "err" : "neutral", sub: "Unplanned" },
          { label: "Full scope", value: stats.fullScope, icon: Ban, tone: stats.fullScope > 0 ? "warn" : "neutral", sub: "Plant fully offline" },
        ]}
      />

      <section className="prod-card">
      <div className="prod-filters">
        <label>Start Date<DateInput value={startDate} onChange={(e) => setStartDate(e.target.value)} /></label>
        <label>End Date<DateInput value={endDate} onChange={(e) => setEndDate(e.target.value)} /></label>
        <button type="button" className="prod-btn" onClick={exportCsv} disabled={rows.length === 0}><Download size={14} /> Export CSV</button>
      </div>

      <div className="prod-table-wrap">
        <table className="prod-table">
          <thead>
            <tr>
              <th>Type</th><th>Scope</th><th>Failure</th><th>Description</th><th>Start</th><th>End</th>
              <th className="ta-r">Duration</th><th className="ta-r">Loss (m³)</th>
              <th>Responsible User</th><th>Submitted At</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.id || i}>
                <td><span className={`prod-badge${isEmergency(r) ? " prod-badge--rejected" : ""}`}>{label(r.outage_type || r.type)}</span></td>
                <td>
                  {rowScope(r)
                    ? <span className={`prod-badge ${rowScope(r) === "full" ? "prod-badge--rejected" : "prod-badge--under_revision"}`}>{label(rowScope(r))}</span>
                    : <span className="muted">—</span>}
                </td>
                <td>{label(r.failure_type)}</td>
                <td className="orl__desc">{r.description || "—"}</td>
                <td className="nowrap">{fmtShort(r.start_datetime)}</td>
                <td className="nowrap">{fmtShort(r.end_datetime)}</td>
                <td className="ta-r mono">{outageDurationHours(r)}h</td>
                <td className={`ta-r mono${outageLossM3(r) > 0 ? " neg" : ""}`}>{num(outageLossM3(r))}</td>
                <td className="nowrap muted">{resolveUserName(r.submitted_by || r.approved_by)}</td>
                <td className="nowrap">{fmtDT(r.submitted_at || r.created_at)}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={10} className="empty">No outage records match the filters.</td></tr>}
          </tbody>
        </table>
      </div>
      </section>
    </div>
  );
}
