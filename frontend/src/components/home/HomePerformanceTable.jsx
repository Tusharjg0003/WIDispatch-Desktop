import React, { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";
import Sparkline from "./Sparkline";
import { sortRows } from "../../lib/homeInsights";

const compact = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });
const PAGE = 8;

const COLUMNS = {
  plants: [
    { key: "name", label: "Plant", align: "left" },
    { key: "region", label: "Region", align: "left" },
    { key: "avg", label: "Avg / day" },
    { key: "peak", label: "Peak" },
    { key: "utilization", label: "Utilization" },
    { key: "change", label: "vs prev." },
    { key: "spark", label: "Trend", sortable: false },
  ],
  gates: [
    { key: "name", label: "City gate", align: "left" },
    { key: "region", label: "Region", align: "left" },
    { key: "avg", label: "Avg / day" },
    { key: "peak", label: "Peak" },
    { key: "total", label: "Period total" },
    { key: "change", label: "vs prev." },
    { key: "spark", label: "Trend", sortable: false },
  ],
};

function Change({ value }) {
  if (value == null || !Number.isFinite(value)) return <span className="home-muted">—</span>;
  const flat = Math.abs(value) < 0.5;
  return (
    <span className={`home-delta${flat ? "" : value > 0 ? " is-up" : " is-down"}`}>
      {flat ? "±0%" : `${value > 0 ? "▲" : "▼"} ${Math.abs(value).toFixed(1)}%`}
    </span>
  );
}

function Utilization({ value }) {
  if (value == null) return <span className="home-muted">—</span>;
  const tone = value >= 95 ? "err" : value >= 80 ? "warn" : value < 40 ? "low" : "ok";
  return (
    <span className={`home-util home-util--${tone}`}>
      <span className="home-util__track"><i style={{ width: `${Math.min(100, value)}%` }} /></span>
      <b className="mono">{value.toFixed(0)}%</b>
    </span>
  );
}

// Plants and city gates for the period: sortable by any column, the top
// eight first (or all), each row opening its page.
export default function HomePerformanceTable({ plants, gates, onOpen }) {
  const [tab, setTab] = useState("plants");
  const [sort, setSort] = useState({ key: "avg", direction: "desc" });
  const [expanded, setExpanded] = useState(false);

  const rows = tab === "plants" ? plants : gates;
  const sorted = useMemo(() => sortRows(rows.filter((r) => r.days > 0), sort.key, sort.direction), [rows, sort]);
  const visible = expanded ? sorted : sorted.slice(0, PAGE);

  const setSortKey = (key) =>
    setSort((current) => (current.key === key ? { key, direction: current.direction === "desc" ? "asc" : "desc" } : { key, direction: key === "name" || key === "region" ? "asc" : "desc" }));

  return (
    <div className="home-perf">
      <div className="home-perf__bar">
        <div className="home-seg" role="tablist" aria-label="Table">
          <button type="button" className={tab === "plants" ? "is-on" : ""} onClick={() => { setTab("plants"); setExpanded(false); }}>
            Plants <b>{plants.filter((r) => r.days > 0).length}</b>
          </button>
          <button type="button" className={tab === "gates" ? "is-on" : ""} onClick={() => { setTab("gates"); setExpanded(false); if (sort.key === "utilization") setSort({ key: "avg", direction: "desc" }); }}>
            City gates <b>{gates.filter((r) => r.days > 0).length}</b>
          </button>
        </div>
        <span className="home-muted">Click a column to sort · a row to open it</span>
      </div>
      <div className="home-table-wrap">
        <table className="home-table">
          <thead>
            <tr>
              {COLUMNS[tab].map((col) => (
                <th key={col.key} className={col.align === "left" ? "is-left" : ""}>
                  {col.sortable === false ? col.label : (
                    <button type="button" onClick={() => setSortKey(col.key)} className={sort.key === col.key ? "is-sorted" : ""}>
                      {col.label}
                      {sort.key === col.key ? (sort.direction === "desc" ? <ArrowDown size={11} /> : <ArrowUp size={11} />) : <ChevronsUpDown size={11} className="home-muted" />}
                    </button>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => (
              <tr key={row.id} onClick={() => onOpen(tab, row)} tabIndex={0} onKeyDown={(e) => { if (e.key === "Enter") onOpen(tab, row); }}>
                <td className="is-left">
                  <span className="home-table__name">
                    <strong>{row.name}</strong>
                    {row.type && <small>{row.type}</small>}
                  </span>
                </td>
                <td className="is-left">{row.region}</td>
                <td className="mono">{compact.format(row.avg)}</td>
                <td className="mono">{compact.format(row.peak)}</td>
                {tab === "plants" ? <td><Utilization value={row.utilization} /></td> : <td className="mono">{compact.format(row.total)}</td>}
                <td><Change value={row.change} /></td>
                <td><Sparkline values={row.spark} width={84} height={22} color={tab === "plants" ? "var(--acc)" : "var(--chart-purple)"} /></td>
              </tr>
            ))}
            {!visible.length && (
              <tr className="is-empty"><td colSpan={COLUMNS[tab].length}>Nothing reported in this period.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      {sorted.length > PAGE && (
        <button type="button" className="home-link home-perf__more" onClick={() => setExpanded((v) => !v)}>
          {expanded ? "Show top 8" : `Show all ${sorted.length}`}
        </button>
      )}
    </div>
  );
}
