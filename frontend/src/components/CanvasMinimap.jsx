import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Map as MapIcon, X } from "lucide-react";
import { ENTITY_TYPE_COLORS } from "../cytoscape/buildCyStyle";
import "./CanvasMinimap.css";

// A Cytoscape-native overview: node positions drawn into a small SVG with a
// draggable viewport rectangle. Unlike the reference Konva minimap this reads
// straight from the live cy instance (cy.extent() for the viewport, node
// positions for the dots), so it needs no separate coordinate model.
const MINIMAP_W = 200;
const MINIMAP_H = 140;
const PAD = 10;
const PIPE_COLOUR = "#5b7ca3";
// Notes and group boxes are canvas furniture, not network: leave them off.
const ANNOTATION_TYPES = new Set(["note", "group-box"]);

export default function CanvasMinimap({ cyRef, visible = true, onToggle }) {
  const [, force] = useState(0);
  const rerender = useCallback(() => force((n) => (n + 1) % 1_000_000), []);
  const rafRef = useRef(0);
  const svgRef = useRef(null);

  // Coalesce the flurry of pan/zoom/position events into one repaint per frame.
  const schedule = useCallback(() => {
    if (rafRef.current) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = 0;
      rerender();
    });
  }, [rerender]);

  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return undefined;
    const events = "pan zoom resize render add remove position";
    cy.on(events, schedule);
    return () => {
      cy.off(events, schedule);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
    };
  }, [cyRef, schedule]);

  // Repaint once when it first becomes visible, so it is never a frame stale.
  useLayoutEffect(() => {
    if (visible) rerender();
  }, [visible, rerender]);

  if (!visible) return null;
  const cy = cyRef.current;
  if (!cy || cy.destroyed?.()) return null;

  const nodes = cy.nodes().filter((n) => !ANNOTATION_TYPES.has(n.data("type")));
  const edges = cy.edges();
  const bb = nodes.length ? nodes.boundingBox() : { x1: 0, y1: 0, x2: 100, y2: 100 };
  const modelW = Math.max(1, bb.x2 - bb.x1);
  const modelH = Math.max(1, bb.y2 - bb.y1);
  const scale = Math.min((MINIMAP_W - PAD * 2) / modelW, (MINIMAP_H - PAD * 2) / modelH);
  // Centre the content within the minimap box.
  const offX = PAD + (MINIMAP_W - PAD * 2 - modelW * scale) / 2;
  const offY = PAD + (MINIMAP_H - PAD * 2 - modelH * scale) / 2;
  const toMiniX = (x) => offX + (x - bb.x1) * scale;
  const toMiniY = (y) => offY + (y - bb.y1) * scale;
  const toModelX = (mx) => (mx - offX) / scale + bb.x1;
  const toModelY = (my) => (my - offY) / scale + bb.y1;

  const ext = cy.extent(); // model-space rect of the current viewport
  const vp = {
    x: toMiniX(ext.x1),
    y: toMiniY(ext.y1),
    w: (ext.x2 - ext.x1) * scale,
    h: (ext.y2 - ext.y1) * scale,
  };

  // Pan so a given minimap point becomes the centre of the canvas viewport.
  const centerOnMini = (mx, my) => {
    const zoom = cy.zoom();
    cy.pan({
      x: cy.width() / 2 - toModelX(mx) * zoom,
      y: cy.height() / 2 - toModelY(my) * zoom,
    });
  };

  const pointFromEvent = (event) => {
    const rect = svgRef.current.getBoundingClientRect();
    return {
      mx: Math.max(0, Math.min(MINIMAP_W, event.clientX - rect.left)),
      my: Math.max(0, Math.min(MINIMAP_H, event.clientY - rect.top)),
    };
  };

  const handlePointerDown = (event) => {
    event.preventDefault();
    svgRef.current.setPointerCapture?.(event.pointerId);
    const { mx, my } = pointFromEvent(event);
    centerOnMini(mx, my);
  };

  const handlePointerMove = (event) => {
    if (event.buttons !== 1) return;
    const { mx, my } = pointFromEvent(event);
    centerOnMini(mx, my);
  };

  const dotColor = (n) => ENTITY_TYPE_COLORS[n.data("type")] || "#6b7280";

  return (
    <div className="nb-minimap" role="region" aria-label="Minimap">
      <div className="nb-minimap__head">
        <MapIcon size={12} className="nb-minimap__head-icon" aria-hidden="true" />
        <span className="nb-minimap__title">Overview</span>
        <span className="nb-minimap__count">{nodes.length}</span>
        {onToggle && (
          <button type="button" className="nb-minimap__toggle" onClick={onToggle} title="Hide minimap" aria-label="Hide minimap">
            <X size={13} />
          </button>
        )}
      </div>
      <svg
        ref={svgRef}
        className="nb-minimap__svg"
        width={MINIMAP_W}
        height={MINIMAP_H}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
      >
        <rect x={0} y={0} width={MINIMAP_W} height={MINIMAP_H} rx={6} className="nb-minimap__bg" />
        {/* Pipes as straight source→target strokes (bends are too small to
            matter at this scale), under the asset dots. */}
        {edges.map((e) => {
          const a = e.source().position();
          const b = e.target().position();
          return (
            <line
              key={e.id()}
              x1={toMiniX(a.x)}
              y1={toMiniY(a.y)}
              x2={toMiniX(b.x)}
              y2={toMiniY(b.y)}
              className="nb-minimap__pipe"
              stroke={PIPE_COLOUR}
            />
          );
        })}
        {nodes.map((n) => {
          const p = n.position();
          const isJunction = n.data("type") === "node";
          return (
            <circle
              key={n.id()}
              cx={toMiniX(p.x)}
              cy={toMiniY(p.y)}
              r={isJunction ? 1.8 : 3.2}
              fill={dotColor(n)}
              className="nb-minimap__dot"
            />
          );
        })}
        <rect
          className="nb-minimap__vp"
          x={vp.x}
          y={vp.y}
          width={Math.max(3, vp.w)}
          height={Math.max(3, vp.h)}
          rx={3}
        />
      </svg>
    </div>
  );
}
