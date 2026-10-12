import React, { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { Banknote, CalendarRange, Coins, Download, Landmark, TrendingDown, Wrench } from "lucide-react";
import { currentFinancials, changedLabels, financialEntriesToCsv } from "../../lib/financialEntries";
import { fetchEconomics } from "../../api/metrics";
import "./PlantFinancialTable.css";

// Economics → plant → Financial. The app's card language: KPI cards for the
// current cost parameters (with the date they took effect), the plant's place
// in the dispatch merit order (cheapest Variable O&M first, against every
// priced plant), then the effective-dated history with the entry in force
// marked. Nothing here writes.

const num = (v) => (v == null ? "—" : Number(v).toLocaleString("en-US", { maximumFractionDigits: 2 }));
const rate = (v) => (v == null ? "—" : Number(v).toFixed(2));
const statusLabel = (s) => String(s || "draft").replace(/_/g, " ");
const STATUS_TONE = { approved: "ok", submitted: "acc", revised: "acc", under_revision: "warn", draft: "warn", rejected: "err" };
const ordinal = (n) => {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
};

function Kpi({ icon: Icon, tone = "acc", label, value, unit, sub, changed }) {
  return (
    <section className={`pfin-kpi pfin-tone--${tone}`} aria-label={label}>
      <header className="pfin-kpi__head">
        <span className="pfin-kpi__icon" aria-hidden="true"><Icon size={15} /></span>
        <span className="pfin-kpi__label">{label}</span>
        {changed && <span className="pfin-pill pfin-pill--acc" title="Changed in the latest entry">Updated</span>}
      </header>
      <div className="pfin-kpi__value">{value}{unit && <small>{unit}</small>}</div>
      {sub && <span className="pfin-kpi__sub">{sub}</span>}
    </section>
  );
}

/** Where this plant sits in the merit order (cheapest Variable O&M dispatches first). */
function useMeritPosition(plantId, variableOm) {
  const [summary, setSummary] = useState(null);
  useEffect(() => {
    let alive = true;
    fetchEconomics().then((s) => alive && setSummary(s)).catch(() => alive && setSummary(null));
    return () => { alive = false; };
  }, []);
  return useMemo(() => {
    if (!summary || variableOm == null) return null;
    const priced = (summary.plants || [])
      .map((p) => (p.id === plantId ? { ...p, variableOm } : p))
      .filter((p) => p.variableOm != null)
      .sort((a, b) => a.variableOm - b.variableOm);
    const index = priced.findIndex((p) => p.id === plantId);
    if (index === -1) return null;
    const min = priced[0].variableOm;
    const max = priced[priced.length - 1].variableOm;
    return {
      rank: index + 1,
      of: priced.length,
      min,
      max,
      avg: priced.reduce((s, p) => s + p.variableOm, 0) / priced.length,
      share: max > min ? (variableOm - min) / (max - min) : 0,
    };
  }, [summary, plantId, variableOm]);
}

export default function PlantFinancialTable({ entries = [], plantId }) {
  const current = useMemo(() => currentFinancials(entries), [entries]);
  const merit = useMeritPosition(plantId, current.variableOm);

  // The entry in force today, and what it changed (to flag the KPI cards).
  const inForce = useMemo(
    () => entries.find((e) => e.effectiveFrom && e.effectiveFrom === current.effectiveFrom) || null,
    [entries, current.effectiveFrom],
  );
  const changed = new Set((inForce?.changedFields || []).map((f) => String(f).replace(/_([a-z])/g, (_, c) => c.toUpperCase())));
  const lifetime = inForce?.lifetime ?? entries.find((e) => e.lifetime != null)?.lifetime ?? null;
  const since = current.effectiveFrom ? `Since ${current.effectiveFrom}` : "No entry in force";

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
      <div className="pfin-kpis">
        <Kpi icon={Coins} label="Variable O&M" value={rate(current.variableOm)} unit="SAR/m³" sub={since} changed={changed.has("variableOm")} tone="acc" />
        <Kpi icon={Wrench} label="Fixed O&M" value={num(current.fixedOm)} unit="SAR/month" sub={since} changed={changed.has("fixedOm")} tone="warn" />
        <Kpi icon={Banknote} label="CCR" value={num(current.ccr)} unit="SAR/month" sub="Capacity charge rate" changed={changed.has("ccr")} tone="ok" />
        <Kpi icon={Landmark} label="CAPEX" value={num(current.capex)} unit="SAR" sub={lifetime != null ? `Over a ${lifetime}-year lifetime` : "Lifetime not set"} changed={changed.has("capex")} tone="purple" />
      </div>

      <section className="pfin-card" aria-label="Merit order">
        <header className="pfin-card__head">
          <span className="pfin-card__icon" aria-hidden="true"><TrendingDown size={14} /></span>
          <h3>Merit order</h3>
          <span className="pfin-card__hint">Cheapest Variable O&amp;M is dispatched first</span>
        </header>
        {merit ? (
          <div className="pfin-merit">
            <div className="pfin-merit__rank">
              <strong>
                {merit.of === 1 ? "Only" : merit.rank === 1 ? "Cheapest" : merit.rank === merit.of ? "Most expensive" : ordinal(merit.rank)}
              </strong>
              <span>
                {merit.of === 1
                  ? "priced plant on record"
                  : merit.rank === 1 || merit.rank === merit.of
                    ? `of ${merit.of} priced plants`
                    : `cheapest of ${merit.of} priced plants`}
              </span>
            </div>
            <div className="pfin-merit__scale">
              <div className="pfin-merit__track" aria-hidden="true">
                <span className="pfin-merit__marker" style={{ left: `${merit.share * 100}%` }} />
              </div>
              <div className="pfin-merit__ends">
                <span><small>Cheapest</small>{rate(merit.min)}</span>
                <span className="pfin-merit__avg"><small>Average</small>{rate(merit.avg)}</span>
                <span><small>Dearest</small>{rate(merit.max)}</span>
              </div>
            </div>
          </div>
        ) : (
          <p className="pfin-empty">
            {current.variableOm == null
              ? "No Variable O&M on record, so this plant has no merit-order position; dispatch falls back to a default rate."
              : "Loading the other plants' prices…"}
          </p>
        )}
      </section>

      <section className="pfin-card" aria-label="Financial history">
        <header className="pfin-card__head">
          <span className="pfin-card__icon" aria-hidden="true"><CalendarRange size={14} /></span>
          <h3>Financial history</h3>
          <span className="pfin-pill">{entries.length}</span>
          <button type="button" className="pfin-btn" onClick={exportCsv} disabled={entries.length === 0}>
            <Download size={13} aria-hidden="true" /> Export CSV
          </button>
        </header>
        <div className="pfin-table-wrap">
          <table className="pfin-table">
            <thead>
              <tr>
                <th>Effective</th><th>Changed</th>
                <th className="ta-r">Variable O&amp;M</th><th className="ta-r">Fixed O&amp;M</th><th className="ta-r">CCR</th>
                <th className="ta-r">CAPEX</th><th className="ta-r">Lifetime</th><th>Status</th><th>Updated by</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => {
                const labels = changedLabels(e.changedFields);
                const isCurrent = inForce && e.id === inForce.id;
                return (
                  <tr key={e.id} className={isCurrent ? "is-current" : undefined}>
                    <td className="nowrap">
                      <span className="mono">{e.effectiveFrom || "—"}</span>
                      {e.effectiveTo && <span className="pfin-muted mono"> → {e.effectiveTo}</span>}
                      {isCurrent && <span className="pfin-pill pfin-pill--ok pfin-current">In force</span>}
                    </td>
                    <td>
                      {labels.length === 0
                        ? <span className="pfin-muted">Baseline</span>
                        : labels.map((label) => <span className="pfin-pill pfin-pill--acc pfin-changed" key={label}>{label}</span>)}
                    </td>
                    <td className="ta-r mono">{rate(e.variableOm)}</td>
                    <td className="ta-r mono">{num(e.fixedOm)}</td>
                    <td className="ta-r mono">{num(e.ccr)}</td>
                    <td className="ta-r mono">{num(e.capex)}</td>
                    <td className="ta-r mono">{e.lifetime == null ? "—" : `${e.lifetime} yrs`}</td>
                    <td><span className={`pfin-pill pfin-pill--${STATUS_TONE[e.status] || ""}`}>{statusLabel(e.status)}</span></td>
                    <td className="pfin-muted nowrap">{e.updatedBy || "—"}</td>
                  </tr>
                );
              })}
              {entries.length === 0 && (
                <tr><td colSpan={9} className="pfin-empty">No financial entries for this plant yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="pfin-foot">Units: Variable O&amp;M in SAR/m³; Fixed O&amp;M and CCR in SAR/month; CAPEX in SAR.</p>
      </section>
    </div>
  );
}
