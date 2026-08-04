import React, { useMemo } from "react";
import { format } from "date-fns";
import { Download } from "lucide-react";
import { currentFinancials, changedLabels, financialEntriesToCsv } from "../../lib/financialEntries";
import "../production/ProductionInputTable.css"; // shared prod-* table/badge/kpi classes
import "./PlantFinancialTable.css";

const num = (v) => (v == null ? "—" : Number(v).toLocaleString("en-US", { maximumFractionDigits: 2 }));
const fmtDate = (v) => v || "—";
const statusLabel = (s) => String(s || "draft").replace(/_/g, " ");

export default function PlantFinancialTable({ entries = [], plantId }) {
  const current = useMemo(() => currentFinancials(entries), [entries]);

  const exportCsv = () => {
    const csv = financialEntriesToCsv(entries);
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `financial-entries-${plantId || "plant"}-${format(new Date(), "yyyy-MM-dd")}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="pfin">
      <div className="prod-strip">
        <div className="prod-strip-cell"><div className="prod-kpi-label">Current CCR</div><div className="prod-kpi-value">{num(current.ccr)}</div></div>
        <div className="prod-strip-cell"><div className="prod-kpi-label">Current Fixed O&amp;M</div><div className="prod-kpi-value">{num(current.fixedOm)}</div></div>
        <div className="prod-strip-cell"><div className="prod-kpi-label">Current Variable O&amp;M</div><div className="prod-kpi-value">{num(current.variableOm)}</div></div>
        <div className="prod-strip-cell"><div className="prod-kpi-label">Current CAPEX</div><div className="prod-kpi-value">{num(current.capex)}</div></div>
      </div>

      <div className="prod-filters pfin__actions">
        <button type="button" className="prod-btn" onClick={exportCsv} disabled={entries.length === 0}>
          <Download size={14} /> Export CSV
        </button>
      </div>

      <div className="prod-table-wrap">
        <table className="prod-table">
          <thead>
            <tr>
              <th>Effective From</th><th>Changed</th><th className="ta-r">CCR</th><th className="ta-r">Fixed O&amp;M</th>
              <th className="ta-r">Variable O&amp;M</th><th className="ta-r">CAPEX</th><th className="ta-r">Lifetime</th><th>Status</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => (
              <tr key={e.id}>
                <td className="nowrap mono">{fmtDate(e.effectiveFrom)}</td>
                <td>
                  {changedLabels(e.changedFields).length === 0
                    ? <span className="muted">Baseline</span>
                    : changedLabels(e.changedFields).map((label) => (
                      <span className="prod-badge pfin__changed" key={label}>{label}</span>
                    ))}
                </td>
                <td className="ta-r mono">{num(e.ccr)}</td>
                <td className="ta-r mono">{num(e.fixedOm)}</td>
                <td className="ta-r mono">{num(e.variableOm)}</td>
                <td className="ta-r mono">{num(e.capex)}</td>
                <td className="ta-r mono">{e.lifetime == null ? "—" : `${e.lifetime} yrs`}</td>
                <td><span className={`prod-badge prod-badge--${e.status}`}>{statusLabel(e.status)}</span></td>
              </tr>
            ))}
            {entries.length === 0 && <tr><td colSpan={8} className="empty">No financial entries for this plant.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
