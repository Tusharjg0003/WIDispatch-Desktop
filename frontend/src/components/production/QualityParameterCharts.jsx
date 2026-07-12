import React, { useMemo } from "react";
import { Line, LineChart, CartesianGrid, ReferenceArea, ReferenceLine, Tooltip, XAxis, YAxis, ResponsiveContainer } from "recharts";
import { buildQualitySeries, outOfRange, QUALITY_PARAMS } from "../../lib/qualitySeries";
import "./QualityParameterCharts.css";

export default function QualityParameterCharts({ plantId, bundle }) {
  const { qualityRecords, qualityLimits } = bundle;
  const limits = qualityLimits || {};
  const series = useMemo(() => buildQualitySeries(qualityRecords, plantId), [qualityRecords, plantId]);

  if (series.length === 0) {
    return <div className="qp-empty">No quality readings yet</div>;
  }

  return (
    <div className="qp-grid">
      {QUALITY_PARAMS.map(({ key, label, unit, color }) => {
        const lim = limits[key] || {};
        return (
          <div key={key} className="qp-card">
            <div className="qp-card__head">
              <span className="qp-card__title">{label}</span>
              <span className="qp-card__limit">
                {lim.min != null || lim.max != null ? `Limit ${lim.min ?? "–"}–${lim.max ?? "–"} ${unit}` : unit}
              </span>
            </div>
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={series} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
                <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#4b5563" }} interval="preserveStartEnd" minTickGap={24} />
                <YAxis tick={{ fontSize: 10, fill: "#4b5563" }} width={40} />
                {lim.min != null && lim.max != null && <ReferenceArea y1={lim.min} y2={lim.max} fill="#34d399" fillOpacity={0.12} stroke="none" />}
                {lim.min != null && <ReferenceLine y={lim.min} stroke="#f87171" strokeDasharray="4 3" strokeWidth={1} />}
                {lim.max != null && <ReferenceLine y={lim.max} stroke="#f87171" strokeDasharray="4 3" strokeWidth={1} />}
                <Tooltip content={({ active, payload, label: lbl }) => {
                  if (!active || !payload?.length) return null;
                  const v = payload[0]?.value;
                  const bad = outOfRange(v, lim);
                  return (
                    <div className="qp-tip">
                      <div className="qp-tip__title">{String(lbl)}</div>
                      <div style={{ color: bad ? "#dc2626" : color }}>{label}: {v != null ? `${v} ${unit}` : "—"} {bad ? "· OUT OF SPEC" : ""}</div>
                    </div>
                  );
                }} />
                <Line type="monotone" dataKey={key} stroke={color} strokeWidth={2} connectNulls isAnimationActive={false}
                  dot={(props) => {
                    const { cx, cy, value, index } = props;
                    if (cx == null || cy == null) return <circle key={index} r={0} fill="none" />;
                    const bad = outOfRange(value, lim);
                    return <circle key={index} cx={cx} cy={cy} r={bad ? 4 : 2.5} fill={bad ? "#dc2626" : color} stroke={bad ? "#fff" : "none"} strokeWidth={bad ? 1 : 0} />;
                  }}
                  activeDot={{ r: 5 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        );
      })}
    </div>
  );
}
