import React, { useMemo } from "react";
import { format } from "date-fns";
import {
  ComposedChart, Line, Area, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ReferenceLine, ResponsiveContainer,
} from "recharts";
import { buildCapacityChartData } from "../../lib/capacityChartData";
import "../production/ProductionCapacityChart.css";

const getStatusColor = (status) => {
  switch (status) {
    case "approved": return "var(--ok)";
    case "submitted":
    case "revised": return "var(--chart-design)";
    case "under_revision": return "var(--chart-warning)";
    case "rejected": return "var(--chart-danger)";
    case "draft": return "var(--chart-reference)";
    default: return "var(--chart-indigo)";
  }
};

function LegendMarker({ color, kind }) {
  if (kind === "area") return <span style={{ display: "inline-block", width: 14, height: 9, background: color, opacity: 0.3, border: `1px solid ${color}`, borderRadius: 2 }} />;
  if (kind === "diamond") return <span style={{ display: "inline-block", width: 9, height: 9, background: color, transform: "rotate(45deg)" }} />;
  return (
    <svg width="16" height="6" aria-hidden>
      <line x1="0" y1="3" x2="16" y2="3" stroke={color} strokeWidth={kind === "dashed" ? 2 : 3} strokeDasharray={kind === "dashed" ? "4 3" : undefined} />
    </svg>
  );
}

export default function DemandCapacityChart({ cityGate, cityGateId, bundle }) {
  const { demandInputs, outages, maintenanceRecords, qualityRecords } = bundle;
  const contractedCapacity = cityGate?.specifications?.contracted_capacity;
  const designCapacity = cityGate?.specifications?.design_capacity;
  const maximumCapacity = cityGate?.specifications?.maximum_capacity;

  const chartData = useMemo(
    () => buildCapacityChartData({ plantId: cityGateId, productionInputs: demandInputs, qualityRecords, outages, maintenanceRecords, contractedCapacity }),
    [cityGateId, demandInputs, qualityRecords, outages, maintenanceRecords, contractedCapacity],
  );

  const renderStatusDot = (fallbackColor) => (props) => {
    const { cx, cy, payload, dataKey, index } = props;
    const key = `${dataKey || "dot"}-${payload?.isoDate || index}`;
    if (cx == null || cy == null) return <circle key={key} cx={0} cy={0} r={0} fill="none" />;
    return <circle key={key} cx={cx} cy={cy} r={4} fill={getStatusColor(payload.requiredStatus) || fallbackColor} stroke="var(--panel)" strokeWidth={1.5} />;
  };

  const showCapacityLine = !!cityGateId && !!contractedCapacity;
  const legendItems = [
    { label: "Required Demand", color: "var(--chart-indigo)", kind: "dashed" },
    ...(showCapacityLine ? [{ label: "Available Capacity", color: "var(--chart-warning)", kind: "line" }] : []),
    ...(showCapacityLine ? [{ label: "Capacity Lost", color: "var(--chart-warning)", kind: "area" }] : []),
    ...(showCapacityLine ? [{ label: "Contracted", color: "var(--chart-warning)", kind: "dashed" }] : []),
    ...(!!cityGateId && !!designCapacity ? [{ label: "Design", color: "var(--chart-purple)", kind: "dashed" }] : []),
    ...(!!cityGateId && !!maximumCapacity ? [{ label: "Maximum", color: "var(--chart-cyan)", kind: "dashed" }] : []),
    { label: "Out-of-Spec Quality", color: "var(--chart-danger)", kind: "diamond" },
  ];

  const yTicks = (() => {
    const all = chartData.flatMap((d) => [d.required, d.effectiveCapacity, contractedCapacity, designCapacity, maximumCapacity]).filter((v) => v != null);
    if (all.length === 0) return undefined;
    const dataMin = Math.min(0, ...all);
    const dataMax = Math.max(...all);
    const range = dataMax - dataMin || 1;
    const rawStep = range / 4;
    const magnitude = Math.pow(10, Math.floor(Math.log10(rawStep)));
    const step = Math.ceil(rawStep / magnitude) * magnitude;
    const ticks = [];
    for (let v = Math.floor(dataMin / step) * step; v <= dataMax + step; v += step) ticks.push(Math.round(v));
    return ticks;
  })();

  return (
    <div className="cap-chart">
      <ResponsiveContainer width="100%" height={400}>
        <ComposedChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" vertical={false} />
          <XAxis dataKey="date" tick={{ fill: "var(--chart-axis)", fontSize: 11 }} interval={6} />
          <YAxis ticks={yTicks} tick={{ fill: "var(--chart-axis)", fontSize: 11 }} tickFormatter={(v) => v.toLocaleString()} width={80}
            label={{ value: "Demand (m³)", angle: -90, position: "insideLeft", fill: "var(--chart-axis)", fontSize: 11 }} />
          <Tooltip content={({ active, label }) => {
            if (!active) return null;
            const d = chartData.find((p) => p.date === label);
            if (!d) return null;
            return (
              <div className="cap-tip">
                <p className="cap-tip__title">{label}</p>
                {d.effectiveCapacity !== undefined && <p style={{ color: "var(--warnTx)", fontWeight: 600 }}>Available Capacity: {d.effectiveCapacity.toLocaleString()} m³</p>}
                {d.required !== null && <p style={{ color: getStatusColor(d.requiredStatus) }}>Required Demand: {d.required.toLocaleString()} m³ ({d.requiredStatus || "pending"})</p>}
                {contractedCapacity && <p style={{ color: "var(--warnTx)", opacity: 0.85 }}>Contracted: {contractedCapacity.toLocaleString()} m³</p>}
                {designCapacity && <p style={{ color: "var(--chart-purple)" }}>Design: {designCapacity.toLocaleString()} m³</p>}
                {maximumCapacity && <p style={{ color: "var(--chart-cyan)" }}>Maximum: {maximumCapacity.toLocaleString()} m³</p>}
                {d.maintenanceLoss > 0 && <p style={{ color: "var(--warn)" }}>Maintenance Loss: {d.maintenanceLoss.toLocaleString()} m³</p>}
                {d.outageLoss > 0 && <p style={{ color: "var(--err)" }}>Outage Loss ({d.outageIsActual ? "actual" : "estimated"}): {d.outageLoss.toLocaleString()} m³</p>}
                {d.qualityMarker !== null && <p className="cap-tip__flag">⚠ Out-of-spec quality recorded</p>}
              </div>
            );
          }} />
          <Legend content={() => (
            <div className="cap-legend">
              {legendItems.map((it) => (
                <span key={it.label} className="cap-legend__item"><LegendMarker color={it.color} kind={it.kind} /><span>{it.label}</span></span>
              ))}
            </div>
          )} />

          <ReferenceLine x={format(new Date(), "MMM dd")} stroke="var(--tx1)" strokeWidth={2} strokeDasharray="2 4"
            label={{ value: "Today", fill: "var(--tx1)", fontSize: 11, fontWeight: 700, position: "insideTopRight" }} />

          {showCapacityLine && <ReferenceLine y={contractedCapacity} stroke="var(--chart-warning)" strokeWidth={2} strokeDasharray="6 3" label={{ value: "Contracted", fill: "var(--warnTx)", fontSize: 11, position: "insideTopRight" }} />}
          {!!cityGateId && !!designCapacity && <ReferenceLine y={designCapacity} stroke="var(--chart-purple)" strokeWidth={2} strokeDasharray="3 3" label={{ value: "Design", fill: "var(--chart-purple)", fontSize: 11, position: "insideTopRight" }} />}
          {!!cityGateId && !!maximumCapacity && <ReferenceLine y={maximumCapacity} stroke="var(--chart-cyan)" strokeWidth={2} strokeDasharray="3 3" label={{ value: "Maximum", fill: "var(--chart-cyan)", fontSize: 11, position: "insideTopRight" }} />}

          {showCapacityLine && <Area type="monotone" dataKey="effectiveCapacity" stackId="cap" stroke="none" fill="none" isAnimationActive={false} legendType="none" activeDot={false} />}
          {showCapacityLine && <Area type="monotone" dataKey="capacityLost" stackId="cap" stroke="var(--chart-warning)" strokeOpacity={0.35} strokeWidth={1} fill="var(--chart-warning)" fillOpacity={0.13} name="Capacity Lost" isAnimationActive={false} activeDot={false} />}
          {showCapacityLine && <Line type="monotone" dataKey="effectiveCapacity" stroke="var(--chart-warning)" strokeWidth={3} dot={{ fill: "var(--chart-warning)", r: 3 }} activeDot={{ r: 5 }} name="Available Capacity" isAnimationActive={false} />}

          <Line type="monotone" dataKey="required" stroke="var(--chart-indigo)" strokeWidth={2} strokeDasharray="5 3" dot={renderStatusDot("var(--chart-indigo)")} activeDot={{ r: 5 }} name="Required Demand" connectNulls={false} />
          <Scatter dataKey="qualityMarker" fill="var(--chart-danger)" shape="diamond" name="Out-of-Spec Quality" isAnimationActive={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
