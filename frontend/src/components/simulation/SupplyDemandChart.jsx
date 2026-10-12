import React, { useMemo } from "react";
import {
  Area, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { chartSeries } from "../../lib/simulationRows";
import { AXIS_TICK, ChartShell, SERIES } from "./chartKit";

const nf = new Intl.NumberFormat("en-US");

// Required vs delivered per day, with the gap between them shaded as the
// shortfall (an invisible "delivered" base stacked under the shortage).
export default function SupplyDemandChart({ plan }) {
  const series = useMemo(() => chartSeries(plan?.days || []), [plan?.days]);

  return (
    <ChartShell title="Supply vs demand" hint="m³ per day">
      <ResponsiveContainer width="100%" height={220}>
        <ComposedChart data={series}>
          <CartesianGrid strokeDasharray="2 4" stroke="var(--chart-grid)" vertical={false} />
          <XAxis dataKey="label" tick={AXIS_TICK} />
          <YAxis tick={AXIS_TICK} tickFormatter={(v) => nf.format(v)} width={74} />
          <Tooltip formatter={(v, name) => [`${nf.format(Math.round(v))} m³`, name]} />
          <Legend />
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
            fill={SERIES.shortfall}
            fillOpacity={0.22}
            isAnimationActive={false}
          />
          <Line
            type="monotone"
            dataKey="shortageCeiling"
            stroke={SERIES.shortfall}
            strokeWidth={1.5}
            dot={false}
            connectNulls={false}
            legendType="none"
            tooltipType="none"
            isAnimationActive={false}
          />
          <Line
            type="monotone"
            dataKey="required"
            name="Required"
            stroke={SERIES.demand}
            strokeWidth={2}
            strokeDasharray="6 3"
            dot={false}
            isAnimationActive={false}
          />
          <Line
            type="monotone"
            dataKey="delivered"
            name="Delivered"
            stroke={SERIES.supply}
            strokeWidth={2.5}
            dot={{ r: 2 }}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </ChartShell>
  );
}
