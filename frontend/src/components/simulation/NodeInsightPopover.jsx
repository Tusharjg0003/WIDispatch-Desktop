import React, { useMemo, useState } from "react";
import { X } from "lucide-react";

const nf = new Intl.NumberFormat("en-US");
const fmt = (v) => (v == null ? "—" : nf.format(Math.round(v)));
const displayNote = (insight) => {
  if (insight.noteValueText) return insight.noteValueText;
  return insight.noteValue == null ? "Now" : fmt(insight.noteValue);
};

function pathFor(points) {
  return points.map((point, idx) => `${idx === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" ");
}

function TimeSeriesChart({ insight }) {
  const [hoverIdx, setHoverIdx] = useState(null);
  const width = 459;
  const height = 131;
  const padX = 15;
  const padY = 15;
  const plotW = width - padX * 2;
  const plotH = height - padY * 2;
  const series = insight.series || [];
  const max = insight.max > 0 ? insight.max : 1;
  const denom = Math.max(1, series.length - 1);

  const toX = (idx) => padX + (idx / denom) * plotW;
  const toY = (value) => padY + plotH - (Math.max(0, Math.min(max, value || 0)) / max) * plotH;
  const valuePoints = series.map((point, idx) => ({ ...point, x: toX(idx), y: toY(point.value) }));
  const referencePoints = series
    .map((point, idx) => (point.reference == null ? null : ({ ...point, x: toX(idx), y: toY(point.reference) })))
    .filter(Boolean);
  const activeIdx = series.findIndex((point) => point.dayIdx === insight.active?.dayIdx);
  const activePoint = activeIdx >= 0 ? valuePoints[activeIdx] : null;
  const inspectIdx = hoverIdx ?? activeIdx;
  const inspectPoint = inspectIdx >= 0 ? valuePoints[inspectIdx] : activePoint;
  const hitWidth = plotW / Math.max(1, series.length);
  const tooltip = useMemo(() => {
    if (!inspectPoint) return null;
    const left = `${(Math.min(Math.max(inspectPoint.x, 122), width - 122) / width) * 100}%`;
    const position = inspectPoint.y < 59 ? "below" : "above";
    return { left, position };
  }, [inspectPoint]);

  return (
    <div className="nodeinsight__chart" onMouseLeave={() => setHoverIdx(null)}>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${insight.name} time series`}>
        <line className="nodeinsight__grid" x1={padX} y1={padY} x2={width - padX} y2={padY} />
        <line className="nodeinsight__grid" x1={padX} y1={height - padY} x2={width - padX} y2={height - padY} />
        {referencePoints.length > 1 && (
          <path className="nodeinsight__line nodeinsight__line--reference" d={pathFor(referencePoints)} />
        )}
        {valuePoints.length > 1 && (
          <path className="nodeinsight__line nodeinsight__line--value" d={pathFor(valuePoints)} />
        )}
        {valuePoints.map((point) => (
          <circle
            key={`${point.dayIdx}-${point.date}`}
            className={[
              "nodeinsight__point",
              point.alert ? "nodeinsight__point--alert" : "",
              point.dayIdx === insight.active?.dayIdx ? "nodeinsight__point--active" : "",
              point.dayIdx === inspectPoint?.dayIdx ? "nodeinsight__point--inspect" : "",
            ].filter(Boolean).join(" ")}
            cx={point.x}
            cy={point.y}
            r={point.dayIdx === inspectPoint?.dayIdx ? 3.4 : point.dayIdx === insight.active?.dayIdx ? 3 : 2}
          >
            <title>{`${point.date}: ${fmt(point.value)} m³`}</title>
          </circle>
        ))}
        {inspectPoint && (
          <line className="nodeinsight__cursor" x1={inspectPoint.x} y1={padY} x2={inspectPoint.x} y2={height - padY} />
        )}
        {valuePoints.map((point, idx) => (
          <rect
            key={`hit-${point.dayIdx}-${point.date}`}
            className="nodeinsight__hit"
            x={Math.max(padX, point.x - hitWidth / 2)}
            y={padY}
            width={Math.min(hitWidth + 2, width - padX - Math.max(padX, point.x - hitWidth / 2))}
            height={plotH}
            tabIndex={0}
            role="button"
            aria-label={`${point.date}, ${insight.metricLabel} ${fmt(point.value)} cubic meters, ${insight.referenceLabel} ${fmt(point.reference)} cubic meters`}
            onMouseEnter={() => setHoverIdx(idx)}
            onFocus={() => setHoverIdx(idx)}
            onBlur={() => setHoverIdx(null)}
            onClick={() => setHoverIdx(idx)}
          >
            <title>{`${point.date}: ${insight.metricLabel} ${fmt(point.value)} m³; ${insight.referenceLabel} ${fmt(point.reference)} m³`}</title>
          </rect>
        ))}
      </svg>
      {inspectPoint && tooltip && (
        <div
          className={`nodeinsight__tooltip nodeinsight__tooltip--${tooltip.position}`}
          style={{ left: tooltip.left }}
        >
          <strong>{inspectPoint.date}</strong>
          <span>{insight.metricLabel}: {fmt(inspectPoint.value)}</span>
          <span>{insight.referenceLabel}: {fmt(inspectPoint.reference)}</span>
        </div>
      )}
      <div className="nodeinsight__legend-mini">
        <span><i className="nodeinsight__key nodeinsight__key--value" />{insight.metricLabel}</span>
        <span><i className="nodeinsight__key nodeinsight__key--reference" />{insight.referenceLabel}</span>
      </div>
    </div>
  );
}

export default function NodeInsightPopover({ insight, anchor, onClose }) {
  if (!insight || !anchor) return null;

  const style = { left: anchor.x, top: anchor.y };
  const placement = anchor.placement === "below" ? " nodeinsight--below" : "";
  const tone = insight.tone ? ` nodeinsight--${insight.tone}` : "";

  return (
    <aside className={`nodeinsight${placement}${tone}`} style={style}>
      <header className="nodeinsight__head">
        <div className="nodeinsight__title">
          <span>{insight.eyebrow}</span>
          <strong title={insight.name}>{insight.name}</strong>
        </div>
        <button type="button" className="nodeinsight__close" onClick={onClose} title="Close insight">
          <X size={13} />
        </button>
      </header>

      <div className="nodeinsight__metrics">
        <span>
          <em>{insight.metricLabel}</em>
          <strong>{fmt(insight.currentValue)}</strong>
        </span>
        <span>
          <em>{insight.referenceLabel}</em>
          <strong>{fmt(insight.referenceValue)}</strong>
        </span>
        <span>
          <em>{insight.noteLabel}</em>
          <strong>{displayNote(insight)}</strong>
        </span>
      </div>

      <TimeSeriesChart insight={insight} />
    </aside>
  );
}
