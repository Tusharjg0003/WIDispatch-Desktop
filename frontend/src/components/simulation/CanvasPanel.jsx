import React, { useEffect, useMemo, useRef, useState } from "react";
import cytoscape from "cytoscape";
import { AlertTriangle, Crosshair, Maximize2, Palette, RefreshCw, Tag, Waves } from "lucide-react";
import { buildCyStyle } from "../../cytoscape/buildCyStyle";
import { applyCardIcon } from "../../cytoscape/nodeCard";
import { addGraph } from "../../cytoscape/graph";
import { applyOverlay, clearOverlay, startFlowAnimation, stopFlowAnimation } from "../../cytoscape/simulationOverlay";
import { canvasStaleness, dayOverlay, daySummaries } from "../../lib/simulationCanvas";
import { fetchNetwork } from "../../api/networks";
import CanvasDayScrubber from "./CanvasDayScrubber";
import CanvasToolbar from "./CanvasToolbar";
import "./CanvasPanel.css";

export default function CanvasPanel({ plan }) {
  const containerRef = useRef(null);
  const cyRef = useRef(null);
  const animationRef = useRef(null);

  const [topology, setTopology] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [cyReady, setCyReady] = useState(false);
  const [dayIdx, setDayIdx] = useState(0);
  const [animate, setAnimate] = useState(true);
  const [showLegend, setShowLegend] = useState(true);
  const [showLabels, setShowLabels] = useState(true);
  const [toast, setToast] = useState(null);

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

    return () => {
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
    cy.nodes().forEach(applyCardIcon);
    cy.fit(undefined, 48);
  }, [topology, cyReady]);

  const stale = useMemo(
    () => (topology ? canvasStaleness(topology, plan) : { unknownToRun: [], missingFromCanvas: [] }),
    [topology, plan],
  );

  // A re-run can have a shorter horizon, so a plan swap must not leave dayIdx
  // pointing past the end of the new plan's days.
  useEffect(() => { setDayIdx(0); }, [plan?.id]);

  const overlay = useMemo(() => dayOverlay(plan, dayIdx), [plan, dayIdx]);
  const summaries = useMemo(() => daySummaries(plan), [plan]);

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

  // Newly hydrated elements need the class applied too, hence the `topology`
  // dependency alongside the toggle itself.
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy || !cyReady) return;
    if (showLabels) cy.elements().removeClass("hide-labels");
    else cy.elements().addClass("hide-labels");
  }, [showLabels, cyReady, topology]);

  useEffect(() => {
    if (!toast) return undefined;
    const id = setTimeout(() => setToast(null), 3200);
    return () => clearTimeout(id);
  }, [toast]);

  const handleFit = () => cyRef.current?.fit(undefined, 48);

  const handleZoomToSelection = () => {
    const cy = cyRef.current;
    if (!cy) return;
    const selected = cy.$(":selected");
    cy.fit(selected.length ? selected : cy.elements(), 60);
  };

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
        { key: "tosel", label: "To Sel", icon: Crosshair, title: "Zoom to selection (or fit all)", onClick: handleZoomToSelection },
        { key: "labels", label: "Labels", icon: Tag, title: "Toggle labels", active: showLabels, onClick: () => setShowLabels((v) => !v) },
        { key: "reset", label: "Reset", icon: RefreshCw, title: "Reset pan and zoom", onClick: handleResetView },
      ],
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

      <div className="simcanvas__stage">
        <div ref={containerRef} className="simcanvas__cy" />

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
              ["bottleneck", "Binding constraint"],
              ["unconstrained", "No capacity on record"],
              ["idle", "No flow"],
            ].map(([key, label]) => (
              <span key={key} className="simcanvas__legend-row">
                <i className={`simcanvas__swatch simcanvas__swatch--${key}`} />
                {label}
              </span>
            ))}
          </div>
        )}
      </div>

      <CanvasDayScrubber summaries={summaries} dayIdx={dayIdx} onChange={setDayIdx} />
    </section>
  );
}
