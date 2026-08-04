import React, { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Pause, Play } from "lucide-react";

const nf = new Intl.NumberFormat("en-US");
const fmt = (v) => (v == null ? "—" : nf.format(Math.round(v)));
const STEP_MS = 700;

export default function CanvasDayScrubber({ summaries, dayIdx, onChange }) {
  const [playing, setPlaying] = useState(false);
  const timerRef = useRef(null);

  const last = summaries.length - 1;
  const current = summaries[dayIdx];
  const worstShortage = Math.max(0, ...summaries.map((s) => s.shortage || 0));

  // Stepping lives in an effect keyed on dayIdx so the timer always sees the
  // current day, and stops itself at the end of the horizon.
  useEffect(() => {
    if (!playing) return undefined;
    if (dayIdx >= last) {
      setPlaying(false);
      return undefined;
    }
    timerRef.current = setTimeout(() => onChange(dayIdx + 1), STEP_MS);
    return () => clearTimeout(timerRef.current);
  }, [playing, dayIdx, last, onChange]);

  if (!current) return null;

  return (
    <div className="simscrub">
      <div className="simscrub__controls">
        <button type="button" className="simscrub__btn" title="Previous day"
          disabled={dayIdx <= 0} onClick={() => onChange(dayIdx - 1)}>
          <ChevronLeft size={14} />
        </button>
        <button type="button" className="simscrub__btn" title={playing ? "Pause" : "Play the horizon"}
          onClick={() => setPlaying((v) => !v)}>
          {playing ? <Pause size={14} /> : <Play size={14} />}
        </button>
        <button type="button" className="simscrub__btn" title="Next day"
          disabled={dayIdx >= last} onClick={() => onChange(dayIdx + 1)}>
          <ChevronRight size={14} />
        </button>
      </div>

      <div className="simscrub__track">
        <div className="simscrub__bars">
          {summaries.map((s) => (
            <button
              key={s.date}
              type="button"
              title={`${s.date} — ${fmt(s.shortage)} m³ short`}
              className={`simscrub__bar${s.dayIdx === dayIdx ? " simscrub__bar--active" : ""}`}
              style={{ "--fill": worstShortage > 0 ? `${(s.shortage / worstShortage) * 100}%` : "0%" }}
              onClick={() => onChange(s.dayIdx)}
            />
          ))}
        </div>
        <input
          type="range"
          className="simscrub__range"
          min={0}
          max={last}
          step={1}
          value={dayIdx}
          onChange={(e) => onChange(Number(e.target.value))}
          aria-label="Selected day"
        />
      </div>

      <div className="simscrub__readout">
        <strong>{current.date}</strong>
        <span>Day {dayIdx + 1} of {summaries.length}</span>
        <span>{fmt(current.delivered)} / {fmt(current.required)} m³</span>
        <span className={current.shortage > 0 ? "simscrub__short" : ""}>
          {current.shortage > 0 ? `${fmt(current.shortage)} m³ short` : "Fully served"}
        </span>
      </div>
    </div>
  );
}
