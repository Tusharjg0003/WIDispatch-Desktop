import React, { useEffect, useState } from "react";
import { fetchSummary, fetchRecords } from "../api/metrics";
import "./MetricDashboard.css";

const nf = new Intl.NumberFormat("en-US");
export const fmtM3 = (v) => (v == null ? "—" : nf.format(Math.round(v)));
export const fmtPct = (v) => (v == null ? "—" : `${v}%`);
const fmtInt = (v) => (v == null ? "—" : nf.format(v));

function formatValue(format, v) {
  switch (format) {
    case "m3":
      return fmtM3(v);
    case "pct":
      return fmtPct(v);
    case "int":
      return fmtInt(v);
    default:
      return v ?? "—";
  }
}

function Kpi({ desc, kpis }) {
  const tone = desc.tone?.(kpis);
  return (
    <div className={`kpi ${tone ? `kpi--${tone}` : ""}`}>
      <span className="kpi__eyebrow">{desc.eyebrow}</span>
      <span className="kpi__value">
        {formatValue(desc.format, kpis[desc.key])}
        {desc.unit && <span className="kpi__unit">{desc.unit}</span>}
      </span>
      {desc.sub && <span className="kpi__sub">{desc.sub(kpis)}</span>}
    </div>
  );
}

function Meter({ pct }) {
  if (pct == null) return <span className="meter meter--empty">—</span>;
  const w = Math.max(0, Math.min(100, pct));
  return (
    <span className="meter" title={`${pct}%`}>
      <span className="meter__track">
        <span className="meter__fill" style={{ width: `${w}%` }} />
      </span>
      <span className="meter__num">{pct}%</span>
    </span>
  );
}

function PlantSheet({ plant, config }) {
  const t = plant.totals;
  return (
    <section className="sheet">
      <header className="sheet__head">
        <div className="sheet__id">
          <span className="sheet__eyebrow">{config.groupLabel}</span>
          <h2 className="sheet__name">{plant.plantName}</h2>
          <span className="sheet__meta">
            {[plant.region, plant.assetType].filter(Boolean).join(" · ") || "—"}
            {plant.designCapacityM3 != null && (
              <>
                {" · "}
                <span className="mono">{fmtM3(plant.designCapacityM3)} m³/day capacity</span>
              </>
            )}
          </span>
        </div>
        <dl className="sheet__rollup">
          {config.rollups.map((r) => {
            const tone = r.tone?.(t);
            return (
              <div key={r.label} className={`rollup ${tone ? `rollup--${tone}` : ""}`}>
                <dt>{r.label}</dt>
                <dd className="mono">
                  {formatValue(r.format, t[r.key])}
                  {r.unit && <span className="rollup__unit">{r.unit}</span>}
                </dd>
              </div>
            );
          })}
        </dl>
      </header>

      <div className="sheet__table-wrap">
        <table className="ledger">
          <thead>
            <tr>
              <th>Date</th>
              <th className="num">{config.valueLabel}</th>
              {config.showUtilization && <th className="util-col">Utilization</th>}
              {config.showHandover && <th>Handover Point</th>}
              <th>Approved by</th>
            </tr>
          </thead>
          <tbody>
            {plant.rows.map((r) => (
              <tr key={r.date}>
                <td className="mono">{r.date}</td>
                <td className="num mono">{fmtM3(r.valueM3)}</td>
                {config.showUtilization && (
                  <td className="util-col">
                    <Meter pct={r.utilizationPct} />
                  </td>
                )}
                {config.showHandover && <td>{r.handoverPoints.join(", ") || "—"}</td>}
                <td className="approved">{r.approvedBy || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default function MetricDashboard({ domain, config }) {
  const [filters, setFilters] = useState({ from: "", to: "", plant: "" });
  const [summary, setSummary] = useState(null);
  const [groups, setGroups] = useState([]);
  const [plantOptions, setPlantOptions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    setPlantOptions([]);
    fetchSummary(domain)
      .then((s) =>
        setPlantOptions((s.byPlant || []).map((p) => ({ id: p.plantId, name: p.plantName })))
      )
      .catch(() => {});
  }, [domain]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([fetchSummary(domain, filters), fetchRecords(domain, filters)])
      .then(([s, g]) => {
        if (cancelled) return;
        setSummary(s);
        setGroups(g);
      })
      .catch((e) => !cancelled && setError(e.message || "Couldn't load data"))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [domain, filters.from, filters.to, filters.plant]);

  const kpis = summary?.kpis;
  const hasData = groups.length > 0;
  const filtered = filters.from || filters.to || filters.plant;

  return (
    <div className="metric page-transition">
      <header className="metric__head">
        <div className="metric__title-block">
          <span className="metric__eyebrow">{config.eyebrow}</span>
          <h1 className="metric__title">{config.title}</h1>
        </div>
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
          <label>
            <span>{config.groupLabel}</span>
            <select value={filters.plant}
              onChange={(e) => setFilters((f) => ({ ...f, plant: e.target.value }))}>
              <option value="">All</option>
              {plantOptions.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </label>
          {filtered && (
            <button className="metric__clear" onClick={() => setFilters({ from: "", to: "", plant: "" })}>
              Clear
            </button>
          )}
        </div>
      </header>

      {error && (
        <div className="metric__notice metric__notice--error">
          <span>{error}</span>
          <button onClick={() => setFilters((f) => ({ ...f }))}>Try again</button>
        </div>
      )}

      {loading && <div className="metric__notice">Loading {domain} data…</div>}

      {!loading && !error && !hasData && (
        <div className="metric__notice">{config.emptyText}</div>
      )}

      {!loading && !error && hasData && (
        <>
          <section className="status-strip" style={{ gridTemplateColumns: `repeat(${config.kpis.length}, 1fr)` }}>
            {config.kpis.map((desc) => (
              <Kpi key={desc.eyebrow} desc={desc} kpis={kpis} />
            ))}
          </section>

          <div className="sheets">
            {groups.map((p) => (
              <PlantSheet key={p.plantId} plant={p} config={config} />
            ))}
          </div>

          {config.renderFooter?.(filters)}
        </>
      )}
    </div>
  );
}
