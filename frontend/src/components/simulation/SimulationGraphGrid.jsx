import React, { useMemo } from "react";
import {
  Bar, BarChart, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { bottleneckSeries, costTrendSeries, plantMixSeries } from "../../lib/simulationRows";
import SupplyDemandChart from "./SupplyDemandChart";
import "./SimulationGraphGrid.css";

const nf = new Intl.NumberFormat("en-US");
const money = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const rate = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });

const PLANT_COLORS = ["#1a4a8a", "#10b981", "#d97706", "#7c3aed", "#0891b2", "#64748b"];
const BOTTLENECKS = [
  { key: "pipe", name: "Pipe", color: "#d97706" },
  { key: "pump", name: "Pump", color: "#0891b2" },
  { key: "gateIntake", name: "Gate intake", color: "#dc2626" },
  { key: "plantSupply", name: "Plant supply", color: "#7c3aed" },
];

function ChartShell({ title, children }) {
  return (
    <section className="sheet simgraph">
      <header className="sheet__head sheet__head--simple">
        <h2 className="sheet__name sheet__name--sm">{title}</h2>
      </header>
      <div className="simgraph__body">{children}</div>
    </section>
  );
}

function EmptyChart({ children }) {
  return <div className="simgraph__empty">{children}</div>;
}

function DispatchCostChart({ plan }) {
  const series = useMemo(() => costTrendSeries(plan?.days || []), [plan?.days]);
  const hasCost = series.some((d) => d.cost > 0 || d.avgCost != null);

  return (
    <ChartShell title="Dispatch Cost">
      {!hasCost ? (
        <EmptyChart>No dispatch cost recorded.</EmptyChart>
      ) : (
        <ResponsiveContainer width="100%" height={220}>
          <ComposedChart data={series}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
            <XAxis dataKey="label" tick={{ fill: "#4b5563", fontSize: 11 }} />
            <YAxis
              yAxisId="cost"
              tick={{ fill: "#4b5563", fontSize: 11 }}
              tickFormatter={(v) => money.format(v)}
              width={74}
            />
            <YAxis
              yAxisId="rate"
              orientation="right"
              tick={{ fill: "#4b5563", fontSize: 11 }}
              tickFormatter={(v) => rate.format(v)}
              width={52}
            />
            <Tooltip
              formatter={(value, name) => {
                if (name === "Avg SAR/m3") return [`${rate.format(value)} SAR/m3`, name];
                return [`${money.format(Math.round(value))} SAR`, name];
              }}
            />
            <Legend />
            <Bar yAxisId="cost" dataKey="cost" name="Variable O&M" fill="#1a4a8a" radius={[3, 3, 0, 0]} />
            <Line
              yAxisId="rate"
              type="monotone"
              dataKey="avgCost"
              name="Avg SAR/m3"
              stroke="#d97706"
              strokeWidth={2}
              dot={{ r: 2 }}
              connectNulls={false}
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      )}
    </ChartShell>
  );
}

function PlantDispatchMixChart({ plan }) {
  const mix = useMemo(() => plantMixSeries(plan, { limit: 5 }), [plan]);

  return (
    <ChartShell title="Plant Dispatch Mix">
      {!mix.plants.length ? (
        <EmptyChart>No plant allocation recorded.</EmptyChart>
      ) : (
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={mix.series}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
            <XAxis dataKey="label" tick={{ fill: "#4b5563", fontSize: 11 }} />
            <YAxis tick={{ fill: "#4b5563", fontSize: 11 }} tickFormatter={(v) => nf.format(v)} width={74} />
            <Tooltip formatter={(value, name) => [`${nf.format(Math.round(value))} m3`, name]} />
            <Legend />
            {mix.plants.map((plant, index) => (
              <Bar
                key={plant.key}
                dataKey={plant.key}
                name={plant.name}
                stackId="dispatch"
                fill={PLANT_COLORS[index % PLANT_COLORS.length]}
                isAnimationActive={false}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      )}
    </ChartShell>
  );
}

function BottleneckDriversChart({ plan }) {
  const series = useMemo(() => bottleneckSeries(plan?.days || []), [plan?.days]);
  const hasBottlenecks = series.some((d) => BOTTLENECKS.some((b) => d[b.key] > 0) || d.shortage > 0);

  return (
    <ChartShell title="Bottleneck Drivers">
      {!hasBottlenecks ? (
        <EmptyChart>No binding constraints recorded.</EmptyChart>
      ) : (
        <ResponsiveContainer width="100%" height={220}>
          <ComposedChart data={series}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
            <XAxis dataKey="label" tick={{ fill: "#4b5563", fontSize: 11 }} />
            <YAxis yAxisId="count" allowDecimals={false} tick={{ fill: "#4b5563", fontSize: 11 }} width={42} />
            <YAxis
              yAxisId="shortage"
              orientation="right"
              tick={{ fill: "#4b5563", fontSize: 11 }}
              tickFormatter={(v) => nf.format(v)}
              width={74}
            />
            <Tooltip
              formatter={(value, name) => {
                if (name === "Shortfall") return [`${nf.format(Math.round(value))} m3`, name];
                return [value, name];
              }}
            />
            <Legend />
            {BOTTLENECKS.map((item) => (
              <Bar
                key={item.key}
                yAxisId="count"
                dataKey={item.key}
                name={item.name}
                stackId="constraints"
                fill={item.color}
                isAnimationActive={false}
              />
            ))}
            <Line
              yAxisId="shortage"
              type="monotone"
              dataKey="shortage"
              name="Shortfall"
              stroke="#111827"
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      )}
    </ChartShell>
  );
}

export default function SimulationGraphGrid({ plan }) {
  return (
    <div className="simgraphs">
      <SupplyDemandChart plan={plan} compact className="simgraph" />
      <DispatchCostChart plan={plan} />
      <PlantDispatchMixChart plan={plan} />
      <BottleneckDriversChart plan={plan} />
    </div>
  );
}
