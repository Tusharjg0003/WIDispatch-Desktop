import React, { useMemo } from "react";
import {
  Area, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { chartSeries } from "../../lib/simulationRows";
import "./SupplyDemandChart.css";

const nf = new Intl.NumberFormat("en-US");

export default function SupplyDemandChart({ plan, compact = false, className = "" }) {
  const series = useMemo(() => chartSeries(plan?.days || []), [plan?.days]);

  return (
    <section className={["sheet", compact ? "sdchart__sheet--compact" : "", className].filter(Boolean).join(" ")}>
      <header className="sheet__head sheet__head--simple">
        <h2 className="sheet__name sheet__name--sm">Supply vs Demand</h2>
      </header>
      <div className="sdchart">
        <ResponsiveContainer width="100%" height={compact ? 220 : 320}>
          <ComposedChart data={series}>
            <CartesianGrid strokeDasharray="3 3" stroke="#d9e4ec" vertical={false} />
            <XAxis dataKey="label" tick={{ fill: "#607d91", fontSize: 11 }} />
            <YAxis
              tick={{ fill: "#607d91", fontSize: 11 }}
              tickFormatter={(v) => nf.format(v)}
              width={80}
              label={{ value: "m³/day", angle: -90, position: "insideLeft", fill: "#607d91", fontSize: 11 }}
            />
            <Tooltip formatter={(v, name) => [`${nf.format(Math.round(v))} m³`, name]} />
            <Legend />
            <Line
              type="monotone"
              dataKey="required"
              name="Required"
              stroke="#8b5cf6"
              strokeWidth={2}
              strokeDasharray="6 3"
              dot={false}
              isAnimationActive={false}
            />
            <Area
              type="monotone"
              dataKey="delivered"
              stackId="shortageGap"
              stroke="none"
              fill="transparent"
              fillOpacity={0}
              legendType="none"
              tooltipType="none"
              isAnimationActive={false}
            />
            <Area
              type="monotone"
              dataKey="shortage"
              stackId="shortageGap"
              name="Shortfall"
              stroke="none"
              fill="#c11b1b"
              fillOpacity={0.22}
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="shortageCeiling"
              stroke="#c11b1b"
              strokeWidth={2}
              dot={{ r: 2 }}
              activeDot={{ r: 3 }}
              connectNulls={false}
              legendType="none"
              tooltipType="none"
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="delivered"
              name="Delivered"
              stroke="#1d4f91"
              strokeWidth={3}
              dot={{ r: 2 }}
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
