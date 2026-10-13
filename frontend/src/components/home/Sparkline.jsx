import React from "react";

// A tiny trend line (no axes) for KPI cards and table rows. Nulls break the
// line rather than dropping to zero.
export default function Sparkline({ values = [], width = 96, height = 26, color = "var(--acc)", fill = true, className = "" }) {
  const numbers = values.filter((v) => v != null && Number.isFinite(v));
  if (numbers.length < 2) return <svg className={`home-spark ${className}`} width={width} height={height} aria-hidden="true" />;
  const min = Math.min(...numbers);
  const max = Math.max(...numbers);
  const span = max - min || 1;
  const step = values.length > 1 ? width / (values.length - 1) : width;
  const y = (v) => height - 2 - ((v - min) / span) * (height - 4);

  // Split into runs of consecutive values.
  const runs = [];
  let run = [];
  values.forEach((v, i) => {
    if (v == null || !Number.isFinite(v)) {
      if (run.length) runs.push(run);
      run = [];
    } else {
      run.push([i * step, y(v)]);
    }
  });
  if (run.length) runs.push(run);

  const line = (points) => points.map(([px, py], i) => `${i ? "L" : "M"}${px.toFixed(1)},${py.toFixed(1)}`).join(" ");
  const last = runs.at(-1)?.at(-1);

  return (
    <svg className={`home-spark ${className}`} width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      {fill && runs.map((points, i) => (
        <path
          key={`f${i}`}
          d={`${line(points)} L${points.at(-1)[0].toFixed(1)},${height} L${points[0][0].toFixed(1)},${height} Z`}
          fill={color}
          opacity="0.12"
        />
      ))}
      {runs.map((points, i) => (
        <path key={`l${i}`} d={line(points)} fill="none" stroke={color} strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" />
      ))}
      {last && <circle cx={last[0]} cy={last[1]} r="2.2" fill={color} />}
    </svg>
  );
}
