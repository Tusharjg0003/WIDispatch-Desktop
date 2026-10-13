import React, { useEffect, useRef, useState } from "react";
import { Ruler, TriangleAlert } from "lucide-react";
import {
  areaFromRect,
  areaRectPx,
  describeArea,
  dragSheetRect,
  idsOutside,
  niceScaleBar,
  onSheetBounds,
} from "../../cytoscape/canvasArea.js";
import { CANVAS_GRID_PITCH } from "../../cytoscape/canvasGeometry.js";
import "./CanvasSheet.css";

// The network's drawing area under the graph: a framed sheet with the outside
// dimmed, a scale bar that follows the zoom, and a count of whatever sits off
// the sheet (a soft guide — nothing is held inside it).
//
// The frame is positioned straight from Cytoscape's viewport events rather
// than through React state, so it tracks pan/zoom without re-rendering.
//
// With `onResize`, the sheet's edges and corners can be dragged: the opposite
// side stays put, the size snaps to whole grid squares (Alt: free), and it
// can't shrink past what is on the sheet. One drag is one change.
const HANDLES = ["n", "e", "s", "w", "ne", "se", "sw", "nw"];

const nodePoints = (cy) => cy.nodes().map((n) => ({ id: n.id(), ...n.position() }));

export default function CanvasSheet({ cy, area, onEdit, onResize }) {
  const layerRef = useRef(null);
  const sheetRef = useRef(null);
  const handlesRef = useRef(null);
  const dragRef = useRef(null); // { rect } while a handle is dragged
  const placeRef = useRef(() => {});
  const [bar, setBar] = useState(null);
  const [outside, setOutside] = useState([]);
  const [drag, setDrag] = useState(null); // { area, x, y } while dragging

  useEffect(() => {
    if (!cy || !area) return undefined;
    const rect = areaRectPx(area);

    const place = () => {
      const zoom = cy.zoom();
      const pan = cy.pan();
      const r = dragRef.current?.rect || rect;
      for (const el of [sheetRef.current, handlesRef.current]) {
        if (!el) continue;
        el.style.transform = `translate(${r.x1 * zoom + pan.x}px, ${r.y1 * zoom + pan.y}px)`;
        el.style.width = `${r.w * zoom}px`;
        el.style.height = `${r.h * zoom}px`;
      }
      const next = niceScaleBar(area.resolution / (CANVAS_GRID_PITCH * zoom), area.unit);
      setBar((prev) => (prev && next && prev.label === next.label && Math.abs(prev.px - next.px) < 0.5 ? prev : next));
    };

    let timer = null;
    const count = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        const ids = idsOutside(rect, nodePoints(cy));
        setOutside((prev) => (prev.length === ids.length && prev.every((id, i) => id === ids[i]) ? prev : ids));
      }, 150);
    };

    placeRef.current = place;
    place();
    count();
    cy.on("viewport resize", place);
    cy.on("add remove position", count);
    return () => {
      clearTimeout(timer);
      cy.off("viewport resize", place);
      cy.off("add remove position", count);
    };
  }, [cy, area]);

  if (!cy || !area) return null;

  const startDrag = (handle) => (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const rect = areaRectPx(area);
    const keep = onSheetBounds(rect, nodePoints(cy));
    const box = layerRef.current.getBoundingClientRect();
    dragRef.current = { rect };

    const move = (e) => {
      const zoom = cy.zoom();
      const pan = cy.pan();
      const point = { x: (e.clientX - box.left - pan.x) / zoom, y: (e.clientY - box.top - pan.y) / zoom };
      const next = dragSheetRect(rect, handle, point, { keep, free: e.altKey });
      dragRef.current = { rect: next };
      placeRef.current();
      setDrag({ area: areaFromRect(area, next), x: e.clientX - box.left, y: e.clientY - box.top });
    };
    const end = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
      const done = dragRef.current?.rect;
      dragRef.current = null;
      setDrag(null);
      const changed = done && (done.x1 !== rect.x1 || done.y1 !== rect.y1 || done.w !== rect.w || done.h !== rect.h);
      if (changed) onResize(areaFromRect(area, done));
      else placeRef.current();
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
  };

  const selectOutside = () => {
    const nodes = cy.collection(outside.map((id) => cy.getElementById(id)).filter((n) => n.nonempty()));
    if (!nodes.nonempty()) return;
    cy.elements().unselect();
    nodes.select();
    cy.animate({ fit: { eles: nodes, padding: 80 } }, { duration: 200 });
  };

  return (
    <>
      <div ref={layerRef} className="nb-sheet-layer" aria-hidden="true">
        <div ref={sheetRef} className="nb-sheet">
          <span className="nb-sheet__label">{describeArea(drag?.area || area)}</span>
        </div>
      </div>

      {onResize && (
        <div className={`nb-sheet-handles${drag ? " nb-sheet-handles--dragging" : ""}`}>
          <div ref={handlesRef} className="nb-sheet-handles__frame">
            {HANDLES.map((h) => (
              <span
                key={h}
                className={`nb-sheet-handle nb-sheet-handle--${h}`}
                onPointerDown={startDrag(h)}
                title="Drag to resize the drawing area (hold Alt to skip snapping)"
              />
            ))}
          </div>
          {drag && (
            <span className="nb-sheet-handles__size" style={{ left: drag.x + 14, top: drag.y + 14 }}>
              {describeArea(drag.area)}
            </span>
          )}
        </div>
      )}

      <div className="nb-sheet-hud">
        {bar && (
          <div className="nb-scalebar" title="Scale at the current zoom">
            <span className="nb-scalebar__bar" style={{ width: `${bar.px}px` }} />
            <span className="nb-scalebar__label">{bar.label}</span>
          </div>
        )}
        {onEdit && (
          <button type="button" className="nb-sheet-hud__btn" onClick={onEdit} title="Drawing area size">
            <Ruler size={12} aria-hidden="true" /> {area.width} × {area.height} {area.unit}
          </button>
        )}
        {outside.length > 0 && (
          <button
            type="button"
            className="nb-sheet-hud__btn nb-sheet-hud__btn--warn"
            onClick={selectOutside}
            title="Select the items outside the drawing area"
          >
            <TriangleAlert size={12} aria-hidden="true" />
            {outside.length} outside the drawing area
          </button>
        )}
      </div>
    </>
  );
}
