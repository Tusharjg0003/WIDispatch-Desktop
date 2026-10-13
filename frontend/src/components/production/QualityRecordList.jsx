import React, { useMemo, useState } from "react";
import { fileSlug, fmtDateTime, fmtShortDateTime, recordName } from "../../lib/displayDates";
import { format, parseISO } from "date-fns";
import { CheckCircle2, Download, FlaskConical, ShieldCheck, TriangleAlert } from "lucide-react";
import RecordKpis from "./RecordKpis";
import { buildQualityRows, filterQualityByCompliance, computeQualityStats, qualityRowsToCsv } from "../../lib/qualityRecords";
import "./QualityRecordList.css";
import "./ProductionInputTable.css"; // shared prod-* table/badge/kpi/filter classes
import DateInput from "../DateInput";
import { downloadCsv } from "../../lib/exportCsv";

const fmtDT = (v) => fmtDateTime(v);
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
    downloadCsv(`quality-${fileSlug(recordName(bundle, plantId))}-${format(new Date(), "yyyy-MM-dd")}.csv`, csv, { title: `Quality — ${recordName(bundle, plantId)}` });
  };

  return (
    <div className="qrl">
      <RecordKpis
        items={[
          { label: "Total tests", value: stats.total, icon: FlaskConical, tone: "neutral", sub: "Samples in range" },
          {
            label: "Compliance rate",
            value: stats.total ? `${stats.complianceRate.toFixed(0)}%` : "—",
            icon: ShieldCheck,
            tone: !stats.total ? "neutral" : stats.complianceRate >= 95 ? "ok" : stats.complianceRate >= 80 ? "warn" : "err",
            meter: stats.total ? stats.complianceRate : undefined,
            sub: stats.total ? undefined : "No samples yet",
          },
          { label: "Within spec", value: stats.within, icon: CheckCircle2, tone: "ok" },
          { label: "Out of spec", value: stats.out, icon: TriangleAlert, tone: stats.out > 0 ? "err" : "neutral" },
        ]}
      />

      <section className="prod-card">
      <div className="prod-filters">
        <label>Start Date<DateInput value={startDate} onChange={(e) => setStartDate(e.target.value)} /></label>
        <label>End Date<DateInput value={endDate} onChange={(e) => setEndDate(e.target.value)} /></label>
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
              <tr key={r.id || i} className={r.compliance_flag === "within_spec" ? undefined : "qrl__row--out"}>
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
      </section>
    </div>
  );
}
