import React, { useMemo } from "react";
import { format, parseISO, startOfDay, subDays, addDays, eachDayOfInterval } from "date-fns";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { findPump, pumpCapacity, totalDesignCapacity } from "../../lib/pumpStation";
import "../production/ProductionCapacityChart.css";

const ACTIVE_MAINTENANCE_STATUSES = ["submitted", "under_revision", "revised", "approved"];

const safeParse = (value) => {
  if (!value) return null;
  const date = parseISO(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const overlapsDay = (record, dateStart, dateEnd) => {
  const start = safeParse(record.start_datetime);
  if (!start) return false;
  const end = safeParse(record.end_datetime) || new Date();
  return start <= dateEnd && end >= dateStart;
};

const dayLoss = (record, isoDate) => {
  if (Array.isArray(record.daily_losses) && record.daily_losses.length) {
    const entry = record.daily_losses.find((row) => row.date === isoDate);
    return Number(entry?.loss_m3 || 0);
  }
  return Number(record.expected_loss_m3 ?? record.expected_impact_m3 ?? record.actual_loss_m3 ?? record.estimated_loss_m3 ?? 0) || 0;
};

const substitutionMap = (record) => {
  const map = new Map();
  if (!Array.isArray(record.substitutions)) return map;
  for (const substitution of record.substitutions) {
    if (substitution?.down_pump_id) map.set(substitution.down_pump_id, substitution.standby_pump_id);
  }
  return map;
};

const pumpReduction = (record, specifications, pumpIds) => {
  const substitutions = substitutionMap(record);
  return (pumpIds || []).reduce((sum, pumpId) => {
    const downPump = findPump(specifications, pumpId);
    const standbyPump = substitutions.get(pumpId) ? findPump(specifications, substitutions.get(pumpId)) : null;
    return sum + Math.max(0, pumpCapacity(downPump) - pumpCapacity(standbyPump));
  }, 0);
};

function LegendMarker({ color, kind }) {
  if (kind === "area") {
    return <span style={{ display: "inline-block", width: 14, height: 9, background: color, opacity: 0.3, border: `1px solid ${color}`, borderRadius: 2 }} />;
  }
  return (
    <svg width="16" height="6" aria-hidden>
      <line x1="0" y1="3" x2="16" y2="3" stroke={color} strokeWidth={kind === "dashed" ? 2 : 3} strokeDasharray={kind === "dashed" ? "4 3" : undefined} />
    </svg>
  );
}

export default function PumpStationCapacityChart({ station, bundle }) {
  const maintenanceRecords = bundle?.maintenanceRecords || [];
  const outages = bundle?.outages || [];
  const stationId = station?.id;
  const specifications = station?.specifications;
  const designCapacity = totalDesignCapacity(specifications);

  const chartData = useMemo(() => {
    const today = startOfDay(new Date());
    const gridStart = subDays(today, 30);
    const gridEnd = addDays(today, 30);

    return eachDayOfInterval({ start: gridStart, end: gridEnd }).map((day) => {
      const isoDate = format(day, "yyyy-MM-dd");
      const dateStart = startOfDay(day);
      const dateEnd = new Date(dateStart);
      dateEnd.setHours(23, 59, 59, 999);

      const overlappingOutages = outages.filter((outage) => (
        outage.plant_id === stationId &&
        outage.submission_status === "approved" &&
        overlapsDay(outage, dateStart, dateEnd)
      ));

      const outaged = overlappingOutages.some((outage) => outage.outage_scope !== "partial");
      const outageLoss = overlappingOutages.reduce((sum, outage) => {
        if (outage.outage_scope !== "partial") return sum;
        if (Array.isArray(outage.daily_losses) && outage.daily_losses.length) return sum + dayLoss(outage, isoDate);
        return sum + pumpReduction(outage, specifications, outage.pumps_out);
      }, 0);

      const maintenanceLoss = maintenanceRecords.reduce((sum, record) => {
        if (record.plant_id !== stationId) return sum;
        if (!ACTIVE_MAINTENANCE_STATUSES.includes(record.submission_status)) return sum;
        if (!overlapsDay(record, dateStart, dateEnd)) return sum;
        if (Array.isArray(record.daily_losses) && record.daily_losses.length) return sum + dayLoss(record, isoDate);
        if (Array.isArray(record.pumps_under_maintenance) && record.pumps_under_maintenance.length) {
          return sum + pumpReduction(record, specifications, record.pumps_under_maintenance);
        }
        return sum + dayLoss(record, isoDate);
      }, 0);

      const effectiveCapacity = outaged ? 0 : Math.max(0, designCapacity - maintenanceLoss - outageLoss);

      return {
        date: format(day, "MMM dd"),
        isoDate,
        designCapacity,
        effectiveCapacity,
        capacityLost: Math.max(0, designCapacity - effectiveCapacity),
        outaged,
        maintenanceLoss,
        outageLoss,
      };
    });
  }, [maintenanceRecords, outages, stationId, designCapacity, specifications]);

  const legendItems = [
    { label: "Design Capacity", color: "#8b5cf6", kind: "dashed" },
    { label: "Effective Capacity", color: "#f59e0b", kind: "line" },
    { label: "Capacity Lost", color: "#f59e0b", kind: "area" },
  ];

  const yMax = Math.ceil(((designCapacity || 100) * 1.1) / 1000) * 1000 || 100;

  return (
    <div className="cap-chart">
      <ResponsiveContainer width="100%" height={360}>
        <ComposedChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
          <XAxis dataKey="date" tick={{ fill: "#4b5563", fontSize: 11 }} interval={6} />
          <YAxis
            domain={[0, yMax]}
            tick={{ fill: "#4b5563", fontSize: 11 }}
            tickFormatter={(value) => value.toLocaleString()}
            width={80}
            label={{ value: "Capacity (m³/day)", angle: -90, position: "insideLeft", fill: "#4b5563", fontSize: 11 }}
          />
          <Tooltip content={({ active, label }) => {
            if (!active) return null;
            const row = chartData.find((point) => point.date === label);
            if (!row) return null;
            return (
              <div className="cap-tip">
                <p className="cap-tip__title">{label}</p>
                <p style={{ color: "#7c3aed" }}>Design: {row.designCapacity.toLocaleString()} m³/day</p>
                <p style={{ color: "#b45309", fontWeight: 600 }}>Effective: {row.effectiveCapacity.toLocaleString()} m³/day</p>
                {row.outaged && <p style={{ color: "#dc2626" }}>Complete outage: all pumps out of service</p>}
                {!row.outaged && row.outageLoss > 0 && <p style={{ color: "#dc2626" }}>Outage Reduction: {row.outageLoss.toLocaleString()} m³/day</p>}
                {!row.outaged && row.maintenanceLoss > 0 && <p style={{ color: "#d97706" }}>Maintenance Reduction: {row.maintenanceLoss.toLocaleString()} m³/day</p>}
              </div>
            );
          }} />
          <Legend content={() => (
            <div className="cap-legend">
              {legendItems.map((item) => (
                <span key={item.label} className="cap-legend__item">
                  <LegendMarker color={item.color} kind={item.kind} />
                  <span>{item.label}</span>
                </span>
              ))}
            </div>
          )} />
          <ReferenceLine
            x={format(new Date(), "MMM dd")}
            stroke="#111827"
            strokeWidth={2}
            strokeDasharray="2 4"
            label={{ value: "Today", fill: "#111827", fontSize: 11, fontWeight: 700, position: "insideTopRight" }}
          />
          <Area type="monotone" dataKey="effectiveCapacity" stackId="cap" stroke="none" fill="none" isAnimationActive={false} legendType="none" activeDot={false} />
          <Area type="monotone" dataKey="capacityLost" stackId="cap" stroke="#f59e0b" strokeOpacity={0.35} strokeWidth={1} fill="#f59e0b" fillOpacity={0.13} name="Capacity Lost" isAnimationActive={false} activeDot={false} />
          <Line type="monotone" dataKey="designCapacity" stroke="#8b5cf6" strokeWidth={2} strokeDasharray="6 3" dot={false} name="Design Capacity" isAnimationActive={false} />
          <Line type="monotone" dataKey="effectiveCapacity" stroke="#f59e0b" strokeWidth={3} dot={{ fill: "#f59e0b", r: 2 }} activeDot={{ r: 5 }} name="Effective Capacity" isAnimationActive={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
