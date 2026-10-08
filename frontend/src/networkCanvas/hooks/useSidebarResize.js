import { useCallback, useEffect, useRef, useState } from "react";

// Drag-to-resize for the canvas side rails. The handle sits on the rail's
// inner edge (the right edge of the left rail, the left edge of the right
// panel), so both resize the same natural way; the width is remembered per
// browser. Arrow keys resize too, and a double-click restores the default.
//
//   const left = useSidebarResize({ key: "nb.leftRailWidth", side: "left", initial: 232, min: 190, max: 420 });
//   <aside style={{ width: left.width }}> … <div {...left.handleProps} /></aside>

const STEP = 16;

const readWidth = (key, fallback, min, max) => {
  try {
    const value = Number(window.localStorage.getItem(key));
    return Number.isFinite(value) && value > 0 ? Math.min(max, Math.max(min, value)) : fallback;
  } catch {
    return fallback;
  }
};
const writeWidth = (key, value) => {
  try {
    window.localStorage.setItem(key, String(Math.round(value)));
  } catch {
    // Storage unavailable: the width just resets on reload.
  }
};

export default function useSidebarResize({ key, side, initial, min, max }) {
  const [width, setWidth] = useState(() => readWidth(key, initial, min, max));
  const dragRef = useRef(null);
  const widthRef = useRef(width);
  widthRef.current = width;

  const clamp = useCallback((value) => Math.min(max, Math.max(min, Math.round(value))), [min, max]);
  const commit = useCallback((value) => {
    const next = clamp(value);
    setWidth(next);
    writeWidth(key, next);
  }, [clamp, key]);

  const onPointerDown = (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { startX: event.clientX, startWidth: widthRef.current };
    document.body.classList.add("is-resizing-sidebar");
  };
  const onPointerMove = (event) => {
    const drag = dragRef.current;
    if (!drag) return;
    // Left rail grows to the right; right panel grows to the left.
    const delta = (event.clientX - drag.startX) * (side === "left" ? 1 : -1);
    setWidth(clamp(drag.startWidth + delta));
  };
  const endDrag = () => {
    if (!dragRef.current) return;
    dragRef.current = null;
    document.body.classList.remove("is-resizing-sidebar");
    writeWidth(key, widthRef.current);
  };
  const onKeyDown = (event) => {
    const grow = side === "left" ? "ArrowRight" : "ArrowLeft";
    const shrink = side === "left" ? "ArrowLeft" : "ArrowRight";
    if (event.key === grow) commit(widthRef.current + STEP);
    else if (event.key === shrink) commit(widthRef.current - STEP);
    else if (event.key === "Home") commit(min);
    else if (event.key === "End") commit(max);
    else return;
    event.preventDefault();
  };

  useEffect(() => () => document.body.classList.remove("is-resizing-sidebar"), []);

  return {
    width,
    handleProps: {
      className: `nb-resize-handle nb-resize-handle--${side}`,
      role: "separator",
      "aria-orientation": "vertical",
      "aria-label": side === "left" ? "Resize left sidebar" : "Resize right sidebar",
      "aria-valuemin": min,
      "aria-valuemax": max,
      "aria-valuenow": width,
      tabIndex: 0,
      title: "Drag to resize · double-click to reset",
      onPointerDown,
      onPointerMove,
      onPointerUp: endDrag,
      onPointerCancel: endDrag,
      onKeyDown,
      onDoubleClick: () => commit(initial),
    },
  };
}
