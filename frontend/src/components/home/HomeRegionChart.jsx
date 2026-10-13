import React from "react";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const compact = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });
const full = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

function RegionTip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  return (
    <div className="home-tip">
      <strong>{row.region}</strong>
      <span><i style={{ background: "var(--acc)" }} />Production <b>{full.format(row.production)} m³/day</b></span>
      <span><i style={{ background: "var(--chart-purple)" }} />Demand <b>{full.format(row.demand)} m³/day</b></span>
      <span className={row.balance < 0 ? "home-tip__bad" : "home-tip__good"}>
        {row.balance < 0 ? "Imports" : "Exports"} {full.format(Math.abs(row.balance))} m³/day
      </span>
      <small>Click to filter by this region</small>
    </div>
  );
}

// Average daily production vs demand per operating region; a region that
// needs more than it makes is drawing on the transmission network. Click a
// region to filter the page by it.
export default function HomeRegionChart({ rows, selected, onSelect }) {
  if (!rows.length) return <div className="home-empty">No regional data in this period.</div>;
  const dim = (region) => (selected !== "all" && selected !== region ? 0.35 : 1);
  return (
    <div className="home-regions">
      <div className="home-regions__chart">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 12, bottom: 0, left: 4 }} barGap={2} barCategoryGap="28%"
            onClick={(state) => {
              const region = state?.activePayload?.[0]?.payload?.region;
              if (region) onSelect(region === selected ? "all" : region);
            }}
            style={{ cursor: "pointer" }}
          >
            <CartesianGrid stroke="var(--chart-grid)" strokeDasharray="3 3" horizontal={false} />
            <XAxis type="number" tickFormatter={(v) => compact.format(v)} tick={{ fill: "var(--chart-axis)", fontSize: 11 }} tickLine={false} axisLine={false} />
            <YAxis type="category" dataKey="region" tick={{ fill: "var(--tx2)", fontSize: 11.5 }} tickLine={false} axisLine={false} width={66} />
            <Tooltip content={<RegionTip />} cursor={{ fill: "color-mix(in srgb, var(--acc) 7%, transparent)" }} />
            <Bar dataKey="production" fill="var(--acc)" radius={[0, 3, 3, 0]} isAnimationActive={false}>
              {rows.map((r) => <Cell key={r.region} fillOpacity={dim(r.region)} />)}
            </Bar>
            <Bar dataKey="demand" fill="var(--chart-purple)" radius={[0, 3, 3, 0]} isAnimationActive={false}>
              {rows.map((r) => <Cell key={r.region} fillOpacity={dim(r.region)} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="home-regions__balance">
        {rows.map((r) => (
          <button key={r.region} type="button" className={`home-regions__row${selected === r.region ? " is-on" : ""}`} onClick={() => onSelect(r.region === selected ? "all" : r.region)}>
            <span>{r.region}</span>
            <b className={`mono ${r.balance < 0 ? "home-neg" : "home-pos"}`}>{r.balance < 0 ? "−" : "+"}{compact.format(Math.abs(r.balance))}</b>
          </button>
        ))}
      </div>
    </div>
  );
}
