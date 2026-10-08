import { useCallback, useEffect, useRef, useState } from "react";

export const DRAW_ROUTE_MODE = "draw-segmented-line";
const ANNOTATION_TYPES = new Set(["note", "group-box"]);

// Draw Route (SWIIMS "connect-segmented-line"): click a source asset, then
// click empty canvas to drop junctions (each becomes a real Node) or
// Shift+click to drop bends, Backspace removes the last point, and clicking
// the target asset finishes. Each leg between consecutive vertices becomes
// its own pipe; the host's pipe modal supplies the shared pipe fields.
//
// The hook owns its own Cytoscape listeners (guarded by the current mode) so
// it never has to be threaded through the canvas's mount effect.
export default function useDrawRoute({ cyRef, cyReady, mode, onFinish, onToast }) {
  const [route, setRoute] = useState(null); // { sourceId, points: [{ kind, x, y }] }
  const [cursor, setCursor] = useState(null);
  const [viewTick, setViewTick] = useState(0);
  const routeRef = useRef(null);
  const modeRef = useRef(mode);
  const finishRef = useRef(onFinish);
  const toastRef = useRef(onToast);
  modeRef.current = mode;
  finishRef.current = onFinish;
  toastRef.current = onToast;

  const update = useCallback((next) => {
    routeRef.current = next;
    setRoute(next);
  }, []);

  // Leaving the mode abandons an unfinished route.
  useEffect(() => {
    if (mode !== DRAW_ROUTE_MODE && routeRef.current) update(null);
    if (mode !== DRAW_ROUTE_MODE) setCursor(null);
  }, [mode, update]);

  useEffect(() => {
    const cy = cyRef.current;
    if (!cyReady || !cy) return undefined;
    const active = () => modeRef.current === DRAW_ROUTE_MODE;

    const onNodeTap = (evt) => {
      if (!active()) return;
      const node = evt.target;
      if (ANNOTATION_TYPES.has(node.data("type"))) return;
      const current = routeRef.current;
      if (!current) {
        cy.$(".draw-source").removeClass("draw-source");
        node.addClass("draw-source");
        update({ sourceId: node.id(), points: [] });
        toastRef.current?.("Route started. Click to add junctions, Shift+click for bends, click the target asset to finish.");
        return;
      }
      if (node.id() === current.sourceId) return;
      cy.$(".draw-source").removeClass("draw-source");
      const finished = { ...current, targetId: node.id() };
      update(null);
      finishRef.current?.(finished);
    };

    const onBackgroundTap = (evt) => {
      if (!active() || evt.target !== cy) return;
      const current = routeRef.current;
      if (!current) {
        toastRef.current?.("Click a source asset to start the route.");
        return;
      }
      const kind = evt.originalEvent?.shiftKey ? "bend" : "junction";
      update({ ...current, points: [...current.points, { kind, x: evt.position.x, y: evt.position.y }] });
    };

    const onMove = (evt) => {
      if (!active() || !routeRef.current) return;
      setCursor({ x: evt.position.x, y: evt.position.y });
    };
    const onViewport = () => {
      if (active() && routeRef.current) setViewTick((t) => t + 1);
    };

    cy.on("tap", "node", onNodeTap);
    cy.on("tap", onBackgroundTap);
    cy.on("mousemove", onMove);
    cy.on("viewport", onViewport);
    return () => {
      cy.removeListener("tap", "node", onNodeTap);
      cy.removeListener("tap", onBackgroundTap);
      cy.removeListener("mousemove", onMove);
      cy.removeListener("viewport", onViewport);
    };
  }, [cyRef, cyReady, update]);

  // Backspace removes the last point while drawing.
  useEffect(() => {
    if (mode !== DRAW_ROUTE_MODE) return undefined;
    const onKey = (event) => {
      if (event.key !== "Backspace" || !routeRef.current) return;
      const tag = event.target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || event.target?.isContentEditable) return;
      event.preventDefault();
      // Same target (window) as the canvas's own Delete/Backspace handler:
      // only stopImmediatePropagation keeps that one from deleting too.
      event.stopImmediatePropagation();
      const current = routeRef.current;
      update({ ...current, points: current.points.slice(0, -1) });
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [mode, update]);

  // Live preview polyline in rendered (screen) coordinates.
  const cy = cyRef.current;
  let preview = null;
  if (route && cy && !cy.destroyed()) {
    const source = cy.getElementById(route.sourceId);
    if (source.length) {
      const zoom = cy.zoom();
      const pan = cy.pan();
      const toScreen = (p) => ({ x: p.x * zoom + pan.x, y: p.y * zoom + pan.y });
      const model = [source.position(), ...route.points, ...(cursor ? [cursor] : [])];
      preview = {
        path: model.map(toScreen),
        points: route.points.map((p) => ({ ...toScreen(p), kind: p.kind })),
        viewTick,
      };
    }
  }

  const cancel = useCallback(() => update(null), [update]);
  return { route, preview, cancel };
}

/**
 * Turn a finished route into legs: each junction closes a leg; bends belong
 * to the leg they fall in. Returns [{ from, to, bends: [{x,y}] }] where
 * from/to are "source" | "target" | junction index.
 */
export function routeToLegs(points = []) {
  const legs = [];
  let from = "source";
  let bends = [];
  let junction = 0;
  points.forEach((point) => {
    if (point.kind === "bend") {
      bends.push({ x: point.x, y: point.y });
      return;
    }
    legs.push({ from, to: junction, bends });
    from = junction;
    junction += 1;
    bends = [];
  });
  legs.push({ from, to: "target", bends });
  return legs;
}
