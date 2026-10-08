import { useCallback, useEffect, useMemo, useState } from "react";
import { Grid3x3, Minus, Plus, RotateCcw } from "lucide-react";
import { useStatusItems } from "../../components/StatusBar";
import { nextZoomStop, prevZoomStop } from "../../cytoscape/canvasGeometry";

const MIN_ZOOM = 0.05;
const MAX_ZOOM = 4;
const ZOOM_ANIM_MS = 140;

// Canvas status bar, as SWIIMS StatusBar + NetworkSimulation2Page: zoom
// −/+/reset stepping through ZOOM_STOPS (140ms ease-out, anchored on the
// selection or the view centre), a live zoom % readout, a count per asset
// type, the New / Unsaved / Saved state and "N selected".
const NO_TOGGLES = [];

// `assetCounts` is one { label, value, tone } per asset type on the canvas;
// `leading` / `trailing` are the panel toggles pinned to the bar's outer
// edges (see StatusBar). Pass memoised arrays.
export default function useCanvasStatus({
  cyRef, cyReady, assetCounts = NO_TOGGLES, selectedCount, saveState,
  leading = NO_TOGGLES, trailing = NO_TOGGLES,
}) {
  const [zoom, setZoom] = useState(1);

  useEffect(() => {
    const cy = cyRef.current;
    if (!cyReady || !cy) return undefined;
    let timer = null;
    const sync = () => {
      if (timer) return;
      timer = setTimeout(() => {
        timer = null;
        if (!cy.destroyed()) setZoom(cy.zoom());
      }, 50);
    };
    sync();
    cy.on("zoom", sync);
    return () => {
      cy.removeListener("zoom", sync);
      if (timer) clearTimeout(timer);
    };
  }, [cyRef, cyReady]);

  const zoomToLevel = useCallback(
    (level, { animate = true } = {}) => {
      const cy = cyRef.current;
      if (!cy) return;
      const target = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, level));
      if (Math.abs(target - cy.zoom()) < 1e-4) return;
      const selected = cy.$(":selected");
      let anchor = { x: cy.width() / 2, y: cy.height() / 2 };
      if (selected.nonempty()) {
        const bb = selected.renderedBoundingBox({ includeLabels: false, includeOverlays: false });
        anchor = { x: (bb.x1 + bb.x2) / 2, y: (bb.y1 + bb.y2) / 2 };
      }
      // Stop first so repeated clicks don't queue drifting animations.
      cy.stop();
      if (!animate) {
        cy.zoom({ level: target, renderedPosition: anchor });
        return;
      }
      cy.animate({ zoom: { level: target, renderedPosition: anchor } }, { duration: ZOOM_ANIM_MS, easing: "ease-out-quad" });
    },
    [cyRef]
  );

  const zoomIn = useCallback(() => zoomToLevel(nextZoomStop(cyRef.current?.zoom() ?? 1)), [zoomToLevel, cyRef]);
  const zoomOut = useCallback(() => zoomToLevel(prevZoomStop(cyRef.current?.zoom() ?? 1)), [zoomToLevel, cyRef]);
  const zoomReset = useCallback(() => zoomToLevel(1), [zoomToLevel]);

  const zoomPercent = Math.round(zoom * 100);
  const items = useMemo(
    () => ({
      left: [
        ...(assetCounts.length ? assetCounts : [{ label: "Assets", value: 0, tone: "neutral" }]),
        { label: "State", value: saveState.label, tone: saveState.tone, pill: true },
        ...(selectedCount > 0 ? [{ label: "Selected", value: selectedCount, tone: "warn" }] : []),
      ],
      actions: [
        { id: "zoom-out", group: "Zoom", label: "Zoom out", icon: Minus, title: "Zoom out", onClick: zoomOut },
        { id: "zoom-readout", group: "Zoom", type: "readout", label: `${zoomPercent}%` },
        { id: "zoom-in", group: "Zoom", label: "Zoom in", icon: Plus, title: "Zoom in", onClick: zoomIn },
        { id: "zoom-reset", label: "Reset", icon: RotateCcw, showLabel: true, title: "Reset zoom to 100%", onClick: zoomReset },
      ],
      right: [{ label: "Grid", value: "40m", icon: Grid3x3 }],
      leading,
      trailing,
    }),
    [assetCounts, saveState.label, saveState.tone, selectedCount, zoomPercent, zoomIn, zoomOut, zoomReset, leading, trailing]
  );
  useStatusItems(items);

  return { zoom, zoomPercent, zoomIn, zoomOut, zoomReset, zoomToLevel };
}
