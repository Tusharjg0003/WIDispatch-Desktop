import React, { useMemo } from "react";
import { format } from "date-fns";
import {
  ComposedChart, Line, Area, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ReferenceLine, ResponsiveContainer,
} from "recharts";
import { buildCapacityChartData } from "../../lib/capacityChartData";
import "./ProductionCapacityChart.css";

const getStatusColor = (status) => {
  switch (status) {
    case "approved": return "#10b981";
    case "submitted":
    case "revised": return "#3b82f6";
    case "under_revision": return "#f59e0b";
    case "rejected": return "#ef4444";
    case "adjusted":
    case "conditional": return "#f59e0b";
    case "shortfall":
    case "postponed": return "#ef4444";
    case "draft": return "#94a3b8";
    default: return "#6366f1";
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

export default function ProductionCapacityChart({ plant, plantId, bundle }) {
  const { productionInputs, outages, maintenanceRecords, qualityRecords } = bundle;
  const contractedCapacity = plant?.specifications?.contracted_capacity;
  const designCapacity = plant?.specifications?.design_capacity;
  const maximumCapacity = plant?.specifications?.maximum_capacity;

  const chartData = useMemo(
    () => buildCapacityChartData({ plantId, productionInputs, qualityRecords, outages, maintenanceRecords, contractedCapacity }),
    [plantId, productionInputs, qualityRecords, outages, maintenanceRecords, contractedCapacity],
  );

  const renderStatusDot = (fallbackColor) => (props) => {
    const { cx, cy, payload, dataKey, index } = props;
    const key = `${dataKey || "dot"}-${payload?.isoDate || index}`;
    if (cx == null || cy == null) return <circle key={key} cx={0} cy={0} r={0} fill="none" />;
    const status = dataKey === "actual" ? payload.actualStatus : payload.requiredStatus;
    return <circle key={key} cx={cx} cy={cy} r={4} fill={getStatusColor(status) || fallbackColor} stroke="#fff" strokeWidth={1.5} />;
  };

  const showCapacityLine = !!plantId && !!contractedCapacity;
  const legendItems = [
    { label: "Delivered", color: "#10b981", kind: "line" },
    { label: "Requested", color: "#6366f1", kind: "dashed" },
    ...(showCapacityLine ? [{ label: "Available Capacity", color: "#f59e0b", kind: "line" }] : []),
    ...(showCapacityLine ? [{ label: "Capacity Lost", color: "#f59e0b", kind: "area" }] : []),
    ...(showCapacityLine ? [{ label: "Contracted", color: "#f59e0b", kind: "dashed" }] : []),
    ...(!!plantId && !!designCapacity ? [{ label: "Design", color: "#8b5cf6", kind: "dashed" }] : []),
    ...(!!plantId && !!maximumCapacity ? [{ label: "Maximum", color: "#06b6d4", kind: "dashed" }] : []),
    { label: "Out-of-Spec Quality", color: "#ef4444", kind: "diamond" },
  ];

  const yTicks = (() => {
    const all = chartData.flatMap((d) => [d.actual, d.required, d.effectiveCapacity, contractedCapacity, designCapacity, maximumCapacity]).filter((v) => v != null);
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
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
          <XAxis dataKey="date" tick={{ fill: "#4b5563", fontSize: 11 }} interval={6} />
          <YAxis ticks={yTicks} tick={{ fill: "#4b5563", fontSize: 11 }} tickFormatter={(v) => v.toLocaleString()} width={80}
            label={{ value: "Production (m³)", angle: -90, position: "insideLeft", fill: "#4b5563", fontSize: 11 }} />
          <Tooltip content={({ active, label }) => {
            if (!active) return null;
            const d = chartData.find((p) => p.date === label);
            if (!d) return null;
            return (
              <div className="cap-tip">
                <p className="cap-tip__title">{label}</p>
                {d.effectiveCapacity !== undefined && <p style={{ color: "#b45309", fontWeight: 600 }}>Available Capacity: {d.effectiveCapacity.toLocaleString()} m³</p>}
                {d.required !== null && <p style={{ color: getStatusColor(d.requiredStatus) }}>Requested: {d.required.toLocaleString()} m³ ({d.requiredStatus || "pending"})</p>}
                {d.actual !== null && <p style={{ color: getStatusColor(d.actualStatus) }}>Delivered: {d.actual.toLocaleString()} m³ ({d.actualStatus || "pending"})</p>}
                {contractedCapacity && <p style={{ color: "#b45309", opacity: 0.85 }}>Contracted: {contractedCapacity.toLocaleString()} m³</p>}
                {designCapacity && <p style={{ color: "#7c3aed" }}>Design: {designCapacity.toLocaleString()} m³</p>}
                {maximumCapacity && <p style={{ color: "#0891b2" }}>Maximum: {maximumCapacity.toLocaleString()} m³</p>}
                {d.maintenanceLoss > 0 && <p style={{ color: "#d97706" }}>Maintenance Loss: {d.maintenanceLoss.toLocaleString()} m³</p>}
                {d.outageLoss > 0 && <p style={{ color: "#dc2626" }}>Outage Loss ({d.outageIsActual ? "actual" : "estimated"}): {d.outageLoss.toLocaleString()} m³</p>}
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

          <ReferenceLine x={format(new Date(), "MMM dd")} stroke="#111827" strokeWidth={2} strokeDasharray="2 4"
            label={{ value: "Today", fill: "#111827", fontSize: 11, fontWeight: 700, position: "insideTopRight" }} />

          {showCapacityLine && <ReferenceLine y={contractedCapacity} stroke="#f59e0b" strokeWidth={2} strokeDasharray="6 3" label={{ value: "Contracted", fill: "#b45309", fontSize: 11, position: "insideTopRight" }} />}
          {!!plantId && !!designCapacity && <ReferenceLine y={designCapacity} stroke="#8b5cf6" strokeWidth={2} strokeDasharray="3 3" label={{ value: "Design", fill: "#7c3aed", fontSize: 11, position: "insideTopRight" }} />}
          {!!plantId && !!maximumCapacity && <ReferenceLine y={maximumCapacity} stroke="#06b6d4" strokeWidth={2} strokeDasharray="3 3" label={{ value: "Maximum", fill: "#0891b2", fontSize: 11, position: "insideTopRight" }} />}

          {showCapacityLine && <Area type="monotone" dataKey="effectiveCapacity" stackId="cap" stroke="none" fill="none" isAnimationActive={false} legendType="none" activeDot={false} />}
          {showCapacityLine && <Area type="monotone" dataKey="capacityLost" stackId="cap" stroke="#f59e0b" strokeOpacity={0.35} strokeWidth={1} fill="#f59e0b" fillOpacity={0.13} name="Capacity Lost" isAnimationActive={false} activeDot={false} />}
          {showCapacityLine && <Line type="monotone" dataKey="effectiveCapacity" stroke="#f59e0b" strokeWidth={3} dot={{ fill: "#f59e0b", r: 3 }} activeDot={{ r: 5 }} name="Available Capacity" isAnimationActive={false} />}

          <Line type="monotone" dataKey="required" stroke="#6366f1" strokeWidth={2} strokeDasharray="5 3" dot={renderStatusDot("#6366f1")} activeDot={{ r: 5 }} name="Requested" connectNulls={false} />
          <Line type="monotone" dataKey="actual" stroke="#10b981" strokeWidth={2} dot={renderStatusDot("#10b981")} activeDot={{ r: 5 }} name="Delivered" connectNulls={false} />
          <Scatter dataKey="qualityMarker" fill="#ef4444" shape="diamond" name="Out-of-Spec Quality" isAnimationActive={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
