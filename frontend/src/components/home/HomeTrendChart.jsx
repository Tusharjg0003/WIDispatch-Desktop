import React, { useMemo, useState } from "react";
import {
  Area, Bar, Brush, CartesianGrid, Cell, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { movingAverage } from "../../lib/homeInsights";

const compact = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });
const full = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const dayLabel = (iso) => new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", timeZone: "UTC" }).format(new Date(`${iso}T00:00:00Z`));
const longDay = (iso) => new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${iso}T00:00:00Z`));

const SERIES = [
  { key: "production", label: "Production", color: "var(--acc)" },
  { key: "demand", label: "Required demand", color: "var(--chart-purple)" },
  { key: "capacity", label: "Design capacity", color: "var(--chart-reference)" },
];

function ChartTooltip({ active, payload, view }) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload;
  return (
    <div className="home-tip">
      <strong>{longDay(point.date)}</strong>
      {view === "balance" ? (
        <span className={point.gap == null ? "" : point.gap < 0 ? "home-tip__bad" : "home-tip__good"}>
          {point.gap == null ? "Not reported by both" : `${point.gap < 0 ? "Short" : "Surplus"} ${full.format(Math.abs(point.gap))} m³`}
        </span>
      ) : (
        <>
          <span><i style={{ background: "var(--acc)" }} />Production <b>{point.production == null ? "—" : `${full.format(point.production)} m³`}</b></span>
          <span><i style={{ background: "var(--chart-purple)" }} />Demand <b>{point.demand == null ? "—" : `${full.format(point.demand)} m³`}</b></span>
          {point.gap != null && (
            <span className={point.gap < 0 ? "home-tip__bad" : "home-tip__good"}>
              {point.gap < 0 ? "Short" : "Surplus"} {full.format(Math.abs(point.gap))} m³
            </span>
          )}
        </>
      )}
      <small>Click for the day&apos;s breakdown</small>
    </div>
  );
}

// Daily production against required demand. Two views (volumes / balance),
// an optional 7-day average, toggleable series, a brush to zoom, and a click
// that selects a day for the breakdown beside it.
export default function HomeTrendChart({ series, selectedDate, onSelectDate }) {
  const [view, setView] = useState("volumes");
  const [smooth, setSmooth] = useState(false);
  const [hidden, setHidden] = useState(() => new Set(["capacity"]));

  const data = useMemo(() => {
    if (!smooth) return series;
    const prod = movingAverage(series, "production");
    const dem = movingAverage(series, "demand");
    const gap = movingAverage(series, "gap");
    return series.map((p, i) => ({
      ...p,
      production: p.production == null ? null : prod[i],
      demand: p.demand == null ? null : dem[i],
      gap: p.gap == null ? null : gap[i],
    }));
  }, [series, smooth]);

  const toggle = (key) =>
    setHidden((set) => {
      const next = new Set(set);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const handleClick = (state) => {
    const date = state?.activePayload?.[0]?.payload?.date;
    if (date) onSelectDate(date === selectedDate ? null : date);
  };

  return (
    <div className="home-trend">
      <div className="home-trend__bar">
        <div className="home-seg" role="tablist" aria-label="Chart view">
          <button type="button" className={view === "volumes" ? "is-on" : ""} onClick={() => setView("volumes")}>Volumes</button>
          <button type="button" className={view === "balance" ? "is-on" : ""} onClick={() => setView("balance")}>Balance</button>
        </div>
        {view === "volumes" && (
          <div className="home-legend">
            {SERIES.map((s) => (
              <button
                key={s.key}
                type="button"
                className={`home-legend__item${hidden.has(s.key) ? " is-off" : ""}`}
                onClick={() => toggle(s.key)}
                title={hidden.has(s.key) ? `Show ${s.label}` : `Hide ${s.label}`}
              >
                <i style={{ background: s.color }} className={s.key === "capacity" ? "is-dashed" : ""} />
                {s.label}
              </button>
            ))}
          </div>
        )}
        <label className="home-check">
          <input type="checkbox" checked={smooth} onChange={(e) => setSmooth(e.target.checked)} />
          7-day average
        </label>
      </div>

      <div className="home-trend__chart">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }} onClick={handleClick} style={{ cursor: "pointer" }}>
            <defs>
              <linearGradient id="homeProdFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--acc)" stopOpacity={0.32} />
                <stop offset="100%" stopColor="var(--acc)" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="var(--chart-grid)" strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="date" tickFormatter={dayLabel} tick={{ fill: "var(--chart-axis)", fontSize: 11 }} tickLine={false} axisLine={{ stroke: "var(--line)" }} minTickGap={24} />
            <YAxis tickFormatter={(v) => compact.format(v)} tick={{ fill: "var(--chart-axis)", fontSize: 11 }} tickLine={false} axisLine={false} width={48} />
            <Tooltip content={<ChartTooltip view={view} />} cursor={{ stroke: "var(--line2)", strokeWidth: 1 }} />
            {selectedDate && <ReferenceLine x={selectedDate} stroke="var(--acc)" strokeDasharray="4 3" />}
            {view === "volumes" ? (
              <>
                {!hidden.has("capacity") && (
                  <Line dataKey="capacity" stroke="var(--chart-reference)" strokeDasharray="6 4" dot={false} strokeWidth={1.5} isAnimationActive={false} connectNulls />
                )}
                {!hidden.has("production") && (
                  <Area dataKey="production" stroke="var(--acc)" strokeWidth={2} fill="url(#homeProdFill)" dot={false} activeDot={{ r: 4 }} connectNulls={false} isAnimationActive={false} />
                )}
                {!hidden.has("demand") && (
                  <Line dataKey="demand" stroke="var(--chart-purple)" strokeWidth={2} dot={false} activeDot={{ r: 4 }} connectNulls={false} isAnimationActive={false} />
                )}
              </>
            ) : (
              <>
                <ReferenceLine y={0} stroke="var(--line2)" />
                <Bar dataKey="gap" radius={[3, 3, 0, 0]} isAnimationActive={false}>
                  {data.map((p) => (
                    <Cell key={p.date} fill={p.gap == null ? "transparent" : p.gap < 0 ? "var(--err)" : "var(--ok)"} fillOpacity={p.date === selectedDate ? 1 : 0.75} />
                  ))}
                </Bar>
              </>
            )}
            {data.length > 14 && (
              <Brush dataKey="date" height={18} travellerWidth={8} stroke="var(--line2)" fill="var(--panel2)" tickFormatter={dayLabel} />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
