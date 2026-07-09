import React, { useEffect, useState } from "react";
import { GitBranch } from "lucide-react";
import { fetchTransmission } from "../api/metrics";
import WorkspaceHeader from "../components/WorkspaceHeader";
import "../components/MetricDashboard.css";
import "./TransmissionPage.css";

const nf = new Intl.NumberFormat("en-US");
const fmtM3 = (v) => (v == null ? "—" : nf.format(Math.round(v)));
const fmtInt = (v) => (v == null ? "—" : nf.format(v));
const fmtDT = (iso) => (iso ? iso.slice(0, 16).replace("T", " ") : "—");

const STATUS_LABEL = {
  operational: "Operational",
  maintenance: "Maintenance",
  under_construction: "Under constr.",
  planned: "Planned",
  decommissioned: "Decommissioned",
};

function Kpi({ eyebrow, value, unit, sub, tone }) {
  return (
    <div className={`kpi ${tone ? `kpi--${tone}` : ""}`}>
      <span className="kpi__eyebrow">{eyebrow}</span>
      <span className="kpi__value">
        {value}
        {unit && <span className="kpi__unit">{unit}</span>}
      </span>
      {sub && <span className="kpi__sub">{sub}</span>}
    </div>
  );
}

function Section({ title, count, children }) {
  return (
    <section className="sheet">
      <header className="sheet__head sheet__head--simple">
        <h2 className="sheet__name sheet__name--sm">
          {title}
          {count != null && <span className="sheet__count">{count}</span>}
        </h2>
      </header>
      {children}
    </section>
  );
}

function EmptyRow({ colSpan, text }) {
  return (
    <tr>
      <td colSpan={colSpan} className="ledger__empty">{text}</td>
    </tr>
  );
}

export default function TransmissionPage() {
  const [filters, setFilters] = useState({ from: "", to: "" });
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchTransmission(filters)
      .then((d) => !cancelled && setData(d))
      .catch((e) => !cancelled && setError(e.message || "Couldn't load transmission data"))
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [filters.from, filters.to]);

  const k = data?.kpis;
  const filtered = filters.from || filters.to;

  return (
    <div className="metric page-transition transmission-page transmission-page--boxy">
      <WorkspaceHeader
        title="Transmission"
        subtitle="Dispatch · Network"
        icon={GitBranch}
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

      {loading && <div className="metric__notice">Loading transmission data…</div>}

      {!loading && !error && data && (
        <>
          <section className="status-strip" style={{ gridTemplateColumns: "repeat(6, 1fr)" }}>
            <Kpi eyebrow="Required production" value={fmtM3(k.requiredProductionM3)} unit="m³"
              sub="Target across plants" />
            <Kpi eyebrow="Maintenance impact" value={fmtM3(k.maintenanceImpactM3)} unit="m³"
              sub="Planned + emergency" tone={k.maintenanceImpactM3 > 0 ? "warn" : undefined} />
            <Kpi eyebrow="Outage loss" value={fmtM3(k.outageLossM3)} unit="m³"
              sub="Unplanned downtime" tone={k.outageLossM3 > 0 ? "bad" : undefined} />
            <Kpi eyebrow="Issue loss" value={fmtM3(k.issueLossM3)} unit="m³"
              sub="Reported issues" tone={k.issueLossM3 > 0 ? "warn" : undefined} />
            <Kpi eyebrow="Assets operational" value={fmtInt(k.assetsOperational)}
              sub={`of ${fmtInt(k.assetsTotal)} total`} tone="good" />
            <Kpi eyebrow="In maintenance" value={fmtInt(k.assetsInMaintenance)}
              sub="Assets down for service" tone={k.assetsInMaintenance > 0 ? "warn" : undefined} />
          </section>

          {/* Asset status matrix */}
          <Section title="Network Assets by Status">
            <div className="sheet__table-wrap">
              <table className="ledger matrix">
                <thead>
                  <tr>
                    <th>Asset</th>
                    {data.assets.statuses.map((s) => (
                      <th key={s} className="num">{STATUS_LABEL[s] || s}</th>
                    ))}
                    <th className="num">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {data.assets.byType.map((t) => (
                    <tr key={t.type}>
                      <td>{t.type}</td>
                      {data.assets.statuses.map((s) => (
                        <td key={s} className={`num mono ${t.counts[s] ? "" : "zero"}`}>
                          {t.counts[s] || "—"}
                        </td>
                      ))}
                      <td className="num mono total">{fmtInt(t.total)}</td>
                    </tr>
                  ))}
                  <tr className="matrix__totals">
                    <td>All assets</td>
                    {data.assets.statuses.map((s) => (
                      <td key={s} className="num mono">{data.assets.totals[s] || "—"}</td>
                    ))}
                    <td className="num mono total">{fmtInt(data.assets.grandTotal)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </Section>

          {/* Required production by plant */}
          <Section title="Required Production by Plant" count={data.requiredByPlant.length}>
            <div className="sheet__table-wrap">
              <table className="ledger">
                <thead>
                  <tr><th>Plant</th><th className="num">Required m³</th><th className="num">Days</th></tr>
                </thead>
                <tbody>
                  {data.requiredByPlant.length === 0
                    ? <EmptyRow colSpan={3} text="No required-production targets for this range." />
                    : data.requiredByPlant.map((p) => (
                      <tr key={p.plantId}>
                        <td>{p.plantName}</td>
                        <td className="num mono">{fmtM3(p.requiredM3)}</td>
                        <td className="num mono">{p.days}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </Section>

          {/* Maintenance */}
          <Section title="Maintenance" count={data.maintenance.length}>
            <div className="sheet__table-wrap">
              <table className="ledger">
                <thead>
                  <tr><th>Assets</th><th>Type</th><th>Start</th><th>End</th><th className="num">Impact m³</th><th>Notes</th></tr>
                </thead>
                <tbody>
                  {data.maintenance.length === 0
                    ? <EmptyRow colSpan={6} text="No maintenance records for this range." />
                    : data.maintenance.map((r) => (
                      <tr key={r.id}>
                        <td>{r.plantName}</td>
                        <td><span className={`pill pill--${r.type}`}>{r.type}</span></td>
                        <td className="mono">{fmtDT(r.start)}</td>
                        <td className="mono">{fmtDT(r.end)}</td>
                        <td className="num mono">{fmtM3(r.impactM3)}</td>
                        <td className="notes">{r.description || "—"}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </Section>

          {/* Outages */}
          <Section title="Outages" count={data.outages.length}>
            <div className="sheet__table-wrap">
              <table className="ledger">
                <thead>
                  <tr><th>Assets</th><th>Type</th><th>Start</th><th className="num">Duration (h)</th><th className="num">Loss m³</th><th>Emergency</th></tr>
                </thead>
                <tbody>
                  {data.outages.length === 0
                    ? <EmptyRow colSpan={6} text="No outages for this range." />
                    : data.outages.map((r) => (
                      <tr key={r.id}>
                        <td>{r.plantName}</td>
                        <td><span className={`pill pill--${r.type}`}>{r.type}</span></td>
                        <td className="mono">{fmtDT(r.start)}</td>
                        <td className="num mono">{r.durationHours ?? "—"}</td>
                        <td className="num mono var--shortfall">{fmtM3(r.lossM3)}</td>
                        <td>{r.isEmergency ? <span className="pill pill--emergency">Emergency</span> : "—"}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </Section>

          {/* Issues */}
          <Section title="Issues" count={data.issues.length}>
            <div className="sheet__table-wrap">
              <table className="ledger">
                <thead>
                  <tr><th>Assets</th><th>Date</th><th className="num">Loss m³</th><th>Description</th></tr>
                </thead>
                <tbody>
                  {data.issues.length === 0
                    ? <EmptyRow colSpan={4} text="No issues for this range." />
                    : data.issues.map((r) => (
                      <tr key={r.id}>
                        <td>{r.plantName}</td>
                        <td className="mono">{r.date || "—"}</td>
                        <td className="num mono var--shortfall">{fmtM3(r.lossM3)}</td>
                        <td className="notes">{r.description || "—"}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </Section>
        </>
      )}
    </div>
  );
}
