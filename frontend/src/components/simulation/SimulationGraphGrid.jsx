import React, { useMemo } from "react";
import {
  CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { costTrendSeries, plantMixSeries } from "../../lib/simulationRows";
import SupplyDemandChart from "./SupplyDemandChart";
import "./SimulationGraphGrid.css";

const nf = new Intl.NumberFormat("en-US");
const money = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const rate = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });

const PLANT_COLORS = ["#1a4a8a", "#10b981", "#d97706", "#7c3aed", "#0891b2", "#64748b"];

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
                if (name === "Variable O&M") return [`${rate.format(value)} SAR/m3`, name];
                return [`${money.format(Math.round(value))} SAR`, name];
              }}
            />
            <Legend />
            <Line
              yAxisId="cost"
              type="monotone"
              dataKey="cost"
              name="Production Cost"
              stroke="#1a4a8a"
              strokeWidth={2}
              dot={{ r: 2 }}
              isAnimationActive={false}
            />
            <Line
              yAxisId="rate"
              type="monotone"
              dataKey="avgCost"
              name="Variable O&M"
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
          <ComposedChart data={mix.series}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
            <XAxis dataKey="label" tick={{ fill: "#4b5563", fontSize: 11 }} />
            <YAxis tick={{ fill: "#4b5563", fontSize: 11 }} tickFormatter={(v) => nf.format(v)} width={74} />
            <Tooltip formatter={(value, name) => [`${nf.format(Math.round(value))} m3`, name]} />
            <Legend />
            {mix.plants.map((plant, index) => (
              <Line
                key={plant.key}
                type="monotone"
                dataKey={plant.key}
                name={plant.name}
                stroke={PLANT_COLORS[index % PLANT_COLORS.length]}
                strokeWidth={2}
                dot={{ r: 2 }}
                activeDot={{ r: 4 }}
                isAnimationActive={false}
              />
            ))}
          </ComposedChart>
        </ResponsiveContainer>
      )}
    </ChartShell>
  );
}

function TankUtilizationPlaceholder() {
  return (
    <ChartShell title="Tank Utilization">
      <div className="simgraph__placeholder">
        <span className="simgraph__placeholder-value">Pending</span>
        <span className="simgraph__placeholder-copy">Tank storage, drawdown, and refill utilization will appear here.</span>
      </div>
    </ChartShell>
  );
}

export default function SimulationGraphGrid({ plan }) {
  return (
    <div className="simgraphs">
      <SupplyDemandChart plan={plan} compact className="simgraph" />
      <DispatchCostChart plan={plan} />
      <PlantDispatchMixChart plan={plan} />
      <TankUtilizationPlaceholder />
    </div>
  );
}
