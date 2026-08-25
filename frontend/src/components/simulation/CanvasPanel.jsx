import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import cytoscape from "cytoscape";
import { AlertTriangle, GitBranch, Layers, Maximize2, Palette, RefreshCw, Waves, XCircle } from "lucide-react";
import { buildCyStyle } from "../../cytoscape/buildCyStyle";
import { applyEntitySymbol } from "../../cytoscape/entitySymbol";
import { addGraph } from "../../cytoscape/graph";
import { CANVAS_GRID_PITCH, computeGridPitch, wrapOffset } from "../../cytoscape/canvasGeometry";
import { applyZoomLod } from "../../cytoscape/lod";
import { applyOverlay, clearOverlay, startFlowAnimation, stopFlowAnimation } from "../../cytoscape/simulationOverlay";
import { clearTraceClasses, computeTrace, paintTrace, traceNeighbours } from "../../cytoscape/trace";
import { applyIsolation, clearIsolation, isIsolated } from "../../cytoscape/isolate";
import { canvasStaleness, dayOverlay, daySummaries, edgeInsight, nodeInsight } from "../../lib/simulationCanvas";
import { fetchNetwork } from "../../api/networks";
import CanvasDayScrubber from "./CanvasDayScrubber";
import CanvasToolbar from "./CanvasToolbar";
import CanvasDetails from "./CanvasDetails";
import NodeInsightPopover from "./NodeInsightPopover";
import "./CanvasPanel.css";

function elementAnchor(el, container) {
  if (!el?.length || !container) return null;
  const box = el.renderedBoundingBox({ includeLabels: false, includeOverlays: false });
  const stageWidth = container.clientWidth;
  const halfWidth = 258;
  const margin = 10;
  const lower = stageWidth > halfWidth * 2 ? halfWidth : stageWidth / 2;
  const upper = stageWidth > halfWidth * 2 ? stageWidth - halfWidth : stageWidth / 2;
  const x = Math.min(Math.max((box.x1 + box.x2) / 2, lower), upper);
  const placeBelow = box.y1 < 128;

  return {
    x,
    y: placeBelow ? box.y2 + margin : box.y1 - margin,
    placement: placeBelow ? "below" : "above",
  };
}

export default function CanvasPanel({ plan }) {
  const stageRef = useRef(null);
  const containerRef = useRef(null);
  const cyRef = useRef(null);
  const animationRef = useRef(null);

  const [topology, setTopology] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [cyReady, setCyReady] = useState(false);
  const [dayIdx, setDayIdx] = useState(0);
  const [animate, setAnimate] = useState(true);
  const [showLegend, setShowLegend] = useState(true);
  const [toast, setToast] = useState(null);
  const [traceActive, setTraceActive] = useState(false);
  const [traceMode, setTraceMode] = useState("delivered");
  const [traceInfo, setTraceInfo] = useState(null);
  const [isolationActive, setIsolationActive] = useState(false);
  const [selection, setSelection] = useState({ id: null, kind: null });
  const [insightAnchor, setInsightAnchor] = useState(null);

  // ── Mount the instance once ───────────────────────────────────────────────
  useEffect(() => {
    const cy = cytoscape({
      container: containerRef.current,
      style: buildCyStyle(),
      layout: { name: "preset" },
      minZoom: 0.05,
      maxZoom: 4,
      boxSelectionEnabled: true,
      wheelSensitivity: 0.2,
      // Read-only: positions come from the saved canvas and stay there.
      autoungrabify: true,
    });
    cyRef.current = cy;
    setCyReady(true);

    // Same adaptive grid as the Network Builder canvas, so a plan reads against
    // the mesh the topology was drawn on.
    const updateGridBackground = () => {
      const stage = stageRef.current;
      if (!stage) return;
      const pan = cy.pan();
      const zoom = cy.zoom();
      const { minor, major, minorAlpha } = computeGridPitch(zoom, CANVAS_GRID_PITCH);
      const minorPx = minor * zoom;
      const majorPx = major * zoom;

      stage.style.setProperty("--grid-size", `${minorPx}px`);
      stage.style.setProperty("--grid-major-size", `${majorPx}px`);
      stage.style.setProperty("--grid-minor-alpha", String(minorAlpha));
      stage.style.setProperty("--grid-offset-x", `${wrapOffset(pan.x, minorPx)}px`);
      stage.style.setProperty("--grid-offset-y", `${wrapOffset(pan.y, minorPx)}px`);
      stage.style.setProperty("--grid-major-offset-x", `${wrapOffset(pan.x, majorPx)}px`);
      stage.style.setProperty("--grid-major-offset-y", `${wrapOffset(pan.y, majorPx)}px`);
    };

    updateGridBackground();
    applyZoomLod(cy);
    cy.on("pan zoom resize", updateGridBackground);
    cy.on("zoom add", () => applyZoomLod(cy));

    return () => {
      cy.removeListener("pan zoom resize", updateGridBackground);
      cy.destroy();
      cyRef.current = null;
      setCyReady(false);
    };
  }, []);

  // ── Fetch the topology the plan ran against ───────────────────────────────
  useEffect(() => {
    const networkId = plan?.network?.id;
    if (!networkId) {
      setTopology(null);
      setLoadError(null);
      return undefined;
    }
    let cancelled = false;
    setLoadError(null);
    fetchNetwork(networkId)
      .then((doc) => !cancelled && setTopology(doc))
      .catch(() => {
        if (!cancelled) {
          setTopology(null);
          setLoadError("The network this plan ran against is no longer available.");
        }
      });
    return () => { cancelled = true; };
  }, [plan?.network?.id]);

  // ── Hydrate ───────────────────────────────────────────────────────────────
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy || !cyReady || !topology) return;
    cy.elements().remove();
    addGraph(cy, topology);
    cy.nodes().forEach(applyEntitySymbol);
    cy.fit(undefined, 48);
  }, [topology, cyReady]);

  const stale = useMemo(
    () => (topology ? canvasStaleness(topology, plan) : { unknownToRun: [], missingFromCanvas: [] }),
    [topology, plan],
  );

  // A re-run can have a shorter horizon, so a plan swap must not leave dayIdx
  // pointing past the end of the new plan's days. The same swap can also
  // change node/edge ids underneath a stale trace or isolate, so drop those
  // too rather than let the detail panel describe elements that no longer
  // exist. traceActive is left alone: it is an armed input mode ("click a
  // node to trace"), not stale analysis output, and stays valid against the
  // new topology.
  useEffect(() => {
    setDayIdx(0);
    setTraceInfo(null);
    setIsolationActive(false);
    setSelection({ id: null, kind: null });
    setInsightAnchor(null);
  }, [plan?.id]);

  const overlay = useMemo(() => dayOverlay(plan, dayIdx), [plan, dayIdx]);
  const summaries = useMemo(() => daySummaries(plan), [plan]);
  const insight = useMemo(
    () => {
      if (selection.kind === "node") return nodeInsight(plan, dayIdx, selection.id);
      if (selection.kind === "edge") return edgeInsight(plan, dayIdx, selection.id);
      return null;
    },
    [plan, dayIdx, selection.id, selection.kind],
  );

  // Unlike the Network Builder, any asset node is a valid trace root here —
  // with real flow available, "where does this plant's output go" is as
  // useful as "where does this gate's water come from".
  const runTrace = useCallback((node, mode = traceMode) => {
    const cy = cyRef.current;
    if (!cy || !node) return;
    const flowByEdge = overlay?.flowByEdge || {};
    const trace = computeTrace(cy, node.id(), { flowByEdge, mode });
    paintTrace(cy, trace);
    const { sources, dests } = traceNeighbours(cy, trace);
    setTraceInfo({
      rootId: trace.rootId,
      rootName: node.data("label") || node.data("displayLabel") || node.id(),
      mode: trace.mode,
      requestedMode: trace.requestedMode,
      hasFlow: trace.hasFlow,
      sources,
      dests,
      upCount: trace.up.nodes.size,
      downCount: trace.down.nodes.size,
    });
    if (mode === "delivered" && !trace.hasFlow) {
      setToast("No flow on this day, so Trace is showing reachable topology.");
    }
  }, [traceMode, overlay]);

  const clearAnalysis = useCallback(() => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.$(":selected").unselect();
    clearTraceClasses(cy);
    clearIsolation(cy);
    setTraceInfo(null);
    setIsolationActive(false);
    setTraceActive(false);
    setSelection({ id: null, kind: null });
    setInsightAnchor(null);
  }, []);

  const handleToggleIsolation = useCallback(() => {
    const cy = cyRef.current;
    if (!cy) return;
    if (isolationActive || isIsolated(cy)) {
      clearIsolation(cy);
      setIsolationActive(false);
      setToast("Cleared isolate.");
      return;
    }
    if (!applyIsolation(cy, cy.$(":selected"))) {
      setToast("Select something to isolate first.");
      return;
    }
    setIsolationActive(true);
  }, [isolationActive]);

  // Bound per-hydration so a re-fetched topology gets a live handler.
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy || !cyReady) return undefined;

    const onNodeTap = (evt) => {
      if (!traceActive) return;
      runTrace(evt.target);
    };
    const onBackgroundTap = (evt) => {
      if (evt.target !== cy) return;
      cy.$(":selected").unselect();
      clearTraceClasses(cy);
      setTraceInfo(null);
      setSelection({ id: null, kind: null });
      setInsightAnchor(null);
    };

    const onSelect = () => {
      const selected = cy.$(":selected");
      if (selected.length !== 1) {
        setSelection({ id: null, kind: null });
        setInsightAnchor(null);
        return;
      }
      const el = selected[0];
      const kind = el.isEdge() ? "edge" : "node";
      setSelection({ id: el.id(), kind });
      setInsightAnchor(elementAnchor(el, containerRef.current));
    };

    cy.on("tap", "node", onNodeTap);
    cy.on("tap", onBackgroundTap);
    cy.on("select unselect", onSelect);
    return () => {
      cy.removeListener("tap", "node", onNodeTap);
      cy.removeListener("tap", onBackgroundTap);
      cy.removeListener("select unselect", onSelect);
    };
  }, [cyReady, traceActive, runTrace]);

  useEffect(() => {
    const cy = cyRef.current;
    if (!cy || !cyReady || !selection.kind || !selection.id) return undefined;

    const update = () => {
      const el = cy.getElementById(selection.id);
      setInsightAnchor(elementAnchor(el, containerRef.current));
    };

    update();
    cy.on("pan zoom resize", update);
    window.addEventListener("resize", update);
    return () => {
      cy.removeListener("pan zoom resize", update);
      window.removeEventListener("resize", update);
    };
  }, [cyReady, selection.id, selection.kind]);

  // Re-run an active trace when the day changes, so a delivery path visibly
  // appears and disappears across the horizon.
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy || !traceInfo?.rootId) return;
    const root = cy.getElementById(traceInfo.rootId);
    if (root.length) runTrace(root, traceMode);
    // Keyed on the day and the mode only. runTrace closes over the overlay this
    // effect already reacts to, so listing it would re-trace on every repaint.
  }, [dayIdx, traceMode]);

  // Paint. Hydration must have happened first, so this depends on `topology`.
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy || !cyReady || !topology) return;
    if (!overlay) {
      clearOverlay(cy);
      return;
    }
    applyOverlay(cy, overlay, { staleIds: stale.unknownToRun });
  }, [overlay, stale, topology, cyReady]);

  // Animate separately from painting, so toggling the animation off does not
  // repaint and toggling days does not restart from a jarring offset.
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
  }, [animate, overlay, cyReady]);

  useEffect(() => {
    if (!toast) return undefined;
    const id = setTimeout(() => setToast(null), 3200);
    return () => clearTimeout(id);
  }, [toast]);

  const handleFocus = useCallback((elementId) => {
    const cy = cyRef.current;
    if (!cy) return;
    const el = cy.getElementById(elementId);
    if (!el.length) return;
    cy.$(":selected").unselect();
    el.select();
    cy.fit(el.closedNeighborhood(), 120);
  }, []);

  const handleCloseInsight = useCallback(() => {
    const cy = cyRef.current;
    cy?.$(":selected").unselect();
    setSelection({ id: null, kind: null });
    setInsightAnchor(null);
  }, []);

  const handleFit = () => cyRef.current?.fit(undefined, 48);

  const handleResetView = () => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.zoom(1);
    cy.center();
  };

  // "What is binding today" in one click.
  const handleSelectBottlenecks = () => {
    const cy = cyRef.current;
    if (!cy || !overlay) return;
    const ids = new Set([...overlay.bottleneckEdgeIds, ...overlay.bottleneckNodeIds]);
    cy.$(":selected").unselect();
    const binding = cy.elements().filter((el) => ids.has(el.id()));
    if (!binding.length) {
      setToast("Nothing was binding on this day.");
      return;
    }
    binding.select();
    cy.fit(binding, 80);
  };

  const toolbarGroups = [
    {
      key: "view",
      items: [
        { key: "fit", label: "Fit", icon: Maximize2, title: "Fit the network to the frame", onClick: handleFit },
        { key: "reset", label: "Reset", icon: RefreshCw, title: "Reset pan and zoom", onClick: handleResetView },
      ],
    },
    {
      key: "analysis",
      items: [
        {
          key: "trace",
          label: "Trace",
          icon: GitBranch,
          title: "Click an asset to trace its upstream and downstream path",
          active: traceActive,
          onClick: () => {
            const next = !traceActive;
            setTraceActive(next);
            if (next) setToast("Trace: click any plant, pump, gate or junction.");
            else { clearTraceClasses(cyRef.current); setTraceInfo(null); }
          },
        },
        traceActive && {
          key: "tracemode",
          label: traceMode === "delivered" ? "Delivered" : "Reachable",
          title: "Switch between delivered flow paths and topology reachability",
          onClick: () => setTraceMode((m) => (m === "delivered" ? "reachable" : "delivered")),
        },
        { key: "isolate", label: "Isolate", icon: Layers, title: "Isolate the current selection, or clear isolate", active: isolationActive, onClick: handleToggleIsolation },
        { key: "clear", label: "Clear", icon: XCircle, title: "Clear trace, isolate and selection", onClick: clearAnalysis },
      ].filter(Boolean),
    },
    {
      key: "overlay",
      items: [
        { key: "flow", label: "Flow", icon: Waves, title: "Toggle the flow animation", active: animate, onClick: () => setAnimate((v) => !v) },
        { key: "legend", label: "Legend", icon: Palette, title: "Toggle the legend", active: showLegend, onClick: () => setShowLegend((v) => !v) },
        { key: "bottlenecks", label: "Bottlenecks", icon: AlertTriangle, title: "Select everything binding on this day", onClick: handleSelectBottlenecks },
      ],
    },
  ];

  const emptyRun = plan?.kpis?.totalRequiredM3 === 0;

  return (
    <section className="simcanvas">
      {loadError && <div className="metric__notice metric__notice--error">{loadError}</div>}

      {stale.unknownToRun.length > 0 && (
        <div className="metric__notice metric__notice--warn">
          {stale.unknownToRun.length} element(s) on this canvas were added after the run and carry no
          results. They are shown dimmed. Re-run the simulation to include them.
        </div>
      )}
      {stale.missingFromCanvas.length > 0 && (
        <div className="metric__notice metric__notice--warn">
          {stale.missingFromCanvas.length} element(s) this run used are no longer on the canvas.
        </div>
      )}
      {emptyRun && (
        <div className="metric__notice">
          This run had no demand to dispatch, so every pipe shows as idle. See the Configuration tab
          for why.
        </div>
      )}

      <CanvasToolbar groups={toolbarGroups} />

      <div className="simcanvas__body">
        <div ref={stageRef} className="simcanvas__stage simcanvas__stage--grid">
          <div ref={containerRef} className="simcanvas__cy" />

          <NodeInsightPopover insight={insight} anchor={insightAnchor} onClose={handleCloseInsight} />

          {toast && (
            <button type="button" className="simcanvas__toast" onClick={() => setToast(null)}>
              {toast}
            </button>
          )}

          {showLegend && (
            <div className="simcanvas__legend">
              <span className="simcanvas__legend-title">Pipe utilisation</span>
              {[
                ["low", "Below 70%"],
                ["medium", "70–90%"],
                ["high", "90%+"],
                ["bottleneck", "Pipe binding"],
                ["unconstrained", "No capacity on record"],
                ["idle", "No flow"],
                ["node-binding", "Supply / pump binding"],
              ].map(([key, label]) => (
                <span key={key} className="simcanvas__legend-row">
                  <i className={`simcanvas__swatch simcanvas__swatch--${key}`} />
                  {label}
                </span>
              ))}
            </div>
          )}
        </div>
        <CanvasDetails
          plan={plan}
          dayIdx={dayIdx}
          selectedId={selection.id}
          selectedKind={selection.kind}
          traceInfo={traceInfo}
          onFocus={handleFocus}
        />
      </div>

      <CanvasDayScrubber summaries={summaries} dayIdx={dayIdx} onChange={setDayIdx} />
    </section>
  );
}
