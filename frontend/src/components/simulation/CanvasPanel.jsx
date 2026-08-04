import React, { useEffect, useMemo, useRef, useState } from "react";
import cytoscape from "cytoscape";
import { buildCyStyle } from "../../cytoscape/buildCyStyle";
import { applyCardIcon } from "../../cytoscape/nodeCard";
import { addGraph } from "../../cytoscape/graph";
import { canvasStaleness } from "../../lib/simulationCanvas";
import { fetchNetwork } from "../../api/networks";
import "./CanvasPanel.css";

export default function CanvasPanel({ plan }) {
  const containerRef = useRef(null);
  const cyRef = useRef(null);

  const [topology, setTopology] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [cyReady, setCyReady] = useState(false);

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

      <div className="simcanvas__stage">
        <div ref={containerRef} className="simcanvas__cy" />
      </div>
    </section>
  );
}
