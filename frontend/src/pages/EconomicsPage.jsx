import React, { useEffect, useState } from "react";
import { CircleDollarSign } from "lucide-react";
import { fetchEconomics } from "../api/metrics";
import WorkspaceHeader from "../components/WorkspaceHeader";
import "../components/MetricDashboard.css";
import "./EconomicsPage.css";

const nf = new Intl.NumberFormat("en-US");
const fmt = (v) => (v == null ? "—" : nf.format(Math.round(v)));
const fmtDate = (iso) => (iso ? iso.slice(0, 10) : "—");

function Kpi({ eyebrow, value, sub }) {
  return (
    <div className="kpi">
      <span className="kpi__eyebrow">{eyebrow}</span>
      <span className="kpi__value">{value}</span>
      {sub && <span className="kpi__sub">{sub}</span>}
    </div>
  );
}

export default function EconomicsPage() {
  const [filters, setFilters] = useState({ from: "", to: "" });
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchEconomics(filters)
      .then((d) => !cancelled && setData(d))
      .catch((e) => !cancelled && setError(e.message || "Couldn't load economics data"))
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [filters.from, filters.to]);

  const k = data?.kpis;
  const filtered = filters.from || filters.to;
  const compMax = data ? Math.max(1, ...data.composition.map((c) => c.value)) : 1;

  return (
    <div className="metric page-transition economics-page economics-page--boxy">
      <WorkspaceHeader
        title="Economics"
        subtitle="Dispatch · Economics"
        icon={CircleDollarSign}
        status={filtered ? "Filtered" : undefined}
        statusTone="blue"
        actions={(
          <div className="metric__filters">
            <label>
              <span>From</span>
              <input type="date" value={filters.from}
                onChange={(e) => setFilters((f) => ({ ...f, from: e.target.value }))} />
            </label>
            <label>
              <span>To</span>
              <input type="date" value={filters.to}
                onChange={(e) => setFilters((f) => ({ ...f, to: e.target.value }))} />
            </label>
            {filtered && (
              <button className="metric__clear" onClick={() => setFilters({ from: "", to: "" })}>
                Clear
              </button>
            )}
          </div>
        )}
      />

      {error && (
        <div className="metric__notice metric__notice--error">
          <span>{error}</span>
          <button onClick={() => setFilters((f) => ({ ...f }))}>Try again</button>
        </div>
      )}

      {loading && <div className="metric__notice">Loading economics data…</div>}

      {!loading && !error && data && data.kpis.entries === 0 && (
        <div className="metric__notice">No approved financial entries for this range.</div>
      )}

      {!loading && !error && data && data.kpis.entries > 0 && (
        <>
          <section className="status-strip" style={{ gridTemplateColumns: "repeat(6, 1fr)" }}>
            <Kpi eyebrow="Approved entries" value={fmt(k.entries)} sub="Cost-parameter sets" />
            <Kpi eyebrow="Total CapEx" value={fmt(k.totalCapex)} sub="Capital expenditure" />
            <Kpi eyebrow="Total Fixed O&M" value={fmt(k.totalFixedOm)} sub="Fixed operating cost" />
            <Kpi eyebrow="Total Variable O&M" value={fmt(k.totalVariableOm)} sub="Variable operating cost" />
            <Kpi eyebrow="Total CCR" value={fmt(k.totalCcr)} sub="Capital charge" />
            <Kpi eyebrow="Avg lifetime" value={k.avgLifetimeYears ?? "—"} sub="Years" />
          </section>

          {/* Cost composition */}
          <section className="sheet">
            <header className="sheet__head sheet__head--simple">
              <h2 className="sheet__name sheet__name--sm">Cost Composition</h2>
            </header>
            <div className="econ-comp">
              {data.composition.map((c) => (
                <div className="econ-comp__row" key={c.label}>
                  <span className="econ-comp__label">{c.label}</span>
                  <span className="econ-comp__track">
                    <span className="econ-comp__fill" style={{ width: `${(c.value / compMax) * 100}%` }} />
                  </span>
                  <span className="econ-comp__value mono">{fmt(c.value)}</span>
                </div>
              ))}
            </div>
          </section>

          {/* Entries */}
          <section className="sheet">
            <header className="sheet__head sheet__head--simple">
              <h2 className="sheet__name sheet__name--sm">
                Financial Entries
                <span className="sheet__count">{data.entries.length}</span>
              </h2>
            </header>
            <div className="sheet__table-wrap">
              <table className="ledger">
                <thead>
                  <tr>
                    <th>Entry</th>
                    <th className="num">CCR</th>
                    <th className="num">CapEx</th>
                    <th className="num">Fixed O&M</th>
                    <th className="num">Variable O&M</th>
                    <th className="num">Lifetime (yrs)</th>
                    <th>Approved by</th>
                    <th>Approved</th>
                  </tr>
                </thead>
                <tbody>
                  {data.entries.map((r) => (
                    <tr key={r.id}>
                      <td className="mono">{r.id}</td>
                      <td className="num mono">{fmt(r.ccr)}</td>
                      <td className="num mono">{fmt(r.capex)}</td>
                      <td className="num mono">{fmt(r.fixedOm)}</td>
                      <td className="num mono">{fmt(r.variableOm)}</td>
                      <td className="num mono">{r.lifetime ?? "—"}</td>
                      <td className="approved">{r.approvedBy || "—"}</td>
                      <td className="mono">{fmtDate(r.approvedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
