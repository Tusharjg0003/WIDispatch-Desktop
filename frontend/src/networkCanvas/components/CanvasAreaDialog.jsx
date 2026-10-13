import React, { useMemo, useState } from "react";
import FloatingPanel from "../../components/FloatingPanel";
import { Field } from "../../components/AssetFormControls";
import {
  MAX_GRID,
  MIN_GRID,
  areaRectPx,
  describeArea,
  describeGrid,
  fitAreaToBounds,
  idsOutside,
  resizeArea,
  shortfallForBounds,
} from "../../cytoscape/canvasArea.js";

const boundsOf = (items) => {
  if (!items.length) return null;
  const xs = items.map((i) => i.x);
  const ys = items.map((i) => i.y);
  return { x1: Math.min(...xs), y1: Math.min(...ys), x2: Math.max(...xs), y2: Math.max(...ys) };
};

const toForm = (area) => ({
  width: String(area.width),
  height: String(area.height),
  grid: String(area.grid),
  anchor: "top-left",
});

// The drawing area's size and grid, in canvas pixels. A change may not push
// off the sheet what is on it now (items already outside — it's a soft guide —
// don't hold it back). The grid size is the canvas grid: snapping and arrow
// nudges follow it; nothing already drawn moves.
export default function CanvasAreaDialog({ area, items = [], onApply, onCancel }) {
  const [form, setForm] = useState(() => toForm(area));
  const drawingBounds = useMemo(() => boundsOf(items), [items]);
  const onSheetBounds = useMemo(() => {
    const outside = new Set(idsOutside(areaRectPx(area), items));
    return boundsOf(items.filter((i) => !outside.has(i.id)));
  }, [area, items]);
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const { next, error } = useMemo(() => {
    const width = Number(form.width);
    const height = Number(form.height);
    const grid = Number(form.grid);
    if (!(width > 0) || !(height > 0)) return { next: null, error: "Width and height must be greater than zero." };
    if (!(grid >= MIN_GRID && grid <= MAX_GRID)) {
      return { next: null, error: `The grid size must be between ${MIN_GRID} and ${MAX_GRID} px.` };
    }
    const candidate = resizeArea(area, { width, height, grid }, form.anchor);
    const short = shortfallForBounds(candidate, onSheetBounds);
    if (short) {
      return {
        next: null,
        error: short.startsBefore
          ? "Part of the drawing is above or left of this area. Anchor it at the centre, or use Fit to drawing."
          : `This would cut off part of the drawing. It needs at least ${describeArea(short)}.`,
      };
    }
    return { next: candidate, error: null };
  }, [form, area, onSheetBounds]);

  const fitToDrawing = () => {
    const grid = Number(form.grid);
    const fitted = fitAreaToBounds(drawingBounds, { grid: grid >= MIN_GRID && grid <= MAX_GRID ? grid : area.grid });
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
          <Field label="Width (px)">
            <input type="number" min="1" step="any" value={form.width} onChange={set("width")} autoFocus required />
          </Field>
          <Field label="Height (px)">
            <input type="number" min="1" step="any" value={form.height} onChange={set("height")} required />
          </Field>
          <Field label="Grid size (px)">
            <input type="number" min={MIN_GRID} max={MAX_GRID} step="1" value={form.grid} onChange={set("grid")} required />
          </Field>
          <Field label="Resize from">
            <select value={form.anchor} onChange={set("anchor")}>
              <option value="top-left">Top-left corner</option>
              <option value="center">Centre</option>
            </select>
          </Field>
        </div>

        <p className="af__hint">
          {next ? <>Sheet: <strong>{describeArea(next)}</strong>, {describeGrid(next)}.</> : "Set a width, a height and a grid size."}
          {" "}Snapping and arrow-key nudges follow the grid.
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
