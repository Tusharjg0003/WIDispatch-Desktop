import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { applyOverlay, clearOverlay, startFlowAnimation, stopFlowAnimation } from "../../cytoscape/simulationOverlay";
import { canvasStaleness, dayOverlay, daySummaries, edgeInsight, nodeInsight } from "../../lib/simulationCanvas";

export const BOTTLENECK_MODE = "bottlenecks";
const FOCUS_CLASSES = "sim-focus sim-focus-dim sim-gap-binding sim-gap-spare sim-gap-root";
const DELIVERY = new Set(["handover_point", "filling_station", "point", "distribution_point"]);
const SUPPLY = new Set(["plant", "stp"]);

/** Insight popover anchor near a node/edge, clamped inside the stage. */
export function elementAnchor(el, container) {
  if (!el?.length || !container) return null;
  const box = el.renderedBoundingBox({ includeLabels: false, includeOverlays: false });
  const stageWidth = container.clientWidth;
  const halfWidth = 258;
  const margin = 10;
  const lower = stageWidth > halfWidth * 2 ? halfWidth : stageWidth / 2;
  const upper = stageWidth > halfWidth * 2 ? stageWidth - halfWidth : stageWidth / 2;
  const x = Math.min(Math.max((box.x1 + box.x2) / 2, lower), upper);
  const placeBelow = box.y1 < 128;
  return { x, y: placeBelow ? box.y2 + margin : box.y1 - margin, placement: placeBelow ? "below" : "above" };
}

// Simulation layer of the embedded canvas (Simulation Config), combining the
// former read-only CanvasPanel with SWIIMS' simulation-config canvas:
//  - paints the solved day (pipe utilisation, plant/gate/pump/tank states,
//    stale and overridden elements), re-painting as the network is edited;
//  - day scrubber, flow animation, node/pipe insight popover;
//  - Simulation View → Bottlenecks (highlight + dim the rest, sorted list);
//  - Show Gap: from a short delivery point, binding pipes upstream in red and
//    plants with spare capacity in green (SWIIMS showGapOnCanvas).
export default function useSimulationLayer({ cyRef, cyReady, plan, document, enabled, mode, setMode, containerRef, onToast }) {
  const [dayIdx, setDayIdx] = useState(0);
  const [animate, setAnimate] = useState(true);
  const [cleared, setCleared] = useState(false);
  const [selection, setSelection] = useState({ id: null, kind: null });
  const [insightAnchor, setInsightAnchor] = useState(null);
  const [gap, setGap] = useState(null); // { rootId, binding: [], spare: [] }
  const [graphTick, setGraphTick] = useState(0);
  const animationRef = useRef(null);
  const toastRef = useRef(onToast);
  toastRef.current = onToast;

  const active = Boolean(enabled && plan && !cleared);

  useEffect(() => {
    setDayIdx(0);
    setSelection({ id: null, kind: null });
    setInsightAnchor(null);
    setGap(null);
    setCleared(false);
  }, [plan?.id]);

  const overlay = useMemo(() => (active ? dayOverlay(plan, dayIdx) : null), [active, plan, dayIdx]);
  const summaries = useMemo(() => (plan ? daySummaries(plan) : []), [plan]);
  const stale = useMemo(
    () => (plan && document ? canvasStaleness(document, plan) : { unknownToRun: [], missingFromCanvas: [] }),
    [plan, document]
  );

  // Re-paint when the network is edited (elements added / removed).
  useEffect(() => {
    const cy = cyRef.current;
    if (!cyReady || !cy || !enabled) return undefined;
    let timer = null;
    const bump = () => {
      clearTimeout(timer);
      timer = setTimeout(() => setGraphTick((t) => t + 1), 80);
    };
    cy.on("add remove", bump);
    return () => {
      clearTimeout(timer);
      cy.removeListener("add remove", bump);
    };
  }, [cyRef, cyReady, enabled]);

  // Paint (elements unknown to the run are dimmed as stale).
  useEffect(() => {
    const cy = cyRef.current;
    if (!cyReady || !cy) return;
    if (!overlay) {
      clearOverlay(cy);
      return;
    }
    // Staleness against the LIVE canvas, so elements added while editing show
    // as "not in this run" until the simulation is re-run.
    const live = canvasStaleness({ nodes: cy.nodes().map((n) => n.data()), edges: cy.edges().map((e) => e.data()) }, plan);
    applyOverlay(cy, overlay, { staleIds: live.unknownToRun });
  }, [cyRef, cyReady, overlay, graphTick, plan]);

  // Flow animation, separate from painting.
  useEffect(() => {
    const cy = cyRef.current;
    stopFlowAnimation(animationRef.current, cy);
    animationRef.current = null;
    if (!cy || !cyReady || !animate || !overlay) return undefined;
    animationRef.current = startFlowAnimation(cy, overlay.flowByEdge);
    return () => {
      stopFlowAnimation(animationRef.current, cyRef.current);
      animationRef.current = null;
    };
  }, [cyRef, cyReady, animate, overlay, graphTick]);

  // Insight follows the single selected element.
  useEffect(() => {
    const cy = cyRef.current;
    if (!cyReady || !cy || !enabled) return undefined;
    const onSelect = () => {
      const sel = cy.$(":selected");
      if (sel.length !== 1) {
        setSelection({ id: null, kind: null });
        setInsightAnchor(null);
        return;
      }
      const el = sel[0];
      setSelection({ id: el.id(), kind: el.isEdge() ? "edge" : "node" });
      setInsightAnchor(elementAnchor(el, containerRef.current));
    };
    const onViewport = () => {
      const sel = cy.$(":selected");
      if (sel.length === 1) setInsightAnchor(elementAnchor(sel[0], containerRef.current));
    };
    cy.on("select unselect", onSelect);
    cy.on("pan zoom resize position", onViewport);
    return () => {
      cy.removeListener("select unselect", onSelect);
      cy.removeListener("pan zoom resize position", onViewport);
    };
  }, [cyRef, cyReady, enabled, containerRef]);

  const insight = useMemo(() => {
    if (!active || !selection.id) return null;
    return selection.kind === "node" ? nodeInsight(plan, dayIdx, selection.id) : edgeInsight(plan, dayIdx, selection.id);
  }, [active, plan, dayIdx, selection.id, selection.kind]);

  const closeInsight = useCallback(() => {
    cyRef.current?.$(":selected").unselect();
    setSelection({ id: null, kind: null });
    setInsightAnchor(null);
  }, [cyRef]);

  // ── Bottlenecks (Tools → Simulation View) ────────────────────────────────
  const bottlenecks = useMemo(() => {
    const cy = cyRef.current;
    if (!overlay || !cy) return [];
    const name = (id) => {
      const el = cy.getElementById(id);
      return el.length ? el.data("label") || id : id;
    };
    const edges = overlay.bottleneckEdgeIds.map((id) => ({ id, kind: "pipe", name: name(id), util: overlay.utilByEdge[id] ?? null, flow: overlay.flowByEdge[id] ?? 0 }));
    const nodes = overlay.bottleneckNodeIds.map((id) => ({ id, kind: cy.getElementById(id).data("type") || "asset", name: name(id), util: 1, flow: null }));
    return [...edges, ...nodes].sort((a, b) => (b.util ?? 0) - (a.util ?? 0) || a.name.localeCompare(b.name));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [overlay, graphTick]);

  useEffect(() => {
    const cy = cyRef.current;
    if (!cyReady || !cy) return;
    cy.elements().removeClass("sim-focus sim-focus-dim");
    if (mode !== BOTTLENECK_MODE || !overlay) return;
    const ids = new Set([...overlay.bottleneckEdgeIds, ...overlay.bottleneckNodeIds]);
    cy.batch(() => cy.elements().forEach((el) => el.addClass(ids.has(el.id()) ? "sim-focus" : "sim-focus-dim")));
    if (!ids.size) toastRef.current?.("Nothing was binding on this day.");
  }, [cyRef, cyReady, mode, overlay, graphTick]);

  const toggleBottlenecks = useCallback(() => setMode(mode === BOTTLENECK_MODE ? "select" : BOTTLENECK_MODE), [mode, setMode]);

  // ── Show Gap (SWIIMS showGapOnCanvas / highlightGap) ─────────────────────
  const clearGap = useCallback(() => {
    const cy = cyRef.current;
    if (cy) cy.elements().removeClass("sim-gap-binding sim-gap-spare sim-gap-root");
    setGap(null);
  }, [cyRef]);

  const showGap = useCallback(
    (rootId) => {
      const cy = cyRef.current;
      if (!cy || !overlay) return;
      const root = cy.getElementById(rootId);
      if (!root.length) return;
      clearGap();
      const binding = [];
      const spare = [];
      const seen = new Set([rootId]);
      const queue = [rootId];
      while (queue.length) {
        const id = queue.shift();
        cy.getElementById(id).connectedEdges().forEach((edge) => {
          const bidi = edge.data("meta")?.specifications?.bidirectional === true;
          const upstream = edge.target().id() === id ? edge.source().id() : bidi && edge.source().id() === id ? edge.target().id() : null;
          if (!upstream) return;
          const state = overlay.edgeStates[edge.id()];
          if (state === "bottleneck" || state === "high") binding.push(edge.id());
          if (!seen.has(upstream)) {
            seen.add(upstream);
            queue.push(upstream);
            const node = cy.getElementById(upstream);
            const plantState = overlay.nodeStates[upstream];
            if (SUPPLY.has(node.data("type")) && plantState && plantState !== "at-capacity") spare.push(upstream);
          }
        });
      }
      cy.batch(() => {
        root.addClass("sim-gap-root");
        binding.forEach((id) => cy.getElementById(id).addClass("sim-gap-binding"));
        spare.forEach((id) => cy.getElementById(id).addClass("sim-gap-spare"));
      });
      setGap({ rootId, binding, spare });
      toastRef.current?.(
        binding.length || spare.length
          ? `Gap: ${binding.length} binding pipe(s) upstream, ${spare.length} plant(s) with spare capacity.`
          : "No binding pipes or spare plant capacity upstream of this point on this day."
      );
    },
    [cyRef, overlay, clearGap]
  );

  const clearRun = useCallback(() => {
    clearGap();
    setCleared(true);
    if (mode === BOTTLENECK_MODE) setMode("select");
    closeInsight();
  }, [clearGap, mode, setMode, closeInsight]);

  const canShowGap = Boolean(overlay && selection.kind === "node" && DELIVERY.has(cyRef.current?.getElementById(selection.id).data("type")));

  return {
    active,
    overlay,
    summaries,
    stale,
    dayIdx,
    setDayIdx,
    animate,
    setAnimate,
    insight,
    insightAnchor,
    closeInsight,
    bottlenecks,
    toggleBottlenecks,
    gap,
    showGap,
    clearGap,
    canShowGap,
    selection,
    clearRun,
    restore: () => setCleared(false),
    cleared,
  };
}
