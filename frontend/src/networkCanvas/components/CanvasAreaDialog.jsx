import React, { useMemo, useState } from "react";
import FloatingPanel from "../../components/FloatingPanel";
import { Field } from "../../components/AssetFormControls";
import {
  areaRectPx,
  describeArea,
  fitAreaToBounds,
  idsOutside,
  resizeArea,
  shortfallForBounds,
} from "../../cytoscape/canvasArea.js";

const UNIT_FACTOR = { km: 1000, m: 1 };

const boundsOf = (items) => {
  if (!items.length) return null;
  const xs = items.map((i) => i.x);
  const ys = items.map((i) => i.y);
  return { x1: Math.min(...xs), y1: Math.min(...ys), x2: Math.max(...xs), y2: Math.max(...ys) };
};

// Switching units keeps the same real size (100 km ⇄ 100000 m).
const convert = (value, from, to) => {
  const n = Number(value);
  if (!Number.isFinite(n) || from === to) return value;
  return String(Math.round(((n * UNIT_FACTOR[from]) / UNIT_FACTOR[to]) * 1e6) / 1e6);
};

const toForm = (area) => ({
  width: String(area.width),
  height: String(area.height),
  unit: area.unit,
  resolution: String(area.resolution),
  anchor: "top-left",
});

// The drawing area's size. The grid's scale (area.resolution) isn't shown or
// edited here; it is kept, converting with the units. The sheet keeps its scale when
// resized, and a change may not push off the sheet what is on it now (items
// already outside — it's a soft guide — don't hold it back).
export default function CanvasAreaDialog({ area, items = [], onApply, onCancel }) {
  const [form, setForm] = useState(() => toForm(area));
  const drawingBounds = useMemo(() => boundsOf(items), [items]);
  const onSheetBounds = useMemo(() => {
    const outside = new Set(idsOutside(areaRectPx(area), items));
    return boundsOf(items.filter((i) => !outside.has(i.id)));
  }, [area, items]);
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const setUnit = (e) => {
    const unit = e.target.value;
    setForm((f) => ({
      ...f,
      unit,
      width: convert(f.width, f.unit, unit),
      height: convert(f.height, f.unit, unit),
      resolution: convert(f.resolution, f.unit, unit),
    }));
  };

  const { next, error } = useMemo(() => {
    const width = Number(form.width);
    const height = Number(form.height);
    const resolution = Number(form.resolution);
    if (!(width > 0) || !(height > 0)) return { next: null, error: "Width and height must be greater than zero." };
    const candidate = resizeArea(area, { width, height, unit: form.unit, resolution }, form.anchor);
    const short = shortfallForBounds(candidate, onSheetBounds);
    if (short) {
      return {
        next: null,
        error: short.startsBefore
          ? "Part of the drawing is above or left of this area. Anchor it at the centre, or use Fit to drawing."
          : `This would cut off part of the drawing. It needs at least ${short.width} × ${short.height} ${form.unit}.`,
      };
    }
    return { next: candidate, error: null };
  }, [form, area, onSheetBounds]);

  const fitToDrawing = () => {
    const fitted = fitAreaToBounds(drawingBounds, { unit: form.unit, resolution: Number(form.resolution) });
    // The fitted origin isn't a form field, so it applies straight away.
    onApply(fitted);
  };

  const submit = (e) => {
    e.preventDefault();
    if (next) onApply(next);
  };

  return (
    <FloatingPanel title="Drawing area" onClose={onCancel} storageKey="canvas-area" width={440} className="nb-area-modal">
      <form className="af__body" onSubmit={submit}>
        <div className="af__grid">
          <Field label="Width">
            <input type="number" min="0" step="any" value={form.width} onChange={set("width")} autoFocus required />
          </Field>
          <Field label="Height">
            <input type="number" min="0" step="any" value={form.height} onChange={set("height")} required />
          </Field>
          <Field label="Units">
            <select value={form.unit} onChange={setUnit}>
              <option value="km">Kilometres (km)</option>
              <option value="m">Metres (m)</option>
            </select>
          </Field>
          <Field label="Resize from">
            <select value={form.anchor} onChange={set("anchor")}>
              <option value="top-left">Top-left corner</option>
              <option value="center">Centre</option>
            </select>
          </Field>
        </div>

        <p className="af__hint">
          {next ? <>Sheet: <strong>{describeArea(next)}</strong>.</> : "Set a width and a height."}
          {" "}Pipe lengths are not affected.
        </p>

        {error && <div className="af__error">{error}</div>}

        <div className="af__footer">
          <button type="button" className="af__btn af__btn--ghost" onClick={fitToDrawing} disabled={!drawingBounds}>
            Fit to drawing
          </button>
          <span style={{ flex: 1 }} />
          <button type="button" className="af__btn af__btn--ghost" onClick={onCancel}>Cancel</button>
          <button type="submit" className="af__btn af__btn--primary" disabled={!next}>Apply</button>
        </div>
      </form>
    </FloatingPanel>
  );
}
