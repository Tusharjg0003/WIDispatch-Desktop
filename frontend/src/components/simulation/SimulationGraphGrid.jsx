import React, { useMemo } from "react";
import {
  Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { costTrendSeries, plantMixSeries, tankBehaviorSeries } from "../../lib/simulationRows";
import SupplyDemandChart from "./SupplyDemandChart";
import "./SimulationGraphGrid.css";

const nf = new Intl.NumberFormat("en-US");
const money = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const rate = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });

const PLANT_COLORS = ["#1a4a8a", "#10b981", "#d97706", "#7c3aed", "#0891b2", "#64748b"];
const TANK_COLORS = ["#0284c7", "#7c3aed", "#059669", "#d97706", "#dc2626", "#4f46e5", "#0f766e", "#9333ea"];

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

function TankBehaviorTooltip({ active, payload, tanks }) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload;
  return (
    <div className="simgraph__tooltip">
      <strong>{point.date}</strong>
      <div className="simgraph__tooltip-flows">
        <span>Inflow <b>{nf.format(point.totalInflow)} m³</b></span>
        <span>Outflow <b>{nf.format(point.totalOutflow)} m³</b></span>
      </div>
      {tanks.map((tank, index) => {
        const detail = point.tankDetails?.[tank.nodeId];
        if (!detail) return null;
        return (
          <div className="simgraph__tooltip-tank" key={tank.nodeId}>
            <span className="simgraph__tooltip-name">
              <i style={{ backgroundColor: TANK_COLORS[index % TANK_COLORS.length] }} />
              {tank.name}
            </span>
            <span>Start <b>{nf.format(detail.startLevel)} m³</b></span>
            <span>In / out <b>{nf.format(detail.inflow)} / {nf.format(detail.outflow)} m³</b></span>
            <span>End <b>{nf.format(detail.endLevel)} m³ ({rate.format(detail.fillPct)}%)</b></span>
            <span>Min / max <b>{nf.format(detail.minLevel)} / {nf.format(detail.maxLevel)} m³</b></span>
          </div>
        );
      })}
    </div>
  );
}

function TankBehaviorChart({ plan }) {
  const { series, tanks } = useMemo(() => tankBehaviorSeries(plan?.days || []), [plan?.days]);
  return (
    <ChartShell title="Daily Tank Behavior">
      {!tanks.length ? (
        <EmptyChart>No tank storage recorded.</EmptyChart>
      ) : (
        <ResponsiveContainer width="100%" height={220}>
          <ComposedChart data={series}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
            <XAxis dataKey="label" tick={{ fill: "#4b5563", fontSize: 11 }} />
            <YAxis tick={{ fill: "#4b5563", fontSize: 11 }} tickFormatter={(v) => nf.format(v)} width={74} />
            <Tooltip content={<TankBehaviorTooltip tanks={tanks} />} />
            <Legend />
            <Bar dataKey="totalInflow" name="Total Inflow" fill="#86efac" stroke="#16a34a" isAnimationActive={false} />
            <Bar dataKey="totalOutflow" name="Total Outflow" fill="#fecaca" stroke="#dc2626" isAnimationActive={false} />
            {tanks.map((tank, index) => (
              <Line
                key={tank.nodeId}
                type="monotone"
                dataKey={tank.key}
                name={`${tank.name} End Inventory`}
                stroke={TANK_COLORS[index % TANK_COLORS.length]}
                strokeWidth={2.5}
                dot={{ r: 2 }}
                activeDot={{ r: 4 }}
                connectNulls={false}
                isAnimationActive={false}
              />
            ))}
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
      <TankBehaviorChart plan={plan} />
    </div>
  );
}
