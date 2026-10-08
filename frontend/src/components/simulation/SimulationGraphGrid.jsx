import React, { useMemo, useState } from "react";
import {
  Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import {
  costTrendSeries, gateDailySupply, plantMixSeries, plantPerformanceRows,
  systemBalanceSeries, tankBehaviorSeries,
} from "../../lib/simulationRows";
import SupplyDemandChart from "./SupplyDemandChart";
import "./SimulationGraphGrid.css";

const nf = new Intl.NumberFormat("en-US");
const money = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const rate = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });

// WIDispatch-Production light chart palette (globals.css .light --chart-*).
const PLANT_COLORS = ["var(--acc)", "var(--chart-output)", "var(--chart-contracted)", "var(--chart-maximum)", "var(--chart-cyan)", "var(--chart-axis)"];
const TANK_COLORS = ["var(--chart-output)", "var(--chart-maximum)", "var(--chart-contracted)", "var(--chart-warning)", "var(--chart-danger)", "var(--acc)", "var(--chart-cyan)", "var(--chart-success)"];

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
            <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" vertical={false} />
            <XAxis dataKey="label" tick={{ fill: "var(--chart-axis)", fontSize: 11 }} />
            <YAxis
              yAxisId="cost"
              tick={{ fill: "var(--chart-axis)", fontSize: 11 }}
              tickFormatter={(v) => money.format(v)}
              width={74}
            />
            <YAxis
              yAxisId="rate"
              orientation="right"
              tick={{ fill: "var(--chart-axis)", fontSize: 11 }}
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
              stroke="var(--acc)"
              strokeWidth={2}
              dot={{ r: 2 }}
              isAnimationActive={false}
            />
            <Line
              yAxisId="rate"
              type="monotone"
              dataKey="avgCost"
              name="Variable O&M"
              stroke="var(--warn)"
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
            <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" vertical={false} />
            <XAxis dataKey="label" tick={{ fill: "var(--chart-axis)", fontSize: 11 }} />
            <YAxis tick={{ fill: "var(--chart-axis)", fontSize: 11 }} tickFormatter={(v) => nf.format(v)} width={74} />
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
            <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" vertical={false} />
            <XAxis dataKey="label" tick={{ fill: "var(--chart-axis)", fontSize: 11 }} />
            <YAxis tick={{ fill: "var(--chart-axis)", fontSize: 11 }} tickFormatter={(v) => nf.format(v)} width={74} />
            <Tooltip content={<TankBehaviorTooltip tanks={tanks} />} />
            <Legend />
            <Bar dataKey="totalInflow" name="Total Inflow" fill="var(--ok-border)" stroke="var(--ok)" isAnimationActive={false} />
            <Bar dataKey="totalOutflow" name="Total Outflow" fill="var(--err-soft)" stroke="var(--err)" isAnimationActive={false} />
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

// ── Charts adapted from the SWIIMS Results tab (year axis → daily horizon) ────

function SystemBalanceChart({ plan }) {
  const series = useMemo(() => systemBalanceSeries(plan?.days || []), [plan?.days]);
  return (
    <ChartShell title="System Balance">
      {!series.length ? (
        <EmptyChart>No daily balance recorded.</EmptyChart>
      ) : (
        <ResponsiveContainer width="100%" height={220}>
          <ComposedChart data={series}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" vertical={false} />
            <XAxis dataKey="label" tick={{ fill: "var(--chart-axis)", fontSize: 11 }} />
            <YAxis tick={{ fill: "var(--chart-axis)", fontSize: 11 }} tickFormatter={(v) => nf.format(v)} width={74} />
            <Tooltip formatter={(value, name) => [`${nf.format(Math.round(value))} m3`, name]} />
            <Legend />
            <Line type="monotone" dataKey="capacity" name="Active capacity" stroke="var(--chart-reference)" strokeDasharray="4 3" strokeWidth={2} dot={false} isAnimationActive={false} />
            <Line type="monotone" dataKey="demand" name="Demand" stroke="var(--err)" strokeWidth={2} dot={{ r: 2 }} isAnimationActive={false} />
            <Line type="monotone" dataKey="supply" name="Production" stroke="var(--acc)" strokeWidth={2} dot={{ r: 2 }} isAnimationActive={false} />
          </ComposedChart>
        </ResponsiveContainer>
      )}
    </ChartShell>
  );
}

function PlantUtilisationChart({ plan }) {
  const rows = useMemo(
    () => plantPerformanceRows(plan?.days || []).filter((r) => r.utilisationPct != null),
    [plan?.days]
  );
  return (
    <ChartShell title="Plant Utilisation">
      {!rows.length ? (
        <EmptyChart>No plant utilisation recorded.</EmptyChart>
      ) : (
        <ResponsiveContainer width="100%" height={Math.max(200, rows.length * 30)}>
          <ComposedChart data={rows} layout="vertical" margin={{ left: 16, right: 16 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" horizontal={false} />
            <XAxis type="number" domain={[0, "dataMax"]} tick={{ fill: "var(--chart-axis)", fontSize: 11 }} tickFormatter={(v) => `${v}%`} />
            <YAxis type="category" dataKey="name" width={130} tick={{ fill: "var(--chart-axis)", fontSize: 11 }} />
            <Tooltip formatter={(value) => [`${rate.format(value)}%`, "Utilisation"]} />
            <Bar dataKey="utilisationPct" name="Utilisation" fill="var(--acc)" isAnimationActive={false} />
          </ComposedChart>
        </ResponsiveContainer>
      )}
    </ChartShell>
  );
}

function PlantCostChart({ plan }) {
  const rows = useMemo(
    () => plantPerformanceRows(plan?.days || []).filter((r) => r.costSar > 0),
    [plan?.days]
  );
  return (
    <ChartShell title="Plant Cost">
      {!rows.length ? (
        <EmptyChart>No plant cost recorded.</EmptyChart>
      ) : (
        <ResponsiveContainer width="100%" height={Math.max(200, rows.length * 30)}>
          <ComposedChart data={rows} layout="vertical" margin={{ left: 16, right: 16 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" horizontal={false} />
            <XAxis type="number" tick={{ fill: "var(--chart-axis)", fontSize: 11 }} tickFormatter={(v) => money.format(v)} />
            <YAxis type="category" dataKey="name" width={130} tick={{ fill: "var(--chart-axis)", fontSize: 11 }} />
            <Tooltip formatter={(value) => [`${money.format(Math.round(value))} SAR`, "Variable O&M cost"]} />
            <Bar dataKey="costSar" name="Variable O&M cost" fill="var(--chart-cyan)" isAnimationActive={false} />
          </ComposedChart>
        </ResponsiveContainer>
      )}
    </ChartShell>
  );
}

function DeliveryPointSupplyChart({ plan }) {
  const gates = useMemo(() => gateDailySupply(plan?.days || []).gates, [plan?.days]);
  const [selected, setSelected] = useState(null);
  const nodeId = selected || gates[0]?.nodeId || null;
  const series = useMemo(() => gateDailySupply(plan?.days || [], nodeId).series, [plan?.days, nodeId]);
  return (
    <ChartShell title="Delivery Point Supply">
      {!gates.length ? (
        <EmptyChart>No city gates on this network.</EmptyChart>
      ) : (
        <>
          <div className="simgraph__control">
            <label>
              Delivery point
              <select value={nodeId || ""} onChange={(e) => setSelected(e.target.value)}>
                {gates.map((g) => (
                  <option key={g.nodeId} value={g.nodeId}>{g.name}</option>
                ))}
              </select>
            </label>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <ComposedChart data={series}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" vertical={false} />
              <XAxis dataKey="label" tick={{ fill: "var(--chart-axis)", fontSize: 11 }} />
              <YAxis tick={{ fill: "var(--chart-axis)", fontSize: 11 }} tickFormatter={(v) => nf.format(v)} width={74} />
              <Tooltip formatter={(value, name) => [`${nf.format(Math.round(value))} m3`, name]} />
              <Legend />
              <Bar dataKey="delivered" name="Delivered" fill="var(--acc-border)" stroke="var(--acc)" isAnimationActive={false} />
              <Line type="monotone" dataKey="required" name="Required" stroke="var(--err)" strokeWidth={2} dot={{ r: 2 }} isAnimationActive={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </>
      )}
    </ChartShell>
  );
}

export default function SimulationGraphGrid({ plan }) {
  return (
    <div className="simgraphs">
      <SupplyDemandChart plan={plan} compact className="simgraph" />
      <SystemBalanceChart plan={plan} />
      <DispatchCostChart plan={plan} />
      <PlantDispatchMixChart plan={plan} />
      <PlantUtilisationChart plan={plan} />
      <PlantCostChart plan={plan} />
      <DeliveryPointSupplyChart plan={plan} />
      <TankBehaviorChart plan={plan} />
    </div>
  );
}
