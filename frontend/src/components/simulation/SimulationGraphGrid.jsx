import React, { useMemo, useState } from "react";
import {
  Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import {
  costTrendSeries, gateDailySupply, plantMixSeries, plantPerformanceRows,
  systemBalanceSeries, tankBehaviorSeries,
} from "../../lib/simulationRows";
import SupplyDemandChart from "./SupplyDemandChart";
import { AXIS_TICK, ChartShell, SERIES } from "./chartKit";
import "./SimulationGraphGrid.css";

const nf = new Intl.NumberFormat("en-US");
const money = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const rate = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });

// WIDispatch-Production light chart palette (globals.css .light --chart-*).
const PLANT_COLORS = ["var(--acc)", "var(--chart-output)", "var(--chart-contracted)", "var(--chart-maximum)", "var(--chart-cyan)", "var(--chart-axis)"];
const TANK_COLORS = ["var(--chart-output)", "var(--chart-maximum)", "var(--chart-contracted)", "var(--chart-warning)", "var(--chart-danger)", "var(--acc)", "var(--chart-cyan)", "var(--chart-success)"];

function EmptyChart({ children }) {
  return <div className="simgraph__empty">{children}</div>;
}

function DispatchCostChart({ plan }) {
  const series = useMemo(() => costTrendSeries(plan?.days || []), [plan?.days]);
  const hasCost = series.some((d) => d.cost > 0 || d.avgCost != null);

  return (
    <ChartShell title="Dispatch cost" hint="SAR per day · SAR/m³">
      {!hasCost ? (
        <EmptyChart>No dispatch cost recorded.</EmptyChart>
      ) : (
        <ResponsiveContainer width="100%" height={220}>
          <ComposedChart data={series}>
            <CartesianGrid strokeDasharray="2 4" stroke="var(--chart-grid)" vertical={false} />
            <XAxis dataKey="label" tick={AXIS_TICK} />
            <YAxis
              yAxisId="cost"
              tick={AXIS_TICK}
              tickFormatter={(v) => money.format(v)}
              width={74}
            />
            <YAxis
              yAxisId="rate"
              orientation="right"
              tick={AXIS_TICK}
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
              name="Production cost"
              stroke={SERIES.cost}
              strokeWidth={2}
              dot={{ r: 2 }}
              isAnimationActive={false}
            />
            <Line
              yAxisId="rate"
              type="monotone"
              dataKey="avgCost"
              name="Variable O&M"
              stroke={SERIES.rate}
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
    <ChartShell title="Plant dispatch mix" hint="m³ per day, top 5 plants">
      {!mix.plants.length ? (
        <EmptyChart>No plant allocation recorded.</EmptyChart>
      ) : (
        <ResponsiveContainer width="100%" height={220}>
          <ComposedChart data={mix.series}>
            <CartesianGrid strokeDasharray="2 4" stroke="var(--chart-grid)" vertical={false} />
            <XAxis dataKey="label" tick={AXIS_TICK} />
            <YAxis tick={AXIS_TICK} tickFormatter={(v) => nf.format(v)} width={74} />
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
    <ChartShell title="Tank behaviour" hint="Daily flows and end inventory">
      {!tanks.length ? (
        <EmptyChart>No tank storage recorded.</EmptyChart>
      ) : (
        <ResponsiveContainer width="100%" height={220}>
          <ComposedChart data={series}>
            <CartesianGrid strokeDasharray="2 4" stroke="var(--chart-grid)" vertical={false} />
            <XAxis dataKey="label" tick={AXIS_TICK} />
            <YAxis tick={AXIS_TICK} tickFormatter={(v) => nf.format(v)} width={74} />
            <Tooltip content={<TankBehaviorTooltip tanks={tanks} />} />
            <Legend />
            <Bar dataKey="totalInflow" name="Inflow" fill="color-mix(in srgb, var(--ok) 35%, transparent)" stroke="var(--ok)" radius={[3, 3, 0, 0]} isAnimationActive={false} />
            <Bar dataKey="totalOutflow" name="Outflow" fill="color-mix(in srgb, var(--err) 25%, transparent)" stroke="var(--err)" radius={[3, 3, 0, 0]} isAnimationActive={false} />
            {tanks.map((tank, index) => (
              <Line
                key={tank.nodeId}
                type="monotone"
                dataKey={tank.key}
                name={`${tank.name} (end)`}
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
    <ChartShell title="System balance" hint="m³ per day">
      {!series.length ? (
        <EmptyChart>No daily balance recorded.</EmptyChart>
      ) : (
        <ResponsiveContainer width="100%" height={220}>
          <ComposedChart data={series}>
            <CartesianGrid strokeDasharray="2 4" stroke="var(--chart-grid)" vertical={false} />
            <XAxis dataKey="label" tick={AXIS_TICK} />
            <YAxis tick={AXIS_TICK} tickFormatter={(v) => nf.format(v)} width={74} />
            <Tooltip formatter={(value, name) => [`${nf.format(Math.round(value))} m3`, name]} />
            <Legend />
            <Line type="monotone" dataKey="capacity" name="Active capacity" stroke={SERIES.capacity} strokeDasharray="4 3" strokeWidth={1.5} dot={false} isAnimationActive={false} />
            <Line type="monotone" dataKey="demand" name="Demand" stroke={SERIES.demand} strokeDasharray="6 3" strokeWidth={2} dot={false} isAnimationActive={false} />
            <Line type="monotone" dataKey="supply" name="Production" stroke={SERIES.supply} strokeWidth={2.5} dot={{ r: 2 }} isAnimationActive={false} />
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
    <ChartShell title="Plant utilisation" hint="% of available capacity">
      {!rows.length ? (
        <EmptyChart>No plant utilisation recorded.</EmptyChart>
      ) : (
        <ResponsiveContainer width="100%" height={Math.max(200, rows.length * 30)}>
          <ComposedChart data={rows} layout="vertical" margin={{ left: 16, right: 16 }}>
            <CartesianGrid strokeDasharray="2 4" stroke="var(--chart-grid)" horizontal={false} />
            <XAxis type="number" domain={[0, "dataMax"]} tick={AXIS_TICK} tickFormatter={(v) => `${v}%`} />
            <YAxis type="category" dataKey="name" width={130} tick={AXIS_TICK} />
            <Tooltip formatter={(value) => [`${rate.format(value)}%`, "Utilisation"]} />
            <Bar dataKey="utilisationPct" name="Utilisation" fill="color-mix(in srgb, var(--acc) 70%, transparent)" radius={[0, 3, 3, 0]} barSize={16} isAnimationActive={false} />
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
    <ChartShell title="Plant cost" hint="Variable O&M, SAR">
      {!rows.length ? (
        <EmptyChart>No plant cost recorded.</EmptyChart>
      ) : (
        <ResponsiveContainer width="100%" height={Math.max(200, rows.length * 30)}>
          <ComposedChart data={rows} layout="vertical" margin={{ left: 16, right: 16 }}>
            <CartesianGrid strokeDasharray="2 4" stroke="var(--chart-grid)" horizontal={false} />
            <XAxis type="number" tick={AXIS_TICK} tickFormatter={(v) => money.format(v)} />
            <YAxis type="category" dataKey="name" width={130} tick={AXIS_TICK} />
            <Tooltip formatter={(value) => [`${money.format(Math.round(value))} SAR`, "Variable O&M cost"]} />
            <Bar dataKey="costSar" name="Variable O&M cost" fill="color-mix(in srgb, var(--chart-warning) 70%, transparent)" radius={[0, 3, 3, 0]} barSize={16} isAnimationActive={false} />
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
    <ChartShell
      title="Delivery point supply"
      aside={gates.length > 0 && (
        <select className="simgraph__select" aria-label="Delivery point" value={nodeId || ""} onChange={(e) => setSelected(e.target.value)}>
          {gates.map((g) => (
            <option key={g.nodeId} value={g.nodeId}>{g.name}</option>
          ))}
        </select>
      )}
    >
      {!gates.length ? (
        <EmptyChart>No city gates on this network.</EmptyChart>
      ) : (
        <>
          <ResponsiveContainer width="100%" height={220}>
            <ComposedChart data={series}>
              <CartesianGrid strokeDasharray="2 4" stroke="var(--chart-grid)" vertical={false} />
              <XAxis dataKey="label" tick={AXIS_TICK} />
              <YAxis tick={AXIS_TICK} tickFormatter={(v) => nf.format(v)} width={74} />
              <Tooltip formatter={(value, name) => [`${nf.format(Math.round(value))} m3`, name]} />
              <Legend />
              <Bar dataKey="delivered" name="Delivered" fill="color-mix(in srgb, var(--acc) 35%, transparent)" stroke={SERIES.supply} radius={[3, 3, 0, 0]} isAnimationActive={false} />
              <Line type="monotone" dataKey="required" name="Required" stroke={SERIES.demand} strokeDasharray="6 3" strokeWidth={2} dot={false} isAnimationActive={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </>
      )}
    </ChartShell>
  );
}

/** The Results charts in two groups: water balance first, then plants and cost. */
export default function SimulationGraphGrid({ plan }) {
  return (
    <>
      <div className="rp-group">
        <h2 className="rp-group__title">Supply and demand</h2>
        <div className="simgraphs">
          <SupplyDemandChart plan={plan} />
          <SystemBalanceChart plan={plan} />
          <DeliveryPointSupplyChart plan={plan} />
          <TankBehaviorChart plan={plan} />
        </div>
      </div>
      <div className="rp-group">
        <h2 className="rp-group__title">Plants and cost</h2>
        <div className="simgraphs">
          <PlantDispatchMixChart plan={plan} />
          <PlantUtilisationChart plan={plan} />
          <DispatchCostChart plan={plan} />
          <PlantCostChart plan={plan} />
        </div>
      </div>
    </>
  );
}
